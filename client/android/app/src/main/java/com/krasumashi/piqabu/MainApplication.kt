package com.krasumashi.piqabu

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

import com.krasumashi.piqabu.bridge.PiqabuKeyboardBridgePackage
import com.krasumashi.piqabu.bnw.BnWVideoPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // PiqabuKeyboardBridge — exposes a single setProStatus()
              // method to JS so the keyboard IME process can read the
              // Pro flag from a plaintext SharedPreferences file shared
              // by UID. See bridge/PiqabuKeyboardBridgeModule.kt.
              add(PiqabuKeyboardBridgePackage())
              // BnWVideoPackage — custom native TextureView-based video
              // renderer that applies a grayscale ColorMatrix via
              // RenderEffect (API 31+). RTCView renders into a
              // SurfaceView whose frames don't participate in normal
              // view-hierarchy compositing, so JS overlays / blend
              // modes cannot turn it black-and-white. This native view
              // takes the same streamURL and renders true greyscale.
              add(BnWVideoPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
