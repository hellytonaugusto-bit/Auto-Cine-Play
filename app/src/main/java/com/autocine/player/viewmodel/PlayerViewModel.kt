package com.autocine.player.viewmodel

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
                    colorTheme = saved.colorTheme
                )
            }
            service?.engine?.applyAspectRatio(saved.aspectRatio)

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
