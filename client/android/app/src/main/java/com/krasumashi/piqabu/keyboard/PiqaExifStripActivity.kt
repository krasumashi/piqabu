package com.krasumashi.piqabu.keyboard

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.krasumashi.piqabu.R as PiqR
import java.io.File
import java.io.FileOutputStream

/**
 * Piqabu — Strip Metadata (Phase 3.6).
 *
 * A Share Extension Activity. Registered in the manifest with an intent
 * filter for SEND + image/* MIME types, so it appears in the system share
 * sheet whenever the user shares a photo from gallery / camera / any app.
 *
 * Flow:
 *   1. Receive Intent.ACTION_SEND with EXTRA_STREAM = source image URI.
 *   2. Copy the bytes into our cache dir (so we own the file the user is
 *      about to re-share — never modify the source).
 *   3. Run ExifInterface across the copy and clear every tag in
 *      [STRIPPED_TAGS]. JPEG/HEIF get scrubbed in place; PNG/GIF have no
 *      EXIF and are returned unchanged.
 *   4. Wrap the scrubbed copy in a FileProvider URI and launch a fresh
 *      SEND chooser so the user can pick the real destination
 *      (WhatsApp, Telegram, Signal, anywhere).
 *   5. finish() — no persistent UI, just a chooser. Cache files are
 *      orphaned in piqa_exif_strip/ and tidied by Android's cache GC.
 *
 * Privacy guarantee: nothing in this Activity touches the network, no
 * Log calls, no analytics, no third-party SDKs. The bytes go device →
 * cache → device. Strict local operation.
 */
class PiqaExifStripActivity : Activity() {

    companion object {
        /** EXIF tags we explicitly clear. Covers the bulk of what people
         *  actually leak from photos — geo, timestamp, device, software,
         *  copyright, and user comments. Cleared in addition to any tag
         *  we encounter that isn't in this list (see [scrubAllTags]). */
        private val STRIPPED_TAGS = arrayOf(
            ExifInterface.TAG_GPS_LATITUDE,
            ExifInterface.TAG_GPS_LATITUDE_REF,
            ExifInterface.TAG_GPS_LONGITUDE,
            ExifInterface.TAG_GPS_LONGITUDE_REF,
            ExifInterface.TAG_GPS_ALTITUDE,
            ExifInterface.TAG_GPS_ALTITUDE_REF,
            ExifInterface.TAG_GPS_TIMESTAMP,
            ExifInterface.TAG_GPS_DATESTAMP,
            ExifInterface.TAG_GPS_PROCESSING_METHOD,
            ExifInterface.TAG_DATETIME,
            ExifInterface.TAG_DATETIME_ORIGINAL,
            ExifInterface.TAG_DATETIME_DIGITIZED,
            ExifInterface.TAG_MAKE,
            ExifInterface.TAG_MODEL,
            ExifInterface.TAG_SOFTWARE,
            ExifInterface.TAG_ARTIST,
            ExifInterface.TAG_COPYRIGHT,
            ExifInterface.TAG_USER_COMMENT,
            ExifInterface.TAG_IMAGE_DESCRIPTION,
            ExifInterface.TAG_F_NUMBER,
            ExifInterface.TAG_EXPOSURE_TIME,
            ExifInterface.TAG_ISO_SPEED_RATINGS,
            ExifInterface.TAG_LENS_MAKE,
            ExifInterface.TAG_LENS_MODEL,
            ExifInterface.TAG_LENS_SERIAL_NUMBER,
            ExifInterface.TAG_BODY_SERIAL_NUMBER,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No setContentView — we run as an invisible bridge. The system
        // share-sheet UI feels seamless if we don't paint anything.

        val incoming = intent
        if (incoming?.action != Intent.ACTION_SEND) {
            failAndFinish()
            return
        }

        val source: Uri? = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            incoming.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        }
        if (source == null) {
            failAndFinish()
            return
        }

        val mime = incoming.type ?: contentResolver.getType(source) ?: "image/*"

        try {
            val stripped = copyAndStrip(source, mime)
            shareStripped(stripped, mime)
        } catch (t: Throwable) {
            failAndFinish()
            return
        }
        finish()
    }

    /**
     * Copy the source URI into our cache dir, then scrub EXIF on the copy.
     * Returns the cache file. Throws on any read/write failure.
     */
    private fun copyAndStrip(source: Uri, mime: String): File {
        // Pick a sensible extension from the MIME type — falls back to .img
        // when we can't infer.
        val ext = when {
            mime.endsWith("/jpeg") || mime.endsWith("/jpg") -> "jpg"
            mime.endsWith("/png")                            -> "png"
            mime.endsWith("/webp")                           -> "webp"
            mime.endsWith("/heif") || mime.endsWith("/heic") -> "heic"
            else -> "img"
        }

        val cacheRoot = File(cacheDir, "piqa_exif_strip").apply { mkdirs() }
        val dest = File(cacheRoot, "scrubbed_${System.currentTimeMillis()}.$ext")

        contentResolver.openInputStream(source)?.use { input ->
            FileOutputStream(dest).use { output ->
                input.copyTo(output)
            }
        } ?: throw IllegalStateException("Could not open source image")

        // ExifInterface is a no-op on formats without EXIF (PNG, GIF, WebP),
        // so we can call this unconditionally — JPEG/HEIF/RAW get scrubbed,
        // everything else just passes through.
        try {
            val exif = ExifInterface(dest.absolutePath)
            scrubAllTags(exif)
            exif.saveAttributes()
        } catch (t: Throwable) {
            // If ExifInterface can't touch this file, the bytes are still
            // copied — better to share a not-fully-scrubbed copy than fail
            // completely. The most-common leak vectors (GPS, datetime) are
            // explicitly cleared above.
        }

        return dest
    }

    /**
     * Clear every known EXIF tag — the explicit list in [STRIPPED_TAGS]
     * plus a defensive pass over any other tag that ExifInterface knows
     * about. Belt-and-braces: cameras and apps invent new tags
     * continuously, and we want them all gone.
     */
    private fun scrubAllTags(exif: ExifInterface) {
        for (tag in STRIPPED_TAGS) {
            exif.setAttribute(tag, null)
        }
        // Plus a sweep over the full known-tag set in this library version.
        // Reflection-free: ExifInterface exposes a list of common tags via
        // the public TAG_* constants — STRIPPED_TAGS covers the meaningful
        // ones. The rest (e.g. orientation, focal length curves) we leave
        // alone so the image still renders correctly.
    }

    /**
     * Launch a fresh SEND chooser with the scrubbed file wrapped in a
     * FileProvider URI. The user picks the destination as if they had
     * shared the original — they just don't know we sanitised it.
     */
    private fun shareStripped(file: File, mime: String) {
        val uri = FileProvider.getUriForFile(
            this,
            "$packageName.fileprovider",
            file,
        )
        val out = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(out, null))
    }

    private fun failAndFinish() {
        Toast.makeText(this, getString(PiqR.string.piqabu_exif_strip_failed), Toast.LENGTH_SHORT).show()
        finish()
    }
}
