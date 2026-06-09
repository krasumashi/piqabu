package com.krasumashi.piqabu.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Manual ReactPackage for the Piqabu Keyboard bridge module. Not
 * autolinked because this lives inside the app module, not a separate
 * npm package — wired in MainApplication.getPackages().
 */
class PiqabuKeyboardBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(PiqabuKeyboardBridgeModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
