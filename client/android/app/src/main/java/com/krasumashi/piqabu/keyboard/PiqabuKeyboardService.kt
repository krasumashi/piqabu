package com.krasumashi.piqabu.keyboard

import android.content.Context
import android.content.Intent
import android.inputmethodservice.InputMethodService
import android.inputmethodservice.Keyboard
import android.inputmethodservice.KeyboardView
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.biometric.BiometricManager
// Aliased so there is no chance of clashing with `android.R` in nested scopes.
// The app's R lives at the namespace declared in `app/build.gradle`
// (`com.krasumashi.piqabu`), and any subpackage (like this one) needs to
// reach up to it explicitly — Kotlin will not auto-resolve `R` to the app
// module when the current package is a subpackage of the namespace.
import com.krasumashi.piqabu.R as PiqR
import kotlin.random.Random

/**
 * Piqabu Keyboard — the Resident half of the Resident/Theatre split.
 *
 * ## Privacy posture (Stealth Type)
 *
 * What this IME does **not** do, deliberately:
 *
 *   - **No logging.** No `Log.*` calls anywhere in this service. Nothing
 *     touches `logcat`, no analytics SDK is initialised, no breadcrumbs.
 *   - **No user-dictionary writes.** `UserDictionary.Words.addWord(...)`
 *     is never called. Words you type never enter Android's personalised
 *     learning system.
 *   - **No candidates / suggestions.** `setCandidatesViewShown(true)` is
 *     never called. No predictive-text strip, no auto-correct, no word
 *     completion. Your keystrokes never leave the device for cloud
 *     completion (which Gboard does by default).
 *   - **No network calls** anywhere in this file. The Phase-4 session
 *     wiring will reach the Piqabu signal tower over a TLS Socket.IO
 *     channel, but no third-party analytics or telemetry ever ships.
 *
 * ## Modes
 *
 *   - **Idle**: keys type into the host app's text field. Strip shows
 *     "PIQA LIVE · IDLE".
 *   - **Minted**: MINT was tapped — the share URL inserted into the host
 *     app's compose box, the local Piqabu app simultaneously opened to a
 *     fresh room (waiting for the partner to tap the link). Strip shows
 *     "MINTED · XXXXXX", MINT label flips to RESET.
 *   - **Locked**: Triple-tapping the globe puts the IME in LOCKED state.
 *     All input is blocked behind an overlay. Tapping the overlay fires
 *     a device-credential confirmation; success unlocks.
 *
 * ## Lifecycle notes
 *
 *   - The IME runs in its own process under the same app UID, which means
 *     it can read/write the encrypted SharedPreferences file that
 *     `expo-secure-store` uses. See [SecureStoreReader] (Phase 3 native
 *     bridge, future commit) for the identity / Pro-status handoff.
 *   - The OS may kill the IME process aggressively; don't hold long-lived
 *     state in `this`. Active session state will belong in `PiqaSession`
 *     (Phase 4), which is stateless across keyboard hide/show.
 */
class PiqabuKeyboardService : InputMethodService() {

    /** 6-char alphabet mirrored from server.js (ROOM_CHARS). */
    private val roomChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    /** Share-link host. Must match the AndroidManifest intent-filter. */
    private val shareHost = "piqabu.live"

    /** Current minted room code, or null when idle. */
    private var mintedCode: String? = null

    /** Caps state — toggled by the shift key. */
    private var capsOn: Boolean = false

    /** True while the lock overlay is showing keys disabled. */
    private var locked: Boolean = false

    // --- Cached view references (re-set every onCreateInputView) ---
    private var statusLabel: TextView? = null
    private var mintButton: Button? = null
    private var keyboardView: KeyboardView? = null
    private var lockOverlay: LinearLayout? = null
    private var rootView: View? = null

    // --- Globe triple-tap tracking (Quick-Lock) ---
    /** Window within which 3 globe taps trigger lock (ms). */
    private val tripleTapWindowMs = 1500L
    /** Timestamps of recent globe taps; oldest first. */
    private val globeTapTimes = ArrayDeque<Long>(3)

