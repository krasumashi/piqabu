package com.krasumashi.piqabu.bnw

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class BnWVideoViewManager(
    private val reactContext: ReactApplicationContext
) : SimpleViewManager<BnWVideoView>() {

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): BnWVideoView {
        return BnWVideoView(reactContext)
    }

    @ReactProp(name = "streamURL")
    fun setStreamURL(view: BnWVideoView, streamURL: String?) {
        view.setStreamURL(streamURL)
    }

    @ReactProp(name = "mirror", defaultBoolean = false)
    fun setMirror(view: BnWVideoView, mirror: Boolean) {
        view.setMirror(mirror)
    }

    companion object {
        const val REACT_CLASS = "PiqabuBnWVideoView"
    }
}
