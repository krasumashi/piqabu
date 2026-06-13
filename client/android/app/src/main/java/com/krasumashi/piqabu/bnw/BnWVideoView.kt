package com.krasumashi.piqabu.bnw

import android.content.Context
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactContext
import com.oney.WebRTCModule.EglUtils
import com.oney.WebRTCModule.WebRTCModule
import org.webrtc.MediaStream
import org.webrtc.VideoTrack

/**
 * BnWVideoView
 *
 * Custom Android view that renders a WebRTC video track in true greyscale.
 * Replaces RTCView for the "isBnW = true" code path in LiveGlassPanel.
 *
 * Why this exists:
 *   react-native-webrtc renders into SurfaceView, which lives in its own
 *   compositor layer below the regular Android view hierarchy. CSS-style
 *   filters and `mixBlendMode` overlays don't reach the SurfaceView's
 *   frames — they composite above it instead of through it. So no
 *   JS-only approach can produce true greyscale on a SurfaceView-based
 *   RTCView. (We tried mixBlendMode='saturation' with a white overlay —
 *   on Android the overlay just sat there as solid white blocking
 *   the video.)
 *
 * The fix here:
 *   - Use TextureView instead of SurfaceView. TextureView lives IN the
 *     view hierarchy and participates in normal Android rendering, so
 *     effects from parent views apply to its frames.
 *   - Apply ColorMatrix(saturation=0) via RenderEffect on the FrameLayout
 *     parent. On Android 12+ (API 31), this is GPU-accelerated and
 *     produces true greyscale without a per-frame cost.
 *   - On older Android, RenderEffect is unavailable and the video
 *     renders in colour. The JS wrapper surfaces this in the UI for
 *     transparency.
 *
 * Lookup: takes a streamURL (same format as RTCView accepts), reaches
 * into WebRTCModule to grab the associated VideoTrack, and addSinks
 * the TextureViewRenderer. Stream might not be registered yet at
 * prop-set time, so we retry with backoff for up to ~3 seconds.
 *
 * Lifecycle: cleanly releases the renderer + removes the sink in
 * onDetachedFromWindow so screen rotation / panel close don't leak.
 */
class BnWVideoView(context: Context) : FrameLayout(context) {
    private val renderer: BnWTextureRenderer = BnWTextureRenderer(context)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var streamURL: String? = null
    private var videoTrack: VideoTrack? = null
    private var initialized = false
    private var pendingRetry: Runnable? = null

    init {
        addView(renderer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        setBackgroundColor(Color.BLACK)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val matrix = ColorMatrix().apply { setSaturation(0f) }
            val filter = ColorMatrixColorFilter(matrix)
            setRenderEffect(RenderEffect.createColorFilterEffect(filter))
        }
    }

    private fun ensureInit(): Boolean {
        if (initialized) return true
        try {
            // Use react-native-webrtc's SHARED root EGL context — the same
            // one the PeerConnectionFactory, camera capturer, and RTCView
            // use. WebRTC delivers camera/remote frames as GPU texture
            // frames bound to this context; a renderer on a separate
            // context (e.g. a fresh EglBase.create()) cannot sample those
            // textures and renders nothing — a pure black feed. Sharing the
            // root context is what makes the frames actually draw.
            val sharedContext = EglUtils.getRootEglBaseContext()
                ?: return false
            renderer.init(sharedContext)
            initialized = true
        } catch (_: Throwable) {
            initialized = false
        }
        return initialized
    }

    fun setStreamURL(url: String?) {
        if (streamURL == url && videoTrack != null) return

        // Clean up previous attachment.
        clearPendingRetry()
        videoTrack?.let {
            try { it.removeSink(renderer) } catch (_: Throwable) {}
        }
        videoTrack = null
        streamURL = url

        if (url == null) return
        attachWithRetry(0)
    }

    /**
     * The WebRTC JS bridge registers streams asynchronously. If we look
     * up the stream the moment a prop is set, it may not yet exist.
     * Retry up to ~3 seconds with linear backoff.
     */
    private fun attachWithRetry(attempt: Int) {
        if (attempt >= 30 || streamURL == null) return
        val url = streamURL ?: return

        val stream = lookupStream(url)
        val track = stream?.videoTracks?.firstOrNull()

        if (track != null && ensureInit()) {
            try {
                track.addSink(renderer)
                videoTrack = track
            } catch (_: Throwable) {
                videoTrack = null
            }
            return
        }

        val retry = Runnable { attachWithRetry(attempt + 1) }
        pendingRetry = retry
        mainHandler.postDelayed(retry, 100)
    }

    fun setMirror(mirror: Boolean) {
        renderer.setMirror(mirror)
    }

    /**
     * Looks up a MediaStream by reactTag via reflection.
     *
     * WebRTCModule.getStreamForReactTag is package-private (in
     * com.oney.WebRTCModule), so we can't call it directly from
     * here. Two options: move this view into the WebRTC package
     * (ugly cross-cutting concern), or use reflection. Reflection
     * keeps the module boundary clean — the trade-off is we lose
     * compile-time checks on the signature, but the signature has
     * been stable across react-native-webrtc versions for years.
     */
    private fun lookupStream(url: String): MediaStream? {
        val module = (context as? ReactContext)?.getNativeModule(WebRTCModule::class.java)
            ?: return null
        return try {
            val method = WebRTCModule::class.java.getDeclaredMethod(
                "getStreamForReactTag",
                String::class.java
            )
            method.isAccessible = true
            method.invoke(module, url) as? MediaStream
        } catch (_: Throwable) {
            null
        }
    }

    private fun clearPendingRetry() {
        pendingRetry?.let { mainHandler.removeCallbacks(it) }
        pendingRetry = null
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        clearPendingRetry()
        try {
            videoTrack?.removeSink(renderer)
            videoTrack = null
            if (initialized) {
                renderer.release()
                initialized = false
            }
            // NOTE: do NOT release the EGL context — it's the shared root
            // owned by react-native-webrtc (EglUtils). Releasing it would
            // break every other renderer/capturer in the app.
        } catch (_: Throwable) { /* noop */ }
    }
}