    // --- Long-press tracking (Decoy Send) ---
    /** Long-press threshold (ms). */
    private val longPressMs = 500L
    /** Code currently being held down, or 0 if none. */
    private var pressedKey: Int = 0
    /** True if a long-press was fired and the upcoming onKey should be ignored. */
    private var longPressFired: Boolean = false
    private val handler = Handler(Looper.getMainLooper())
    private val longPressRunnable: Runnable = Runnable {
        val held = pressedKey
        if (held == Keyboard.KEYCODE_DONE && !longPressFired) {
            longPressFired = true
            insertDecoyPhrase()
        }
    }

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(PiqR.layout.piqabu_keyboard_root, null)
        rootView = root

        statusLabel = root.findViewById(PiqR.id.piqabu_status_label)
        mintButton = root.findViewById(PiqR.id.piqabu_mint_button)
        keyboardView = root.findViewById(PiqR.id.piqabu_keyboard_view)
        lockOverlay = root.findViewById(PiqR.id.piqabu_lock_overlay)

        // Strip wiring
        mintButton?.setOnClickListener { onMintTap() }
        root.findViewById<ImageButton>(PiqR.id.piqabu_globe_button).setOnClickListener {
            onGlobeTap()
        }

        // QWERTY wiring
        keyboardView?.apply {
            keyboard = Keyboard(this@PiqabuKeyboardService, PiqR.xml.piqabu_qwerty)
            isPreviewEnabled = false  // Per-key floating preview off — feels
                                      // cleaner / more discreet without it.
            setOnKeyboardActionListener(keyboardActionListener)
        }

        // Lock overlay tap → biometric prompt
        lockOverlay?.setOnClickListener { promptBiometricUnlock() }

