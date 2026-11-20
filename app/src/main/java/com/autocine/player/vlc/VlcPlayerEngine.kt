package com.autocine.player.vlc

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

enum class AspectRatioOption(val label: String) {
    FIT("Ajustar"),
    FILL("Preencher"),
    STRETCH("Esticar"),
    RATIO_16_9("16:9"),
    RATIO_4_3("4:3");

    fun next(): AspectRatioOption {
        val values = entries
        return values[(ordinal + 1) % values.size]
    }
}

class VlcPlayerEngine(private val context: Context) {

    private var libVlc: LibVLC? = null
    private var mediaPlayer: MediaPlayer? = null
    private var currentPfd: ParcelFileDescriptor? = null
    private var attachedLayout: VLCVideoLayout? = null

    private var baseVolumePercent: Int = 100
    private var duckMultiplier: Float = 1f
    private var currentAspectRatio: AspectRatioOption = AspectRatioOption.FIT

    var onTimeChanged: ((positionMs: Long, durationMs: Long) -> Unit)? = null
    var onPlayingChanged: ((isPlaying: Boolean) -> Unit)? = null
    var onTrackEnded: (() -> Unit)? = null

    init {
        initVlc()
    }

    private fun initVlc() {
        // Opções otimizadas para centrais multimídia com hardware modesto:
        // aceleração por hardware com fallback automático para software, baixo uso de RAM e cache USB rápido.
        val options = arrayListOf(
            "--file-caching=600",
            "--network-caching=1000",
            "--drop-late-frames",
            "--skip-frames",
            "--avcodec-fast",
            "--avcodec-hw=any",
            "--audio-time-stretch",
            "--no-stats",
            "--no-osd"
        )
        libVlc = LibVLC(context.applicationContext, options)
        mediaPlayer = MediaPlayer(libVlc).apply {
            setEventListener { event ->
                when (event.type) {
                    MediaPlayer.Event.Playing -> onPlayingChanged?.invoke(true)
                    MediaPlayer.Event.Paused,
                    MediaPlayer.Event.Stopped -> onPlayingChanged?.invoke(false)
                    MediaPlayer.Event.TimeChanged -> {
                        val pos = time.coerceAtLeast(0L)
                        val dur = length.coerceAtLeast(0L)
                        onTimeChanged?.invoke(pos, dur)
                    }
                    MediaPlayer.Event.EndReached -> onTrackEnded?.invoke()
                }
            }
        }
    }

    /**
     * Anexa a superfície de vídeo (Tela Cheia, Mini-Player ou PiP) sem interromper a reprodução.
     */
    fun attachVideoLayout(layout: VLCVideoLayout) {
        val player = mediaPlayer ?: return
        if (attachedLayout === layout) return
        if (attachedLayout != null) {
            player.detachViews()
        }
        attachedLayout = layout
        player.attachViews(layout, null, false, false)
        applyAspectRatio(currentAspectRatio)
    }

    /**
     * Desanexa apenas a View visual ao entrar em segundo plano ou trocar de modo, mantendo o áudio rodando.
     */
    fun detachVideoLayout(layout: VLCVideoLayout) {
        val player = mediaPlayer ?: return
        if (attachedLayout === layout) {
            player.detachViews()
            attachedLayout = null
        }
    }

    fun playUri(uri: Uri) {
        val vlc = libVlc ?: return
        val player = mediaPlayer ?: return

        closeActiveDescriptor()

        val media = if (uri.scheme == "content") {
            val pfd = context.contentResolver.openFileDescriptor(uri, "r")
            currentPfd = pfd
            if (pfd != null) {
                Media(vlc, pfd.fileDescriptor)
            } else {
                Media(vlc, uri)
            }
        } else {
            Media(vlc, uri)
        }

        // Ativa aceleração por hardware (HW) com fallback automático para decodificação por software (SW)
        media.setHWDecoderEnabled(true, false)
        media.addOption(":codec=mediacodec_ndk,mediacodec_jni,all")

        player.media = media
        media.release()
        applyEffectiveVolume()
        player.play()
        applyAspectRatio(currentAspectRatio)
    }

    fun play() {
        mediaPlayer?.play()
    }

    fun pause() {
        mediaPlayer?.pause()
    }

    fun togglePlayPause() {
        val player = mediaPlayer ?: return
        if (player.isPlaying) player.pause() else player.play()
    }

    fun isPlaying(): Boolean = mediaPlayer?.isPlaying == true

    fun seekTo(positionMs: Long) {
        val player = mediaPlayer ?: return
        val maxLen = player.length.takeIf { it > 0L } ?: Long.MAX_VALUE
        player.time = positionMs.coerceIn(0L, maxLen)
    }

    fun getPositionMs(): Long = mediaPlayer?.time?.coerceAtLeast(0L) ?: 0L

    fun getDurationMs(): Long = mediaPlayer?.length?.coerceAtLeast(0L) ?: 0L

    fun setDucking(ducked: Boolean) {
        duckMultiplier = if (ducked) 0.25f else 1.0f
        applyEffectiveVolume()
    }

    fun setBaseVolume(percent: Int) {
        baseVolumePercent = percent.coerceIn(0, 100)
        applyEffectiveVolume()
    }

    private fun applyEffectiveVolume() {
        val effective = (baseVolumePercent * duckMultiplier).toInt().coerceIn(0, 100)
        mediaPlayer?.volume = effective
    }

    fun applyAspectRatio(option: AspectRatioOption) {
        currentAspectRatio = option
        val player = mediaPlayer ?: return
        when (option) {
            AspectRatioOption.FIT -> {
                player.aspectRatio = null
                player.videoScale = MediaPlayer.ScaleType.SURFACE_BEST_FIT
            }
            AspectRatioOption.FILL -> {
                player.aspectRatio = null
                player.videoScale = MediaPlayer.ScaleType.SURFACE_FILL
            }
            AspectRatioOption.STRETCH -> {
                player.aspectRatio = null
                player.videoScale = MediaPlayer.ScaleType.SURFACE_FIT_SCREEN
            }
            AspectRatioOption.RATIO_16_9 -> {
                player.aspectRatio = "16:9"
                player.videoScale = MediaPlayer.ScaleType.SURFACE_BEST_FIT
            }
            AspectRatioOption.RATIO_4_3 -> {
                player.aspectRatio = "4:3"
                player.videoScale = MediaPlayer.ScaleType.SURFACE_BEST_FIT
            }
        }
    }

    private fun closeActiveDescriptor() {
        runCatching { currentPfd?.close() }
        currentPfd = null
    }

    fun release() {
        mediaPlayer?.stop()
        mediaPlayer?.detachViews()
        mediaPlayer?.release()
        libVlc?.release()
        closeActiveDescriptor()
        mediaPlayer = null
        libVlc = null
    }
}
