package com.krasumashi.piqabu.bnw

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.RendererCommon
import org.webrtc.VideoFrame
import org.webrtc.VideoSink

/**
 * BnWTextureRenderer
 *
 * Minimal TextureView-based WebRTC video sink. We roll our own
 * instead of using org.webrtc.TextureViewRenderer because the
 * Jitsi webrtc:124 fork's exact API surface isn't guaranteed —
 * EglRenderer + VideoSink have been stable WebRTC primitives
 * for years and are safer to depend on.
 *
 * Why TextureView (not SurfaceView): TextureView participates in
 * the normal Android view hierarchy, so a RenderEffect on a parent
 * applies to its frames. SurfaceView lives in its own compositor
 * layer and bypasses parent effects — that's why JS-side overlays
 * couldn't make WebRTC video greyscale.
 *
 * Lifecycle:
 *   - init(eglContext): create the GL context, ready to receive frames.
 *   - onSurfaceTextureAvailable: attach EglRenderer's surface to the
 *     TextureView's SurfaceTexture. Now frames are visible.
 *   - onFrame: called by the VideoTrack's sink callback on the WebRTC
 *     thread; forward to EglRenderer which schedules the draw on its
 *     own thread.
 *   - onSurfaceTextureDestroyed: release the EGL surface but keep the
 *     renderer alive (we'll get a new surface on the next attach).
 *   - release(): tear down the EglRenderer entirely. Idempotent.
 */
class BnWTextureRenderer(context: Context) : TextureView(context),
    VideoSink, TextureView.SurfaceTextureListener {

    private val renderer = EglRenderer("BnW")
    private var initialized = false
    private var releaseInProgress = false
    private var scalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL
    private var mirrorHorizontally = false

    init {
        surfaceTextureListener = this
        // Transparent background until first frame so the parent
        // FrameLayout's black background shows through instead of
        // a flash of system grey.
        isOpaque = false
    }

    fun init(eglContext: EglBase.Context) {
        if (initialized) return
        try {
            renderer.init(eglContext, EglBase.CONFIG_PLAIN, GlRectDrawer())
            renderer.setMirror(mirrorHorizontally)
            initialized = true
            // If the TextureView already has a SurfaceTexture (i.e.
            // init() was called after onSurfaceTextureAvailable),
            // hook it up immediately. Otherwise the listener will
            // attach when the SurfaceTexture lands.
            surfaceTexture?.let { attachSurface(it) }
        } catch (_: Throwable) {
            initialized = false
        }
    }

    fun setMirror(mirror: Boolean) {
        mirrorHorizontally = mirror
        if (initialized) renderer.setMirror(mirror)
    }

    fun release() {
        if (!initialized || releaseInProgress) return
        releaseInProgress = true
        try { renderer.release() } catch (_: Throwable) { /* noop */ }
        initialized = false
        releaseInProgress = false
    }

    /* ── VideoSink ─────────────────────────────────────────────── */

    override fun onFrame(frame: VideoFrame) {
        if (!initialized) return
        try { renderer.onFrame(frame) } catch (_: Throwable) { /* noop */ }
    }

    /* ── SurfaceTextureListener ────────────────────────────────── */

    override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
        if (initialized) attachSurface(st)
    }

    override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {
        // EglRenderer adapts to surface size automatically.
    }

    override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        if (initialized) {
            try {
                renderer.releaseEglSurface { /* noop */ }
            } catch (_: Throwable) { /* noop */ }
        }
        // Returning true lets the system release the SurfaceTexture —
        // we don't need to keep it around.
        return true
    }

    override fun onSurfaceTextureUpdated(st: SurfaceTexture) {
        // Per-frame callback after compositor presents — nothing to do.
    }

    private fun attachSurface(st: SurfaceTexture) {
        try {
            val surface = Surface(st)
            renderer.createEglSurface(surface)
        } catch (_: Throwable) { /* noop */ }
    }
}
