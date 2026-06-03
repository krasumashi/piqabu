package com.krasumashi.piqabu.keyboard

import android.inputmethodservice.InputMethodService
import android.inputmethodservice.Keyboard
import android.inputmethodservice.KeyboardView
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
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
 * Lives in the IME layer so the moment a user decides to go private, the
 * keyboard is already in their hand. Two modes:
 *
 *   - **Idle** (default): keys type into the host app's text field like
 *     any normal keyboard. The strip shows "PIQA LIVE · IDLE" + a MINT
 *     button. Tapping MINT inserts a `https://piqabu.live/j/XXXXXX`
 *     share link straight into the compose box so the user can hit Send.
 *
 *   - **Minted** (Phase 4 active): after the partner taps the link and
 *     joins the room, keystrokes route to the Piqabu peer via Socket.IO
 *     instead of the host app. The strip shows "LINKED · XXXXXX" + END.
 *
 * Phase 2.5/2.6 scope (this file): IDLE mode with real QWERTY keys, plus
 * MINT-inserts-URL using a locally-generated code. The session lifecycle
 * (joining, peer routing, partner detection) lands in Phase 4 when we
 * wire up Socket.IO from inside the IME.
 *
 * Lifecycle notes:
 *   - The IME runs in its own process under the same app UID, which means
 *     it can read/write the encrypted SharedPreferences file that
 *     `expo-secure-store` uses. See [SecureStoreReader] (Phase 3) for
 *     the identity / Pro-status bridge.
 *   - The OS may kill the IME process aggressively; don't hold long-lived
 *     state in `this`. Active session state belongs in [PiqaSession]
 *     (Phase 4), which will be stateless across keyboard hide/show.
 */
class PiqabuKeyboardService : InputMethodService() {

    /** 6-char alphabet mirrored from server.js (ROOM_CHARS). */
    private val roomChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    /** Current minted room code, or null when idle. */
    private var mintedCode: String? = null

    /** Caps state — toggled by the shift key. */
    private var capsOn: Boolean = false

    /** Cached view references so we can update them without re-querying. */
    private var statusLabel: TextView? = null
    private var mintButton: Button? = null
    private var keyboardView: KeyboardView? = null

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(PiqR.layout.piqabu_keyboard_root, null)

        statusLabel = root.findViewById(PiqR.id.piqabu_status_label)
        mintButton = root.findViewById(PiqR.id.piqabu_mint_button)
        keyboardView = root.findViewById(PiqR.id.piqabu_keyboard_view)

        // Strip wiring
        mintButton?.setOnClickListener { onMintTap() }
        root.findViewById<ImageButton>(PiqR.id.piqabu_globe_button).setOnClickListener {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }

        // QWERTY wiring
        keyboardView?.apply {
            keyboard = Keyboard(this@PiqabuKeyboardService, PiqR.xml.piqabu_qwerty)
            isPreviewEnabled = false  // Per-key floating preview off — feels
                                      // cleaner / more discreet without it.
            setOnKeyboardActionListener(keyboardActionListener)
        }

        return root
    }

    /**
     * MINT button: idempotent two-state toggle.
     *
     *   - When idle: generate a 6-char code locally, insert the share URL
     *     into the host app's compose box, flip the strip to MINTED, swap
     *     the button label to RESET.
     *   - When already minted: clear local state and flip the strip back
     *     to IDLE. Does not delete what the user already inserted/sent —
     *     the demo behavior is that the link is yours to keep or backspace.
     *
     * Phase 4 will replace the local code with a server-issued one and
     * open the Socket.IO channel.
     */
    private fun onMintTap() {
        if (mintedCode != null) {
            resetToIdle()
            return
        }

        val ic = currentInputConnection
        if (ic == null) {
            Toast.makeText(
                this,
                "Focus a text field first, then tap MINT.",
                Toast.LENGTH_SHORT,
            ).show()
            return
        }

        val code = generateLocalCode()
        val link = "https://piqabu.live/j/$code"
        ic.commitText(link, 1)
        mintedCode = code
        statusLabel?.text = "MINTED · $code"
        mintButton?.text = "RESET"
    }

    private fun resetToIdle() {
        mintedCode = null
        statusLabel?.setText(PiqR.string.piqabu_keyboard_status_idle)
        mintButton?.setText(PiqR.string.piqabu_keyboard_mint)
    }

    /** 6-char code matching the server's CSPRNG alphabet (server.js:203). */
    private fun generateLocalCode(): String =
        (1..6).map { roomChars[Random.nextInt(roomChars.length)] }.joinToString("")

    /**
     * Routes QWERTY key events. In Phase 2.5/2.6 (dual-mode IDLE), every
     * keystroke goes to the host app's input field. Phase 4 will branch on
     * `mintedCode != null && partnerLinked` and route to the Piqabu peer
     * instead.
     */
    private val keyboardActionListener = object : KeyboardView.OnKeyboardActionListener {
        override fun onKey(primaryCode: Int, keyCodes: IntArray?) {
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
                    if (capsOn && ch.isLetter()) {
                        // One-shot shift — release after the keystroke unless
                        // the user explicitly enabled caps lock (held shift).
                        // KeyboardView's `isSticky` already handles toggle,
                        // so we just leave caps on until next shift tap.
                    }
                }
            }
        }

        // Boilerplate — the deprecated KeyboardView API requires these
        // even when we don't use them. No-ops.
        override fun onPress(primaryCode: Int) {}
        override fun onRelease(primaryCode: Int) {}
        override fun onText(text: CharSequence?) {}
        override fun swipeLeft() {}
        override fun swipeRight() {}
        override fun swipeDown() {}
        override fun swipeUp() {}
    }

    override fun onEvaluateFullscreenMode(): Boolean = false
}
