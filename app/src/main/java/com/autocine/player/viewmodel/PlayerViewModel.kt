package com.autocine.player.viewmodel

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
