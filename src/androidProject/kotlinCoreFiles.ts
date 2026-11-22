import { AndroidProjectFile } from './buildAndManifestFiles';

export const KOTLIN_CORE_FILES: AndroidProjectFile[] = [
  {
    path: 'app/src/main/java/com/autocine/player/vlc/VlcPlayerEngine.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Motor libVLC com decodificação híbrida (Hardware + fallback Software), controle de volume, proporção e fila contínua',
    content: `package com.autocine.player.vlc

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

    private var baseVolumePercent: Int = FIXED_VLC_VOLUME
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

    fun setVolumePercent(percent: Int) {
        baseVolumePercent = percent.coerceIn(0, 100)
        applyEffectiveVolume()
    }

    fun getVolumePercent(): Int = baseVolumePercent

    fun setDucking(ducked: Boolean) {
        duckMultiplier = if (ducked) 0.25f else 1.0f
        applyEffectiveVolume()
    }

    private fun applyEffectiveVolume() {
        val effective = (baseVolumePercent * duckMultiplier).toInt().coerceIn(0, 100)
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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/audio/AudioFocusController.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Gerenciador de AudioFocusRequest: ducking em comandos do Waze/Maps e pausa apenas em foco exclusivo',
    content: `package com.autocine.player.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresApi

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

    private val focusRequestOreo: AudioFocusRequest? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createFocusRequestOreo()
        } else {
            null
        }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun createFocusRequestOreo(): AudioFocusRequest {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
            .build()

        return AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(audioAttributes)
            .setAcceptsDelayedFocusGain(true)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()
    }

    fun requestFocus(): Boolean {
        if (hasFocus) return true
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = focusRequestOreo ?: return false
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasFocus
    }

    fun abandonFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequestOreo?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusChangeListener)
        }
        hasFocus = false
        pausedByTransientLoss = false
        onDuckChanged(false)
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/data/StorageRepository.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Leitura rápida via File nativo / DocumentsContract com cache em memória, busca sem acentos, ordenação e exclusão',
    content: `package com.autocine.player.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap

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
    val videoCount: Int = -1,
    val documentId: String = ""
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

        private val SAF_CHILD_PROJECTION = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

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

    // Cache em memória por pasta para navegação instantânea (0 ms) ao entrar/voltar.
    // Só é limpo quando o usuário toca em "Atualizar" ou exclui um arquivo.
    private val directoryCache = ConcurrentHashMap<String, DirectorySnapshot>()
    private val allFoldersCache = ConcurrentHashMap<String, List<VideoFileItem>>()
    private val safDocumentIdCache = ConcurrentHashMap<String, String>()

    private fun buildDirCacheKey(rootUriString: String, relativePath: List<String>): String =
        "$rootUriString::\${relativePath.joinToString("/")}"

    /**
     * Retorna instantaneamente o snapshot em cache (0 ms) sem bloquear ou acessar o Pen Drive.
     */
    fun getCachedDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList()
    ): DirectorySnapshot? {
        if (rootUriString.isEmpty()) return null
        return directoryCache[buildDirCacheKey(rootUriString, relativePath)]
    }

    fun getCachedAllFolders(
        savedFolderUri: String,
        selectedFolderIds: Set<String>?,
        usbFolderUri: String = "",
        sdFolderUri: String = ""
    ): List<VideoFileItem>? {
        val key = buildAllCacheKey(savedFolderUri, selectedFolderIds, usbFolderUri, sdFolderUri)
        return allFoldersCache[key]
    }

    private fun buildAllCacheKey(
        savedFolderUri: String,
        selectedFolderIds: Set<String>?,
        usbFolderUri: String = "",
        sdFolderUri: String = ""
    ): String {
        val sel = selectedFolderIds?.sorted()?.joinToString(",") ?: "__ALL__"
        return "$savedFolderUri::$usbFolderUri::$sdFolderUri::$sel"
    }

    fun invalidateAllCaches() {
        directoryCache.clear()
        allFoldersCache.clear()
        safDocumentIdCache.clear()
    }

    /**
     * Verifica rapidamente em Dispatchers.IO se a URI/caminho do último vídeo salvo
     * ainda existe e está acessível (Pen Drive, Cartão SD ou Memória Interna).
     */
    suspend fun isVideoUriAccessible(uriString: String): Boolean = withContext(Dispatchers.IO) {
        if (uriString.isBlank()) return@withContext false
        runCatching {
            val uri = Uri.parse(uriString)
            when (uri.scheme) {
                "content" -> {
                    context.contentResolver.openFileDescriptor(uri, "r")?.use { true } ?: false
                }
                "file" -> {
                    val path = uri.path ?: return@runCatching false
                    val file = File(path)
                    file.exists() && file.isFile && file.canRead()
                }
                else -> {
                    val file = File(uriString)
                    file.exists() && file.isFile && file.canRead()
                }
            }
        }.getOrDefault(false)
    }

    /**
     * Lista subpastas imediatas + vídeos do diretório atual de forma ultrarrápida:
     * 1) Usa cache em memória (0 ms) quando já visitado (a menos que forceRefresh == true).
     * 2) Prefere acesso físico direto via java.io.File.listFiles() sempre que acessível.
     * 3) No fallback SAF, faz UMA ÚNICA query de cursor (DocumentsContract) em vez de centenas de IPCs do DocumentFile.
     * 4) Nunca roda MediaMetadataRetriever nem conta arquivos dentro de subpastas durante a listagem.
     */
    suspend fun scanDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList(),
        knownDocumentId: String? = null,
        forceRefresh: Boolean = false
    ): DirectorySnapshot = withContext(Dispatchers.IO) {
        if (rootUriString.isEmpty()) return@withContext DirectorySnapshot(emptyList(), emptyList())

        val cacheKey = buildDirCacheKey(rootUriString, relativePath)
        if (!forceRefresh) {
            directoryCache[cacheKey]?.let { return@withContext it }
        }

        val snapshot = if (rootUriString.startsWith("content://")) {
            val treeUri = Uri.parse(rootUriString)
            val directDir = tryResolvePhysicalDirectory(treeUri, relativePath)
            if (directDir != null) {
                scanDirectDirectorySnapshot(directDir, relativePath)
            } else {
                scanSafDirectoryFast(treeUri, relativePath, knownDocumentId)
            }
        } else {
            val targetDir = relativePath.fold(File(rootUriString)) { acc, seg -> File(acc, seg) }
            scanDirectDirectorySnapshot(targetDir, relativePath)
        }

        directoryCache[cacheKey] = snapshot
        snapshot
    }

    /**
     * Tenta mapear uma URI SAF (ex: primary:Movies ou XXXX-XXXX:Videos) para o caminho físico
     * java.io.File quando o dispositivo concede leitura direta (muito mais rápido em Pen Drives USB).
     */
    private fun tryResolvePhysicalDirectory(treeUri: Uri, relativePath: List<String>): File? {
        val treeDocId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull() ?: return null
        val parts = treeDocId.split(":", limit = 2)
        if (parts.isEmpty()) return null
        val volumeId = parts[0]
        val subPath = parts.getOrNull(1).orEmpty().trim('/')

        val candidateRoots = mutableListOf<File>()
        if (volumeId.equals("primary", ignoreCase = true)) {
            Environment.getExternalStorageDirectory()?.let { candidateRoots.add(it) }
        } else if (volumeId.isNotBlank()) {
            candidateRoots.add(File("/storage/$volumeId"))
            candidateRoots.add(File("/mnt/media_rw/$volumeId"))
            candidateRoots.add(File("/mnt/usb_storage/$volumeId"))
            candidateRoots.add(File("/mnt/external_sd/$volumeId"))
        }

        for (base in candidateRoots) {
            var dir = if (subPath.isNotEmpty()) File(base, subPath) else base
            for (seg in relativePath) {
                dir = File(dir, seg)
            }
            if (dir.exists() && dir.isDirectory && dir.canRead() && dir.listFiles() != null) {
                return dir
            }
        }
        return null
    }

    /**
     * Listagem SAF de altíssima performance usando 1 única query de cursor por pasta
     * (evita os 4 IPCs por arquivo da API DocumentFile.listFiles()).
     */
    private fun scanSafDirectoryFast(
        treeUri: Uri,
        relativePath: List<String>,
        knownDocumentId: String?
    ): DirectorySnapshot {
        val targetDocId = resolveSafDocumentIdFast(treeUri, relativePath, knownDocumentId)
            ?: return DirectorySnapshot(emptyList(), emptyList())

        val currentName = relativePath.lastOrNull()
            ?: targetDocId.substringAfterLast('/').substringAfterLast(':').ifBlank { "Pasta USB" }
        val currentFolderId = "saf:" + relativePath.joinToString("/")

        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, targetDocId)
        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        runCatching {
            context.contentResolver.query(
                childrenUri,
                SAF_CHILD_PROJECTION,
                null,
                null,
                null
            )?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                val sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val modCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                while (cursor.moveToNext()) {
                    val docId = if (idCol >= 0) cursor.getString(idCol) else null
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    if (docId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue

                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        val childPath = relativePath + name
                        val childKey = buildDirCacheKey(treeUri.toString(), childPath)
                        safDocumentIdCache[childKey] = docId
                        subfolders.add(
                            FolderEntry(
                                id = "saf:" + childPath.joinToString("/"),
                                name = name,
                                relativePath = childPath,
                                sourceLabel = "Pen Drive / Pasta SAF",
                                depth = childPath.size,
                                videoCount = -1,
                                documentId = docId
                            )
                        )
                    } else {
                        val ext = name.substringAfterLast('.', "").lowercase()
                        if (ext in VIDEO_EXTENSIONS) {
                            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                            val size = if (sizeCol >= 0 && !cursor.isNull(sizeCol)) cursor.getLong(sizeCol) else 0L
                            val mod = if (modCol >= 0 && !cursor.isNull(modCol)) cursor.getLong(modCol) else 0L
                            videos.add(
                                VideoFileItem(
                                    id = docUri.toString(),
                                    uri = docUri,
                                    name = name,
                                    sizeBytes = size,
                                    lastModified = mod,
                                    isSafDocument = true,
                                    folderName = currentName,
                                    folderId = currentFolderId
                                )
                            )
                        }
                    }
                }
            }
        }

        return DirectorySnapshot(
            subfolders = subfolders.sortedBy { normalizeForSearch(it.name) },
            videos = videos
        )
    }

    private fun resolveSafDocumentIdFast(
        treeUri: Uri,
        relativePath: List<String>,
        knownDocumentId: String?
    ): String? {
        if (!knownDocumentId.isNullOrEmpty()) return knownDocumentId
        val cacheKey = buildDirCacheKey(treeUri.toString(), relativePath)
        safDocumentIdCache[cacheKey]?.let { return it }

        var currentDocId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
            ?: return null
        if (relativePath.isEmpty()) {
            safDocumentIdCache[cacheKey] = currentDocId
            return currentDocId
        }

        val walked = mutableListOf<String>()
        for (segment in relativePath) {
            walked.add(segment)
            val segKey = buildDirCacheKey(treeUri.toString(), walked)
            val cached = safDocumentIdCache[segKey]
            if (cached != null) {
                currentDocId = cached
                continue
            }
            val foundId = findChildDirectoryId(treeUri, currentDocId, segment) ?: return null
            safDocumentIdCache[segKey] = foundId
            currentDocId = foundId
        }
        return currentDocId
    }

    private fun findChildDirectoryId(treeUri: Uri, parentDocId: String, targetName: String): String? {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        return runCatching {
            context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR && name == targetName) {
                        return@use if (idCol >= 0) cursor.getString(idCol) else null
                    }
                }
                null
            }
        }.getOrNull()
    }

    /**
     * Descobre todas as pastas e subpastas disponíveis agrupadas por origem
     * (Pen Drive, Cartão SD, Memória Interna) para o modal de seleção do botão "Todas".
     */
    suspend fun discoverSelectableFolders(
        savedRootUri: String,
        usbFolderUri: String = "",
        sdFolderUri: String = "",
        activeSlot: StorageSlot = StorageSlot.USB
    ): List<FolderEntry> = withContext(Dispatchers.IO) {
        val entries = mutableListOf<FolderEntry>()

        fun collectRoot(uriStr: String, groupLabel: String, filePrefix: String, safPrefix: String) {
            if (uriStr.isEmpty()) return
            if (uriStr.startsWith("content://")) {
                val treeUri = Uri.parse(uriStr)
                val directRoot = tryResolvePhysicalDirectory(treeUri, emptyList())
                if (directRoot != null) {
                    collectDirectFolders(directRoot, emptyList(), 0, entries, groupLabel, filePrefix)
                } else {
                    val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
                    if (rootId != null) {
                        val rootName = DocumentFile.fromTreeUri(context, treeUri)?.name ?: groupLabel
                        collectSafFoldersFast(treeUri, rootId, rootName, emptyList(), 0, entries, groupLabel, safPrefix)
                    }
                }
            } else {
                val rootDir = File(uriStr)
                if (rootDir.exists() && rootDir.isDirectory) {
                    collectDirectFolders(rootDir, emptyList(), 0, entries, groupLabel, filePrefix)
                }
            }
        }

        val primaryLabel = when {
            savedRootUri.isNotEmpty() && savedRootUri == usbFolderUri -> "Pen Drive"
            savedRootUri.isNotEmpty() && savedRootUri == sdFolderUri -> "Cartão SD"
            activeSlot == StorageSlot.USB -> "Pen Drive"
            activeSlot == StorageSlot.SD_CARD -> "Cartão SD"
            else -> "Memória Interna"
        }

        // 1. Raiz principal salva (mantém prefixo "file:" / "saf:" para compatibilidade com seleções já salvas)
        collectRoot(savedRootUri, primaryLabel, "file:", "saf:")

        // 2. Pen Drive configurado separadamente (caso não seja a raiz principal)
        if (usbFolderUri.isNotEmpty() && usbFolderUri != savedRootUri) {
            collectRoot(usbFolderUri, "Pen Drive", "usb_file:", "usb_saf:")
        }

        // 3. Cartão SD configurado separadamente (caso não seja a raiz principal nem o Pen Drive)
        if (sdFolderUri.isNotEmpty() && sdFolderUri != savedRootUri && sdFolderUri != usbFolderUri) {
            collectRoot(sdFolderUri, "Cartão SD", "sd_file:", "sd_saf:")
        }

        // 4. Buckets de vídeo da Memória Interna (MediaStore) ordenados alfabeticamente
        val mediaStoreByFolder = queryMediaStoreVideos().groupBy { it.folderId }
        mediaStoreByFolder.entries
            .map { (folderId, items) ->
                val displayName = items.firstOrNull()?.folderName ?: "Memória Interna"
                FolderEntry(
                    id = folderId,
                    name = displayName,
                    relativePath = emptyList(),
                    sourceLabel = "Memória Interna",
                    depth = 0,
                    videoCount = items.size
                )
            }
            .sortedBy { normalizeForSearch(it.name) }
            .forEach { entries.add(it) }

        entries.distinctBy { it.id }
    }

    /**
     * Modo "Todas as Pastas": combina vídeos das pastas e subpastas escolhidas manualmente
     * pelo usuário (ou todas disponíveis quando selectedFolderIds == null), com cache em memória.
     */
    suspend fun scanAllFoldersCombined(
        savedFolderUri: String,
        selectedFolderIds: Set<String>? = null,
        usbFolderUri: String = "",
        sdFolderUri: String = "",
        forceRefresh: Boolean = false
    ): List<VideoFileItem> = withContext(Dispatchers.IO) {
        val cacheKey = buildAllCacheKey(savedFolderUri, selectedFolderIds, usbFolderUri, sdFolderUri)
        if (!forceRefresh) {
            allFoldersCache[cacheKey]?.let { return@withContext it }
        }

        val uniqueById = LinkedHashMap<String, VideoFileItem>()

        fun scanRoot(uriStr: String, filePrefix: String, safPrefix: String) {
            if (uriStr.isEmpty()) return
            val fromRoot = if (uriStr.startsWith("content://")) {
                val treeUri = Uri.parse(uriStr)
                val directRoot = tryResolvePhysicalDirectory(treeUri, emptyList())
                if (directRoot != null) {
                    scanDirectDirectory(directRoot, recursive = true, idPrefix = filePrefix)
                } else {
                    scanSafTreeFast(treeUri, idPrefix = safPrefix)
                }
            } else {
                scanDirectDirectory(File(uriStr), recursive = true, idPrefix = filePrefix)
            }
            fromRoot
                .filter { selectedFolderIds == null || it.folderId in selectedFolderIds }
                .forEach { uniqueById[it.id] = it }
        }

        scanRoot(savedFolderUri, "file:", "saf:")
        if (usbFolderUri.isNotEmpty() && usbFolderUri != savedFolderUri) {
            scanRoot(usbFolderUri, "usb_file:", "usb_saf:")
        }
        if (sdFolderUri.isNotEmpty() && sdFolderUri != savedFolderUri && sdFolderUri != usbFolderUri) {
            scanRoot(sdFolderUri, "sd_file:", "sd_saf:")
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

        val result = uniqueById.values.toList()
        allFoldersCache[cacheKey] = result
        result
    }

    private fun collectSafFoldersFast(
        treeUri: Uri,
        docId: String,
        displayName: String,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>,
        sourceLabel: String = "Pen Drive",
        idPrefix: String = "saf:"
    ) {
        if (depth > 6) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
        val subDirs = mutableListOf<Pair<String, String>>()
        var directVideos = 0

        runCatching {
            context.contentResolver.query(
                childrenUri,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                ),
                null,
                null,
                null
            )?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val childId = if (idCol >= 0) cursor.getString(idCol) else null
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    if (childId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        subDirs.add(childId to name)
                    } else if (name.substringAfterLast('.', "").lowercase() in VIDEO_EXTENSIONS) {
                        directVideos++
                    }
                }
            }
        }

        out.add(
            FolderEntry(
                id = idPrefix + path.joinToString("/"),
                name = displayName,
                relativePath = path,
                sourceLabel = sourceLabel,
                depth = depth,
                videoCount = directVideos,
                documentId = docId
            )
        )

        subDirs
            .sortedBy { normalizeForSearch(it.second) }
            .forEach { (subId, subName) ->
                collectSafFoldersFast(
                    treeUri = treeUri,
                    docId = subId,
                    displayName = subName,
                    path = path + subName,
                    depth = depth + 1,
                    out = out,
                    sourceLabel = sourceLabel,
                    idPrefix = idPrefix
                )
            }
    }

    private fun scanDirectDirectorySnapshot(current: File, relativePath: List<String>): DirectorySnapshot {
        if (!current.exists() || !current.isDirectory) return DirectorySnapshot(emptyList(), emptyList())
        val currentFolderId = "file:" + relativePath.joinToString("/")

        val children = current.listFiles().orEmpty()
        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        for (child in children) {
            val name = child.name
            if (name.startsWith(".")) continue
            if (child.isDirectory) {
                val childPath = relativePath + name
                subfolders.add(
                    FolderEntry(
                        id = "file:" + childPath.joinToString("/"),
                        name = name,
                        relativePath = childPath,
                        sourceLabel = "Armazenamento Direto",
                        depth = childPath.size,
                        videoCount = -1
                    )
                )
            } else if (child.isFile) {
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext in VIDEO_EXTENSIONS) {
                    videos.add(
                        VideoFileItem(
                            id = child.absolutePath,
                            uri = Uri.fromFile(child),
                            name = name,
                            sizeBytes = child.length(),
                            lastModified = child.lastModified(),
                            isSafDocument = false,
                            folderName = current.name,
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

    private fun collectDirectFolders(
        dir: File,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>,
        sourceLabel: String = "Pen Drive",
        idPrefix: String = "file:"
    ) {
        if (depth > 6) return
        val children = dir.listFiles().orEmpty()
        val directVideos = children.count { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
        out.add(
            FolderEntry(
                id = idPrefix + path.joinToString("/"),
                name = dir.name.ifBlank { "Raiz" },
                relativePath = path,
                sourceLabel = sourceLabel,
                depth = depth,
                videoCount = directVideos
            )
        )
        children
            .filter { it.isDirectory && !it.name.startsWith(".") }
            .sortedBy { normalizeForSearch(it.name) }
            .forEach { sub ->
                collectDirectFolders(
                    dir = sub,
                    path = path + sub.name,
                    depth = depth + 1,
                    out = out,
                    sourceLabel = sourceLabel,
                    idPrefix = idPrefix
                )
            }
    }

    private fun scanSafTreeFast(treeUri: Uri, idPrefix: String = "saf:"): List<VideoFileItem> {
        val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
            ?: return emptyList()
        val collected = mutableListOf<VideoFileItem>()

        fun walk(docId: String, dirName: String, path: List<String>, depth: Int) {
            if (depth > 8) return
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
            val folderId = idPrefix + path.joinToString("/")
            val nextDirs = mutableListOf<Pair<String, String>>()

            runCatching {
                context.contentResolver.query(
                    childrenUri,
                    SAF_CHILD_PROJECTION,
                    null,
                    null,
                    null
                )?.use { cursor ->
                    val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                    val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                    val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                    val sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                    val modCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                    while (cursor.moveToNext()) {
                        val childId = if (idCol >= 0) cursor.getString(idCol) else null
                        val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                        val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                        if (childId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            nextDirs.add(childId to name)
                        } else if (name.substringAfterLast('.', "").lowercase() in VIDEO_EXTENSIONS) {
                            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childId)
                            val size = if (sizeCol >= 0 && !cursor.isNull(sizeCol)) cursor.getLong(sizeCol) else 0L
                            val mod = if (modCol >= 0 && !cursor.isNull(modCol)) cursor.getLong(modCol) else 0L
                            collected.add(
                                VideoFileItem(
                                    id = docUri.toString(),
                                    uri = docUri,
                                    name = name,
                                    sizeBytes = size,
                                    lastModified = mod,
                                    isSafDocument = true,
                                    folderName = dirName,
                                    folderId = folderId
                                )
                            )
                        }
                    }
                }
            }

            nextDirs.forEach { (subId, subName) ->
                walk(subId, subName, path + subName, depth + 1)
            }
        }

        val rootName = DocumentFile.fromTreeUri(context, treeUri)?.name ?: "Pasta USB"
        walk(rootId, rootName, emptyList(), 0)
        return collected
    }

    private fun scanDirectDirectory(
        dir: File,
        recursive: Boolean,
        idPrefix: String = "file:"
    ): List<VideoFileItem> {
        if (!dir.exists() || !dir.isDirectory) return emptyList()
        val sequence = if (recursive) dir.walkTopDown().maxDepth(8) else dir.listFiles().orEmpty().asSequence()
        return sequence
            .filter { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
            .map { file ->
                val relDir = file.parentFile?.relativeToOrNull(dir)?.path.orEmpty()
                val folderId = idPrefix + if (relDir == ".") "" else relDir
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
                            folderId = "bucket:$bucketId"
                        )
                    )
                }
            }
        }
        return results
    }

    suspend fun deleteVideo(item: VideoFileItem): Boolean = withContext(Dispatchers.IO) {
        val deleted = if (item.isSafDocument) {
            DocumentFile.fromSingleUri(context, item.uri)?.delete() == true
        } else {
            File(item.id).delete()
        }
        if (deleted) {
            invalidateAllCaches()
        }
        deleted
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/data/PreferencesManager.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Persistência da última pasta, último vídeo com posição (retomada automática), iniciar com a multimídia, tema e escala de UI',
    content: `package com.autocine.player.data

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.UiScaleLevel
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

