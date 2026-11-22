package com.autocine.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AspectRatio
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PictureInPictureAlt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.PlaybackMode
import com.autocine.player.ui.theme.LocalAutoCinePalette
import com.autocine.player.viewmodel.PlaybackProgressState
import com.autocine.player.viewmodel.PlayerUiState
import kotlinx.coroutines.flow.StateFlow

private val TopScrimBrush = Brush.verticalGradient(colors = listOf(Color(0xD907090D), Color.Transparent))
private val BottomScrimBrush = Brush.verticalGradient(colors = listOf(Color.Transparent, Color(0xEB07090D)))
private val ControlChipShape = RoundedCornerShape(16.dp)
private val ControlChipColor = Color(0x991E293B)
private val CenterButtonBgColor = Color(0xB30F172A)

private fun formatTwoDigitIndex(value: Int): String = if (value < 10) "0$value" else value.toString()

@Composable
fun FullScreenControls(
    visible: Boolean,
    state: PlayerUiState,
    progressFlow: StateFlow<PlaybackProgressState>,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onSeek: (Long) -> Unit,
    onCycleMode: () -> Unit,
    onCycleAspect: () -> Unit,
    onOpenSplitList: () -> Unit,
    onEnterPip: () -> Unit
) {
    val palette = LocalAutoCinePalette.current

    val headerLabel by remember(state.currentVideo?.name, state.currentIndexInFolder, state.allVideos.size) {
        derivedStateOf {
            val video = state.currentVideo
            if (video != null) {
                val total = state.allVideos.size
                val idxDisplay = if (state.currentIndexInFolder >= 0) state.currentIndexInFolder + 1 else 0
                "${formatTwoDigitIndex(idxDisplay)}/${formatTwoDigitIndex(total)} - ${video.name}"
            } else {
                "Toque em Pastas para escolher vídeos (USB / SD)"
            }
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(animationSpec = tween(150)),
        exit = fadeOut(animationSpec = tween(180)),
        modifier = Modifier.fillMaxSize()
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Barra Superior otimizada para 9": índice/total + nome completo + botão grande de PiP
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .background(TopScrimBrush)
                    .padding(horizontal = 24.dp, vertical = 18.dp)
            ) {
                Text(
                    text = headerLabel,
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                Spacer(Modifier.width(16.dp))

                Surface(
                    onClick = onEnterPip,
                    shape = ControlChipShape,
                    color = ControlChipColor,
                    modifier = Modifier.height(58.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 18.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.PictureInPictureAlt,
                            contentDescription = "Picture-in-Picture",
                            tint = palette.accent,
                            modifier = Modifier.size(26.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("PiP", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            // Controles Extragrandes Centrais para tela de 9" (88dp / 108dp)
            Row(
                horizontalArrangement = Arrangement.spacedBy(48.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.align(Alignment.Center)
            ) {
                Surface(
                    onClick = onPrev,
                    shape = CircleShape,
                    color = CenterButtonBgColor,
                    modifier = Modifier.size(88.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipPrevious,
                            contentDescription = "Anterior",
                            tint = Color.White,
                            modifier = Modifier.size(48.dp)
                        )
                    }
                }

                Surface(
                    onClick = onTogglePlayPause,
                    shape = CircleShape,
                    color = palette.accent,
                    modifier = Modifier.size(108.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = if (state.isPlaying) "Pausar" else "Reproduzir",
                            tint = palette.onAccent,
                            modifier = Modifier.size(58.dp)
                        )
                    }
                }

                Surface(
                    onClick = onNext,
                    shape = CircleShape,
                    color = CenterButtonBgColor,
                    modifier = Modifier.size(88.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipNext,
                            contentDescription = "Próximo",
                            tint = Color.White,
                            modifier = Modifier.size(48.dp)
                        )
                    }
                }
            }

            // Barra Inferior ampla para toque seguro em 9" (botões 64dp)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .background(BottomScrimBrush)
                    .padding(horizontal = 24.dp, vertical = 18.dp)
            ) {
                // Barra de progresso 100% isolada: somente este Composable recompõe ao longo do tempo
                FullScreenProgressBar(
                    progressFlow = progressFlow,
                    accentColor = palette.accent,
                    onSeek = onSeek
                )

                Spacer(Modifier.height(10.dp))

                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Esquerda: Modo de Reprodução + Proporção de Tela (64dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Surface(
                            onClick = onCycleMode,
                            shape = ControlChipShape,
                            color = ControlChipColor,
                            modifier = Modifier.height(64.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 18.dp)
                            ) {
                                val icon = when (state.playbackMode) {
                                    PlaybackMode.SEQUENTIAL -> Icons.Rounded.Repeat
                                    PlaybackMode.SHUFFLE -> Icons.Rounded.Shuffle
                                    PlaybackMode.REPEAT_ONE -> Icons.Rounded.RepeatOne
                                }
                                Icon(icon, contentDescription = "Modo", tint = palette.accent, modifier = Modifier.size(26.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(state.playbackMode.label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            }
                        }

                        Surface(
                            onClick = onCycleAspect,
                            shape = ControlChipShape,
                            color = ControlChipColor,
                            modifier = Modifier.height(64.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 18.dp)
                            ) {
                                Icon(Icons.Rounded.AspectRatio, contentDescription = "Proporção", tint = palette.accent, modifier = Modifier.size(26.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(state.aspectRatio.label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }

                    // Centro: Retroceder, Play/Pause, Próximo (64dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onPrev, modifier = Modifier.size(64.dp)) {
                            Icon(Icons.Rounded.SkipPrevious, contentDescription = "Anterior", tint = Color.White, modifier = Modifier.size(36.dp))
                        }
                        IconButton(onClick = onTogglePlayPause, modifier = Modifier.size(68.dp)) {
                            Icon(
                                if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                contentDescription = "Play/Pause",
                                tint = Color.White,
                                modifier = Modifier.size(40.dp)
                            )
                        }
                        IconButton(onClick = onNext, modifier = Modifier.size(64.dp)) {
                            Icon(Icons.Rounded.SkipNext, contentDescription = "Próximo", tint = Color.White, modifier = Modifier.size(36.dp))
                        }
                    }

                    // Direita: Botão grande Pastas / Lista (64dp)
                    Surface(
                        onClick = onOpenSplitList,
                        shape = ControlChipShape,
                        color = Color(0xFF1E293B),
                        modifier = Modifier.height(64.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 22.dp)
                        ) {
                            Icon(Icons.Rounded.FolderOpen, contentDescription = "Pastas", tint = palette.accent, modifier = Modifier.size(28.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Pastas / Lista", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Composable dedicado e isolado para a linha do tempo e o Slider.
 * Coleta apenas o StateFlow de progresso, evitando recomposições em cascata
 * do FullScreenControls, PlayerScreen e VlcVideoSurface a cada tick do vídeo.
 */
@Composable
private fun FullScreenProgressBar(
    progressFlow: StateFlow<PlaybackProgressState>,
    accentColor: Color,
    onSeek: (Long) -> Unit
) {
    val progress by progressFlow.collectAsState()
    var isDragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }

    val maxDuration = progress.durationMs.coerceAtLeast(1L).toFloat()
    val displayedPositionMs = if (isDragging) dragValue.toLong() else progress.positionMs
    val sliderValue = (if (isDragging) dragValue else progress.positionMs.toFloat()).coerceIn(0f, maxDuration)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = formatMs(displayedPositionMs),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold
        )
        Slider(
            value = sliderValue,
            onValueChange = { next ->
                isDragging = true
                dragValue = next
            },
            onValueChangeFinished = {
                val targetMs = dragValue.toLong()
                isDragging = false
                onSeek(targetMs)
            },
            valueRange = 0f..maxDuration,
            colors = SliderDefaults.colors(
                thumbColor = Color.White,
                activeTrackColor = accentColor,
                inactiveTrackColor = Color(0x4DFFFFFF)
            ),
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 14.dp)
        )
        Text(
            text = formatMs(progress.durationMs),
            color = Color(0xFFCBD5E1),
            fontSize = 16.sp
        )
    }
}
