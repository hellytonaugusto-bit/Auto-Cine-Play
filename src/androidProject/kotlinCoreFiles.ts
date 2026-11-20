import type { AndroidProjectFile } from './buildAndManifestFiles';

export const KOTLIN_CORE_FILES: AndroidProjectFile[] = [
  {
    path: 'app/src/main/java/com/autocine/player/vlc/VlcPlayerEngine.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Motor libVLC com decodificação por hardware + fallback automático por software, 5 proporções de tela e troca contínua de Surface sem pausar',
    content: `package com.autocine.player.vlc

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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/audio/AudioFocusController.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Gerenciamento moderno AudioFocusRequest: ducking para Waze/Maps e pausa apenas quando outro app assume o áudio',
    content: `package com.autocine.player.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager

class AudioFocusController(
    context: Context,
    private val onPauseRequired: () -> Unit,
    private val onResumeAllowed: () -> Unit,
    private val onDuckChanged: (Boolean) -> Unit
) {
    private val audioManager =
        context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var pausedByTransientLoss = false
    private var hasFocus = false

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasFocus = true
                onDuckChanged(false)
                if (pausedByTransientLoss) {
                    pausedByTransientLoss = false
                    onResumeAllowed()
                }
            }
            AudioManager.AUDIOFOCUS_LOSS -> {
                // Outro app assumiu áudio exclusivo (Spotify, YouTube, Rádio, Ligação longa)
                hasFocus = false
                pausedByTransientLoss = false
                onDuckChanged(false)
                onPauseRequired()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Interrupção temporária (ex.: chamada curta ou assistente de voz)
                pausedByTransientLoss = true
                onDuckChanged(false)
                onPauseRequired()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // Navegação GPS (Waze / Google Maps): apenas reduz volume sem pausar
                onDuckChanged(true)
            }
        }
    }

    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
        .build()

    private val focusRequest: AudioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(audioAttributes)
        .setAcceptsDelayedFocusGain(true)
        .setWillPauseWhenDucked(false)
        .setOnAudioFocusChangeListener(focusChangeListener)
        .build()

    fun requestFocus(): Boolean {
        if (hasFocus) return true
        val result = audioManager.requestAudioFocus(focusRequest)
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasFocus
    }

    fun abandonFocus() {
        audioManager.abandonAudioFocusRequest(focusRequest)
        hasFocus = false
        pausedByTransientLoss = false
        onDuckChanged(false)
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/service/VideoPlaybackService.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Foreground Service (mediaPlayback) + MediaSession que mantém vídeo e áudio vivos em segundo plano e durante a Câmera de Ré',
    content: `package com.autocine.player.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.IBinder
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.autocine.player.MainActivity
import com.autocine.player.R
import com.autocine.player.audio.AudioFocusController
import com.autocine.player.vlc.VlcPlayerEngine

class VideoPlaybackService : Service() {

    companion object {
        const val CHANNEL_ID = "autocine_playback_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PREV = "com.autocine.player.ACTION_PREV"
        const val ACTION_TOGGLE = "com.autocine.player.ACTION_TOGGLE"
        const val ACTION_NEXT = "com.autocine.player.ACTION_NEXT"

        fun start(context: Context) {
            val intent = Intent(context, VideoPlaybackService::class.java)
            context.startForegroundService(intent)
        }
    }

    inner class LocalBinder : Binder() {
        fun getService(): VideoPlaybackService = this@VideoPlaybackService
    }

    private val binder = LocalBinder()
    lateinit var engine: VlcPlayerEngine
        private set
    lateinit var audioFocus: AudioFocusController
        private set

    private lateinit var mediaSession: MediaSessionCompat
    private var currentTitle: String = "AutoCine Player"
    private var isPlayingNow: Boolean = false

    var onExternalPrev: (() -> Unit)? = null
    var onExternalNext: (() -> Unit)? = null
    var onExternalToggle: (() -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        engine = VlcPlayerEngine(this)
        audioFocus = AudioFocusController(
            context = this,
            onPauseRequired = { engine.pause() },
            onResumeAllowed = { engine.play() },
            onDuckChanged = { ducked -> engine.setDucking(ducked) }
        )

        mediaSession = MediaSessionCompat(this, "AutoCineMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    if (audioFocus.requestFocus()) engine.play()
                }
                override fun onPause() = engine.pause()
                override fun onSkipToNext() { onExternalNext?.invoke() }
                override fun onSkipToPrevious() { onExternalPrev?.invoke() }
            })
            isActive = true
        }

        startForeground(
            NOTIFICATION_ID,
            buildNotification(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREV -> onExternalPrev?.invoke()
            ACTION_TOGGLE -> onExternalToggle?.invoke()
            ACTION_NEXT -> onExternalNext?.invoke()
        }
        return START_STICKY
    }

    fun updateNotification(title: String, playing: Boolean) {
        currentTitle = title
        isPlayingNow = playing
        val state = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            )
            .setState(
                if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                engine.getPositionMs(),
                1f
            )
            .build()
        mediaSession.setPlaybackState(state)

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val prevPending = serviceActionIntent(ACTION_PREV, 1)
        val togglePending = serviceActionIntent(ACTION_TOGGLE, 2)
        val nextPending = serviceActionIntent(ACTION_NEXT, 3)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(if (isPlayingNow) "Reproduzindo em segundo plano" else "Pausado")
            .setContentIntent(openAppIntent)
            .setOngoing(isPlayingNow)
            .setSilent(true)
            .addAction(android.R.drawable.ic_media_previous, getString(R.string.pip_action_prev), prevPending)
            .addAction(
                if (isPlayingNow) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlayingNow) getString(R.string.pip_action_pause) else getString(R.string.pip_action_play),
                togglePending
            )
            .addAction(android.R.drawable.ic_media_next, getString(R.string.pip_action_next), nextPending)
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
    }

    private fun serviceActionIntent(action: String, code: Int): PendingIntent {
        val intent = Intent(this, VideoPlaybackService::class.java).setAction(action)
        return PendingIntent.getService(
            this,
            code,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            setShowBadge(false)
        }
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        audioFocus.abandonFocus()
        mediaSession.release()
        engine.release()
        super.onDestroy()
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/data/StorageRepository.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Leitura SAF/File hierárquica (pastas e subpastas no USB OTG / SD Card / Interna), filtro manual do modo Todas, busca parcial sem acentos (NFD), ordenação e exclusão direta',
    content: `package com.autocine.player.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.Normalizer

enum class SortOrder(val label: String) {
    NAME_ASC("Nome (A–Z)"),
    NAME_DESC("Nome (Z–A)"),
    DATE_DESC("Mais recentes");

    fun next(): SortOrder = entries[(ordinal + 1) % entries.size]
}

data class VideoFileItem(
    val id: String,
    val uri: Uri,
    val name: String,
    val sizeBytes: Long,
    val lastModified: Long,
    val isSafDocument: Boolean,
    val folderName: String = "",
    val folderId: String = ""
)

data class FolderEntry(
    val id: String,
    val name: String,
    val relativePath: List<String>,
    val sourceLabel: String,
    val depth: Int = 0,
    val videoCount: Int = 0
)

data class DirectorySnapshot(
    val subfolders: List<FolderEntry>,
    val videos: List<VideoFileItem>
)

class StorageRepository(private val context: Context) {

    companion object {
        private val VIDEO_EXTENSIONS = setOf(
            "mp4", "mkv", "avi", "mov", "wmv", "flv",
            "webm", "ts", "mpg", "mpeg", "3gp", "m4v", "vob"
        )

        private val DIACRITICS_REGEX = Regex("\\\\p{InCombiningDiacriticalMarks}+")

        /**
         * Normaliza texto removendo acentos e ignorando maiúsculas/minúsculas.
         * Ex.: "pagode e forró.mp4" -> "pagode e forro.mp4" (encontrado por "gode" ou "forro").
         */
        fun normalizeForSearch(input: String): String {
            val nfd = Normalizer.normalize(input, Normalizer.Form.NFD)
            return DIACRITICS_REGEX.replace(nfd, "").lowercase().trim()
        }

        fun filterBySubstring(items: List<VideoFileItem>, query: String): List<VideoFileItem> {
            val normalizedQuery = normalizeForSearch(query)
            if (normalizedQuery.isEmpty()) return items
            return items.filter { normalizeForSearch(it.name).contains(normalizedQuery) }
        }

        fun sortItems(items: List<VideoFileItem>, sortOrder: SortOrder): List<VideoFileItem> =
            when (sortOrder) {
                SortOrder.NAME_ASC -> items.sortedBy { normalizeForSearch(it.name) }
                SortOrder.NAME_DESC -> items.sortedByDescending { normalizeForSearch(it.name) }
                SortOrder.DATE_DESC -> items.sortedByDescending { it.lastModified }
            }
    }

    /**
     * Lista subpastas imediatas + vídeos do diretório atual (suporta subpastas em múltiplos níveis
     * sem precisar reabrir o seletor SAF do sistema).
     */
    suspend fun scanDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList()
    ): DirectorySnapshot = withContext(Dispatchers.IO) {
        if (rootUriString.isEmpty()) return@withContext DirectorySnapshot(emptyList(), emptyList())
        if (rootUriString.startsWith("content://")) {
            scanSafDirectory(Uri.parse(rootUriString), relativePath)
        } else {
            scanDirectDirectorySnapshot(File(rootUriString), relativePath)
        }
    }

    /**
     * Descobre todas as pastas e subpastas disponíveis (SAF USB/SD + buckets do MediaStore)
     * para o usuário escolher manualmente quais entram no modo "Todas".
     */
    suspend fun discoverSelectableFolders(savedRootUri: String): List<FolderEntry> = withContext(Dispatchers.IO) {
        val entries = mutableListOf<FolderEntry>()

        if (savedRootUri.isNotEmpty()) {
            if (savedRootUri.startsWith("content://")) {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(savedRootUri))
                if (root != null) {
                    collectSafFolders(root, emptyList(), 0, entries)
                }
            } else {
                val rootDir = File(savedRootUri)
                if (rootDir.exists() && rootDir.isDirectory) {
                    collectDirectFolders(rootDir, emptyList(), 0, entries)
                }
            }
        }

        val mediaStoreByFolder = queryMediaStoreVideos().groupBy { it.folderId }
        mediaStoreByFolder.forEach { (folderId, items) ->
            val displayName = items.firstOrNull()?.folderName ?: "Armazenamento"
            entries.add(
                FolderEntry(
                    id = folderId,
                    name = displayName,
                    relativePath = emptyList(),
                    sourceLabel = "Armazenamento do Dispositivo",
                    depth = 0,
                    videoCount = items.size
                )
            )
        }

        entries
    }

    /**
     * Modo "Todas as Pastas": combina vídeos das pastas e subpastas escolhidas manualmente
     * pelo usuário (ou todas disponíveis quando selectedFolderIds == null).
     */
    suspend fun scanAllFoldersCombined(
        savedFolderUri: String,
        selectedFolderIds: Set<String>? = null
    ): List<VideoFileItem> = withContext(Dispatchers.IO) {
        val uniqueById = LinkedHashMap<String, VideoFileItem>()

        if (savedFolderUri.isNotEmpty()) {
            val fromSaved = if (savedFolderUri.startsWith("content://")) {
                scanSafTree(Uri.parse(savedFolderUri), recursive = true)
            } else {
                scanDirectDirectory(File(savedFolderUri), recursive = true)
            }
            fromSaved
                .filter { selectedFolderIds == null || it.folderId in selectedFolderIds }
                .forEach { uniqueById[it.id] = it }
        }

        queryMediaStoreVideos()
            .filter { selectedFolderIds == null || it.folderId in selectedFolderIds }
            .forEach { item ->
                val duplicateByNameAndSize = uniqueById.values.any {
                    it.name == item.name && it.sizeBytes == item.sizeBytes
                }
                if (!duplicateByNameAndSize) {
                    uniqueById[item.id] = item
                }
            }

        uniqueById.values.toList()
    }

    private fun resolveSafTarget(treeUri: Uri, relativePath: List<String>): DocumentFile? {
        var current = DocumentFile.fromTreeUri(context, treeUri) ?: return null
        for (segment in relativePath) {
            current = current.listFiles().firstOrNull { it.isDirectory && it.name == segment }
                ?: return null
        }
        return current
    }

    private fun scanSafDirectory(treeUri: Uri, relativePath: List<String>): DirectorySnapshot {
        val current = resolveSafTarget(treeUri, relativePath)
            ?: return DirectorySnapshot(emptyList(), emptyList())
        val currentName = current.name ?: "Pasta USB"
        val currentFolderId = "saf:" + relativePath.joinToString("/")

        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        for (doc in current.listFiles()) {
            val name = doc.name ?: continue
            if (doc.isDirectory) {
                val childPath = relativePath + name
                subfolders.add(
                    FolderEntry(
                        id = "saf:" + childPath.joinToString("/"),
                        name = name,
                        relativePath = childPath,
                        sourceLabel = "Pen Drive / Pasta SAF",
                        depth = childPath.size,
                        videoCount = countSafVideosQuick(doc)
                    )
                )
            } else if (doc.isFile) {
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext in VIDEO_EXTENSIONS) {
                    videos.add(
                        VideoFileItem(
                            id = doc.uri.toString(),
                            uri = doc.uri,
                            name = name,
                            sizeBytes = doc.length(),
                            lastModified = doc.lastModified(),
                            isSafDocument = true,
                            folderName = currentName,
                            folderId = currentFolderId
                        )
                    )
                }
            }
        }

        return DirectorySnapshot(
            subfolders = subfolders.sortedBy { normalizeForSearch(it.name) },
            videos = videos
        )
    }

    private fun countSafVideosQuick(dir: DocumentFile): Int =
        dir.listFiles().count { doc ->
            doc.isFile && doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty() in VIDEO_EXTENSIONS
        }

    private fun collectSafFolders(
        dir: DocumentFile,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>
    ) {
        if (depth > 6) return
        val children = dir.listFiles()
        val directVideos = children.count { doc ->
            doc.isFile && doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty() in VIDEO_EXTENSIONS
        }
        out.add(
            FolderEntry(
                id = "saf:" + path.joinToString("/"),
                name = dir.name ?: "Pasta Raiz",
                relativePath = path,
                sourceLabel = "Pen Drive / Pasta SAF",
                depth = depth,
                videoCount = directVideos
            )
        )
        children
            .filter { it.isDirectory && !it.name.isNullOrBlank() }
            .sortedBy { normalizeForSearch(it.name.orEmpty()) }
            .forEach { sub ->
                collectSafFolders(sub, path + sub.name!!, depth + 1, out)
            }
    }

    private fun scanDirectDirectorySnapshot(rootDir: File, relativePath: List<String>): DirectorySnapshot {
        val current = relativePath.fold(rootDir) { acc, seg -> File(acc, seg) }
        if (!current.exists() || !current.isDirectory) return DirectorySnapshot(emptyList(), emptyList())
        val currentFolderId = "file:" + relativePath.joinToString("/")

        val children = current.listFiles().orEmpty()
        val subfolders = children
            .filter { it.isDirectory && !it.name.startsWith(".") }
            .sortedBy { normalizeForSearch(it.name) }
            .map { sub ->
                val childPath = relativePath + sub.name
                val directCount = sub.listFiles().orEmpty().count {
                    it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS
                }
                FolderEntry(
                    id = "file:" + childPath.joinToString("/"),
                    name = sub.name,
                    relativePath = childPath,
                    sourceLabel = "Armazenamento Direto",
                    depth = childPath.size,
                    videoCount = directCount
                )
            }

        val videos = children
            .filter { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
            .map { file ->
                VideoFileItem(
                    id = file.absolutePath,
                    uri = Uri.fromFile(file),
                    name = file.name,
                    sizeBytes = file.length(),
                    lastModified = file.lastModified(),
                    isSafDocument = false,
                    folderName = current.name,
                    folderId = currentFolderId
                )
            }

        return DirectorySnapshot(subfolders = subfolders, videos = videos)
    }

    private fun collectDirectFolders(
        dir: File,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>
    ) {
        if (depth > 6) return
        val children = dir.listFiles().orEmpty()
        val directVideos = children.count { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
        out.add(
            FolderEntry(
                id = "file:" + path.joinToString("/"),
                name = dir.name.ifBlank { "Raiz" },
                relativePath = path,
                sourceLabel = "Armazenamento Direto",
                depth = depth,
                videoCount = directVideos
            )
        )
        children
            .filter { it.isDirectory && !it.name.startsWith(".") }
            .sortedBy { normalizeForSearch(it.name) }
            .forEach { sub ->
                collectDirectFolders(sub, path + sub.name, depth + 1, out)
            }
    }

    private fun scanSafTree(treeUri: Uri, recursive: Boolean): List<VideoFileItem> {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: return emptyList()
        val collected = mutableListOf<VideoFileItem>()

        fun walk(dir: DocumentFile, path: List<String>, depth: Int) {
            if (depth > 8) return
            val dirName = dir.name ?: "Pasta USB"
            val folderId = "saf:" + path.joinToString("/")
            for (doc in dir.listFiles()) {
                if (doc.isDirectory && recursive && !doc.name.isNullOrBlank()) {
                    walk(doc, path + doc.name!!, depth + 1)
                } else if (doc.isFile) {
                    val ext = doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty()
                    if (ext in VIDEO_EXTENSIONS) {
                        collected.add(
                            VideoFileItem(
                                id = doc.uri.toString(),
                                uri = doc.uri,
                                name = doc.name ?: "video.mp4",
                                sizeBytes = doc.length(),
                                lastModified = doc.lastModified(),
                                isSafDocument = true,
                                folderName = dirName,
                                folderId = folderId
                            )
                        )
                    }
                }
            }
        }

        walk(root, emptyList(), 0)
        return collected
    }

    private fun scanDirectDirectory(dir: File, recursive: Boolean): List<VideoFileItem> {
        if (!dir.exists() || !dir.isDirectory) return emptyList()
        val sequence = if (recursive) dir.walkTopDown().maxDepth(8) else dir.listFiles().orEmpty().asSequence()
        return sequence
            .filter { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
            .map { file ->
                val relDir = file.parentFile?.relativeToOrNull(dir)?.path.orEmpty()
                val folderId = "file:" + if (relDir == ".") "" else relDir
                VideoFileItem(
                    id = file.absolutePath,
                    uri = Uri.fromFile(file),
                    name = file.name,
                    sizeBytes = file.length(),
                    lastModified = file.lastModified(),
                    isSafDocument = false,
                    folderName = file.parentFile?.name ?: "Armazenamento",
                    folderId = folderId
                )
            }
            .toList()
    }

    private fun queryMediaStoreVideos(): List<VideoFileItem> {
        val results = mutableListOf<VideoFileItem>()
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_MODIFIED,
            MediaStore.Video.Media.BUCKET_ID,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME
        )
        runCatching {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "\${MediaStore.Video.Media.DISPLAY_NAME} ASC"
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val modCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_MODIFIED)
                val bucketIdCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_ID)
                val bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val name = cursor.getString(nameCol) ?: continue
                    val bucketId = cursor.getString(bucketIdCol) ?: "default"
                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        id
                    )
                    results.add(
                        VideoFileItem(
                            id = contentUri.toString(),
                            uri = contentUri,
                            name = name,
                            sizeBytes = cursor.getLong(sizeCol),
                            lastModified = cursor.getLong(modCol) * 1000L,
                            isSafDocument = true,
                            folderName = cursor.getString(bucketCol) ?: "Dispositivo",
                            folderId = "bucket:\$bucketId"
                        )
                    )
                }
            }
        }
        return results
    }

    suspend fun deleteVideo(item: VideoFileItem): Boolean = withContext(Dispatchers.IO) {
        if (item.isSafDocument) {
            DocumentFile.fromSingleUri(context, item.uri)?.delete() == true
        } else {
            File(item.id).delete()
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/data/PreferencesManager.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Persistência com Jetpack DataStore lembrando pasta raiz (USB/SD/Interna), pastas selecionadas do modo Todas, modo de reprodução, proporção e ordenação',
    content: `package com.autocine.player.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.autocine.player.vlc.AspectRatioOption
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "autocine_prefs")

enum class PlaybackMode(val label: String) {
    SEQUENTIAL("Sequencial"),
    SHUFFLE("Aleatório"),
    REPEAT_ONE("Repetir");

    fun next(): PlaybackMode = entries[(ordinal + 1) % entries.size]
}

data class SavedPlayerPrefs(
    val folderUri: String = "",
    val folderDisplayName: String = "Selecione uma pasta (USB / SD / Interna)",
    val playAllFolders: Boolean = false,
    val allFilterCustomized: Boolean = false,
    val selectedAllFolderIds: Set<String> = emptySet(),
    val lastVideoId: String = "",
    val playbackMode: PlaybackMode = PlaybackMode.SEQUENTIAL,
    val aspectRatio: AspectRatioOption = AspectRatioOption.FIT,
    val sortOrder: SortOrder = SortOrder.NAME_ASC
)

class PreferencesManager(private val context: Context) {

    private object Keys {
        val FOLDER_URI = stringPreferencesKey("saved_folder_uri")
        val FOLDER_NAME = stringPreferencesKey("saved_folder_name")
        val PLAY_ALL_FOLDERS = booleanPreferencesKey("play_all_folders")
        val ALL_FILTER_CUSTOMIZED = booleanPreferencesKey("all_filter_customized")
        val SELECTED_ALL_FOLDERS = stringSetPreferencesKey("selected_all_folders")
        val LAST_VIDEO_ID = stringPreferencesKey("last_video_id")
        val PLAYBACK_MODE = stringPreferencesKey("playback_mode")
        val ASPECT_RATIO = stringPreferencesKey("aspect_ratio")
        val SORT_ORDER = stringPreferencesKey("sort_order")
    }

    val prefsFlow: Flow<SavedPlayerPrefs> = context.dataStore.data.map { prefs ->
        SavedPlayerPrefs(
            folderUri = prefs[Keys.FOLDER_URI].orEmpty(),
            folderDisplayName = prefs[Keys.FOLDER_NAME] ?: "Selecione uma pasta (USB / SD / Interna)",
            playAllFolders = prefs[Keys.PLAY_ALL_FOLDERS] ?: false,
            allFilterCustomized = prefs[Keys.ALL_FILTER_CUSTOMIZED] ?: false,
            selectedAllFolderIds = prefs[Keys.SELECTED_ALL_FOLDERS] ?: emptySet(),
            lastVideoId = prefs[Keys.LAST_VIDEO_ID].orEmpty(),
            playbackMode = prefs[Keys.PLAYBACK_MODE]
                ?.let { runCatching { PlaybackMode.valueOf(it) }.getOrNull() }
                ?: PlaybackMode.SEQUENTIAL,
            aspectRatio = prefs[Keys.ASPECT_RATIO]
                ?.let { runCatching { AspectRatioOption.valueOf(it) }.getOrNull() }
                ?: AspectRatioOption.FIT,
            sortOrder = prefs[Keys.SORT_ORDER]
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() }
                ?: SortOrder.NAME_ASC
        )
    }

    suspend fun saveFolder(uri: String, displayName: String) {
        context.dataStore.edit {
            it[Keys.FOLDER_URI] = uri
            it[Keys.FOLDER_NAME] = displayName
            it[Keys.PLAY_ALL_FOLDERS] = false
        }
    }

    suspend fun savePlayAllFolders(enabled: Boolean) {
        context.dataStore.edit { it[Keys.PLAY_ALL_FOLDERS] = enabled }
    }

    suspend fun saveSelectedAllFolders(ids: Set<String>?) {
        context.dataStore.edit {
            if (ids == null) {
                it[Keys.ALL_FILTER_CUSTOMIZED] = false
                it.remove(Keys.SELECTED_ALL_FOLDERS)
            } else {
                it[Keys.ALL_FILTER_CUSTOMIZED] = true
                it[Keys.SELECTED_ALL_FOLDERS] = ids
            }
        }
    }

    suspend fun saveLastVideoId(id: String) {
        context.dataStore.edit { it[Keys.LAST_VIDEO_ID] = id }
    }

    suspend fun savePlaybackMode(mode: PlaybackMode) {
        context.dataStore.edit { it[Keys.PLAYBACK_MODE] = mode.name }
    }

    suspend fun saveAspectRatio(ratio: AspectRatioOption) {
        context.dataStore.edit { it[Keys.ASPECT_RATIO] = ratio.name }
    }

    suspend fun saveSortOrder(order: SortOrder) {
        context.dataStore.edit { it[Keys.SORT_ORDER] = order.name }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/viewmodel/PlayerViewModel.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'ViewModel StateFlow com navegação hierárquica em subpastas (sem interromper o Mini-Player), filtro manual de pastas para Todas, busca parcial, ordenação e exclusão',
    content: `package com.autocine.player.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.PlaybackMode
import com.autocine.player.data.PreferencesManager
import com.autocine.player.data.SortOrder
import com.autocine.player.data.StorageRepository
import com.autocine.player.data.VideoFileItem
import com.autocine.player.service.VideoPlaybackService
import com.autocine.player.vlc.AspectRatioOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.random.Random

data class PlayerUiState(
    val folderUri: String = "",
    val rootFolderName: String = "Nenhuma pasta selecionada",
    val folderName: String = "Nenhuma pasta selecionada",
    val folderBreadcrumbs: List<String> = emptyList(),
    val currentSubfolders: List<FolderEntry> = emptyList(),
    val isAllFoldersMode: Boolean = false,
    val selectableAllFolders: List<FolderEntry> = emptyList(),
    val selectedAllFolderIds: Set<String>? = null,
    val isAllFilterDialogOpen: Boolean = false,
    val allVideos: List<VideoFileItem> = emptyList(),
    val browsedVideos: List<VideoFileItem> = emptyList(),
    val visibleVideos: List<VideoFileItem> = emptyList(),
    val currentVideo: VideoFileItem? = null,
    val currentIndexInFolder: Int = -1,
    val isPlaying: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val playbackMode: PlaybackMode = PlaybackMode.SEQUENTIAL,
    val aspectRatio: AspectRatioOption = AspectRatioOption.FIT,
    val sortOrder: SortOrder = SortOrder.NAME_ASC,
    val searchQuery: String = "",
    val isSplitScreen: Boolean = false,
    val isInPipMode: Boolean = false,
    val isScanning: Boolean = false,
    val pendingDeleteItem: VideoFileItem? = null
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = StorageRepository(application)
    private val prefs = PreferencesManager(application)

    private var service: VideoPlaybackService? = null
    private val shuffleBackStack = ArrayDeque<String>()

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = prefs.prefsFlow.first()
            val savedSelection = if (saved.allFilterCustomized) saved.selectedAllFolderIds else null
            _uiState.update {
                it.copy(
                    folderUri = saved.folderUri,
                    rootFolderName = saved.folderDisplayName,
                    folderName = if (saved.playAllFolders) "Todas as Pastas" else saved.folderDisplayName,
                    isAllFoldersMode = saved.playAllFolders,
                    selectedAllFolderIds = savedSelection,
                    playbackMode = saved.playbackMode,
                    aspectRatio = saved.aspectRatio,
                    sortOrder = saved.sortOrder
                )
            }
            if (saved.playAllFolders) {
                loadAllFolders(saved.folderUri, savedSelection, saved.lastVideoId)
            } else if (saved.folderUri.isNotEmpty()) {
                loadDirectory(
                    uriString = saved.folderUri,
                    rootName = saved.folderDisplayName,
                    relativePath = emptyList(),
                    autoResumeVideoId = saved.lastVideoId,
                    replaceActiveQueue = true
                )
            }
        }
    }

    fun bindService(playbackService: VideoPlaybackService) {
        service = playbackService
        playbackService.engine.applyAspectRatio(_uiState.value.aspectRatio)
        playbackService.engine.onPlayingChanged = { playing ->
            _uiState.update { it.copy(isPlaying = playing) }
            val title = _uiState.value.currentVideo?.name ?: "AutoCine Player"
            playbackService.updateNotification(title, playing)
        }
        playbackService.engine.onTimeChanged = { pos, dur ->
            _uiState.update { it.copy(positionMs = pos, durationMs = dur) }
        }
        playbackService.engine.onTrackEnded = { playNext() }

        playbackService.onExternalPrev = { playPrevious() }
        playbackService.onExternalNext = { playNext() }
        playbackService.onExternalToggle = { togglePlayPause() }

        val current = _uiState.value.currentVideo
        if (current != null && !playbackService.engine.isPlaying()) {
            playVideo(current)
        }
    }

    fun onFolderSelected(uriString: String, displayName: String) {
        viewModelScope.launch {
            prefs.saveFolder(uriString, displayName)
            loadDirectory(
                uriString = uriString,
                rootName = displayName,
                relativePath = emptyList(),
                autoResumeVideoId = "",
                replaceActiveQueue = _uiState.value.currentVideo == null
            )
        }
    }

    /**
     * Entra em uma subpasta sem interromper o vídeo que já está tocando no Mini-Player.
     */
    fun openSubfolder(entry: FolderEntry) {
        val state = _uiState.value
        if (state.folderUri.isEmpty()) return
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                relativePath = entry.relativePath,
                autoResumeVideoId = "",
                replaceActiveQueue = false
            )
        }
    }

    fun navigateUpFolder() {
        val state = _uiState.value
        if (state.folderBreadcrumbs.isEmpty() || state.folderUri.isEmpty()) return
        val parentPath = state.folderBreadcrumbs.dropLast(1)
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                relativePath = parentPath,
                autoResumeVideoId = "",
                replaceActiveQueue = false
            )
        }
    }

    fun navigateToBreadcrumb(index: Int) {
        val state = _uiState.value
        if (state.folderUri.isEmpty()) return
        val targetPath = if (index < 0) emptyList() else state.folderBreadcrumbs.take(index + 1)
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                relativePath = targetPath,
                autoResumeVideoId = "",
                replaceActiveQueue = false
            )
        }
    }

    fun enableAllFoldersMode() {
        val state = _uiState.value
        viewModelScope.launch {
            prefs.savePlayAllFolders(true)
            loadAllFolders(state.folderUri, state.selectedAllFolderIds, state.currentVideo?.id.orEmpty())
        }
    }

    fun openAllFoldersFilter() {
        val state = _uiState.value
        viewModelScope.launch {
            val discovered = repository.discoverSelectableFolders(state.folderUri)
            _uiState.update {
                it.copy(
                    selectableAllFolders = discovered,
                    isAllFilterDialogOpen = true
                )
            }
        }
    }

    fun closeAllFoldersFilter() {
        _uiState.update { it.copy(isAllFilterDialogOpen = false) }
    }

    fun applyAllFoldersSelection(selectedIds: Set<String>?) {
        val state = _uiState.value
        viewModelScope.launch {
            prefs.saveSelectedAllFolders(selectedIds)
            prefs.savePlayAllFolders(true)
            _uiState.update {
                it.copy(
                    selectedAllFolderIds = selectedIds,
                    isAllFilterDialogOpen = false
                )
            }
            loadAllFolders(state.folderUri, selectedIds, state.currentVideo?.id.orEmpty())
        }
    }

    fun refreshCurrentFolder() {
        val state = _uiState.value
        viewModelScope.launch {
            if (state.isAllFoldersMode) {
                loadAllFolders(state.folderUri, state.selectedAllFolderIds, state.currentVideo?.id.orEmpty())
            } else if (state.folderUri.isNotEmpty()) {
                loadDirectory(
                    uriString = state.folderUri,
                    rootName = state.rootFolderName,
                    relativePath = state.folderBreadcrumbs,
                    autoResumeVideoId = state.currentVideo?.id.orEmpty(),
                    replaceActiveQueue = false
                )
            }
        }
    }

    private suspend fun loadAllFolders(
        savedFolderUri: String,
        selectedFolderIds: Set<String>?,
        autoResumeVideoId: String
    ) {
        _uiState.update {
            it.copy(
                isScanning = true,
                isAllFoldersMode = true,
                folderBreadcrumbs = emptyList(),
                currentSubfolders = emptyList(),
                folderName = "Todas as Pastas"
            )
        }
        val scanned = repository.scanAllFoldersCombined(savedFolderUri, selectedFolderIds)
        applyLoadedPlaylist(scanned, autoResumeVideoId, replaceActiveQueue = true)
    }

    private suspend fun loadDirectory(
        uriString: String,
        rootName: String,
        relativePath: List<String>,
        autoResumeVideoId: String,
        replaceActiveQueue: Boolean
    ) {
        val displayTitle = relativePath.lastOrNull() ?: rootName
        _uiState.update {
            it.copy(
                isScanning = true,
                isAllFoldersMode = false,
                folderUri = uriString,
                rootFolderName = rootName,
                folderName = displayTitle,
                folderBreadcrumbs = relativePath
            )
        }
        val snapshot = repository.scanDirectoryEntries(uriString, relativePath)
        _uiState.update { it.copy(currentSubfolders = snapshot.subfolders) }
        applyLoadedPlaylist(snapshot.videos, autoResumeVideoId, replaceActiveQueue = replaceActiveQueue)
    }

    private fun applyLoadedPlaylist(
        scanned: List<VideoFileItem>,
        autoResumeVideoId: String,
        replaceActiveQueue: Boolean
    ) {
        val sorted = StorageRepository.sortItems(scanned, _uiState.value.sortOrder)
        val filtered = StorageRepository.filterBySubstring(sorted, _uiState.value.searchQuery)

        if (!replaceActiveQueue && _uiState.value.currentVideo != null) {
            _uiState.update {
                it.copy(
                    browsedVideos = sorted,
                    visibleVideos = filtered,
                    isScanning = false
                )
            }
            return
        }

        shuffleBackStack.clear()
        val target = sorted.firstOrNull { it.id == autoResumeVideoId } ?: sorted.firstOrNull()
        val idx = if (target != null) sorted.indexOf(target) else -1

        _uiState.update {
            it.copy(
                allVideos = sorted,
                browsedVideos = sorted,
                visibleVideos = filtered,
                currentVideo = target,
                currentIndexInFolder = idx,
                isScanning = false
            )
        }
        if (target != null && service != null) {
            playVideo(target)
        }
    }

    fun playVideoFromList(item: VideoFileItem) {
        val state = _uiState.value
        val currentBrowsed = state.browsedVideos
        val switchingQueue = currentBrowsed.map { it.id } != state.allVideos.map { it.id }
        if (switchingQueue) {
            shuffleBackStack.clear()
        } else if (state.playbackMode == PlaybackMode.SHUFFLE) {
            val prevId = state.currentVideo?.id
            if (prevId != null && prevId != item.id) {
                pushShuffleHistory(prevId)
            }
        }
        if (currentBrowsed.any { it.id == item.id }) {
            val idx = currentBrowsed.indexOfFirst { it.id == item.id }
            _uiState.update { it.copy(allVideos = currentBrowsed, currentIndexInFolder = idx) }
        }
        playVideo(item)
    }

    private fun pushShuffleHistory(videoId: String) {
        shuffleBackStack.addLast(videoId)
        while (shuffleBackStack.size > 200) {
            shuffleBackStack.removeFirst()
        }
    }

    fun playVideo(item: VideoFileItem) {
        val svc = service ?: return
        if (!svc.audioFocus.requestFocus()) return
        val idx = _uiState.value.allVideos.indexOfFirst { it.id == item.id }
        _uiState.update {
            it.copy(currentVideo = item, currentIndexInFolder = idx, positionMs = 0L)
        }
        svc.engine.playUri(item.uri)
        svc.updateNotification(item.name, true)
        viewModelScope.launch { prefs.saveLastVideoId(item.id) }
    }

    fun togglePlayPause() {
        val svc = service ?: return
        if (!svc.engine.isPlaying()) {
            if (!svc.audioFocus.requestFocus()) return
        }
        svc.engine.togglePlayPause()
    }

    fun playNext() {
        val state = _uiState.value
        val list = state.allVideos
        if (list.isEmpty()) return
        val currentIdx = state.currentIndexInFolder.coerceAtLeast(0)
        val currentId = state.currentVideo?.id
        val nextItem = when (state.playbackMode) {
            PlaybackMode.REPEAT_ONE -> list[currentIdx]
            PlaybackMode.SHUFFLE -> {
                if (list.size == 1) {
                    list[0]
                } else {
                    if (currentId != null) pushShuffleHistory(currentId)
                    val recentIds = shuffleBackStack.takeLast(list.size - 1).toMutableSet()
                    if (currentId != null) recentIds.add(currentId)
                    val unplayedPool = list.filter { it.id !in recentIds }
                    val pool = if (unplayedPool.isNotEmpty()) {
                        unplayedPool
                    } else {
                        list.filter { it.id != currentId }.ifEmpty { list }
                    }
                    pool[Random.nextInt(pool.size)]
                }
            }
            PlaybackMode.SEQUENTIAL -> list[(currentIdx + 1) % list.size]
        }
        playVideo(nextItem)
    }

    fun playPrevious() {
        val state = _uiState.value
        val list = state.allVideos
        if (list.isEmpty()) return

        if (state.playbackMode == PlaybackMode.SHUFFLE) {
            val currentId = state.currentVideo?.id
            val byId = list.associateBy { it.id }
            while (shuffleBackStack.isNotEmpty()) {
                val prevId = shuffleBackStack.removeLast()
                val match = byId[prevId]
                if (match != null && match.id != currentId) {
                    playVideo(match)
                    return
                }
            }
        }

        val currentIdx = state.currentIndexInFolder.coerceAtLeast(0)
        val prevIdx = (currentIdx - 1 + list.size) % list.size
        playVideo(list[prevIdx])
    }

    fun seekTo(positionMs: Long) {
        service?.engine?.seekTo(positionMs)
        _uiState.update { it.copy(positionMs = positionMs) }
    }

    fun cyclePlaybackMode() {
        val next = _uiState.value.playbackMode.next()
        if (next != PlaybackMode.SHUFFLE) {
            shuffleBackStack.clear()
        }
        _uiState.update { it.copy(playbackMode = next) }
        viewModelScope.launch { prefs.savePlaybackMode(next) }
    }

    fun cycleAspectRatio() {
        val next = _uiState.value.aspectRatio.next()
        _uiState.update { it.copy(aspectRatio = next) }
        service?.engine?.applyAspectRatio(next)
        viewModelScope.launch { prefs.saveAspectRatio(next) }
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { state ->
            state.copy(
                searchQuery = query,
                visibleVideos = StorageRepository.filterBySubstring(state.browsedVideos, query)
            )
        }
    }

    fun cycleSortOrder() {
        val next = _uiState.value.sortOrder.next()
        _uiState.update { state ->
            val sortedBrowsed = StorageRepository.sortItems(state.browsedVideos, next)
            val sortedQueue = StorageRepository.sortItems(state.allVideos, next)
            val newIndex = state.currentVideo?.let { cur -> sortedQueue.indexOfFirst { it.id == cur.id } } ?: -1
            state.copy(
                sortOrder = next,
                allVideos = sortedQueue,
                browsedVideos = sortedBrowsed,
                visibleVideos = StorageRepository.filterBySubstring(sortedBrowsed, state.searchQuery),
                currentIndexInFolder = newIndex
            )
        }
        viewModelScope.launch { prefs.saveSortOrder(next) }
    }

    fun setSplitScreen(enabled: Boolean) {
        _uiState.update { it.copy(isSplitScreen = enabled) }
    }

    fun setInPipMode(inPip: Boolean) {
        _uiState.update { it.copy(isInPipMode = inPip, isSplitScreen = if (inPip) false else it.isSplitScreen) }
    }

    fun requestDelete(item: VideoFileItem) {
        _uiState.update { it.copy(pendingDeleteItem = item) }
    }

    fun cancelDelete() {
        _uiState.update { it.copy(pendingDeleteItem = null) }
    }

    fun confirmDelete() {
        val target = _uiState.value.pendingDeleteItem ?: return
        viewModelScope.launch {
            val deleted = repository.deleteVideo(target)
            _uiState.update { it.copy(pendingDeleteItem = null) }
            if (deleted) {
                val remainingQueue = _uiState.value.allVideos.filterNot { it.id == target.id }
                val remainingBrowsed = _uiState.value.browsedVideos.filterNot { it.id == target.id }
                val wasCurrent = _uiState.value.currentVideo?.id == target.id
                val nextCurrent = if (wasCurrent) remainingQueue.firstOrNull() else _uiState.value.currentVideo
                val newIdx = nextCurrent?.let { c -> remainingQueue.indexOfFirst { it.id == c.id } } ?: -1
                _uiState.update {
                    it.copy(
                        allVideos = remainingQueue,
                        browsedVideos = remainingBrowsed,
                        visibleVideos = StorageRepository.filterBySubstring(remainingBrowsed, it.searchQuery),
                        currentVideo = nextCurrent,
                        currentIndexInFolder = newIdx
                    )
                }
                if (wasCurrent && nextCurrent != null) {
                    playVideo(nextCurrent)
                }
            }
        }
    }
}
`,
  },
];
