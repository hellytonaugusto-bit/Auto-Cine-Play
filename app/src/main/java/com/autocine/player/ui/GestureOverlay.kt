package com.autocine.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
    positionMs: Long,
    durationMs: Long,
    onTapToggleControls: () -> Unit,
    onSeekCommit: (Long) -> Unit,
    onGetBrightness: () -> Float,
    onAdjustBrightness: (Float) -> Unit,
    onGetVolume: () -> Float,
    onAdjustVolume: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    val scope = rememberCoroutineScope()

    // Mantém referências sempre atualizadas sem reiniciar o pointerInput quando o vídeo avança (corrige congelamento do HUD)
    val latestPositionMs by rememberUpdatedState(positionMs)
    val latestDurationMs by rememberUpdatedState(durationMs)
    val latestOnTap by rememberUpdatedState(onTapToggleControls)
    val latestOnSeekCommit by rememberUpdatedState(onSeekCommit)
    val latestOnGetBrightness by rememberUpdatedState(onGetBrightness)
    val latestOnAdjustBrightness by rememberUpdatedState(onAdjustBrightness)
    val latestOnGetVolume by rememberUpdatedState(onGetVolume)
    val latestOnAdjustVolume by rememberUpdatedState(onAdjustVolume)

    var hudVisible by remember { mutableStateOf(false) }
    var displayAxis by remember { mutableStateOf(GestureAxis.VOLUME) }
    var hudValue by remember { mutableFloatStateOf(0f) }
    var hudSeekTargetMs by remember { mutableLongStateOf(0L) }
    var hudSeekDeltaSec by remember { mutableLongStateOf(0L) }
    var hideHudJob by remember { mutableStateOf<Job?>(null) }

    fun scheduleHudDismiss() {
        hideHudJob?.cancel()
        hideHudJob = scope.launch {
            delay(600L)
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
                detectTapGestures(onTap = { latestOnTap() })
            }
            .pointerInput(Unit) {
                var activeAxis = GestureAxis.NONE
                var totalDx = 0f
                var totalDy = 0f
                var startX = 0f
                var startValue = 0f
                var startPosMs = 0L
                var dragTargetMs = 0L

                detectDragGestures(
                    onDragStart = { offset ->
                        hideHudJob?.cancel()
                        activeAxis = GestureAxis.NONE
                        totalDx = 0f
                        totalDy = 0f
                        startX = offset.x
                        startPosMs = latestPositionMs
                        dragTargetMs = latestPositionMs
                    },
                    onDragEnd = {
                        if (activeAxis == GestureAxis.SEEK) {
                            latestOnSeekCommit(dragTargetMs)
                        }
                        activeAxis = GestureAxis.NONE
                        scheduleHudDismiss()
                    },
                    onDragCancel = {
                        activeAxis = GestureAxis.NONE
                        scheduleHudDismiss()
                    },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        totalDx += dragAmount.x
                        totalDy += dragAmount.y

                        if (activeAxis == GestureAxis.NONE) {
                            val threshold = 22f
                            if (abs(totalDx) < threshold && abs(totalDy) < threshold) {
                                return@detectDragGestures
                            }
                            hideHudJob?.cancel()
                            activeAxis = when {
                                abs(totalDx) >= abs(totalDy) * 1.15f -> GestureAxis.SEEK
                                startX < size.width / 2f -> {
                                    startValue = latestOnGetBrightness().coerceIn(0.05f, 1f)
                                    GestureAxis.BRIGHTNESS
                                }
                                else -> {
                                    startValue = latestOnGetVolume().coerceIn(0f, 1f)
                                    GestureAxis.VOLUME
                                }
                            }
                            displayAxis = activeAxis
                            hudVisible = true
                        }

                        when (activeAxis) {
                            GestureAxis.SEEK -> {
                                val dur = latestDurationMs.coerceAtLeast(0L)
                                val spanMs = minOf(dur.coerceAtLeast(30_000L), 90_000L)
                                val widthPx = size.width.coerceAtLeast(1).toFloat()
                                val deltaMs = ((totalDx / widthPx) * spanMs).toLong()
                                val target = (startPosMs + deltaMs).coerceIn(0L, dur)
                                dragTargetMs = target
                                hudSeekTargetMs = target
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
                                hudValue = next
                                latestOnAdjustVolume(next)
                            }
                            GestureAxis.NONE -> Unit
                        }
                    }
                )
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
                            text = "${formatMs(hudSeekTargetMs)} / ${formatMs(latestDurationMs)}",
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
    val hrs = totalSec / 3600
    val mins = (totalSec % 3600) / 60
    val secs = totalSec % 60
    return if (hrs > 0) "%02d:%02d:%02d".format(hrs, mins, secs)
    else "%02d:%02d".format(mins, secs)
}
