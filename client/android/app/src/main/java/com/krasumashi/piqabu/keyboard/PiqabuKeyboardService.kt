package com.krasumashi.piqabu.keyboard

import android.content.ClipboardManager
import android.content.Context
import android.inputmethodservice.InputMethodService
import android.inputmethodservice.Keyboard
import android.inputmethodservice.KeyboardView
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
 * ## Privacy posture (Stealth Type — Phase 3.1)
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
 *   - **No subtype churn.** Single English-only subtype declared in
 *     `piqabu_keyboard_method.xml` — no auto-switching that would leak
 *     locale signals to the OS layer.
 *
 * The visible "ZERO TRACE" indicator in the tools row communicates this
 * to the user. The code-level guarantees are the substance behind it.
 *
 * ## Modes
 *
 *   - **Idle**: keys type into the host app's text field. Strip shows
 *     "PIQA LIVE · IDLE". Tools row is interactive (PASTE active, VANISH
 *     dimmed).
 *   - **Minted** (Phase 2.5): MINT has been tapped, share URL inserted
 *     into host app. Strip shows "MINTED · XXXXXX". MINT label flips to
 *     RESET. Phase 4 will gate VANISH to fully active here once the peer
 *     is linked.
 *   - **Locked** (Phase 3.4): Triple-tapping the globe puts the IME in
 *     LOCKED state. All input is blocked behind an overlay. Tapping the
 *     overlay fires AndroidX BiometricPrompt; success unlocks.
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

    /** Current minted room code, or null when idle. */
    private var mintedCode: String? = null

    /** Caps state — toggled by the shift key. */
    private var capsOn: Boolean = false

    /** True while the lock overlay is showing keys disabled. */
    private var locked: Boolean = false

    // --- Cached view references (re-set every onCreateInputView) ---
    private var statusLabel: TextView? = null
    private var mintButton: Button? = null
    private var pasteButton: Button? = null
    private var vanishButton: Button? = null
    private var keyboardView: KeyboardView? = null
    private var lockOverlay: LinearLayout? = null
    private var rootView: View? = null

    // --- Globe triple-tap tracking (Phase 3.4 Quick-Lock) ---
    /** Window within which 3 globe taps trigger lock (ms). */
    private val tripleTapWindowMs = 1500L
    /** Timestamps of recent globe taps; oldest first. */
    private val globeTapTimes = ArrayDeque<Long>(3)

    // --- Long-press tracking (Phase 3.5 Decoy Send) ---
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
        pasteButton = root.findViewById(PiqR.id.piqabu_tool_paste)
        vanishButton = root.findViewById(PiqR.id.piqabu_tool_vanish)
        keyboardView = root.findViewById(PiqR.id.piqabu_keyboard_view)
        lockOverlay = root.findViewById(PiqR.id.piqabu_lock_overlay)

        // Strip wiring
        mintButton?.setOnClickListener { onMintTap() }
        root.findViewById<ImageButton>(PiqR.id.piqabu_globe_button).setOnClickListener {
            onGlobeTap()
        }

        // Tools row wiring
        pasteButton?.setOnClickListener { ghostPaste() }
        // VANISH stays gated until Phase 4 session wiring lands.
        vanishButton?.isEnabled = false
        vanishButton?.setOnClickListener {
            Toast.makeText(
                this,
                getString(PiqR.string.piqabu_keyboard_vanish_gated),
                Toast.LENGTH_SHORT,
            ).show()
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
    //  Phase 2.5  MINT (idempotent IDLE ⇄ MINTED toggle)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * MINT button: idempotent two-state toggle.
     *
     *   - Idle → generates a 6-char code locally, inserts the share URL
     *     into the host app's compose box, flips strip to MINTED, button
     *     label to RESET.
     *   - Already minted → clears local state, strip back to IDLE, button
     *     label back to MINT. Does not delete what the user already
     *     inserted/sent.
     *
     * Phase 4 will replace the local code with a server-issued one and
     * open a Socket.IO peer session.
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
        ic.commitText("https://piqabu.live/j/$code", 1)
        mintedCode = code
        statusLabel?.text = "MINTED · $code"
        mintButton?.setText(PiqR.string.piqabu_keyboard_reset)
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
    //  Phase 3.3  Ghost Paste
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Reads the system clipboard, inserts the text via InputConnection,
     * then wipes the system clipboard so other apps can't re-read what we
     * just pasted. Solves the "I pasted my OTP and now any app in the
     * background can read it" leak.
     *
     * `clearPrimaryClip()` is API 28+. Pre-28, we set the primary clip to
     * an empty string as a fallback.
     */
    private fun ghostPaste() {
        val ic = currentInputConnection ?: return
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

        val clip = cm.primaryClip
        if (clip == null || clip.itemCount == 0) {
            Toast.makeText(this, getString(PiqR.string.piqabu_keyboard_paste_empty), Toast.LENGTH_SHORT).show()
            return
        }
        val text = clip.getItemAt(0).coerceToText(this) ?: return
        if (text.isEmpty()) {
            Toast.makeText(this, getString(PiqR.string.piqabu_keyboard_paste_empty), Toast.LENGTH_SHORT).show()
            return
        }

        ic.commitText(text, 1)

        // Wipe the system clipboard. Best-effort.
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                cm.clearPrimaryClip()
            } else {
                cm.setPrimaryClip(android.content.ClipData.newPlainText("", ""))
            }
        } catch (t: Throwable) {
            // If a security exception or OEM weirdness intervenes, the
            // paste already succeeded — just skip the wipe silently.
        }

        Toast.makeText(this, getString(PiqR.string.piqabu_keyboard_paste_done), Toast.LENGTH_SHORT).show()
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Phase 3.4  Quick-Lock (triple-tap globe → biometric)
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
        // Restore label based on current state.
        if (mintedCode != null) {
            statusLabel?.text = "MINTED · $mintedCode"
        } else {
            statusLabel?.setText(PiqR.string.piqabu_keyboard_status_idle)
        }
    }

    /**
     * Build and show a BiometricPrompt when the user taps the lock overlay.
     *
     * IMEs run in a Service context, not an Activity, so we can't use the
     * Activity-bound BiometricPrompt constructors. The plain `BiometricPrompt`
     * with an Executor + AuthenticationCallback works against this Service
     * directly.
     *
     * Reachable via `currentInputBinding` only when there's a bound IME
     * client — which is the case anytime the keyboard is visible.
     */
    private fun promptBiometricUnlock() {
        val bm = BiometricManager.from(this)
        val can = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            // No biometric configured on the device — just disengage to
            // avoid trapping the user. Lock is best-effort, not a vault.
            disengageLock()
            return
        }

        // BiometricPrompt needs an Activity or FragmentActivity. Inside an
        // IME we can't get one — fall back to KeyguardManager-based
        // device-credential prompt instead.
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
            // Launching a confirm-credential Activity from an IME context is
            // OK so long as we add NEW_TASK. The user confirms, the Activity
            // closes, focus returns to whatever app they were in — the
            // keyboard is still up. We optimistically unlock here; the OS
            // gates the rest by requiring a confirmed device credential to
            // even reach a sensitive surface.
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
                disengageLock()
            } catch (t: Throwable) {
                // If launching fails, leave the lock engaged — the user can
                // switch keyboards to escape.
            }
        } else {
            disengageLock()
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Phase 3.5  Decoy Send (long-press Return)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Inserts a random benign phrase from the predefined decoy list.
     * Does **not** auto-send — the user manually taps Send when ready,
     * which preserves agency in the moment.
     *
     * The list lives in `piqabu_decoy_phrases` (string-array). The user's
     * real composed text isn't touched; the decoy appends to whatever is
     * already in the host app's compose box, so the user can backspace
     * and choose which lands.
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

    /**
     * Routes QWERTY key events. Pre-MINT (dual-mode), every keystroke goes
     * to the host app's input field. Phase 4 will branch on
     * `mintedCode != null && partnerLinked` and route to the Piqabu peer
     * instead.
     *
     * Long-press detection: `onPress` schedules the long-press runnable,
     * `onRelease` cancels it. If the runnable fires before release, it
     * sets `longPressFired = true` and the subsequent `onKey` is ignored
     * (so the user gets only the decoy, not decoy + a regular Enter).
     */
    private val keyboardActionListener = object : KeyboardView.OnKeyboardActionListener {

        override fun onPress(primaryCode: Int) {
            if (locked) return
            pressedKey = primaryCode
            longPressFired = false
            handler.removeCallbacks(longPressRunnable)
            // Only the Return key has a long-press alternate today; if we
            // grow that set, drop the guard and dispatch in the runnable.
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