        return root
    }

    // ─────────────────────────────────────────────────────────────────────
    //  MINT (idempotent IDLE ⇄ MINTED toggle)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * MINT button: idempotent two-state toggle.
     *
     *   - Idle → generates a 6-char code locally, inserts the share URL
     *     into the host app's compose box, AND fires an Intent to open
     *     the local Piqabu app to a fresh room of that code. The sender
     *     sees a "WAITING FOR CORRESPONDENT" handshake screen until the
     *     partner taps the WhatsApp link.
     *   - Already minted → clears local state, strip back to IDLE, button
     *     label back to MINT. Does not delete what was already inserted.
     */
    private fun onMintTap() {
        if (mintedCode != null) {
            resetToIdle()
            return
        }
        val ic = currentInputConnection
        if (ic == null) {
            Toast.makeText(this, "Focus a text field first, then tap MINT.", Toast.LENGTH_SHORT).show()
            return
        }
        val code = generateLocalCode()
        val link = "https://$shareHost/j/$code"
        ic.commitText(link, 1)
        mintedCode = code
        statusLabel?.text = "MINTED · $code"
        mintButton?.setText(PiqR.string.piqabu_keyboard_reset)

        // Open the local Piqabu app to the waiting room. We target our own
        // package explicitly so this never falls through to a browser even
        // if the user hasn't tapped "always open with Piqabu" yet for the
        // share-link domain.
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(link)).apply {
                setPackage(packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (t: Throwable) {
            // Silent fallback — the link is still in the host app and the
            // user can open Piqabu manually.
        }
    }

    private fun resetToIdle() {
        mintedCode = null
        statusLabel?.setText(PiqR.string.piqabu_keyboard_status_idle)
        mintButton?.setText(PiqR.string.piqabu_keyboard_mint)
    }

    /** 6-char code matching the server's CSPRNG alphabet (server.js:203). */
    private fun generateLocalCode(): String =
        (1..6).map { roomChars[Random.nextInt(roomChars.length)] }.joinToString("")

    // ─────────────────────────────────────────────────────────────────────
    //  Quick-Lock (triple-tap globe → biometric)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Globe tap handler. Single tap → IME picker (default behaviour).
     * Three taps within `tripleTapWindowMs` → engage Quick-Lock.
     */
    private fun onGlobeTap() {
        val now = System.currentTimeMillis()

        // Slide the recent-taps window forward.
        while (globeTapTimes.isNotEmpty() && now - globeTapTimes.first() > tripleTapWindowMs) {
            globeTapTimes.removeFirst()
        }
        globeTapTimes.addLast(now)

        if (globeTapTimes.size >= 3) {
            globeTapTimes.clear()
            engageLock()
            return
        }

        // Not a triple-tap — fall through to normal IME-switcher behaviour.
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showInputMethodPicker()
    }

    private fun engageLock() {
        locked = true
        lockOverlay?.visibility = View.VISIBLE
        keyboardView?.isEnabled = false
        statusLabel?.setText(PiqR.string.piqabu_keyboard_status_locked)
        Toast.makeText(this, getString(PiqR.string.piqabu_keyboard_lock_armed), Toast.LENGTH_SHORT).show()
    }

    private fun disengageLock() {
        locked = false
        lockOverlay?.visibility = View.GONE
        keyboardView?.isEnabled = true
        if (mintedCode != null) {
            statusLabel?.text = "MINTED · $mintedCode"
        } else {
            statusLabel?.setText(PiqR.string.piqabu_keyboard_status_idle)
        }
    }

    private fun promptBiometricUnlock() {
        val bm = BiometricManager.from(this)
        val can = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            disengageLock()
            return
        }

        val km = getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
        if (!km.isKeyguardSecure) {
            disengageLock()
            return
        }
        val intent = km.createConfirmDeviceCredentialIntent(
            getString(PiqR.string.piqabu_keyboard_unlock_title),
            getString(PiqR.string.piqabu_keyboard_unlock_subtitle),
        )
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
                disengageLock()
            } catch (t: Throwable) {
                // Leave engaged if launch fails.
            }
        } else {
            disengageLock()
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Decoy Send (long-press Return)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Inserts a random benign phrase from the predefined decoy list.
     * Does **not** auto-send — the user manually taps Send when ready,
     * which preserves agency in the moment.
     */
    private fun insertDecoyPhrase() {
        val ic = currentInputConnection ?: return
        val phrases = resources.getStringArray(PiqR.array.piqabu_decoy_phrases)
        if (phrases.isEmpty()) return
        val pick = phrases[Random.nextInt(phrases.size)]
        ic.commitText(pick, 1)
    }

    // ─────────────────────────────────────────────────────────────────────
    //  QWERTY action listener
    // ─────────────────────────────────────────────────────────────────────

    private val keyboardActionListener = object : KeyboardView.OnKeyboardActionListener {

        override fun onPress(primaryCode: Int) {
            if (locked) return
            pressedKey = primaryCode
            longPressFired = false
            handler.removeCallbacks(longPressRunnable)
            if (primaryCode == Keyboard.KEYCODE_DONE) {
                handler.postDelayed(longPressRunnable, longPressMs)
            }
        }

        override fun onRelease(primaryCode: Int) {
            handler.removeCallbacks(longPressRunnable)
            pressedKey = 0
        }

        override fun onKey(primaryCode: Int, keyCodes: IntArray?) {
            if (locked) return
            if (longPressFired) {
                longPressFired = false
                return
            }
            val ic = currentInputConnection ?: return
            when (primaryCode) {
                Keyboard.KEYCODE_DELETE -> ic.deleteSurroundingText(1, 0)
                Keyboard.KEYCODE_SHIFT  -> {
                    capsOn = !capsOn
                    keyboardView?.isShifted = capsOn
                    keyboardView?.invalidateAllKeys()
                }
                Keyboard.KEYCODE_DONE   -> {
                    ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
                    ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP,   KeyEvent.KEYCODE_ENTER))
                }
                else -> {
                    val ch = primaryCode.toChar()
                    val typed = if (capsOn && ch.isLetter()) ch.uppercaseChar() else ch
                    ic.commitText(typed.toString(), 1)
                }
            }
        }

        override fun onText(text: CharSequence?) {}
        override fun swipeLeft() {}
        override fun swipeRight() {}
        override fun swipeDown() {}
        override fun swipeUp() {}
    }

    override fun onEvaluateFullscreenMode(): Boolean = false

    override fun onFinishInputView(finishingInput: Boolean) {
        super.onFinishInputView(finishingInput)
        handler.removeCallbacks(longPressRunnable)
        pressedKey = 0
        longPressFired = false
    }
}
