package com.autocine.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autocine.player.data.StorageSlot
import com.autocine.player.data.VolumeGestureMode
import com.autocine.player.viewmodel.PlayerViewModel
import com.autocine.player.vlc.VlcPlayerEngine
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.videolan.libvlc.util.VLCVideoLayout

@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    engine: VlcPlayerEngine?,
    onEnterPip: () -> Unit,
    onPickFolderForSlot: (StorageSlot) -> Unit,
    onAdjustBrightness: (Float) -> Unit,
    onGetBrightness: () -> Float
) {
    // Separa o estado estrutural (sem positionMs) para que o Split-Screen e a LazyColumn
    // NÃO recomponham a cada tick de progresso do vídeo em hardware modesto.
    val layoutModeFlow = remember {
        viewModel.uiState
            .map { Triple(it.isSplitScreen, it.isInPipMode, it.isPlaying) }
            .distinctUntilChanged()
    }
    val layoutMode by layoutModeFlow.collectAsState(
        initial = Triple(false, false, false)
    )
    val (isSplitScreen, isInPipMode, isPlaying) = layoutMode

    var controlsVisible by remember { mutableStateOf(true) }

    // Oculta automaticamente os controles após 4.5 segundos em tela cheia
    LaunchedEffect(controlsVisible, isPlaying, isSplitScreen, isInPipMode) {
        if (controlsVisible && isPlaying && !isSplitScreen && !isInPipMode) {
            delay(4500L)
            controlsVisible = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        if (isSplitScreen && !isInPipMode) {
            SplitScreenContent(
                viewModel = viewModel,
                engine = engine,
                onExpandToFullscreen = {
                    controlsVisible = true
                    viewModel.setSplitScreen(false)
                },
                onEnterPip = onEnterPip,
                onPickFolderForSlot = onPickFolderForSlot
            )
        } else {
            FullscreenContent(
                viewModel = viewModel,
                engine = engine,
                isInPipMode = isInPipMode,
                controlsVisible = controlsVisible,
                onToggleControls = { controlsVisible = !controlsVisible },
                onEnterPip = onEnterPip,
                onAdjustBrightness = onAdjustBrightness,
                onGetBrightness = onGetBrightness
            )
        }
    }
}

@Composable
private fun SplitScreenContent(
    viewModel: PlayerViewModel,
    engine: VlcPlayerEngine?,
    onExpandToFullscreen: () -> Unit,
    onEnterPip: () -> Unit,
    onPickFolderForSlot: (StorageSlot) -> Unit
) {
    // Coleta apenas campos relevantes ao Split-Screen (ignorando positionMs/durationMs)
    val browserStateFlow = remember {
        viewModel.uiState
            .map { state ->
                state.copy(positionMs = 0L, durationMs = 0L)
            }
            .distinctUntilChanged()
    }
    val state by browserStateFlow.collectAsState(
        initial = viewModel.uiState.value.copy(positionMs = 0L, durationMs = 0L)
    )

    Row(modifier = Modifier.fillMaxSize()) {
        // Esquerda: Mini-Player com VlcVideoSurface nativo + Controles + Armazenamento
        SplitScreenLeftPane(
            isPlaying = state.isPlaying,
            activeStorageSlot = state.activeStorageSlot,
            hasCustomAllFilter = state.selectedAllFolderIds != null,
            videoSurface = {
                VlcVideoSurface(
                    engine = engine,
                    modifier = Modifier.fillMaxSize()
                )
            },
            onExpandVideo = onExpandToFullscreen,
            onTogglePlayPause = viewModel::togglePlayPause,
            onPrev = viewModel::playPrevious,
            onNext = viewModel::playNext,
            onEnterPip = onEnterPip,
            onSelectStorageSlot = { slot ->
                viewModel.selectStorageSlot(slot, onPickFolderForSlot)
            },
            onOpenAllFilter = viewModel::openAllFoldersFilter,
            modifier = Modifier
                .weight(0.40f)
                .fillMaxHeight()
                .padding(14.dp)
        )

        // Direita: Navegação instantânea por subpastas + Lista com miniaturas sob demanda, busca com Limpar, configurações, refresh e delete
        SplitScreenFileList(
            state = state,
            onSelectVideo = viewModel::playVideoFromList,
            onOpenSubfolder = viewModel::openSubfolder,
            onNavigateUp = viewModel::navigateUpFolder,
            onNavigateBreadcrumb = viewModel::navigateToBreadcrumb,
            onOpenAllFilter = viewModel::openAllFoldersFilter,
            onDismissAllFilter = viewModel::closeAllFoldersFilter,
            onApplyAllFilter = viewModel::applyAllFoldersSelection,
            onOpenSettings = viewModel::openSettings,
            onDismissSettings = viewModel::closeSettings,
            onSelectUiScale = viewModel::setUiScaleLevel,
            onSelectColorTheme = viewModel::setColorTheme,
            onSelectVolumeGestureMode = viewModel::setVolumeGestureMode,
            onSearchChange = viewModel::updateSearchQuery,
            onRefresh = viewModel::refreshCurrentFolder,
            onCycleSort = viewModel::cycleSortOrder,
            onRequestDelete = viewModel::requestDelete,
            onConfirmDelete = viewModel::confirmDelete,
            onCancelDelete = viewModel::cancelDelete,
            modifier = Modifier
                .weight(0.60f)
                .fillMaxHeight()
        )
    }
}

@Composable
private fun FullscreenContent(
    viewModel: PlayerViewModel,
    engine: VlcPlayerEngine?,
    isInPipMode: Boolean,
    controlsVisible: Boolean,
    onToggleControls: () -> Unit,
    onEnterPip: () -> Unit,
    onAdjustBrightness: (Float) -> Unit,
    onGetBrightness: () -> Float
) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        // Superfície de vídeo nativa da libVLC diretamente na raiz (nenhuma camada opaca sobre o vídeo)
        VlcVideoSurface(
            engine = engine,
            modifier = Modifier.fillMaxSize()
        )

        if (!isInPipMode) {
            GestureOverlay(
                positionMs = state.positionMs,
                durationMs = state.durationMs,
                onTapToggleControls = onToggleControls,
                onSeekCommit = viewModel::seekTo,
                onGetBrightness = onGetBrightness,
                onAdjustBrightness = onAdjustBrightness,
                onGetVolume = viewModel::getInternalVolumeFraction,
                onAdjustVolume = viewModel::setInternalVolumeFraction,
                volumeGestureEnabled = state.volumeGestureMode == VolumeGestureMode.APP_INTERNAL
            )

            FullScreenControls(
                visible = controlsVisible,
                state = state,
                onTogglePlayPause = viewModel::togglePlayPause,
                onPrev = viewModel::playPrevious,
                onNext = viewModel::playNext,
                onSeek = viewModel::seekTo,
                onCycleMode = viewModel::cyclePlaybackMode,
                onCycleAspect = viewModel::cycleAspectRatio,
                onOpenSplitList = { viewModel.setSplitScreen(true) },
                onEnterPip = onEnterPip
            )
        }
    }
}

@Composable
private fun VlcVideoSurface(
    engine: VlcPlayerEngine?,
    modifier: Modifier = Modifier
) {
    val currentEngine by rememberUpdatedState(engine)
    var videoLayoutRef by remember { mutableStateOf<VLCVideoLayout?>(null) }

    // Garante anexação imediata assim que o engine conectar ou a View ficar pronta
    LaunchedEffect(engine, videoLayoutRef) {
        val layout = videoLayoutRef
        if (engine != null && layout != null) {
            engine.attachVideoLayout(layout)
        }
    }

    // Desanexa com segurança quando esta instância específica da superfície sair de tela
    DisposableEffect(Unit) {
        onDispose {
            val layout = videoLayoutRef
            if (layout != null) {
                currentEngine?.detachVideoLayout(layout)
            }
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            VLCVideoLayout(context).also { layout ->
                videoLayoutRef = layout
                engine?.attachVideoLayout(layout)
            }
        },
        update = { layout ->
            engine?.attachVideoLayout(layout)
        }
    )
}