enum class StorageSlot(val label: String) {
    ALL("Todas"),
    USB("Pen Drive"),
    SD_CARD("Cartão SD"),
    INTERNAL("Interna")
}

/**
 * Snapshot persistido de forma síncrona (SharedPreferences) para retomar automaticamente
 * o último vídeo, pasta/subpasta de origem e posição exata mesmo se o app for fechado abruptamente.
 */
data class LastPlaybackSnapshot(
    val videoId: String = "",
    val videoUri: String = "",
    val videoName: String = "",
    val folderUri: String = "",
    val folderName: String = "",
    val relativePath: List<String> = emptyList(),
    val storageSlot: StorageSlot = StorageSlot.USB,
    val isAllFoldersMode: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L
)

data class SavedPlayerPrefs(
    val folderUri: String = "",
    val folderDisplayName: String = "Selecione uma pasta (USB / SD / Interna)",
    val activeStorageSlot: StorageSlot = StorageSlot.USB,
    val usbFolderUri: String = "",
    val usbFolderName: String = "Pen Drive",
    val sdFolderUri: String = "",
    val sdFolderName: String = "Cartão SD",
    val playAllFolders: Boolean = false,
    val allFilterCustomized: Boolean = false,
    val selectedAllFolderIds: Set<String> = emptySet(),
    val lastVideoId: String = "",
    val lastPositionMs: Long = 0L,
    val playbackMode: PlaybackMode = PlaybackMode.SEQUENTIAL,
    val aspectRatio: AspectRatioOption = AspectRatioOption.FIT,
    val sortOrder: SortOrder = SortOrder.NAME_ASC,
    val uiScaleLevel: UiScaleLevel = UiScaleLevel.DEFAULT,
    val colorTheme: AppColorTheme = AppColorTheme.AUTOMOTIVE_BLUE,
    val startOnBoot: Boolean = true,
    val volumePercent: Int = 100
)

