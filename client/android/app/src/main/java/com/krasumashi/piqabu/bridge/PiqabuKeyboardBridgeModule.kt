package com.krasumashi.piqabu.bridge

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Tiny native bridge between the RN app process and the Piqabu Keyboard
 * IME process. Its single job is to surface Pro-tier status across the
 * process boundary.
 *
 * Why a plaintext SharedPreferences file (not expo-secure-store)?
 *
 *   `piqabu_pro_status` is not a secret. Knowing whether a device is on
 *   the Pro tier doesn't compromise anything — the entitlement is
 *   enforced server-side too (see /admin/devices/:id/tier and the
 *   tier-aware Socket.IO handshake). The encrypted-store key is also
 *   fragile across processes: the IME runs in its own process and would
 *   have to re-derive the Keystore-backed AES key the JS layer used,
 *   which is version-fragile and pure friction for no security gain.
 *
 *   Plaintext SharedPreferences in MODE_PRIVATE is readable by every
 *   process under this app's UID — exactly the IME's relationship to
 *   the main app — and not readable by anything else. The file is
 *   wiped when the user uninstalls the app, same as secure-store.
 *
 * The mirror is one-way: JS writes, the IME reads. The JS `pro.ts`
 * helpers still own `piqabu_pro_status` in secure-store as the
 * canonical record for the in-app gates; this just additionally
 * publishes the boolean to a place the IME can see.
 */
class PiqabuKeyboardBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * Mirror Pro status into the IME-readable SharedPreferences file.
     * Safe to call repeatedly — apply() is async-safe and the write is
     * idempotent.
     */
    @ReactMethod
    fun setProStatus(isPro: Boolean, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(KEY_PRO_STATUS, isPro).apply()
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("piqabu_bridge_write_failed", e)
        }
    }

    /**
     * Read-back for debugging / sanity checks from JS. Mirrors what the
     * IME would read. Returns false if the key has never been written.
     */
    @ReactMethod
    fun getProStatus(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            promise.resolve(prefs.getBoolean(KEY_PRO_STATUS, false))
        } catch (e: Throwable) {
            promise.reject("piqabu_bridge_read_failed", e)
        }
    }

    companion object {
        const val NAME = "PiqabuKeyboardBridge"
        const val PREFS_FILE = "piqabu_keyboard_bridge"
        const val KEY_PRO_STATUS = "pro_status"
    }
}
