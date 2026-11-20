package com.autocine.player.ui

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.PlaybackMode
import com.autocine.player.viewmodel.PlayerUiState

@Composable
fun FullScreenControls(
    visible: Boolean,
    state: PlayerUiState,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onSeek: (Long) -> Unit,
    onCycleMode: () -> Unit,
    onCycleAspect: () -> Unit,
    onOpenSplitList: () -> Unit,
    onEnterPip: () -> Unit
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
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
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xD907090D), Color.Transparent)
                        )
                    )
                    .padding(horizontal = 24.dp, vertical = 18.dp)
            ) {
                val total = state.allVideos.size
                val idxDisplay = if (state.currentIndexInFolder >= 0) state.currentIndexInFolder + 1 else 0
                val headerLabel = if (state.currentVideo != null) {
                    "%02d/%02d - %s".format(idxDisplay, total, state.currentVideo.name)
                } else {
                    "Toque em Pastas para escolher vídeos (USB / SD)"
                }

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
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0x801E293B),
                    modifier = Modifier.height(58.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 18.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.PictureInPictureAlt,
                            contentDescription = "Picture-in-Picture",
                            tint = Color(0xFF38BDF8),
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
                    color = Color(0xB30F172A),
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
                    color = Color(0xF238BDF8),
                    modifier = Modifier.size(108.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = if (state.isPlaying) "Pausar" else "Reproduzir",
                            tint = Color(0xFF07090D),
                            modifier = Modifier.size(58.dp)
                        )
                    }
                }

                Surface(
                    onClick = onNext,
                    shape = CircleShape,
                    color = Color(0xB30F172A),
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
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color(0xEB07090D))
                        )
                    )
                    .padding(horizontal = 24.dp, vertical = 18.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(formatMs(state.positionMs), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Slider(
                        value = state.positionMs.toFloat(),
                        onValueChange = { onSeek(it.toLong()) },
                        valueRange = 0f..state.durationMs.coerceAtLeast(1L).toFloat(),
                        colors = SliderDefaults.colors(
                            thumbColor = Color.White,
                            activeTrackColor = Color(0xFF38BDF8),
                            inactiveTrackColor = Color(0x4DFFFFFF)
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 14.dp)
                    )
                    Text(formatMs(state.durationMs), color = Color(0xFFCBD5E1), fontSize = 16.sp)
                }

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
                            shape = RoundedCornerShape(16.dp),
                            color = Color(0x8C1E293B),
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
                                Icon(icon, contentDescription = "Modo", tint = Color(0xFF38BDF8), modifier = Modifier.size(26.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(state.playbackMode.label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            }
                        }

                        Surface(
                            onClick = onCycleAspect,
                            shape = RoundedCornerShape(16.dp),
                            color = Color(0x8C1E293B),
                            modifier = Modifier.height(64.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 18.dp)
                            ) {
                                Icon(Icons.Rounded.AspectRatio, contentDescription = "Proporção", tint = Color(0xFF38BDF8), modifier = Modifier.size(26.dp))
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
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF1E293B),
                        modifier = Modifier.height(64.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 22.dp)
                        ) {
                            Icon(Icons.Rounded.FolderOpen, contentDescription = "Pastas", tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Pastas / Lista", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}
