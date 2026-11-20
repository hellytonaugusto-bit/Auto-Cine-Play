package com.autocine.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autocine.player.data.StorageSlot
import com.autocine.player.viewmodel.PlayerViewModel
import com.autocine.player.vlc.VlcPlayerEngine
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.videolan.libvlc.util.VLCVideoLayout
import kotlin.math.roundToInt

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
    var miniSlotBounds by remember { mutableStateOf<Rect?>(null) }

    // Oculta automaticamente os controles após 4.5 segundos em tela cheia
    LaunchedEffect(controlsVisible, isPlaying, isSplitScreen, isInPipMode) {
        if (controlsVisible && isPlaying && !isSplitScreen && !isInPipMode) {
            delay(4500L)
            controlsVisible = false
        }
    }

    // Reaplica a proporção de tela sempre que alterna entre Mini-Player, Tela Cheia e PiP
    LaunchedEffect(engine, isSplitScreen, isInPipMode) {
        engine?.reapplyAspectRatio()
    }

    val showSplitLayout = isSplitScreen && !isInPipMode
    val density = LocalDensity.current

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        val fallbackPaddingPx = with(density) { 26.dp.toPx() }
        val fallbackMiniWidthPx = (constraints.maxWidth * 0.40f - fallbackPaddingPx * 2f).coerceAtLeast(120f)
        val fallbackMiniHeightPx = fallbackMiniWidthPx * 9f / 16f
        val effectiveMiniRect = miniSlotBounds ?: Rect(
            left = fallbackPaddingPx,
            top = fallbackPaddingPx,
            right = fallbackPaddingPx + fallbackMiniWidthPx,
            bottom = fallbackPaddingPx + fallbackMiniHeightPx
        )

        // Camada 1: Interface da Tela Dividida (painel lateral + lista de vídeos)
        if (showSplitLayout) {
            SplitScreenContent(
                viewModel = viewModel,
                onEnterPip = onEnterPip,
                onPickFolderForSlot = onPickFolderForSlot,
                onVideoSlotPositioned = { rect -> miniSlotBounds = rect }
            )
        }

        // Camada 2: ÚNICA instância persistente do VLCVideoLayout (NUNCA destruída nem recriada).
        // Alternar entre Mini-Player e Tela Cheia apenas redimensiona e reposiciona o Modifier,
        // eliminando lag e tela preta causados por detachViews()/attachViews().
        val videoModifier = if (showSplitLayout) {
            val miniWidthDp = with(density) { effectiveMiniRect.width.toDp() }
            val miniHeightDp = with(density) { effectiveMiniRect.height.toDp() }
            Modifier
                .offset {
                    IntOffset(
                        x = effectiveMiniRect.left.roundToInt(),
                        y = effectiveMiniRect.top.roundToInt()
                    )
                }
                .size(width = miniWidthDp, height = miniHeightDp)
                .clip(RoundedCornerShape(14.dp))
        } else {
            Modifier.fillMaxSize()
        }

        PersistentVlcVideoSurface(
            engine = engine,
            modifier = videoModifier
        )

        // Área clicável transparente exatamente sobre o mini-player para expandir instantaneamente para Tela Cheia
        if (showSplitLayout) {
            val miniWidthDp = with(density) { effectiveMiniRect.width.toDp() }
            val miniHeightDp = with(density) { effectiveMiniRect.height.toDp() }
            Box(
                modifier = Modifier
                    .offset {
                        IntOffset(
                            x = effectiveMiniRect.left.roundToInt(),
                            y = effectiveMiniRect.top.roundToInt()
                        )
                    }
                    .size(width = miniWidthDp, height = miniHeightDp)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable {
                        controlsVisible = true
                        viewModel.setSplitScreen(false)
                    }
            )
        }

        // Camada 3: Gestos e Controles de Tela Cheia desenhados por cima da mesma instância de vídeo
        if (!showSplitLayout && !isInPipMode) {
            FullscreenOverlays(
                viewModel = viewModel,
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
    onEnterPip: () -> Unit,
    onPickFolderForSlot: (StorageSlot) -> Unit,
    onVideoSlotPositioned: (Rect) -> Unit
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
        // Esquerda: Espaço reservado 16:9 para o Mini-Player persistente + Controles + Armazenamento
        SplitScreenLeftPane(
            isPlaying = state.isPlaying,
            activeStorageSlot = state.activeStorageSlot,
            hasCustomAllFilter = state.selectedAllFolderIds != null,
            onVideoSlotPositioned = onVideoSlotPositioned,
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

        // Direita: Navegação por subpastas + Lista com miniaturas, busca com Limpar, configurações, refresh e delete
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
private fun FullscreenOverlays(
    viewModel: PlayerViewModel,
    controlsVisible: Boolean,
    onToggleControls: () -> Unit,
    onEnterPip: () -> Unit,
    onAdjustBrightness: (Float) -> Unit,
    onGetBrightness: () -> Float
) {
    val state by viewModel.uiState.collectAsState()

    GestureOverlay(
        positionMs = state.positionMs,
        durationMs = state.durationMs,
        onTapToggleControls = onToggleControls,
        onSeekCommit = viewModel::seekTo,
        onGetBrightness = onGetBrightness,
        onAdjustBrightness = onAdjustBrightness,
        onGetVolume = viewModel::getVlcVolumeFraction,
        onAdjustVolume = viewModel::setVlcVolumeFraction
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

@Composable
private fun PersistentVlcVideoSurface(
    engine: VlcPlayerEngine?,
    modifier: Modifier = Modifier
) {
    var videoLayoutRef by remember { mutableStateOf<VLCVideoLayout?>(null) }

    // Anexa automaticamente assim que o serviço/engine conectar (sem recriar a View)
    LaunchedEffect(engine, videoLayoutRef) {
        val layout = videoLayoutRef
        if (engine != null && layout != null) {
            engine.attachVideoLayout(layout)
        }
    }

    // Só desanexa quando a própria Activity/PlayerScreen for destruída
    DisposableEffect(engine) {
        onDispose {
            val layout = videoLayoutRef
            if (layout != null) {
                engine?.detachVideoLayout(layout)
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
        }
    )
}