class PreferencesManager(private val context: Context) {

    companion object {
        private const val RESUME_PREFS_NAME = "autocine_resume_sync"
        private const val PATH_SEPARATOR = "\\u001F"

        private const val SYNC_VIDEO_ID = "sync_video_id"
        private const val SYNC_VIDEO_URI = "sync_video_uri"
        private const val SYNC_VIDEO_NAME = "sync_video_name"
        private const val SYNC_FOLDER_URI = "sync_folder_uri"
        private const val SYNC_FOLDER_NAME = "sync_folder_name"
        private const val SYNC_RELATIVE_PATH = "sync_relative_path"
        private const val SYNC_STORAGE_SLOT = "sync_storage_slot"
        private const val SYNC_IS_ALL_MODE = "sync_is_all_mode"
        private const val SYNC_POSITION_MS = "sync_position_ms"
        private const val SYNC_DURATION_MS = "sync_duration_ms"
        private const val SYNC_START_ON_BOOT = "sync_start_on_boot"
        private const val SYNC_VOLUME_PERCENT = "sync_volume_percent"
    }

    private val syncStorageContext: Context = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        context.applicationContext.createDeviceProtectedStorageContext() ?: context.applicationContext
    } else {
        context.applicationContext
    }

    private val resumePrefs = syncStorageContext.getSharedPreferences(
        RESUME_PREFS_NAME,
        Context.MODE_PRIVATE
    )

    private object Keys {
        val FOLDER_URI = stringPreferencesKey("saved_folder_uri")
        val FOLDER_NAME = stringPreferencesKey("saved_folder_name")
        val ACTIVE_STORAGE_SLOT = stringPreferencesKey("active_storage_slot")
        val USB_FOLDER_URI = stringPreferencesKey("usb_folder_uri")
        val USB_FOLDER_NAME = stringPreferencesKey("usb_folder_name")
        val SD_FOLDER_URI = stringPreferencesKey("sd_folder_uri")
        val SD_FOLDER_NAME = stringPreferencesKey("sd_folder_name")
        val PLAY_ALL_FOLDERS = booleanPreferencesKey("play_all_folders")
        val ALL_FILTER_CUSTOMIZED = booleanPreferencesKey("all_filter_customized")
        val SELECTED_ALL_FOLDERS = stringSetPreferencesKey("selected_all_folders")
        val LAST_VIDEO_ID = stringPreferencesKey("last_video_id")
        val LAST_POSITION_MS = longPreferencesKey("last_position_ms")
        val PLAYBACK_MODE = stringPreferencesKey("playback_mode")
        val ASPECT_RATIO = stringPreferencesKey("aspect_ratio")
        val SORT_ORDER = stringPreferencesKey("sort_order")
        val UI_SCALE_LEVEL = stringPreferencesKey("ui_scale_level")
        val COLOR_THEME = stringPreferencesKey("color_theme")
        val START_ON_BOOT = booleanPreferencesKey("start_on_boot")
        val VOLUME_PERCENT = intPreferencesKey("volume_percent")
    }

    val prefsFlow: Flow<SavedPlayerPrefs> = context.dataStore.data.map { prefs ->
        SavedPlayerPrefs(
            folderUri = prefs[Keys.FOLDER_URI].orEmpty(),
            folderDisplayName = prefs[Keys.FOLDER_NAME] ?: "Selecione uma pasta (USB / SD / Interna)",
            activeStorageSlot = prefs[Keys.ACTIVE_STORAGE_SLOT]
                ?.let { runCatching { StorageSlot.valueOf(it) }.getOrNull() }
                ?: StorageSlot.USB,
            usbFolderUri = prefs[Keys.USB_FOLDER_URI].orEmpty(),
            usbFolderName = prefs[Keys.USB_FOLDER_NAME] ?: "Pen Drive",
            sdFolderUri = prefs[Keys.SD_FOLDER_URI].orEmpty(),
            sdFolderName = prefs[Keys.SD_FOLDER_NAME] ?: "Cartão SD",
            playAllFolders = prefs[Keys.PLAY_ALL_FOLDERS] ?: false,
            allFilterCustomized = prefs[Keys.ALL_FILTER_CUSTOMIZED] ?: false,
            selectedAllFolderIds = prefs[Keys.SELECTED_ALL_FOLDERS] ?: emptySet(),
            lastVideoId = prefs[Keys.LAST_VIDEO_ID].orEmpty(),
            lastPositionMs = (prefs[Keys.LAST_POSITION_MS] ?: 0L).coerceAtLeast(0L),
            playbackMode = prefs[Keys.PLAYBACK_MODE]
                ?.let { runCatching { PlaybackMode.valueOf(it) }.getOrNull() }
                ?: PlaybackMode.SEQUENTIAL,
            aspectRatio = prefs[Keys.ASPECT_RATIO]
                ?.let { runCatching { AspectRatioOption.valueOf(it) }.getOrNull() }
                ?: AspectRatioOption.FIT,
            sortOrder = prefs[Keys.SORT_ORDER]
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() }
                ?: SortOrder.NAME_ASC,
            uiScaleLevel = prefs[Keys.UI_SCALE_LEVEL]
                ?.let { runCatching { UiScaleLevel.valueOf(it) }.getOrNull() }
                ?: UiScaleLevel.DEFAULT,
            colorTheme = prefs[Keys.COLOR_THEME]
                ?.let { runCatching { AppColorTheme.valueOf(it) }.getOrNull() }
                ?: AppColorTheme.AUTOMOTIVE_BLUE,
            startOnBoot = prefs[Keys.START_ON_BOOT] ?: resumePrefs.getBoolean(SYNC_START_ON_BOOT, true),
            volumePercent = (prefs[Keys.VOLUME_PERCENT] ?: resumePrefs.getInt(SYNC_VOLUME_PERCENT, 100)).coerceIn(0, 100)
        )
    }

    fun readLastPlaybackSync(): LastPlaybackSnapshot {
        val rawPath = resumePrefs.getString(SYNC_RELATIVE_PATH, "").orEmpty()
        val relPath = if (rawPath.isEmpty()) emptyList() else rawPath.split(PATH_SEPARATOR).filter { it.isNotEmpty() }
        val slot = resumePrefs.getString(SYNC_STORAGE_SLOT, null)
            ?.let { runCatching { StorageSlot.valueOf(it) }.getOrNull() }
            ?: StorageSlot.USB
        return LastPlaybackSnapshot(
            videoId = resumePrefs.getString(SYNC_VIDEO_ID, "").orEmpty(),
            videoUri = resumePrefs.getString(SYNC_VIDEO_URI, "").orEmpty(),
            videoName = resumePrefs.getString(SYNC_VIDEO_NAME, "").orEmpty(),
            folderUri = resumePrefs.getString(SYNC_FOLDER_URI, "").orEmpty(),
            folderName = resumePrefs.getString(SYNC_FOLDER_NAME, "").orEmpty(),
            relativePath = relPath,
            storageSlot = slot,
            isAllFoldersMode = resumePrefs.getBoolean(SYNC_IS_ALL_MODE, false),
            positionMs = resumePrefs.getLong(SYNC_POSITION_MS, 0L).coerceAtLeast(0L),
            durationMs = resumePrefs.getLong(SYNC_DURATION_MS, 0L).coerceAtLeast(0L)
        )
    }

    fun saveLastPlaybackSync(snapshot: LastPlaybackSnapshot, commitImmediately: Boolean = false) {
        val editor = resumePrefs.edit()
            .putString(SYNC_VIDEO_ID, snapshot.videoId)
            .putString(SYNC_VIDEO_URI, snapshot.videoUri)
            .putString(SYNC_VIDEO_NAME, snapshot.videoName)
            .putString(SYNC_FOLDER_URI, snapshot.folderUri)
            .putString(SYNC_FOLDER_NAME, snapshot.folderName)
            .putString(SYNC_RELATIVE_PATH, snapshot.relativePath.joinToString(PATH_SEPARATOR))
            .putString(SYNC_STORAGE_SLOT, snapshot.storageSlot.name)
            .putBoolean(SYNC_IS_ALL_MODE, snapshot.isAllFoldersMode)
            .putLong(SYNC_POSITION_MS, snapshot.positionMs.coerceAtLeast(0L))
            .putLong(SYNC_DURATION_MS, snapshot.durationMs.coerceAtLeast(0L))
        if (commitImmediately) {
            editor.commit()
        } else {
            editor.apply()
        }
    }

    fun saveLastPositionSync(positionMs: Long, durationMs: Long, commitImmediately: Boolean = false) {
        val editor = resumePrefs.edit()
            .putLong(SYNC_POSITION_MS, positionMs.coerceAtLeast(0L))
            .putLong(SYNC_DURATION_MS, durationMs.coerceAtLeast(0L))
        if (commitImmediately) {
            editor.commit()
        } else {
            editor.apply()
        }
    }

    suspend fun saveFolder(uri: String, displayName: String, slot: StorageSlot = StorageSlot.USB) {
        context.dataStore.edit {
            it[Keys.FOLDER_URI] = uri
            it[Keys.FOLDER_NAME] = displayName
            it[Keys.ACTIVE_STORAGE_SLOT] = slot.name
            it[Keys.PLAY_ALL_FOLDERS] = false
            when (slot) {
                StorageSlot.USB -> {
                    it[Keys.USB_FOLDER_URI] = uri
                    it[Keys.USB_FOLDER_NAME] = displayName
                }
                StorageSlot.SD_CARD -> {
                    it[Keys.SD_FOLDER_URI] = uri
                    it[Keys.SD_FOLDER_NAME] = displayName
                }
                else -> Unit
            }
        }
    }

    suspend fun savePlayAllFolders(enabled: Boolean) {
        context.dataStore.edit {
            it[Keys.PLAY_ALL_FOLDERS] = enabled
            if (enabled) {
                it[Keys.ACTIVE_STORAGE_SLOT] = StorageSlot.ALL.name
            }
        }
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

    suspend fun saveLastPositionMs(positionMs: Long) {
        context.dataStore.edit { it[Keys.LAST_POSITION_MS] = positionMs.coerceAtLeast(0L) }
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

    suspend fun saveUiScaleLevel(level: UiScaleLevel) {
        context.dataStore.edit { it[Keys.UI_SCALE_LEVEL] = level.name }
    }

    suspend fun saveColorTheme(theme: AppColorTheme) {
        context.dataStore.edit { it[Keys.COLOR_THEME] = theme.name }
    }

    fun isStartOnBootEnabledSync(): Boolean =
        resumePrefs.getBoolean(SYNC_START_ON_BOOT, true)

    suspend fun saveStartOnBoot(enabled: Boolean) {
        resumePrefs.edit().putBoolean(SYNC_START_ON_BOOT, enabled).commit()
        context.dataStore.edit { it[Keys.START_ON_BOOT] = enabled }
    }

    fun readVolumePercentSync(): Int =
        resumePrefs.getInt(SYNC_VOLUME_PERCENT, 100).coerceIn(0, 100)

    fun saveVolumePercentSync(percent: Int) {
        resumePrefs.edit().putInt(SYNC_VOLUME_PERCENT, percent.coerceIn(0, 100)).apply()
    }

    suspend fun saveVolumePercent(percent: Int) {
        val clamped = percent.coerceIn(0, 100)
        resumePrefs.edit().putInt(SYNC_VOLUME_PERCENT, clamped).apply()
        context.dataStore.edit { it[Keys.VOLUME_PERCENT] = clamped }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/service/VideoPlaybackService.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Foreground Service (mediaPlayback) + MediaSession para manter reprodução ativa com Câmera de Ré ou segundo plano',
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
import android.os.Build
import android.os.IBinder
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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
            ContextCompat.startForegroundService(context, intent)
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

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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
    path: 'app/src/main/java/com/autocine/player/receiver/BootReceiver.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'BroadcastReceiver para inicializar o AutoCine Player automaticamente quando a central multimídia é ligada',
    content: `package com.autocine.player.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.autocine.player.MainActivity
import com.autocine.player.data.PreferencesManager

/**
 * Inicializa automaticamente o AutoCine Player quando a central multimídia é ligada
 * (após horas desligada em Cold Boot ou QuickBoot ACC), caso a opção
 * "Iniciar com a Multimídia" esteja ativada nas Configurações.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED
        )
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        val ctx = context ?: return
        val action = intent?.action ?: return
        if (action !in BOOT_ACTIONS) return

        // Leitura síncrona compatível com Direct Boot / Cold Boot
        val prefs = PreferencesManager(ctx)
        if (!prefs.isStartOnBootEnabledSync()) return

        runCatching {
            val launchIntent = Intent(ctx, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra("launched_from_boot", true)
            }
            ctx.startActivity(launchIntent)
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/viewmodel/PlayerViewModel.kt',
    category: 'core',
    language: 'kotlin',
    summary: 'Estado reativo do player, retomada automática, filtro por pasta, volume por gesto e inicialização no boot',
    content: `package com.autocine.player.viewmodel

import android.app.Application
import android.net.Uri
import android.os.Environment
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.LastPlaybackSnapshot
import com.autocine.player.data.PlaybackMode
import com.autocine.player.data.PreferencesManager
import com.autocine.player.data.SortOrder
import com.autocine.player.data.StorageRepository
import com.autocine.player.data.StorageSlot
import com.autocine.player.data.VideoFileItem
import com.autocine.player.service.VideoPlaybackService
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.vlc.AspectRatioOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import kotlin.random.Random

data class PlayerUiState(
    val folderUri: String = "",
    val rootFolderName: String = "Nenhuma pasta selecionada",
    val folderName: String = "Nenhuma pasta selecionada",
    val activeStorageSlot: StorageSlot = StorageSlot.USB,
    val usbFolderUri: String = "",
    val usbFolderName: String = "Pen Drive",
    val sdFolderUri: String = "",
    val sdFolderName: String = "Cartão SD",
    val folderBreadcrumbs: List<String> = emptyList(),
    val currentSubfolders: List<FolderEntry> = emptyList(),
    val isAllFoldersMode: Boolean = false,
    val selectableAllFolders: List<FolderEntry> = emptyList(),
    val selectedAllFolderIds: Set<String>? = null,
    val isAllFilterDialogOpen: Boolean = false,
    val isSettingsOpen: Boolean = false,
    val uiScaleLevel: UiScaleLevel = UiScaleLevel.DEFAULT,
    val colorTheme: AppColorTheme = AppColorTheme.AUTOMOTIVE_BLUE,
    val startOnBoot: Boolean = true,
    val volumePercent: Int = 100,
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

    private var savedResumeVideoId: String = ""
    private var savedResumePositionMs: Long = 0L
    private var lastPositionSavedElapsedMs: Long = 0L

    // Metadados da pasta/origem da fila atualmente em reprodução (salvos para retomada exata ao reabrir o app)
    private var activeQueueRootUri: String = ""
    private var activeQueueRootName: String = ""
    private var activeQueueRelativePath: List<String> = emptyList()
    private var activeQueueStorageSlot: StorageSlot = StorageSlot.USB
    private var activeQueueIsAllMode: Boolean = false

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = prefs.prefsFlow.first()
            val syncResume = prefs.readLastPlaybackSync()
            val savedSelection = if (saved.allFilterCustomized) saved.selectedAllFolderIds else null

            val rawPos = syncResume.positionMs.coerceAtLeast(saved.lastPositionMs)
            val rawDur = syncResume.durationMs
            // Se o vídeo já estava nos últimos 5 segundos, reinicia do começo ao reabrir
            val effectiveResumeMs = if (rawDur > 10_000L && rawPos >= rawDur - 5_000L) 0L else rawPos

            val resumeFolderUri = syncResume.folderUri.ifEmpty { saved.folderUri }
            val resumeFolderName = syncResume.folderName.ifEmpty { saved.folderDisplayName }
            val resumeSlot = if (syncResume.videoUri.isNotEmpty()) syncResume.storageSlot else saved.activeStorageSlot
            val resumeIsAll = if (syncResume.videoUri.isNotEmpty()) syncResume.isAllFoldersMode else saved.playAllFolders
            val resumeRelPath = if (syncResume.videoUri.isNotEmpty() && !resumeIsAll) syncResume.relativePath else emptyList()

            val canResumeDirect = syncResume.videoUri.isNotEmpty() &&
                repository.isVideoUriAccessible(syncResume.videoUri)

            val restoredVideo = if (canResumeDirect) {
                val restoredId = syncResume.videoId.ifEmpty { syncResume.videoUri }
                VideoFileItem(
                    id = restoredId,
                    uri = Uri.parse(syncResume.videoUri),
                    name = syncResume.videoName.ifEmpty { "Vídeo" },
                    sizeBytes = 0L,
                    lastModified = 0L,
                    isSafDocument = syncResume.videoUri.startsWith("content://"),
                    folderName = resumeRelPath.lastOrNull() ?: resumeFolderName,
                    folderId = ""
                )
            } else {
                null
            }

            savedResumeVideoId = restoredVideo?.id ?: saved.lastVideoId
            savedResumePositionMs = effectiveResumeMs
            activeQueueRootUri = resumeFolderUri
            activeQueueRootName = resumeFolderName
            activeQueueRelativePath = resumeRelPath
            activeQueueStorageSlot = resumeSlot
            activeQueueIsAllMode = resumeIsAll

            val displayTitle = when {
                resumeIsAll -> "Todas as Pastas"
                resumeRelPath.isNotEmpty() -> resumeRelPath.last()
                else -> resumeFolderName
            }

            _uiState.update {
                it.copy(
                    folderUri = resumeFolderUri,
                    rootFolderName = resumeFolderName,
                    folderName = displayTitle,
                    activeStorageSlot = if (resumeIsAll) StorageSlot.ALL else resumeSlot,
                    usbFolderUri = saved.usbFolderUri,
                    usbFolderName = saved.usbFolderName,
                    sdFolderUri = saved.sdFolderUri,
                    sdFolderName = saved.sdFolderName,
                    folderBreadcrumbs = resumeRelPath,
                    isAllFoldersMode = resumeIsAll,
                    selectedAllFolderIds = savedSelection,
                    currentVideo = restoredVideo ?: it.currentVideo,
                    positionMs = if (restoredVideo != null) effectiveResumeMs else it.positionMs,
                    durationMs = if (restoredVideo != null) rawDur else it.durationMs,
                    isSplitScreen = false,
                    playbackMode = saved.playbackMode,
                    aspectRatio = saved.aspectRatio,
                    sortOrder = saved.sortOrder,
                    uiScaleLevel = saved.uiScaleLevel,
                    colorTheme = saved.colorTheme,
                    startOnBoot = saved.startOnBoot,
                    volumePercent = saved.volumePercent
                )
            }
            service?.engine?.apply {
                applyAspectRatio(saved.aspectRatio)
                setVolumePercent(saved.volumePercent)
            }

            // Se o último vídeo salvo ainda está acessível e o serviço já conectou, inicia imediatamente em tela cheia
            if (restoredVideo != null && service != null) {
                playVideo(restoredVideo, resumePositionMs = effectiveResumeMs, forceRestart = false)
            }

            // Carrega a pasta/subpasta (ou Todas) em segundo plano para popular a fila sem interromper a retomada
            if (resumeIsAll) {
                loadAllFolders(
                    savedFolderUri = resumeFolderUri,
                    selectedFolderIds = savedSelection,
                    autoResumeVideoId = savedResumeVideoId,
                    forceRefresh = false
                )
            } else if (resumeFolderUri.isNotEmpty()) {
                loadDirectory(
                    uriString = resumeFolderUri,
                    rootName = resumeFolderName,
                    slot = resumeSlot,
                    relativePath = resumeRelPath,
                    knownDocumentId = null,
                    autoResumeVideoId = savedResumeVideoId,
                    replaceActiveQueue = true,
                    forceRefresh = false
                )
            }
        }
    }

    fun bindService(playbackService: VideoPlaybackService) {
        service = playbackService
        val engine = playbackService.engine
        val currentState = _uiState.value
        engine.applyAspectRatio(currentState.aspectRatio)
        engine.setVolumePercent(currentState.volumePercent)

        engine.onPlayingChanged = { playing ->
            _uiState.update { it.copy(isPlaying = playing) }
            val title = _uiState.value.currentVideo?.name ?: "AutoCine Player"
            playbackService.updateNotification(title, playing)
            if (!playing) {
                persistPlaybackPosition(commitImmediately = false)
            }
        }
        engine.onTimeChanged = { pos, dur ->
            _uiState.update { it.copy(positionMs = pos, durationMs = dur) }
            val now = SystemClock.elapsedRealtime()
            if (pos > 0L && now - lastPositionSavedElapsedMs >= 3000L) {
                lastPositionSavedElapsedMs = now
                savedResumePositionMs = pos
                prefs.saveLastPositionSync(pos, dur, commitImmediately = false)
                viewModelScope.launch { prefs.saveLastPositionMs(pos) }
            }
        }
        engine.onTrackEnded = { playNext() }

        playbackService.onExternalPrev = { playPrevious() }
        playbackService.onExternalNext = { playNext() }
        playbackService.onExternalToggle = { togglePlayPause() }

        // CRÍTICO: Se o serviço em segundo plano JÁ tem mídia carregada/tocando,
        // nunca recarregamos nem reiniciamos do 00:00 — apenas sincronizamos o estado atual.
        if (engine.hasActiveMedia()) {
            val activeUri = engine.currentMediaUri
            val state = _uiState.value
            val matching = activeUri?.let { uri -> state.allVideos.firstOrNull { it.uri == uri } }
            val matchingIdx = if (matching != null) state.allVideos.indexOf(matching) else state.currentIndexInFolder
            val livePos = engine.getPositionMs()
            val liveDur = engine.getDurationMs()
            _uiState.update {
                it.copy(
                    currentVideo = matching ?: it.currentVideo,
                    currentIndexInFolder = matchingIdx,
                    isPlaying = engine.isPlaying(),
                    positionMs = livePos,
                    durationMs = liveDur
                )
            }
            return
        }

        // Cold start: nenhuma mídia carregada ainda no engine — retoma automaticamente do ponto salvo em tela cheia
        val current = _uiState.value.currentVideo
        if (current != null) {
            val resumeMs = if (current.id == savedResumeVideoId) savedResumePositionMs else 0L
            playVideo(current, resumePositionMs = resumeMs, forceRestart = false)
        }
    }

    fun persistPlaybackPosition(commitImmediately: Boolean = false) {
        val state = _uiState.value
        val video = state.currentVideo ?: return
        val pos = service?.engine?.getPositionMs()?.takeIf { it > 0L } ?: state.positionMs
        val dur = service?.engine?.getDurationMs()?.takeIf { it > 0L } ?: state.durationMs
        savedResumePositionMs = pos
        saveCurrentSnapshotSync(video, pos, dur, commitImmediately = commitImmediately)
        if (pos > 0L) {
            viewModelScope.launch { prefs.saveLastPositionMs(pos) }
        }
    }

    private fun saveCurrentSnapshotSync(
        video: VideoFileItem,
        positionMs: Long,
        durationMs: Long,
        commitImmediately: Boolean
    ) {
        val state = _uiState.value
        val rootUri = activeQueueRootUri.ifEmpty { state.folderUri }
        val rootName = activeQueueRootName.ifEmpty { state.rootFolderName }
        prefs.saveLastPlaybackSync(
            snapshot = LastPlaybackSnapshot(
                videoId = video.id,
                videoUri = video.uri.toString(),
                videoName = video.name,
                folderUri = rootUri,
                folderName = rootName,
                relativePath = activeQueueRelativePath,
                storageSlot = activeQueueStorageSlot,
                isAllFoldersMode = activeQueueIsAllMode,
                positionMs = positionMs.coerceAtLeast(0L),
                durationMs = durationMs.coerceAtLeast(0L)
            ),
            commitImmediately = commitImmediately
        )
    }

    fun onFolderSelected(uriString: String, displayName: String, slot: StorageSlot = StorageSlot.USB) {
        viewModelScope.launch {
            prefs.saveFolder(uriString, displayName, slot)
            _uiState.update {
                when (slot) {
                    StorageSlot.USB -> it.copy(usbFolderUri = uriString, usbFolderName = displayName)
                    StorageSlot.SD_CARD -> it.copy(sdFolderUri = uriString, sdFolderName = displayName)
                    else -> it
                }
            }
            loadDirectory(
                uriString = uriString,
                rootName = displayName,
                slot = slot,
                relativePath = emptyList(),
                knownDocumentId = null,
                autoResumeVideoId = "",
                replaceActiveQueue = _uiState.value.currentVideo == null,
                forceRefresh = false
            )
        }
    }

    fun selectStorageSlot(slot: StorageSlot, onRequestFolderPicker: (StorageSlot) -> Unit) {
        val state = _uiState.value
        when (slot) {
            StorageSlot.ALL -> enableAllFoldersMode()
            StorageSlot.USB -> {
                if (state.usbFolderUri.isNotEmpty() && state.activeStorageSlot != StorageSlot.USB) {
                    viewModelScope.launch {
                        prefs.saveFolder(state.usbFolderUri, state.usbFolderName, StorageSlot.USB)
                        loadDirectory(
                            uriString = state.usbFolderUri,
                            rootName = state.usbFolderName,
                            slot = StorageSlot.USB,
                            relativePath = emptyList(),
                            knownDocumentId = null,
                            autoResumeVideoId = "",
                            replaceActiveQueue = state.currentVideo == null,
                            forceRefresh = false
                        )
                    }
                } else {
                    onRequestFolderPicker(StorageSlot.USB)
                }
            }
            StorageSlot.SD_CARD -> {
                if (state.sdFolderUri.isNotEmpty() && state.activeStorageSlot != StorageSlot.SD_CARD) {
                    viewModelScope.launch {
                        prefs.saveFolder(state.sdFolderUri, state.sdFolderName, StorageSlot.SD_CARD)
                        loadDirectory(
                            uriString = state.sdFolderUri,
                            rootName = state.sdFolderName,
                            slot = StorageSlot.SD_CARD,
                            relativePath = emptyList(),
                            knownDocumentId = null,
                            autoResumeVideoId = "",
                            replaceActiveQueue = state.currentVideo == null,
                            forceRefresh = false
                        )
                    }
                } else {
                    onRequestFolderPicker(StorageSlot.SD_CARD)
                }
            }
            StorageSlot.INTERNAL -> {
                val internalDir = Environment.getExternalStorageDirectory()
                if (internalDir != null && internalDir.exists() && internalDir.canRead()) {
                    val path = internalDir.absolutePath
                    viewModelScope.launch {
                        prefs.saveFolder(path, "Memória Interna", StorageSlot.INTERNAL)
                        loadDirectory(
                            uriString = path,
                            rootName = "Memória Interna",
                            slot = StorageSlot.INTERNAL,
                            relativePath = emptyList(),
                            knownDocumentId = null,
                            autoResumeVideoId = "",
                            replaceActiveQueue = state.currentVideo == null,
                            forceRefresh = false
                        )
                    }
                } else {
                    onRequestFolderPicker(StorageSlot.INTERNAL)
                }
            }
        }
    }

    /**
     * Entra em uma subpasta instantaneamente usando cache em memória quando disponível (0 ms),
     * sem interromper o vídeo que está tocando no Mini-Player.
     */
    fun openSubfolder(entry: FolderEntry) {
        val state = _uiState.value
        if (state.folderUri.isEmpty()) return
        val cached = repository.getCachedDirectoryEntries(state.folderUri, entry.relativePath)
        if (cached != null) {
            applyInstantDirectorySnapshot(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = entry.relativePath,
                subfolders = cached.subfolders,
                videos = cached.videos
            )
            return
        }
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = entry.relativePath,
                knownDocumentId = entry.documentId.ifBlank { null },
                autoResumeVideoId = "",
                replaceActiveQueue = false,
                forceRefresh = false
            )
        }
    }

    fun navigateUpFolder() {
        val state = _uiState.value
        if (state.folderBreadcrumbs.isEmpty() || state.folderUri.isEmpty()) return
        val parentPath = state.folderBreadcrumbs.dropLast(1)
        val cached = repository.getCachedDirectoryEntries(state.folderUri, parentPath)
        if (cached != null) {
            applyInstantDirectorySnapshot(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = parentPath,
                subfolders = cached.subfolders,
                videos = cached.videos
            )
            return
        }
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = parentPath,
                knownDocumentId = null,
                autoResumeVideoId = "",
                replaceActiveQueue = false,
                forceRefresh = false
            )
        }
    }

    fun navigateToBreadcrumb(index: Int) {
        val state = _uiState.value
        if (state.folderUri.isEmpty()) return
        val targetPath = if (index < 0) emptyList() else state.folderBreadcrumbs.take(index + 1)
        val cached = repository.getCachedDirectoryEntries(state.folderUri, targetPath)
        if (cached != null) {
            applyInstantDirectorySnapshot(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = targetPath,
                subfolders = cached.subfolders,
                videos = cached.videos
            )
            return
        }
        viewModelScope.launch {
            loadDirectory(
                uriString = state.folderUri,
                rootName = state.rootFolderName,
                slot = state.activeStorageSlot,
                relativePath = targetPath,
                knownDocumentId = null,
                autoResumeVideoId = "",
                replaceActiveQueue = false,
                forceRefresh = false
            )
        }
    }

    private fun applyInstantDirectorySnapshot(
        uriString: String,
        rootName: String,
        slot: StorageSlot,
        relativePath: List<String>,
        subfolders: List<FolderEntry>,
        videos: List<VideoFileItem>
    ) {
        val displayTitle = relativePath.lastOrNull() ?: rootName
        val state = _uiState.value
        val sorted = StorageRepository.sortItems(videos, state.sortOrder)
        val filtered = StorageRepository.filterBySubstring(sorted, state.searchQuery)
        _uiState.update {
            it.copy(
                isScanning = false,
                isAllFoldersMode = false,
                activeStorageSlot = slot,
                folderUri = uriString,
                rootFolderName = rootName,
                folderName = displayTitle,
                folderBreadcrumbs = relativePath,
                currentSubfolders = subfolders,
                browsedVideos = sorted,
                visibleVideos = filtered
            )
        }
    }

    fun enableAllFoldersMode() {
        val state = _uiState.value
        val cached = repository.getCachedAllFolders(
            savedFolderUri = state.folderUri,
            selectedFolderIds = state.selectedAllFolderIds,
            usbFolderUri = state.usbFolderUri,
            sdFolderUri = state.sdFolderUri
        )
        viewModelScope.launch {
            prefs.savePlayAllFolders(true)
            if (cached != null) {
                _uiState.update {
                    it.copy(
                        isAllFoldersMode = true,
                        activeStorageSlot = StorageSlot.ALL,
                        folderBreadcrumbs = emptyList(),
                        currentSubfolders = emptyList(),
                        folderName = "Todas as Pastas"
                    )
                }
                applyLoadedPlaylist(cached, state.currentVideo?.id.orEmpty(), replaceActiveQueue = true)
            } else {
                loadAllFolders(state.folderUri, state.selectedAllFolderIds, state.currentVideo?.id.orEmpty(), forceRefresh = false)
            }
        }
    }

    fun openAllFoldersFilter() {
        val state = _uiState.value
        viewModelScope.launch {
            val discovered = repository.discoverSelectableFolders(
                savedRootUri = state.folderUri,
                usbFolderUri = state.usbFolderUri,
                sdFolderUri = state.sdFolderUri,
                activeSlot = state.activeStorageSlot
            )
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
            loadAllFolders(state.folderUri, selectedIds, state.currentVideo?.id.orEmpty(), forceRefresh = false)
        }
    }

    fun openSettings() {
        _uiState.update { it.copy(isSettingsOpen = true) }
    }

    fun closeSettings() {
        _uiState.update { it.copy(isSettingsOpen = false) }
    }

    fun setUiScaleLevel(level: UiScaleLevel) {
        _uiState.update { it.copy(uiScaleLevel = level) }
        viewModelScope.launch { prefs.saveUiScaleLevel(level) }
    }

    fun setColorTheme(theme: AppColorTheme) {
        _uiState.update { it.copy(colorTheme = theme) }
        viewModelScope.launch { prefs.saveColorTheme(theme) }
    }

    fun setStartOnBoot(enabled: Boolean) {
        _uiState.update { it.copy(startOnBoot = enabled) }
        viewModelScope.launch { prefs.saveStartOnBoot(enabled) }
    }

    fun syncVolumeFraction(fraction: Float) {
        val pct = (fraction.coerceIn(0f, 1f) * 100f).roundToInt().coerceIn(0, 100)
        _uiState.update { it.copy(volumePercent = pct) }
        service?.engine?.setVolumePercent(pct)
        prefs.saveVolumePercentSync(pct)
    }

    fun getVolumeFraction(): Float =
        (_uiState.value.volumePercent / 100f).coerceIn(0f, 1f)

    /**
     * Único ponto onde o cache em memória é invalidado para reescanear o Pen Drive / armazenamento.
     */
    fun refreshCurrentFolder() {
        val state = _uiState.value
        repository.invalidateAllCaches()
        viewModelScope.launch {
            if (state.isAllFoldersMode) {
                loadAllFolders(state.folderUri, state.selectedAllFolderIds, state.currentVideo?.id.orEmpty(), forceRefresh = true)
            } else if (state.folderUri.isNotEmpty()) {
                loadDirectory(
                    uriString = state.folderUri,
                    rootName = state.rootFolderName,
                    slot = state.activeStorageSlot,
                    relativePath = state.folderBreadcrumbs,
                    knownDocumentId = null,
                    autoResumeVideoId = state.currentVideo?.id.orEmpty(),
                    replaceActiveQueue = false,
                    forceRefresh = true
                )
            }
        }
    }

    private suspend fun loadAllFolders(
        savedFolderUri: String,
        selectedFolderIds: Set<String>?,
        autoResumeVideoId: String,
        forceRefresh: Boolean
    ) {
        _uiState.update {
            it.copy(
                isScanning = true,
                isAllFoldersMode = true,
                activeStorageSlot = StorageSlot.ALL,
                folderBreadcrumbs = emptyList(),
                currentSubfolders = emptyList(),
                folderName = "Todas as Pastas"
            )
        }
        val state = _uiState.value
        val scanned = repository.scanAllFoldersCombined(
            savedFolderUri = savedFolderUri,
            selectedFolderIds = selectedFolderIds,
            usbFolderUri = state.usbFolderUri,
            sdFolderUri = state.sdFolderUri,
            forceRefresh = forceRefresh
        )
        applyLoadedPlaylist(scanned, autoResumeVideoId, replaceActiveQueue = true)
    }

    private suspend fun loadDirectory(
        uriString: String,
        rootName: String,
        slot: StorageSlot,
        relativePath: List<String>,
        knownDocumentId: String?,
        autoResumeVideoId: String,
        replaceActiveQueue: Boolean,
        forceRefresh: Boolean
    ) {
        val displayTitle = relativePath.lastOrNull() ?: rootName
        _uiState.update {
            it.copy(
                isScanning = true,
                isAllFoldersMode = false,
                activeStorageSlot = slot,
                folderUri = uriString,
                rootFolderName = rootName,
                folderName = displayTitle,
                folderBreadcrumbs = relativePath
            )
        }
        val snapshot = repository.scanDirectoryEntries(
            rootUriString = uriString,
            relativePath = relativePath,
            knownDocumentId = knownDocumentId,
            forceRefresh = forceRefresh
        )
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

        val engine = service?.engine
        val activeUri = if (engine?.hasActiveMedia() == true) engine.currentMediaUri else null

        // Se o serviço já estiver reproduzindo um vídeo (ou retomando o último vídeo salvo),
        // apenas sincroniza a fila em segundo plano sem reiniciar do 00:00
        if (activeUri != null) {
            val runningMatch = sorted.firstOrNull { it.uri == activeUri || it.id == savedResumeVideoId }
            val existingCurrent = _uiState.value.currentVideo
            val target = runningMatch ?: existingCurrent ?: sorted.firstOrNull()
            val idx = if (target != null) sorted.indexOfFirst { it.id == target.id || it.uri == target.uri } else -1
            _uiState.update {
                it.copy(
                    allVideos = sorted,
                    browsedVideos = sorted,
                    visibleVideos = filtered,
                    currentVideo = target,
                    currentIndexInFolder = idx,
                    isPlaying = engine?.isPlaying() == true,
                    positionMs = engine?.getPositionMs() ?: it.positionMs,
                    durationMs = engine?.getDurationMs() ?: it.durationMs,
                    isScanning = false
                )
            }
            return
        }

        shuffleBackStack.clear()
        val existingCurrent = _uiState.value.currentVideo
        val target = sorted.firstOrNull { it.id == autoResumeVideoId || (existingCurrent != null && it.uri == existingCurrent.uri) }
            ?: existingCurrent
            ?: sorted.firstOrNull()
        val idx = if (target != null) sorted.indexOfFirst { it.id == target.id || it.uri == target.uri } else -1

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
            val resumeMs = if (target.id == savedResumeVideoId || target.uri == existingCurrent?.uri) savedResumePositionMs else 0L
            playVideo(target, resumePositionMs = resumeMs, forceRestart = false)
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
        // Registra a pasta/subpasta/origem exata da fila que o usuário acabou de iniciar
        activeQueueRootUri = state.folderUri
        activeQueueRootName = state.rootFolderName
        activeQueueRelativePath = if (state.isAllFoldersMode) emptyList() else state.folderBreadcrumbs
        activeQueueStorageSlot = state.activeStorageSlot
        activeQueueIsAllMode = state.isAllFoldersMode

        if (currentBrowsed.any { it.id == item.id }) {
            val idx = currentBrowsed.indexOfFirst { it.id == item.id }
            _uiState.update { it.copy(allVideos = currentBrowsed, currentIndexInFolder = idx) }
        }
        val isSameRunning = service?.engine?.hasActiveMediaFor(item.uri) == true
        playVideo(item, resumePositionMs = 0L, forceRestart = !isSameRunning)
    }

    private fun pushShuffleHistory(videoId: String) {
        shuffleBackStack.addLast(videoId)
        while (shuffleBackStack.size > 200) {
            shuffleBackStack.removeFirst()
        }
    }

    fun playVideo(
        item: VideoFileItem,
        resumePositionMs: Long = 0L,
        forceRestart: Boolean = true
    ) {
        val svc = service ?: return
        if (!svc.audioFocus.requestFocus()) return
        val idx = _uiState.value.allVideos.indexOfFirst { it.id == item.id }

        if (!forceRestart && svc.engine.hasActiveMediaFor(item.uri)) {
            _uiState.update {
                it.copy(
                    currentVideo = item,
                    currentIndexInFolder = idx,
                    positionMs = svc.engine.getPositionMs(),
                    durationMs = svc.engine.getDurationMs()
                )
            }
            svc.engine.playUri(item.uri, startPositionMs = resumePositionMs, forceRestart = false)
            svc.engine.applyAspectRatio(_uiState.value.aspectRatio)
            svc.updateNotification(item.name, true)
            return
        }

        val prevState = _uiState.value
        val initialDurationMs = if (prevState.currentVideo?.id == item.id) prevState.durationMs else 0L
        savedResumeVideoId = item.id
        savedResumePositionMs = resumePositionMs
        _uiState.update {
            it.copy(
                currentVideo = item,
                currentIndexInFolder = idx,
                positionMs = resumePositionMs,
                durationMs = initialDurationMs
            )
        }
        saveCurrentSnapshotSync(item, resumePositionMs, initialDurationMs, commitImmediately = false)
        svc.engine.applyAspectRatio(_uiState.value.aspectRatio)
        svc.engine.playUri(item.uri, startPositionMs = resumePositionMs, forceRestart = forceRestart)
        svc.updateNotification(item.name, true)
        viewModelScope.launch {
            prefs.saveLastVideoId(item.id)
            prefs.saveLastPositionMs(resumePositionMs)
        }
    }

    fun togglePlayPause() {
        val svc = service ?: return
        if (svc.engine.isPlaying()) {
            persistPlaybackPosition(commitImmediately = false)
        } else {
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
        playVideo(nextItem, resumePositionMs = 0L, forceRestart = true)
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
                    playVideo(match, resumePositionMs = 0L, forceRestart = true)
                    return
                }
            }
        }

        val currentIdx = state.currentIndexInFolder.coerceAtLeast(0)
        val prevIdx = (currentIdx - 1 + list.size) % list.size
        playVideo(list[prevIdx], resumePositionMs = 0L, forceRestart = true)
    }

    fun seekTo(positionMs: Long) {
        service?.engine?.seekTo(positionMs)
        savedResumePositionMs = positionMs
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
                    playVideo(nextCurrent, resumePositionMs = 0L, forceRestart = true)
                }
            }
        }
    }
}
`,
  },
];
