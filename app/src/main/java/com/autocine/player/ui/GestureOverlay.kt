package com.autocine.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Brightness6
import androidx.compose.material.icons.rounded.FastForward
import androidx.compose.material.icons.rounded.FastRewind
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.ui.theme.LocalAutoCinePalette
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

private enum class GestureAxis { NONE, SEEK, BRIGHTNESS, VOLUME }

@Composable
fun GestureOverlay(
    getPositionMs: () -> Long,
    getDurationMs: () -> Long,
    onTapToggleControls: () -> Unit,
    onSeekCommit: (Long) -> Unit,
    onGetBrightness: () -> Float,
    onAdjustBrightness: (Float) -> Unit,
    onGetVolume: () -> Float,
    onAdjustVolume: (Float) -> Float,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    val scope = rememberCoroutineScope()

    // Referências estáveis sem reiniciar pointerInput nem recompor o GestureOverlay a cada segundo do vídeo
    val latestGetPositionMs by rememberUpdatedState(getPositionMs)
    val latestGetDurationMs by rememberUpdatedState(getDurationMs)
    val latestOnTap by rememberUpdatedState(onTapToggleControls)
    val latestOnSeekCommit by rememberUpdatedState(onSeekCommit)
    val latestOnGetBrightness by rememberUpdatedState(onGetBrightness)
    val latestOnAdjustBrightness by rememberUpdatedState(onAdjustBrightness)
    val latestOnGetVolume by rememberUpdatedState(onGetVolume)
    val latestOnAdjustVolume by rememberUpdatedState(onAdjustVolume)

    var hudVisible by remember { mutableStateOf(false) }
    var displayAxis by remember { mutableStateOf(GestureAxis.BRIGHTNESS) }
    var hudValue by remember { mutableFloatStateOf(0f) }
    var hudSeekTargetMs by remember { mutableLongStateOf(0L) }
    var hudSeekDurationMs by remember { mutableLongStateOf(0L) }
    var hudSeekDeltaSec by remember { mutableLongStateOf(0L) }
    var hideHudJob by remember { mutableStateOf<Job?>(null) }

    fun scheduleHudDismiss() {
        hideHudJob?.cancel()
        hideHudJob = scope.launch {
            delay(650L)
            hudVisible = false
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            hideHudJob?.cancel()
            hudVisible = false
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                // Detector unificado (awaitEachGesture) para evitar conflito entre toque e arrasto:
                // - Toque simples alterna controles
                // - Arrasto horizontal (qualquer região): avanço/retrocesso (seek)
                // - Arrasto vertical na metade ESQUERDA: brilho suave (0.05f..1.0f)
                // - Arrasto vertical na metade DIREITA: volume híbrido (libVLC + STREAM_MUSIC)
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = true)
                    val downPos = down.position
                    val startX = downPos.x
                    val touchSlop = viewConfiguration.touchSlop.coerceAtLeast(18f)

                    var activeAxis = GestureAxis.NONE
                    var startValue = 0f
                    val startPosMs = latestGetPositionMs()
                    val startDurMs = latestGetDurationMs().coerceAtLeast(0L)
                    var dragTargetMs = startPosMs
                    var pointerMovedBeyondSlop = false

                    try {
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break

                            if (!change.pressed) {
                                if (activeAxis == GestureAxis.SEEK) {
                                    latestOnSeekCommit(dragTargetMs)
                                } else if (!pointerMovedBeyondSlop && !change.isConsumed) {
                                    latestOnTap()
                                }
                                break
                            }

                            if (activeAxis == GestureAxis.NONE && change.isConsumed) {
                                break
                            }

                            val totalDx = change.position.x - downPos.x
                            val totalDy = change.position.y - downPos.y

                            if (activeAxis == GestureAxis.NONE) {
                                if (abs(totalDx) < touchSlop && abs(totalDy) < touchSlop) {
                                    continue
                                }
                                pointerMovedBeyondSlop = true
                                hideHudJob?.cancel()

                                activeAxis = when {
                                    abs(totalDx) > abs(totalDy) * 1.25f -> {
                                        hudSeekDurationMs = startDurMs
                                        GestureAxis.SEEK
                                    }
                                    startX < size.width / 2f -> {
                                        startValue = latestOnGetBrightness().coerceIn(0.05f, 1f)
                                        hudValue = startValue
                                        GestureAxis.BRIGHTNESS
                                    }
                                    else -> {
                                        startValue = latestOnGetVolume().coerceIn(0f, 1f)
                                        hudValue = startValue
                                        GestureAxis.VOLUME
                                    }
                                }
                                displayAxis = activeAxis
                                hudVisible = true
                            }

                            change.consume()

                            when (activeAxis) {
                                GestureAxis.SEEK -> {
                                    val dur = latestGetDurationMs().coerceAtLeast(startDurMs)
                                    val spanMs = minOf(dur.coerceAtLeast(30_000L), 90_000L)
                                    val widthPx = size.width.coerceAtLeast(1).toFloat()
                                    val deltaMs = ((totalDx / widthPx) * spanMs).toLong()
                                    val target = (startPosMs + deltaMs).coerceIn(0L, dur)
                                    dragTargetMs = target
                                    hudSeekTargetMs = target
                                    hudSeekDurationMs = dur
                                    hudSeekDeltaSec = (target - startPosMs) / 1000L
                                }
                                GestureAxis.BRIGHTNESS -> {
                                    val effectiveH = (size.height * 0.65f).coerceAtLeast(1f)
                                    val next = (startValue + (-totalDy / effectiveH)).coerceIn(0.05f, 1f)
                                    hudValue = next
                                    latestOnAdjustBrightness(next)
                                }
                                GestureAxis.VOLUME -> {
                                    val effectiveH = (size.height * 0.65f).coerceAtLeast(1f)
                                    val next = (startValue + (-totalDy / effectiveH)).coerceIn(0f, 1f)
                                    val realSystemRatio = latestOnAdjustVolume(next).coerceIn(0f, 1f)
                                    hudValue = realSystemRatio
                                }
                                GestureAxis.NONE -> Unit
                            }
                        }
                    } finally {
                        if (activeAxis != GestureAxis.NONE) {
                            scheduleHudDismiss()
                        }
                    }
                }
            }
    ) {
        AnimatedVisibility(
            visible = hudVisible,
            enter = fadeIn(animationSpec = tween(120)),
            exit = fadeOut(animationSpec = tween(180)),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 84.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xE00A0D14))
                    .padding(horizontal = 28.dp, vertical = 18.dp)
            ) {
                when (displayAxis) {
                    GestureAxis.SEEK -> {
                        val forward = hudSeekDeltaSec >= 0
                        Icon(
                            imageVector = if (forward) Icons.Rounded.FastForward else Icons.Rounded.FastRewind,
                            contentDescription = "Avanço por gesto",
                            tint = palette.accent,
                            modifier = Modifier.size(36.dp)
                        )
                        Spacer(Modifier.height(6.dp))
                        val sign = if (forward) "+" else ""
                        Text(
                            text = "$sign${hudSeekDeltaSec}s",
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${formatMs(hudSeekTargetMs)} / ${formatMs(hudSeekDurationMs)}",
                            color = Color(0xFFCBD5E1),
                            fontSize = 14.sp
                        )
                    }
                    GestureAxis.BRIGHTNESS -> {
                        Icon(
                            imageVector = Icons.Rounded.Brightness6,
                            contentDescription = "Brilho",
                            tint = Color(0xFFFBBF24),
                            modifier = Modifier.size(34.dp)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Brilho ${(hudValue * 100f).roundToInt()}%",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = { hudValue },
                            color = Color(0xFFFBBF24),
                            trackColor = Color(0x33FFFFFF),
                            modifier = Modifier
                                .width(180.dp)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                        )
                    }
                    GestureAxis.VOLUME -> {
                        Icon(
                            imageVector = Icons.Rounded.VolumeUp,
                            contentDescription = "Volume",
                            tint = palette.accent,
                            modifier = Modifier.size(34.dp)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Volume ${(hudValue * 100f).roundToInt()}%",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = { hudValue },
                            color = palette.accent,
                            trackColor = Color(0x33FFFFFF),
                            modifier = Modifier
                                .width(180.dp)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                        )
                    }
                    GestureAxis.NONE -> Unit
                }
            }
        }
    }
}

fun formatMs(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val hrs = (totalSec / 3600L).toInt()
    val mins = ((totalSec % 3600L) / 60L).toInt()
    val secs = (totalSec % 60L).toInt()
    val sb = StringBuilder(8)
    if (hrs > 0) {
        if (hrs < 10) sb.append('0')
        sb.append(hrs).append(':')
    }
    if (mins < 10) sb.append('0')
    sb.append(mins).append(':')
    if (secs < 10) sb.append('0')
    sb.append(secs)
    return sb.toString()
}
