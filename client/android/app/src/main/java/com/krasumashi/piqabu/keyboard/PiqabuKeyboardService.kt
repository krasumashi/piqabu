package com.krasumashi.piqabu.keyboard

import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.Toast
import com.krasumashi.piqabu.R

/**
 * Piqabu Keyboard — the Resident half of the Resident/Theatre split.
 *
 * Lives in the IME layer so the moment a user decides to go private, the
 * keyboard is already in their hand. In Piqabu-only mode, keys are inert
 * pre-session — keystrokes route to the Piqabu peer over Socket.IO once a
 * session is active. Camera / audio / screen affordances hand off to the
 * main app via deep-link Intents (the Theatre).
 *
 * Phase 2 scope (this file): registers as an InputMethodService, can be
 * enabled in system Settings, shows a placeholder strip + idle body. No
 * networking, no Pro gate, no live session — those land in Phase 3+.
 *
 * Lifecycle notes:
 *   - The IME runs in its own process under the same app UID, which means
 *     it can read/write the encrypted SharedPreferences file that
 *     `expo-secure-store` uses. This is how identity (Ghost ID) and Pro
 *     status flow from the React Native app into the keyboard. See
 *     [SecureStoreReader] (Phase 3) for the bridge.
 *   - The OS may kill the IME process aggressively; do not hold long-lived
 *     state in `this`. Active session state belongs in [PiqaSession]
 *     (Phase 4), which is itself stateless across keyboard hide/show.
 */
class PiqabuKeyboardService : InputMethodService() {

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(R.layout.piqabu_keyboard_root, null)

        // MINT — Phase 2 placeholder. Phase 4 wires this to [PiqaSession]:
        // generates a 6-char room code, opens a Socket.IO connection,
        // inserts the share link into the host app's compose box, and
        // expands the session panel.
        root.findViewById<Button>(R.id.piqabu_mint_button).setOnClickListener {
            Toast.makeText(
                this,
                getString(R.string.piqabu_keyboard_mint_phase2_toast),
                Toast.LENGTH_SHORT,
            ).show()
        }

        // Globe — system-standard "swap keyboard" affordance. We delegate
        // to the platform InputMethodManager so the user lands on the IME
        // picker (modern) and can pick their daily-driver keyboard back.
        root.findViewById<ImageButton>(R.id.piqabu_globe_button).setOnClickListener {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }

        return root
    }

    override fun onEvaluateFullscreenMode(): Boolean = false
}
