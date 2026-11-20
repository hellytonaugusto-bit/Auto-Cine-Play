package com.autocine.player.vlc

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
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

    companion object {
        // Volume interno da libVLC sempre travado em 100% para não conflitar com o volume geral da multimídia
        private const val FIXED_VLC_VOLUME = 100
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var libVlc: LibVLC? = null
    private var mediaPlayer: MediaPlayer? = null
    private var currentPfd: ParcelFileDescriptor? = null
    private var attachedLayout: VLCVideoLayout? = null

    private var useInternalVolume: Boolean = false
    private var internalVolumePercent: Int = FIXED_VLC_VOLUME
    private var duckMultiplier: Float = 1f
    private var currentAspectRatio: AspectRatioOption = AspectRatioOption.FIT

    @Volatile
    var currentMediaUri: Uri? = null
        private set

    @Volatile
    var lastKnownPositionMs: Long = 0L
        private set

    @Volatile
    private var pendingSeekPositionMs: Long = 0L

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
            volume = FIXED_VLC_VOLUME
            setEventListener { event ->
                when (event.type) {
                    MediaPlayer.Event.Playing -> {
                        val resumeMs = pendingSeekPositionMs
                        if (resumeMs > 1000L) {
                            pendingSeekPositionMs = 0L
                            val maxLen = length.takeIf { it > 0L } ?: Long.MAX_VALUE
                            time = resumeMs.coerceIn(0L, maxLen)
                        }
                        applyEffectiveVolume()
                        mainHandler.post { applyAspectRatioInternal(currentAspectRatio) }
                        onPlayingChanged?.invoke(true)
                    }
                    MediaPlayer.Event.Vout -> {
                        if (event.voutCount > 0) {
                            mainHandler.post {
                                mediaPlayer?.updateVideoSurfaces()
                                applyAspectRatioInternal(currentAspectRatio)
                            }
                        }
                    }
                    MediaPlayer.Event.Paused,
                    MediaPlayer.Event.Stopped -> {
                        val currentPos = time.coerceAtLeast(0L)
                        if (currentPos > 0L) lastKnownPositionMs = currentPos
                        onPlayingChanged?.invoke(false)
                    }
                    MediaPlayer.Event.TimeChanged -> {
                        val pos = time.coerceAtLeast(0L)
                        val dur = length.coerceAtLeast(0L)
                        if (pos > 0L) lastKnownPositionMs = pos
                        onTimeChanged?.invoke(pos, dur)
                    }
                    MediaPlayer.Event.EndReached -> {
                        lastKnownPositionMs = 0L
                        pendingSeekPositionMs = 0L
                        onTrackEnded?.invoke()
                    }
                }
            }
        }
    }

    /**
     * Anexa a superfície de vídeo (Tela Cheia, Mini-Player ou PiP) sem interromper nem reiniciar o vídeo.
     */
    fun attachVideoLayout(layout: VLCVideoLayout) {
        val player = mediaPlayer ?: return
        if (attachedLayout === layout) return
        if (attachedLayout != null) {
            player.detachViews()
        }
        attachedLayout = layout
        player.attachViews(layout, null, false, false)
        applyAspectRatioInternal(currentAspectRatio)
    }

    /**
     * Desanexa apenas a View visual ao trocar de tela ou ir para segundo plano, mantendo áudio e posição intactos.
     */
    fun detachVideoLayout(layout: VLCVideoLayout) {
        val player = mediaPlayer ?: return
        if (attachedLayout === layout) {
            val pos = player.time.coerceAtLeast(0L)
            if (pos > 0L) lastKnownPositionMs = pos
            player.detachViews()
            attachedLayout = null
        }
    }

    fun hasActiveMedia(): Boolean {
        return currentMediaUri != null && mediaPlayer?.hasMedia() == true
    }

    fun hasActiveMediaFor(uri: Uri): Boolean {
        return currentMediaUri == uri && mediaPlayer?.hasMedia() == true
    }

    /**
     * Carrega e reproduz uma URI. Se a mesma mídia já estiver ativa e forceRestart == false,
     * nunca recarrega nem reinicia do 00:00 — apenas garante volume em 100%, proporção e continuidade.
     */
    fun playUri(uri: Uri, startPositionMs: Long = 0L, forceRestart: Boolean = false) {
        val vlc = libVlc ?: return
        val player = mediaPlayer ?: return

        if (!forceRestart && hasActiveMediaFor(uri)) {
            applyEffectiveVolume()
            mainHandler.post { applyAspectRatioInternal(currentAspectRatio) }
            if (!player.isPlaying) {
                player.play()
            }
            return
        }

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

        // Sempre interrompe a mídia anterior antes de atribuir a nova Media para evitar tela preta intermitente
        player.stop()

        // Ativa aceleração por hardware (HW) sem forçar, permitindo fallback automático para software (SW)
        media.setHWDecoderEnabled(true, false)
        media.addOption(":codec=mediacodec_ndk,mediacodec_jni,all")

        currentMediaUri = uri
        pendingSeekPositionMs = startPositionMs.coerceAtLeast(0L)
        lastKnownPositionMs = startPositionMs.coerceAtLeast(0L)

        player.media = media
        media.release()
        applyEffectiveVolume()
        player.play()
        if (startPositionMs > 1000L) {
            player.time = startPositionMs
        }
        mainHandler.post { applyAspectRatioInternal(currentAspectRatio) }
    }

    fun play() {
        applyEffectiveVolume()
        mediaPlayer?.play()
    }

    fun pause() {
        val pos = mediaPlayer?.time?.coerceAtLeast(0L) ?: 0L
        if (pos > 0L) lastKnownPositionMs = pos
        mediaPlayer?.pause()
    }

    fun togglePlayPause() {
        val player = mediaPlayer ?: return
        if (player.isPlaying) {
            pause()
        } else {
            play()
        }
    }

    fun isPlaying(): Boolean = mediaPlayer?.isPlaying == true

    fun seekTo(positionMs: Long) {
        val player = mediaPlayer ?: return
        val maxLen = player.length.takeIf { it > 0L } ?: Long.MAX_VALUE
        val clamped = positionMs.coerceIn(0L, maxLen)
        lastKnownPositionMs = clamped
        player.time = clamped
    }

    fun getPositionMs(): Long {
        val live = mediaPlayer?.time ?: -1L
        return if (live > 0L) live else lastKnownPositionMs.coerceAtLeast(0L)
    }

    fun getDurationMs(): Long = mediaPlayer?.length?.coerceAtLeast(0L) ?: 0L

    fun setInternalVolumeEnabled(enabled: Boolean) {
        useInternalVolume = enabled
        applyEffectiveVolume()
    }

    fun setInternalVolume(percent: Int) {
        internalVolumePercent = percent.coerceIn(0, 100)
        applyEffectiveVolume()
    }

    fun getInternalVolume(): Int = if (useInternalVolume) internalVolumePercent else FIXED_VLC_VOLUME

    fun setDucking(ducked: Boolean) {
        duckMultiplier = if (ducked) 0.25f else 1.0f
        applyEffectiveVolume()
    }

    private fun applyEffectiveVolume() {
        val baseVolume = if (useInternalVolume) internalVolumePercent else FIXED_VLC_VOLUME
        val effective = (baseVolume * duckMultiplier).toInt().coerceIn(0, 100)
        mediaPlayer?.setVolume(effective)
    }

    fun applyAspectRatio(option: AspectRatioOption) {
        currentAspectRatio = option
        if (Looper.myLooper() == Looper.getMainLooper()) {
            applyAspectRatioInternal(option)
        } else {
            mainHandler.post { applyAspectRatioInternal(option) }
        }
    }

    fun reapplyAspectRatio() {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            applyAspectRatioInternal(currentAspectRatio)
        } else {
            mainHandler.post { applyAspectRatioInternal(currentAspectRatio) }
        }
    }

    private fun applyAspectRatioInternal(option: AspectRatioOption) {
        val player = mediaPlayer ?: return
        // Sempre reseta scale e aspectRatio antes de aplicar o ScaleType nativo da libVLC
        player.scale = 0f
        player.aspectRatio = null
        when (option) {
            AspectRatioOption.FIT -> {
                player.videoScale = MediaPlayer.ScaleType.SURFACE_BEST_FIT
            }
            AspectRatioOption.FILL -> {
                player.videoScale = MediaPlayer.ScaleType.SURFACE_FIT_SCREEN
            }
            AspectRatioOption.STRETCH -> {
                player.videoScale = MediaPlayer.ScaleType.SURFACE_FILL
            }
            AspectRatioOption.RATIO_16_9 -> {
                player.aspectRatio = "16:9"
                player.videoScale = MediaPlayer.ScaleType.SURFACE_16_9
            }
            AspectRatioOption.RATIO_4_3 -> {
                player.aspectRatio = "4:3"
                player.videoScale = MediaPlayer.ScaleType.SURFACE_4_3
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
        attachedLayout = null
        currentMediaUri = null
        mediaPlayer = null
        libVlc = null
    }
}
