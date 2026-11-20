package com.autocine.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autocine.player.viewmodel.PlayerViewModel
import com.autocine.player.vlc.VlcPlayerEngine
import kotlinx.coroutines.delay
import org.videolan.libvlc.util.VLCVideoLayout

@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    getEngine: () -> VlcPlayerEngine?,
    onEnterPip: () -> Unit,
    onPickFolder: () -> Unit,
    onAdjustBrightness: (Float) -> Unit,
    onGetBrightness: () -> Float,
    onAdjustVolume: (Float) -> Unit,
    onGetVolume: () -> Float
) {
    val state by viewModel.uiState.collectAsState()
    var controlsVisible by remember { mutableStateOf(true) }

    // Oculta automaticamente os controles após 4.5 segundos em tela cheia
    LaunchedEffect(controlsVisible, state.isPlaying, state.isSplitScreen, state.isInPipMode) {
        if (controlsVisible && state.isPlaying && !state.isSplitScreen && !state.isInPipMode) {
            delay(4500L)
            controlsVisible = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        if (state.isSplitScreen && !state.isInPipMode) {
            Row(modifier = Modifier.fillMaxSize()) {
                // Esquerda: Mini-Player contínuo (toque no vídeo para voltar à tela cheia)
                SplitScreenLeftPane(
                    state = state,
                    videoSurface = {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(16.dp))
                                .clickable { viewModel.setSplitScreen(false) }
                        ) {
                            VlcVideoSurface(getEngine = getEngine, modifier = Modifier.fillMaxSize())
                        }
                    },
                    onTogglePlayPause = viewModel::togglePlayPause,
                    onPrev = viewModel::playPrevious,
                    onNext = viewModel::playNext,
                    onCycleMode = viewModel::cyclePlaybackMode,
                    onCycleAspect = viewModel::cycleAspectRatio,
                    onEnterPip = onEnterPip,
                    onPickFolder = onPickFolder,
                    onPlayAllFolders = viewModel::enableAllFoldersMode,
                    onOpenAllFilter = viewModel::openAllFoldersFilter,
                    modifier = Modifier
                        .weight(0.42f)
                        .fillMaxHeight()
                        .padding(16.dp)
                )

                // Direita: Navegação por subpastas + Lista com miniaturas, busca parcial, filtro Todas, refresh e delete
                SplitScreenFileList(
                    state = state,
                    onSelectVideo = viewModel::playVideoFromList,
                    onOpenSubfolder = viewModel::openSubfolder,
                    onNavigateUp = viewModel::navigateUpFolder,
                    onNavigateBreadcrumb = viewModel::navigateToBreadcrumb,
                    onOpenAllFilter = viewModel::openAllFoldersFilter,
                    onDismissAllFilter = viewModel::closeAllFoldersFilter,
                    onApplyAllFilter = viewModel::applyAllFoldersSelection,
                    onSearchChange = viewModel::updateSearchQuery,
                    onRefresh = viewModel::refreshCurrentFolder,
                    onCycleSort = viewModel::cycleSortOrder,
                    onRequestDelete = viewModel::requestDelete,
                    onConfirmDelete = viewModel::confirmDelete,
                    onCancelDelete = viewModel::cancelDelete,
                    modifier = Modifier
                        .weight(0.58f)
                        .fillMaxHeight()
                )
            }
        } else {
            // Tela Cheia ou Picture-in-Picture (PiP)
            VlcVideoSurface(getEngine = getEngine, modifier = Modifier.fillMaxSize())

            if (!state.isInPipMode) {
                GestureOverlay(
                    positionMs = state.positionMs,
                    durationMs = state.durationMs,
                    onTapToggleControls = { controlsVisible = !controlsVisible },
                    onSeekCommit = viewModel::seekTo,
                    onGetBrightness = onGetBrightness,
                    onAdjustBrightness = onAdjustBrightness,
                    onGetVolume = onGetVolume,
                    onAdjustVolume = onAdjustVolume
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
}

@Composable
fun VlcVideoSurface(
    getEngine: () -> VlcPlayerEngine?,
    modifier: Modifier = Modifier
) {
    var videoLayoutRef by remember { mutableStateOf<VLCVideoLayout?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            val layout = videoLayoutRef
            if (layout != null) {
                getEngine()?.detachVideoLayout(layout)
            }
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            VLCVideoLayout(context).also { layout ->
                videoLayoutRef = layout
                getEngine()?.attachVideoLayout(layout)
            }
        },
        update = { layout ->
            getEngine()?.attachVideoLayout(layout)
        }
    )
}
