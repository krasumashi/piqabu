package com.krasumashi.piqabu.keyboard

import android.content.Context

/**
 * Cross-process Pro-status reader for the Piqabu Keyboard IME.
 *
 * Reads the boolean published by `PiqabuKeyboardBridgeModule` (the
 * RN-side `lib/pro.ts` mirror) from a plaintext SharedPreferences file
 * shared across all processes under the app's UID. Same name as the
 * file the bridge writes to — must stay in sync.
 *
 * Conservative-by-default: if the prefs file or key is missing, treat
 * the device as free-tier. That way:
 *   - a brand-new install (where `setProAccess` has never been called)
 *     correctly sees the paywall on first keyboard activation;
 *   - any failure to read (corrupted prefs, package restore weirdness)
 *     errs on the side of the gate being closed, not bypassable.
 *
 * The name is intentionally `SecureStoreReader` for narrative continuity
 * with the keyboard plan even though the underlying mechanism is
 * plaintext-prefs rather than EncryptedSharedPreferences. Pro status is
 * not a secret — see the bridge module's header for the rationale.
 */
object SecureStoreReader {
    private const val PREFS_FILE = "piqabu_keyboard_bridge"
    private const val KEY_PRO_STATUS = "pro_status"

    fun isPro(context: Context): Boolean {
        return try {
            val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            prefs.getBoolean(KEY_PRO_STATUS, false)
        } catch (_: Throwable) {
            false
        }
    }
}
