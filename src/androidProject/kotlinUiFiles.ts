import { AndroidProjectFile } from './buildAndManifestFiles';

export const KOTLIN_UI_FILES: AndroidProjectFile[] = [
  {
    path: 'app/src/main/java/com/autocine/player/ui/theme/Theme.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Tema automotivo com 6 paletas @Immutable e 4 níveis de escala de UI memorizados via LocalDensity',
    content: `package com.autocine.player.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

@Immutable
enum class UiScaleLevel(val label: String, val factor: Float) {
    SMALL("Pequeno", 0.85f),
    DEFAULT("Padrão", 1.0f),
    LARGE("Grande", 1.15f),
    EXTRA_LARGE("Extra Grande", 1.30f)
}

@Immutable
enum class AppColorTheme(
    val label: String,
    val accent: Color,
    val accentDark: Color,
    val accentContainer: Color,
    val accentSoft: Color,
    val onAccent: Color
) {
    AUTOMOTIVE_BLUE(
        label = "Azul Automotivo",
        accent = Color(0xFF38BDF8),
        accentDark = Color(0xFF0284C7),
        accentContainer = Color(0xFF0369A1),
        accentSoft = Color(0x2B38BDF8),
        onAccent = Color(0xFF07090D)
    ),
    SPORT_RED(
        label = "Vermelho Esportivo",
        accent = Color(0xFFF87171),
        accentDark = Color(0xFFDC2626),
        accentContainer = Color(0xFF991B1B),
        accentSoft = Color(0x2BEF4444),
        onAccent = Color(0xFFFFFFFF)
    ),
    EMERALD_GREEN(
        label = "Verde Esmeralda",
        accent = Color(0xFF34D399),
        accentDark = Color(0xFF059669),
        accentContainer = Color(0xFF065F46),
        accentSoft = Color(0x2B10B981),
        onAccent = Color(0xFF042016)
    ),
    AMBER_GOLD(
        label = "Âmbar / Dourado",
        accent = Color(0xFFFBBF24),
        accentDark = Color(0xFFD97706),
        accentContainer = Color(0xFF92400E),
        accentSoft = Color(0x2BF59E0B),
        onAccent = Color(0xFF140D02)
    ),
    NEON_PURPLE(
        label = "Roxo Neon",
        accent = Color(0xFFC084FC),
        accentDark = Color(0xFF9333EA),
        accentContainer = Color(0xFF6B21A8),
        accentSoft = Color(0x2BA855F7),
        onAccent = Color(0xFF11051C)
    ),
    GRAPHITE_GRAY(
        label = "Cinza Grafite",
        accent = Color(0xFFCBD5E1),
        accentDark = Color(0xFF64748B),
        accentContainer = Color(0xFF334155),
        accentSoft = Color(0x2B94A3B8),
        onAccent = Color(0xFF0B0F17)
    )
}

@Immutable
data class AutoCinePalette(
    val accent: Color,
    val accentDark: Color,
    val accentContainer: Color,
    val accentSoft: Color,
    val onAccent: Color
)

val LocalAutoCinePalette = staticCompositionLocalOf {
    AutoCinePalette(
        accent = AppColorTheme.AUTOMOTIVE_BLUE.accent,
        accentDark = AppColorTheme.AUTOMOTIVE_BLUE.accentDark,
        accentContainer = AppColorTheme.AUTOMOTIVE_BLUE.accentContainer,
        accentSoft = AppColorTheme.AUTOMOTIVE_BLUE.accentSoft,
        onAccent = AppColorTheme.AUTOMOTIVE_BLUE.onAccent
    )
}

@Composable
fun AutoCineTheme(
    colorTheme: AppColorTheme = AppColorTheme.AUTOMOTIVE_BLUE,
    uiScaleLevel: UiScaleLevel = UiScaleLevel.DEFAULT,
    content: @Composable () -> Unit
) {
    val palette = remember(colorTheme) {
        AutoCinePalette(
            accent = colorTheme.accent,
            accentDark = colorTheme.accentDark,
            accentContainer = colorTheme.accentContainer,
            accentSoft = colorTheme.accentSoft,
            onAccent = colorTheme.onAccent
        )
    }

    val colorScheme = remember(colorTheme) {
        darkColorScheme(
            primary = colorTheme.accent,
            onPrimary = colorTheme.onAccent,
            primaryContainer = colorTheme.accentContainer,
            onPrimaryContainer = Color.White,
            background = Color(0xFF07090D),
            surface = Color(0xFF0C1018),
            onBackground = Color(0xFFF1F5F9),
            onSurface = Color(0xFFF1F5F9),
            error = Color(0xFFEF4444)
        )
    }

    val baseDensity = LocalDensity.current
    val scaledDensity = remember(baseDensity, uiScaleLevel) {
        Density(
            density = baseDensity.density * uiScaleLevel.factor,
            fontScale = baseDensity.fontScale * uiScaleLevel.factor
        )
    }

    CompositionLocalProvider(
        LocalAutoCinePalette provides palette,
        LocalDensity provides scaledDensity
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            content = content
        )
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/GestureOverlay.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Detector unificado de gestos (awaitEachGesture) desacoplado de ticks de tempo e formatMs sem alocação de Formatter',
    content: `package com.autocine.player.ui

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
                            text = "$sign\${hudSeekDeltaSec}s",
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "\${formatMs(hudSeekTargetMs)} / \${formatMs(hudSeekDurationMs)}",
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
                            text = "Brilho \${(hudValue * 100f).roundToInt()}%",
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
                            text = "Volume \${(hudValue * 100f).roundToInt()}%",
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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/FullScreenControls.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Overlay em tela cheia com FullScreenProgressBar isolada (zero recomposição por segundo no resto da tela)',
    content: `package com.autocine.player.ui

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
                "\${formatTwoDigitIndex(idxDisplay)}/\${formatTwoDigitIndex(total)} - \${video.name}"
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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/SplitScreenBrowser.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Tela dividida otimizada com LruCache em KB (10% RAM, RGB_565), derivedStateOf e LazyColumn com rows estáveis',
    content: `package com.autocine.player.ui

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.LruCache
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PictureInPictureAlt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SdCard
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SortByAlpha
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.StorageRepository
import com.autocine.player.data.StorageSlot
import com.autocine.player.data.VideoFileItem
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.LocalAutoCinePalette
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.viewmodel.PlayerUiState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.util.Collections
import kotlin.math.roundToInt

private val ThumbWidthDp = 96.dp
private val ThumbHeightDp = 54.dp
private val ThumbShape10 = RoundedCornerShape(10.dp)
private val RowShape14 = RoundedCornerShape(14.dp)
private val IconBoxShape12 = RoundedCornerShape(12.dp)
private val SubfolderCardBg = Color(0xFF111827)
private val SubtleBorderColor = Color(0x1FFFFFFF)
private val DividerColor = Color(0x14FFFFFF)

private fun formatTwoDigits(value: Int): String = if (value < 10) "0$value" else value.toString()

/**
 * Cache de miniaturas limitado em KB a ~10% da memória máxima da JVM
 * (entre 4 MB e 24 MB), evitando OOM em centrais 32-bit com pouca RAM.
 */
private object VideoThumbnailMemoryCache {
    private val maxMemoryKb = (Runtime.getRuntime().maxMemory() / 1024L).toInt().coerceAtLeast(16 * 1024)
    private val cacheSizeKb = (maxMemoryKb / 10).coerceIn(4 * 1024, 24 * 1024)

    class Entry(val image: ImageBitmap, val sizeKb: Int)

    private val cache = object : LruCache<String, Entry>(cacheSizeKb) {
        override fun sizeOf(key: String, value: Entry): Int = value.sizeKb.coerceAtLeast(1)
    }
    private val failedKeys = Collections.synchronizedSet(HashSet<String>())
    // 1 decodificação por vez evita disputar decoders HW com a libVLC e saturação do USB 2.0
    val decodeSemaphore = Semaphore(1)

    fun get(key: String): ImageBitmap? = cache.get(key)?.image
    fun hasFailed(key: String): Boolean = failedKeys.contains(key)
    fun put(key: String, bitmap: ImageBitmap, sizeKb: Int) {
        cache.put(key, Entry(bitmap, sizeKb))
    }
    fun markFailed(key: String) {
        if (failedKeys.size > 300) failedKeys.clear()
        failedKeys.add(key)
    }
    fun trimToHalf() {
        cache.trimToSize(cacheSizeKb / 2)
    }
    fun clear() {
        cache.evictAll()
    }
}

fun trimVideoThumbnailCache() {
    VideoThumbnailMemoryCache.trimToHalf()
}

fun clearVideoThumbnailCache() {
    VideoThumbnailMemoryCache.clear()
}

@Composable
private fun VideoListThumbnail(
    item: VideoFileItem,
    isCurrent: Boolean,
    isPlaying: Boolean
) {
    val palette = LocalAutoCinePalette.current
    val context = LocalContext.current
    val density = LocalDensity.current
    // Calcula exatamente a resolução em pixels exibida na lista (evita alocar frames 720p/1080p na RAM)
    val targetWidthPx = remember(density) {
        with(density) { ThumbWidthDp.toPx().roundToInt().coerceIn(96, 192) }
    }
    val targetHeightPx = remember(density) {
        with(density) { ThumbHeightDp.toPx().roundToInt().coerceIn(54, 108) }
    }
    var bitmap by remember(item.id) { mutableStateOf(VideoThumbnailMemoryCache.get(item.id)) }

    LaunchedEffect(item.id, targetWidthPx, targetHeightPx) {
        if (bitmap == null && !VideoThumbnailMemoryCache.hasFailed(item.id)) {
            // Pequeno atraso antes de acessar o Pen Drive: se o usuário rolar rapidamente,
            // a coroutine é cancelada automaticamente antes de abrir o MediaMetadataRetriever.
            delay(140L)
            val loaded = withContext(Dispatchers.IO) {
                ensureActive()
                VideoThumbnailMemoryCache.decodeSemaphore.withPermit {
                    ensureActive()
                    VideoThumbnailMemoryCache.get(item.id)?.let { return@withPermit it to 0 }
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(context, item.uri)
                        ensureActive()
                        val rawFrame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                            retriever.getScaledFrameAtTime(
                                1_500_000L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                                targetWidthPx,
                                targetHeightPx
                            )
                        } else {
                            retriever.getFrameAtTime(
                                1_500_000L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC
                            )?.let { full ->
                                val scaled = Bitmap.createScaledBitmap(full, targetWidthPx, targetHeightPx, true)
                                if (scaled != full) full.recycle()
                                scaled
                            }
                        }
                        if (rawFrame == null) {
                            null
                        } else {
                            // Converte para RGB_565 (2 bytes/px em vez de 4 bytes/px = metade da RAM)
                            val compact = if (rawFrame.config != Bitmap.Config.RGB_565) {
                                rawFrame.copy(Bitmap.Config.RGB_565, false)?.also {
                                    rawFrame.recycle()
                                } ?: rawFrame
                            } else {
                                rawFrame
                            }
                            val sizeKb = (compact.allocationByteCount / 1024).coerceAtLeast(1)
                            compact.asImageBitmap() to sizeKb
                        }
                    } catch (ce: CancellationException) {
                        throw ce
                    } catch (_: Throwable) {
                        null
                    } finally {
                        runCatching { retriever.release() }
                    }
                }
            }
            if (loaded != null) {
                val (image, sizeKb) = loaded
                if (sizeKb > 0) {
                    VideoThumbnailMemoryCache.put(item.id, image, sizeKb)
                }
                bitmap = image
            } else {
                VideoThumbnailMemoryCache.markFailed(item.id)
            }
        }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .width(ThumbWidthDp)
            .height(ThumbHeightDp)
            .clip(ThumbShape10)
            .background(Color(0xFF0F172A))
            .border(
                width = if (isCurrent) 2.dp else 1.dp,
                color = if (isCurrent) palette.accent else SubtleBorderColor,
                shape = ThumbShape10
            )
    ) {
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp,
                contentDescription = "Miniatura de \${item.name}",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.Movie,
                contentDescription = null,
                tint = Color(0xFF475569),
                modifier = Modifier.size(24.dp)
            )
        }

        if (isCurrent) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0x59000000))
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(palette.accent)
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = palette.onAccent,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun SplitScreenLeftPane(
    isPlaying: Boolean,
    activeStorageSlot: StorageSlot,
    hasCustomAllFilter: Boolean,
    videoSurface: @Composable () -> Unit,
    onExpandVideo: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onEnterPip: () -> Unit,
    onSelectStorageSlot: (StorageSlot) -> Unit,
    onOpenAllFilter: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current

    Column(
        modifier = modifier
            .background(Color(0xFF0C1018), RoundedCornerShape(18.dp))
            .padding(12.dp)
    ) {
        // Quadro do vídeo minimizado (toque para expandir instantaneamente para tela cheia)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(14.dp))
                .background(Color.Black)
                .clickable { onExpandVideo() }
        ) {
            videoSurface()
        }

        Spacer(Modifier.height(12.dp))

        // Conteúdo abaixo do vídeo com rolagem vertical para nunca cortar em telas menores
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            // Controles principais: Anterior, Play/Pause, Próximo, PiP
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Surface(
                    onClick = onPrev,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.weight(1f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipPrevious,
                            contentDescription = "Anterior",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Surface(
                    onClick = onTogglePlayPause,
                    shape = RoundedCornerShape(14.dp),
                    color = palette.accent,
                    modifier = Modifier.weight(1.35f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = "Play/Pause",
                            tint = palette.onAccent,
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }

                Surface(
                    onClick = onNext,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.weight(1f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipNext,
                            contentDescription = "Próximo",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Surface(
                    onClick = onEnterPip,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.width(56.dp).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.PictureInPictureAlt,
                            contentDescription = "PiP",
                            tint = palette.accent,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }
            }

            HorizontalDivider(color = Color(0x18FFFFFF))

            // Seção Armazenamento: Todas (+ filtro), Pen Drive, Cartão SD, Interna
            Text(
                text = "Armazenamento",
                color = Color(0xFFCBD5E1),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )

            // Linha 1: Todas + Botão Filtro | Pen Drive
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    StorageOptionButton(
                        label = "Todas",
                        icon = Icons.Rounded.Layers,
                        selected = activeStorageSlot == StorageSlot.ALL,
                        onClick = { onSelectStorageSlot(StorageSlot.ALL) },
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        onClick = onOpenAllFilter,
                        shape = RoundedCornerShape(14.dp),
                        color = if (hasCustomAllFilter) palette.accentContainer else Color(0xFF1A2234),
                        border = BorderStroke(
                            1.dp,
                            if (hasCustomAllFilter) palette.accent else Color(0x26FFFFFF)
                        ),
                        modifier = Modifier.width(46.dp).height(54.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Rounded.Tune,
                                contentDescription = "Escolher pastas de Todas",
                                tint = if (hasCustomAllFilter) Color.White else palette.accent,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }

                StorageOptionButton(
                    label = "Pen Drive",
                    icon = Icons.Rounded.Usb,
                    selected = activeStorageSlot == StorageSlot.USB,
                    onClick = { onSelectStorageSlot(StorageSlot.USB) },
                    modifier = Modifier.weight(1f)
                )
            }

            // Linha 2: Cartão SD | Interna
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                StorageOptionButton(
                    label = "Cartão SD",
                    icon = Icons.Rounded.SdCard,
                    selected = activeStorageSlot == StorageSlot.SD_CARD,
                    onClick = { onSelectStorageSlot(StorageSlot.SD_CARD) },
                    modifier = Modifier.weight(1f)
                )

                StorageOptionButton(
                    label = "Interna",
                    icon = Icons.Rounded.Storage,
                    selected = activeStorageSlot == StorageSlot.INTERNAL,
                    onClick = { onSelectStorageSlot(StorageSlot.INTERNAL) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun StorageOptionButton(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = if (selected) palette.accentDark else Color(0xFF1A2234),
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) palette.accent else Color(0x26FFFFFF)
        ),
        modifier = modifier.height(54.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 10.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) Color.White else palette.accent,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun SplitScreenFileList(
    state: PlayerUiState,
    onSelectVideo: (VideoFileItem) -> Unit,
    onOpenSubfolder: (FolderEntry) -> Unit,
    onNavigateUp: () -> Unit,
    onNavigateBreadcrumb: (Int) -> Unit,
    onOpenAllFilter: () -> Unit,
    onDismissAllFilter: () -> Unit,
    onApplyAllFilter: (Set<String>?) -> Unit,
    onOpenSettings: () -> Unit,
    onDismissSettings: () -> Unit,
    onSelectUiScale: (UiScaleLevel) -> Unit,
    onSelectColorTheme: (AppColorTheme) -> Unit,
    onToggleStartOnBoot: (Boolean) -> Unit,
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onCycleSort: () -> Unit,
    onRequestDelete: (VideoFileItem) -> Unit,
    onConfirmDelete: () -> Unit,
    onCancelDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    val listState = rememberLazyListState()

    val hasSearchQuery by remember(state.searchQuery) {
        derivedStateOf { state.searchQuery.isNotEmpty() }
    }

    val filteredSubfolders by remember(state.currentSubfolders, state.searchQuery, state.isAllFoldersMode) {
        derivedStateOf {
            if (state.isAllFoldersMode || state.currentSubfolders.isEmpty()) {
                emptyList()
            } else {
                val q = StorageRepository.normalizeForSearch(state.searchQuery)
                if (q.isEmpty()) state.currentSubfolders
                else state.currentSubfolders.filter { it.normalizedName.contains(q) }
            }
        }
    }

    val showSubfoldersSection by remember(filteredSubfolders) {
        derivedStateOf { filteredSubfolders.isNotEmpty() }
    }

    val activeVideoIndex by remember(state.currentVideo?.id, state.visibleVideos) {
        derivedStateOf {
            val activeId = state.currentVideo?.id ?: return@derivedStateOf -1
            state.visibleVideos.indexOfFirst { it.id == activeId }
        }
    }

    val subtitleText by remember(filteredSubfolders.size, state.visibleVideos.size, state.browsedVideos.size, hasSearchQuery) {
        derivedStateOf {
            buildString(32) {
                if (filteredSubfolders.isNotEmpty()) {
                    append(filteredSubfolders.size).append(" subpastas · ")
                }
                append(state.visibleVideos.size)
                if (hasSearchQuery && state.visibleVideos.size != state.browsedVideos.size) {
                    append('/').append(state.browsedVideos.size)
                }
                append(" vídeos")
            }
        }
    }

    LaunchedEffect(activeVideoIndex, filteredSubfolders.size) {
        if (activeVideoIndex >= 0) {
            listState.animateScrollToItem(activeVideoIndex + filteredSubfolders.size)
        }
    }

    Column(
        modifier = modifier
            .background(Color(0xFF0A0D14))
            .padding(14.dp)
    ) {
        // Cabeçalho da pasta + Filtrar (modo Todas) + Ordenar + Atualizar + Configurações (engrenagem)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.folderName,
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = subtitleText,
                    color = Color(0xFF94A3B8),
                    fontSize = 14.sp
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (state.isAllFoldersMode) {
                    Surface(
                        onClick = onOpenAllFilter,
                        shape = RoundedCornerShape(12.dp),
                        color = palette.accentContainer
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                        ) {
                            Icon(Icons.Rounded.Tune, contentDescription = "Filtrar Pastas", tint = Color.White, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Filtrar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Surface(
                    onClick = onCycleSort,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                    ) {
                        Icon(Icons.Rounded.SortByAlpha, contentDescription = "Ordenar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(state.sortOrder.label, color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(
                    onClick = onRefresh,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                    ) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Atualizar", color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(
                    onClick = onOpenSettings,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B),
                    border = BorderStroke(1.dp, Color(0x26FFFFFF)),
                    modifier = Modifier.size(46.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.Settings,
                            contentDescription = "Configurações",
                            tint = palette.accent,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }

        // Barra de Breadcrumbs + botão Voltar fixo quando dentro de subpastas
        if (!state.isAllFoldersMode && state.folderBreadcrumbs.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Surface(
                    onClick = onNavigateUp,
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Voltar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState())
                ) {
                    Text(
                        text = state.rootFolderName,
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp,
                        modifier = Modifier
                            .clickable { onNavigateBreadcrumb(-1) }
                            .padding(horizontal = 4.dp, vertical = 6.dp)
                    )
                    state.folderBreadcrumbs.forEachIndexed { idx, segment ->
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(18.dp))
                        val isLast = idx == state.folderBreadcrumbs.lastIndex
                        Text(
                            text = segment,
                            color = if (isLast) palette.accent else Color(0xFFCBD5E1),
                            fontSize = 14.sp,
                            fontWeight = if (isLast) FontWeight.SemiBold else FontWeight.Normal,
                            modifier = Modifier
                                .clickable { onNavigateBreadcrumb(idx) }
                                .padding(horizontal = 4.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Campo de Busca Parcial (ignora maiúsculas/minúsculas e acentos) com botão visível "Limpar"
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            placeholder = { Text("Pesquisar vídeo (ex: gode, forro)...") },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
            trailingIcon = {
                if (hasSearchQuery) {
                    val onClearSearch = remember(onSearchChange) { { onSearchChange("") } }
                    Surface(
                        onClick = onClearSearch,
                        shape = ThumbShape10,
                        color = palette.accentSoft,
                        border = BorderStroke(1.dp, palette.accent),
                        modifier = Modifier.padding(end = 6.dp)
                    ) {
                        Text(
                            text = "Limpar",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                        )
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = palette.accent,
                unfocusedBorderColor = Color(0x33FFFFFF),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                cursorColor = palette.accent
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        val activeVideoId = state.currentVideo?.id
        val showFolderOrigin = state.isAllFoldersMode

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            // Cards grandes de Subpastas acima da lista de vídeos
            if (showSubfoldersSection) {
                items(
                    items = filteredSubfolders,
                    key = { "sub_\${it.id}" },
                    contentType = { "subfolder" }
                ) { sub ->
                    SubfolderListRow(
                        sub = sub,
                        onOpenSubfolder = onOpenSubfolder
                    )
                }
            }

            itemsIndexed(
                items = state.visibleVideos,
                key = { _, item -> item.id },
                contentType = { _, _ -> "video" }
            ) { index, item ->
                val isCurrent = item.id == activeVideoId
                VideoListRow(
                    index = index,
                    item = item,
                    isCurrent = isCurrent,
                    isPlayingCurrent = isCurrent && state.isPlaying,
                    showFolderOrigin = showFolderOrigin,
                    onSelectVideo = onSelectVideo,
                    onRequestDelete = onRequestDelete
                )
            }
        }
    }

    // Modal de Configurações (Tamanho da Interface + Tema de Cores + Inicialização Automática)
    if (state.isSettingsOpen) {
        SettingsDialog(
            currentScale = state.uiScaleLevel,
            currentTheme = state.colorTheme,
            startOnBoot = state.startOnBoot,
            onSelectScale = onSelectUiScale,
            onSelectTheme = onSelectColorTheme,
            onToggleStartOnBoot = onToggleStartOnBoot,
            onDismiss = onDismissSettings
        )
    }

    // Diálogo manual de seleção de pastas para o modo "Todas"
    if (state.isAllFilterDialogOpen) {
        AllFoldersFilterDialog(
            folders = state.selectableAllFolders,
            initialSelectedIds = state.selectedAllFolderIds,
            onDismiss = onDismissAllFilter,
            onApply = onApplyAllFilter
        )
    }

    // Janela de confirmação de exclusão direta
    val toDelete = state.pendingDeleteItem
    if (toDelete != null) {
        AlertDialog(
            onDismissRequest = onCancelDelete,
            title = { Text("Excluir arquivo?") },
            text = { Text("Deseja apagar permanentemente \\"\${toDelete.name}\\" do armazenamento?") },
            confirmButton = {
                Button(
                    onClick = onConfirmDelete,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEF4444),
                        contentColor = Color.White
                    )
                ) {
                    Text("Excluir")
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelDelete) {
                    Text("Cancelar", color = Color(0xFFCBD5E1))
                }
            }
        )
    }
}

@Composable
private fun SubfolderListRow(
    sub: FolderEntry,
    onOpenSubfolder: (FolderEntry) -> Unit
) {
    val palette = LocalAutoCinePalette.current
    val onClick = remember(sub.id, onOpenSubfolder) { { onOpenSubfolder(sub) } }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RowShape14)
            .background(SubfolderCardBg)
            .border(1.dp, SubtleBorderColor, RowShape14)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(48.dp)
                .clip(IconBoxShape12)
                .background(palette.accentSoft)
        ) {
            Icon(Icons.Rounded.Folder, contentDescription = null, tint = palette.accent, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = sub.name,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = if (sub.videoCount > 0) "\${sub.videoCount} vídeos · Toque para abrir" else "Pasta · Toque para abrir",
                color = Color(0xFF94A3B8),
                fontSize = 13.sp
            )
        }
        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.accent, modifier = Modifier.size(28.dp))
    }
}

@Composable
private fun VideoListRow(
    index: Int,
    item: VideoFileItem,
    isCurrent: Boolean,
    isPlayingCurrent: Boolean,
    showFolderOrigin: Boolean,
    onSelectVideo: (VideoFileItem) -> Unit,
    onRequestDelete: (VideoFileItem) -> Unit
) {
    val palette = LocalAutoCinePalette.current
    val onRowClick = remember(item.id, onSelectVideo) { { onSelectVideo(item) } }
    val onDeleteClick = remember(item.id, onRequestDelete) { { onRequestDelete(item) } }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(if (isCurrent) palette.accentSoft else Color.Transparent, RowShape14)
                .clickable(onClick = onRowClick)
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Text(
                text = formatTwoDigits(index + 1),
                color = if (isCurrent) palette.accent else Color(0xFF64748B),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(30.dp)
            )
            Spacer(Modifier.width(8.dp))
            VideoListThumbnail(
                item = item,
                isCurrent = isCurrent,
                isPlaying = isPlayingCurrent
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    color = if (isCurrent) Color.White else Color(0xFFE2E8F0),
                    fontSize = 16.sp,
                    fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (showFolderOrigin && item.folderName.isNotEmpty()) {
                    Text(
                        text = item.folderName,
                        color = palette.accent,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            IconButton(onClick = onDeleteClick, modifier = Modifier.size(52.dp)) {
                Icon(
                    Icons.Rounded.Delete,
                    contentDescription = "Excluir \${item.name}",
                    tint = Color(0xFF94A3B8)
                )
            }
        }
        HorizontalDivider(color = DividerColor)
    }
}

@Composable
private fun SettingsDialog(
    currentScale: UiScaleLevel,
    currentTheme: AppColorTheme,
    startOnBoot: Boolean,
    onSelectScale: (UiScaleLevel) -> Unit,
    onSelectTheme: (AppColorTheme) -> Unit,
    onToggleStartOnBoot: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    val palette = LocalAutoCinePalette.current

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF0E1420),
        titleContentColor = Color.White,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Rounded.Settings,
                    contentDescription = null,
                    tint = palette.accent,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "Configurações",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // 1. Tamanho da Interface (4 níveis fixos)
                Text(
                    text = "Tamanho da Interface",
                    color = Color(0xFFCBD5E1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                val scaleRows = remember { UiScaleLevel.entries.chunked(2) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    scaleRows.forEach { rowLevels ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowLevels.forEach { level ->
                                val selected = level == currentScale
                                Surface(
                                    onClick = { onSelectScale(level) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (selected) palette.accentDark else Color(0xFF1A2234),
                                    border = BorderStroke(
                                        width = if (selected) 1.5.dp else 1.dp,
                                        color = if (selected) palette.accent else Color(0x26FFFFFF)
                                    ),
                                    modifier = Modifier.weight(1f).height(48.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp)
                                    ) {
                                        if (selected) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(Modifier.width(4.dp))
                                        }
                                        Text(
                                            text = level.label,
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                HorizontalDivider(color = Color(0x18FFFFFF))

                // 2. Tema de Cores (6 conjuntos pré-definidos)
                Text(
                    text = "Tema de Cores",
                    color = Color(0xFFCBD5E1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                val themeRows = remember { AppColorTheme.entries.chunked(2) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    themeRows.forEach { rowThemes ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowThemes.forEach { theme ->
                                val selected = theme == currentTheme
                                Surface(
                                    onClick = { onSelectTheme(theme) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (selected) theme.accentSoft else Color(0xFF1A2234),
                                    border = BorderStroke(
                                        width = if (selected) 1.5.dp else 1.dp,
                                        color = if (selected) theme.accent else Color(0x26FFFFFF)
                                    ),
                                    modifier = Modifier.weight(1f).height(48.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 10.dp)
                                    ) {
                                        Box(
                                            contentAlignment = Alignment.Center,
                                            modifier = Modifier
                                                .size(20.dp)
                                                .clip(CircleShape)
                                                .background(theme.accent)
                                        ) {
                                            if (selected) {
                                                Icon(
                                                    Icons.Rounded.Check,
                                                    contentDescription = null,
                                                    tint = theme.onAccent,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = theme.label,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                HorizontalDivider(color = Color(0x18FFFFFF))

                // 3. Inicialização Automática ao Ligar a Multimídia (Boot / Pós-Chave ACC)
                Text(
                    text = "Inicialização Automática",
                    color = Color(0xFFCBD5E1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                Surface(
                    onClick = { onToggleStartOnBoot(!startOnBoot) },
                    shape = RoundedCornerShape(14.dp),
                    color = if (startOnBoot) palette.accentSoft else Color(0xFF1A2234),
                    border = BorderStroke(
                        width = if (startOnBoot) 1.5.dp else 1.dp,
                        color = if (startOnBoot) palette.accent else Color(0x26FFFFFF)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (startOnBoot) palette.accent else Color(0xFF0F172A))
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.PowerSettingsNew,
                                contentDescription = null,
                                tint = if (startOnBoot) palette.onAccent else Color(0xFF94A3B8),
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Iniciar com a Multimídia",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = if (startOnBoot) {
                                    "Ativado: abre o app e retoma o último vídeo automaticamente ao ligar o carro."
                                } else {
                                    "Desativado: o aplicativo só abrirá quando você tocar no ícone."
                                },
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Checkbox(
                            checked = startOnBoot,
                            onCheckedChange = { onToggleStartOnBoot(it) },
                            colors = CheckboxDefaults.colors(checkedColor = palette.accent)
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accent,
                    contentColor = palette.onAccent
                )
            ) {
                Text("Concluir", fontWeight = FontWeight.Bold)
            }
        }
    )
}

@Immutable
private data class FolderOriginGroup(
    val label: String,
    val folders: List<FolderEntry>
)

@Composable
private fun AllFoldersFilterDialog(
    folders: List<FolderEntry>,
    initialSelectedIds: Set<String>?,
    onDismiss: () -> Unit,
    onApply: (Set<String>?) -> Unit
) {
    val palette = LocalAutoCinePalette.current
    var draftSelected by remember(folders, initialSelectedIds) {
        mutableStateOf(
            initialSelectedIds ?: folders.map { it.id }.toSet()
        )
    }

    // Tudo inicia RECOLHIDO por padrão: apenas os grupos principais (Pen Drive, Cartão SD, Memória Interna)
    // aparecem fechados inicialmente, e cada nível expande sob demanda ao tocar na seta/grupo.
    var expandedGroups by remember(folders) { mutableStateOf(emptySet<String>()) }
    var expandedFolderIds by remember(folders) { mutableStateOf(emptySet<String>()) }

    val groups = remember(folders) {
        val priorityOrder = listOf("Pen Drive", "Cartão SD", "Memória Interna")
        val grouped = folders.groupBy { it.sourceLabel.ifBlank { "Memória Interna" } }
        val orderedKeys = priorityOrder.filter { it in grouped.keys } +
            grouped.keys.filter { it !in priorityOrder }.sorted()
        orderedKeys.map { label ->
            FolderOriginGroup(label = label, folders = grouped[label].orEmpty())
        }
    }

    // Mapeia rapidamente quais pastas possuem subpastas filhas dentro do mesmo grupo/prefixo
    val childrenInfoByGroup = remember(groups) {
        groups.associate { group ->
            val byPrefixAndPath = HashMap<Pair<String, List<String>>, FolderEntry>()
            val hasChildrenSet = HashSet<String>()
            val parentIdByFolderId = HashMap<String, String>()

            group.folders.forEach { entry ->
                val prefix = entry.id.substringBefore(':', "")
                byPrefixAndPath[prefix to entry.relativePath] = entry
            }
            group.folders.forEach { entry ->
                if (entry.relativePath.isNotEmpty()) {
                    val prefix = entry.id.substringBefore(':', "")
                    val parentPath = entry.relativePath.dropLast(1)
                    val parent = byPrefixAndPath[prefix to parentPath]
                    if (parent != null && parent.id != entry.id) {
                        hasChildrenSet.add(parent.id)
                        parentIdByFolderId[entry.id] = parent.id
                    }
                }
            }
            group.label to (hasChildrenSet to parentIdByFolderId)
        }
    }

    val allFolderIds = remember(folders) { folders.map { it.id }.toSet() }
    val hasExpandedNodes by remember {
        derivedStateOf { expandedGroups.isNotEmpty() || expandedFolderIds.isNotEmpty() }
    }

    val groupMetadata = remember(groups) {
        groups.associate { group ->
            group.label to (
                group.folders.map { it.id }.toSet() to
                    group.folders.sumOf { it.videoCount.coerceAtLeast(0) }
                )
        }
    }

    val visibleFoldersByGroup by remember(groups, childrenInfoByGroup) {
        derivedStateOf {
            groups.associate { group ->
                val isGroupExpanded = group.label in expandedGroups
                if (!isGroupExpanded) {
                    group.label to emptyList()
                } else {
                    val parentIdMap = childrenInfoByGroup[group.label]?.second.orEmpty()
                    val visible = group.folders.filter { entry ->
                        var parentId = parentIdMap[entry.id]
                        var ancestorsExpanded = true
                        while (parentId != null) {
                            if (parentId !in expandedFolderIds) {
                                ancestorsExpanded = false
                                break
                            }
                            parentId = parentIdMap[parentId]
                        }
                        ancestorsExpanded
                    }
                    group.label to visible
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF0E1420),
        titleContentColor = Color.White,
        title = {
            Text(
                text = "Selecionar Pastas para \\"Todas\\"",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    TextButton(onClick = { draftSelected = allFolderIds }) {
                        Text("Marcar todas", color = palette.accent)
                    }
                    TextButton(onClick = { draftSelected = emptySet() }) {
                        Text("Limpar", color = Color(0xFF94A3B8))
                    }
                    if (hasExpandedNodes) {
                        TextButton(
                            onClick = {
                                expandedGroups = emptySet()
                                expandedFolderIds = emptySet()
                            }
                        ) {
                            Text("Recolher", color = Color(0xFF94A3B8))
                        }
                    }
                }

                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp)) {
                    groups.forEach { group ->
                        val isGroupExpanded = group.label in expandedGroups
                        val (groupIds, totalVideosInGroup) = groupMetadata[group.label] ?: (emptySet<String>() to 0)
                        val selectedCount = group.folders.count { it.id in draftSelected }
                        val allInGroupSelected = groupIds.isNotEmpty() && selectedCount == groupIds.size
                        val groupIcon = when (group.label) {
                            "Pen Drive" -> Icons.Rounded.Usb
                            "Cartão SD" -> Icons.Rounded.SdCard
                            else -> Icons.Rounded.Storage
                        }

                        item(key = "group_\${group.label}", contentType = "group_header") {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clip(IconBoxShape12)
                                    .background(Color(0xFF151E2E))
                                    .border(1.dp, SubtleBorderColor, IconBoxShape12)
                                    .clickable {
                                        expandedGroups = if (isGroupExpanded) {
                                            expandedGroups - group.label
                                        } else {
                                            expandedGroups + group.label
                                        }
                                    }
                                    .padding(horizontal = 8.dp, vertical = 8.dp)
                            ) {
                                Icon(
                                    imageVector = if (isGroupExpanded) {
                                        Icons.Rounded.KeyboardArrowDown
                                    } else {
                                        Icons.Rounded.ChevronRight
                                    },
                                    contentDescription = if (isGroupExpanded) "Recolher \${group.label}" else "Expandir \${group.label}",
                                    tint = palette.accent,
                                    modifier = Modifier.size(26.dp)
                                )
                                Checkbox(
                                    checked = allInGroupSelected,
                                    onCheckedChange = { checked ->
                                        draftSelected = if (checked) {
                                            draftSelected + groupIds
                                        } else {
                                            draftSelected - groupIds
                                        }
                                    },
                                    colors = CheckboxDefaults.colors(checkedColor = palette.accent)
                                )
                                Icon(
                                    imageVector = groupIcon,
                                    contentDescription = null,
                                    tint = palette.accent,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = group.label,
                                        color = Color.White,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "$selectedCount/\${group.folders.size} pastas · $totalVideosInGroup vídeos",
                                        color = Color(0xFF94A3B8),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }

                        if (isGroupExpanded) {
                            val hasChildrenSet = childrenInfoByGroup[group.label]?.first.orEmpty()
                            val visibleInGroup = visibleFoldersByGroup[group.label].orEmpty()

                            items(
                                items = visibleInGroup,
                                key = { "folder_\${group.label}_\${it.id}" },
                                contentType = { "folder_item" }
                            ) { folder ->
                                val checked = folder.id in draftSelected
                                val hasSubfolders = folder.id in hasChildrenSet
                                val isFolderExpanded = folder.id in expandedFolderIds
                                val indentDp = (16 + folder.depth * 18).coerceAtMost(96)

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            draftSelected = if (checked) {
                                                draftSelected - folder.id
                                            } else {
                                                draftSelected + folder.id
                                            }
                                        }
                                        .padding(start = indentDp.dp, top = 4.dp, bottom = 4.dp, end = 6.dp)
                                ) {
                                    if (hasSubfolders) {
                                        IconButton(
                                            onClick = {
                                                expandedFolderIds = if (isFolderExpanded) {
                                                    expandedFolderIds - folder.id
                                                } else {
                                                    expandedFolderIds + folder.id
                                                }
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = if (isFolderExpanded) {
                                                    Icons.Rounded.KeyboardArrowDown
                                                } else {
                                                    Icons.Rounded.ChevronRight
                                                },
                                                contentDescription = if (isFolderExpanded) "Recolher \${folder.name}" else "Expandir \${folder.name}",
                                                tint = palette.accent,
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    } else {
                                        Spacer(Modifier.width(36.dp))
                                    }

                                    Checkbox(
                                        checked = checked,
                                        onCheckedChange = { isChecked ->
                                            draftSelected = if (isChecked) {
                                                draftSelected + folder.id
                                            } else {
                                                draftSelected - folder.id
                                            }
                                        },
                                        colors = CheckboxDefaults.colors(checkedColor = palette.accent)
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = folder.name,
                                            color = Color.White,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        val countText = if (folder.videoCount >= 0) {
                                            "\${folder.videoCount} vídeos"
                                        } else {
                                            "Pasta"
                                        }
                                        Text(
                                            text = if (hasSubfolders) "$countText · com subpastas" else countText,
                                            color = Color(0xFF94A3B8),
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val normalized = if (draftSelected == allFolderIds) null else draftSelected
                    onApply(normalized)
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accentDark,
                    contentColor = Color.White
                )
            ) {
                Text("Aplicar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar", color = Color(0xFFCBD5E1))
            }
        }
    )
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/PlayerScreen.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Orquestrador principal entre Modo Tela Cheia, Modo Split-Screen e Modo Picture-in-Picture (PiP)',
    content: `package com.autocine.player.ui

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
    onGetBrightness: () -> Float,
    onAdjustVolume: (Float) -> Float,
    onGetVolume: () -> Float
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
                onGetBrightness = onGetBrightness,
                onAdjustVolume = onAdjustVolume,
                onGetVolume = onGetVolume
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
    // PlayerUiState já é isolado de positionMs/durationMs: zero recomposições por tick de tempo
    val state by viewModel.uiState.collectAsState()
    val onSelectSlot = remember(viewModel, onPickFolderForSlot) {
        { slot: StorageSlot -> viewModel.selectStorageSlot(slot, onPickFolderForSlot) }
    }

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
            onSelectStorageSlot = onSelectSlot,
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
            onToggleStartOnBoot = viewModel::setStartOnBoot,
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
    onGetBrightness: () -> Float,
    onAdjustVolume: (Float) -> Float,
    onGetVolume: () -> Float
) {
    // PlayerUiState não muda a cada segundo: apenas FullScreenProgressBar observa playbackProgress
    val state by viewModel.uiState.collectAsState()
    val getPositionMs = remember(viewModel) { { viewModel.playbackProgress.value.positionMs } }
    val getDurationMs = remember(viewModel) { { viewModel.playbackProgress.value.durationMs } }
    val onOpenSplitList = remember(viewModel) { { viewModel.setSplitScreen(true) } }

    Box(modifier = Modifier.fillMaxSize()) {
        // Superfície de vídeo nativa da libVLC diretamente na raiz (nenhuma camada opaca sobre o vídeo)
        VlcVideoSurface(
            engine = engine,
            modifier = Modifier.fillMaxSize()
        )

        if (!isInPipMode) {
            GestureOverlay(
                getPositionMs = getPositionMs,
                getDurationMs = getDurationMs,
                onTapToggleControls = onToggleControls,
                onSeekCommit = viewModel::seekTo,
                onGetBrightness = onGetBrightness,
                onAdjustBrightness = onAdjustBrightness,
                onGetVolume = onGetVolume,
                onAdjustVolume = onAdjustVolume
            )

            FullScreenControls(
                visible = controlsVisible,
                state = state,
                progressFlow = viewModel.playbackProgress,
                onTogglePlayPause = viewModel::togglePlayPause,
                onPrev = viewModel::playPrevious,
                onNext = viewModel::playNext,
                onSeek = viewModel::seekTo,
                onCycleMode = viewModel::cyclePlaybackMode,
                onCycleAspect = viewModel::cycleAspectRatio,
                onOpenSplitList = onOpenSplitList,
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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/MainActivity.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Activity paisagem com cold start assíncrono, PiP, volume híbrido, onTrimMemory e BootReceiver',
    content: `package com.autocine.player

import android.Manifest
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.IBinder
import android.provider.Settings
import android.util.Rational
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.annotation.RequiresApi
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.autocine.player.data.StorageSlot
import com.autocine.player.receiver.BootReceiver
import com.autocine.player.service.VideoPlaybackService
import com.autocine.player.ui.PlayerScreen
import com.autocine.player.ui.clearVideoThumbnailCache
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.AutoCineTheme
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.ui.trimVideoThumbnailCache
import com.autocine.player.viewmodel.PlayerViewModel
import com.autocine.player.vlc.VlcPlayerEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {

    companion object {
        private const val PIP_ACTION_CONTROL = "com.autocine.player.PIP_CONTROL"
        private const val EXTRA_CONTROL_TYPE = "control_type"
        private const val CONTROL_PREV = 1
        private const val CONTROL_TOGGLE = 2
        private const val CONTROL_NEXT = 3
    }

    private val viewModel: PlayerViewModel by viewModels()
    private var playbackService: VideoPlaybackService? = null
    private var activeEngine by mutableStateOf<VlcPlayerEngine?>(null)
    private var isBound = false
    private var pendingPickerSlot: StorageSlot = StorageSlot.USB
    private var lastAppliedSystemVolStep: Int = -1
    private val audioManager: AudioManager? by lazy(LazyThreadSafetyMode.NONE) {
        getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }
    private val maxMusicVolume: Int by lazy(LazyThreadSafetyMode.NONE) {
        audioManager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC)?.coerceAtLeast(1) ?: 15
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val svc = (binder as VideoPlaybackService.LocalBinder).getService()
            playbackService = svc
            activeEngine = svc.engine
            isBound = true
            viewModel.bindService(svc)
            updatePipParams(viewModel.uiState.value.isPlaying)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            isBound = false
            playbackService = null
            activeEngine = null
        }
    }

    private val pipReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != PIP_ACTION_CONTROL) return
            when (intent.getIntExtra(EXTRA_CONTROL_TYPE, 0)) {
                CONTROL_PREV -> viewModel.playPrevious()
                CONTROL_TOGGLE -> {
                    viewModel.togglePlayPause()
                    updatePipParams(!viewModel.uiState.value.isPlaying)
                }
                CONTROL_NEXT -> viewModel.playNext()
            }
        }
    }

    // Seletor SAF para Pen Drive (USB OTG), Cartão SD e Memória Interna com permissão persistente
    private val openFolderLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri: Uri? ->
        if (uri != null) {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            runCatching { contentResolver.takePersistableUriPermission(uri, flags) }
            // Resolve o nome de exibição em Dispatchers.IO dentro do ViewModel (zero IPC na Main Thread)
            viewModel.onFolderSelected(uri.toString(), "", pendingPickerSlot)
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Permissões de armazenamento/notificações (Android 7 ao 15+) tratadas */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        volumeControlStream = AudioManager.STREAM_MUSIC
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        enableImmersiveFullscreen()

        VideoPlaybackService.start(this)
        bindService(
            Intent(this, VideoPlaybackService::class.java),
            serviceConnection,
            Context.BIND_AUTO_CREATE
        )

        ContextCompat.registerReceiver(
            this,
            pipReceiver,
            IntentFilter(PIP_ACTION_CONTROL),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        setContent {
            val appearanceFlow = remember {
                viewModel.uiState
                    .map { Triple(it.colorTheme, it.uiScaleLevel, it.startOnBoot) }
                    .distinctUntilChanged()
            }
            val appearance by appearanceFlow.collectAsState(
                initial = Triple(AppColorTheme.AUTOMOTIVE_BLUE, UiScaleLevel.DEFAULT, true)
            )
            val (colorTheme, uiScaleLevel, startOnBoot) = appearance

            // Sincroniza o estado do BootReceiver fora da Main Thread e apenas quando o valor muda
            LaunchedEffect(startOnBoot) {
                withContext(Dispatchers.IO) {
                    syncBootReceiverComponent(startOnBoot)
                }
            }

            val onEnterPipCb = remember { { enterPipNow() } }
            val onPickFolderCb = remember {
                { slot: StorageSlot ->
                    pendingPickerSlot = slot
                    openFolderLauncher.launch(null)
                }
            }
            val onAdjustBrightnessCb = remember { { fraction: Float -> setWindowBrightness(fraction) } }
            val onGetBrightnessCb = remember { { getWindowBrightness() } }
            val onAdjustVolumeCb = remember { { fraction: Float -> setMediaVolume(fraction) } }
            val onGetVolumeCb = remember { { getMediaVolume() } }

            AutoCineTheme(
                colorTheme = colorTheme,
                uiScaleLevel = uiScaleLevel
            ) {
                PlayerScreen(
                    viewModel = viewModel,
                    engine = activeEngine,
                    onEnterPip = onEnterPipCb,
                    onPickFolderForSlot = onPickFolderCb,
                    onAdjustBrightness = onAdjustBrightnessCb,
                    onGetBrightness = onGetBrightnessCb,
                    onAdjustVolume = onAdjustVolumeCb,
                    onGetVolume = onGetVolumeCb
                )
            }
        }

        // Adia checagem de permissões para depois do primeiro frame (cold start mais rápido)
        window.decorView.post {
            requestModernPermissions()
        }
    }

    /**
     * IMPORTANTE: Nunca pausamos nem reiniciamos a reprodução em onPause()/onStop()/onResume().
     * Apenas salvamos a posição exata ao sair e reaplicamos o modo imersivo/proporção ao voltar.
     */
    override fun onResume() {
        super.onResume()
        if (!isInPictureInPictureMode) {
            enableImmersiveFullscreen()
        }
        activeEngine?.reapplyAspectRatio()
    }

    override fun onPause() {
        viewModel.persistPlaybackPosition(commitImmediately = false)
        super.onPause()
    }

    override fun onStop() {
        viewModel.persistPlaybackPosition(commitImmediately = true)
        super.onStop()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        viewModel.persistPlaybackPosition(commitImmediately = false)
        if (viewModel.uiState.value.isPlaying) {
            enterPipNow()
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        viewModel.setInPipMode(isInPictureInPictureMode)
        if (!isInPictureInPictureMode) {
            enableImmersiveFullscreen()
        }
        activeEngine?.reapplyAspectRatio()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && !isInPictureInPictureMode) {
            enableImmersiveFullscreen()
        }
    }

    private fun enableImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    private fun isPipSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    private fun enterPipNow() {
        if (!isPipSupported()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            runCatching {
                val params = buildPipParams(viewModel.uiState.value.isPlaying)
                setPictureInPictureParams(params)
                enterPictureInPictureMode(params)
            }
        }
    }

    private fun updatePipParams(isPlaying: Boolean) {
        if (!isPipSupported()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            runCatching {
                setPictureInPictureParams(buildPipParams(isPlaying))
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPipParams(isPlaying: Boolean): PictureInPictureParams {
        val actions = listOf(
            createRemoteAction(
                iconRes = android.R.drawable.ic_media_previous,
                title = getString(R.string.pip_action_prev),
                controlType = CONTROL_PREV
            ),
            createRemoteAction(
                iconRes = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                title = if (isPlaying) getString(R.string.pip_action_pause) else getString(R.string.pip_action_play),
                controlType = CONTROL_TOGGLE
            ),
            createRemoteAction(
                iconRes = android.R.drawable.ic_media_next,
                title = getString(R.string.pip_action_next),
                controlType = CONTROL_NEXT
            )
        )
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .setActions(actions)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(isPlaying)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun createRemoteAction(iconRes: Int, title: String, controlType: Int): RemoteAction {
        val intent = Intent(PIP_ACTION_CONTROL).apply {
            setPackage(packageName)
            putExtra(EXTRA_CONTROL_TYPE, controlType)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            controlType,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return RemoteAction(Icon.createWithResource(this, iconRes), title, title, pendingIntent)
    }

    private fun setWindowBrightness(fraction: Float) {
        val clamped = fraction.coerceIn(0.05f, 1.0f)
        val params = window.attributes
        params.screenBrightness = clamped
        window.attributes = params
    }

    private fun getWindowBrightness(): Float {
        val current = window.attributes.screenBrightness
        if (current in 0.05f..1.0f) return current
        val sysBrightness = runCatching {
            Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS) / 255f
        }.getOrDefault(0.75f)
        return sysBrightness.coerceIn(0.05f, 1.0f)
    }

    /**
     * Ajusta o volume sem nenhum travamento (60fps):
     * 1) Atualiza instantaneamente o volume de saída do motor libVLC (0% a 100%) e salva no estado,
     *    garantindo que o som mude na multimídia mesmo quando o amplificador MCU ignora o Android.
     * 2) Atualiza o AudioManager.STREAM_MUSIC do Android apenas quando cruza um novo degrau inteiro
     *    e SEM AudioManager.FLAG_SHOW_UI (evitando que a janela de volume do sistema roube foco e trave o gesto).
     */
    private fun setMediaVolume(fraction: Float): Float {
        val clamped = fraction.coerceIn(0f, 1f)
        viewModel.syncVolumeFraction(clamped)

        val am = audioManager ?: return clamped
        val target = (clamped * maxMusicVolume).roundToInt().coerceIn(0, maxMusicVolume)
        if (target != lastAppliedSystemVolStep) {
            lastAppliedSystemVolStep = target
            runCatching {
                am.setStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    target,
                    0
                )
            }
        }
        return clamped
    }

    private fun getMediaVolume(): Float {
        lastAppliedSystemVolStep = -1
        return viewModel.getVolumeFraction()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        when (level) {
            TRIM_MEMORY_RUNNING_LOW,
            TRIM_MEMORY_RUNNING_CRITICAL,
            TRIM_MEMORY_MODERATE,
            TRIM_MEMORY_COMPLETE -> clearVideoThumbnailCache()
            TRIM_MEMORY_UI_HIDDEN,
            TRIM_MEMORY_BACKGROUND,
            TRIM_MEMORY_RUNNING_MODERATE -> trimVideoThumbnailCache()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onLowMemory() {
        super.onLowMemory()
        clearVideoThumbnailCache()
    }

    private fun syncBootReceiverComponent(enabled: Boolean) {
        runCatching {
            val component = ComponentName(this, BootReceiver::class.java)
            val newState = if (enabled) {
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } else {
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            }
            if (packageManager.getComponentEnabledSetting(component) != newState) {
                packageManager.setComponentEnabledSetting(
                    component,
                    newState,
                    PackageManager.DONT_KILL_APP
                )
            }
        }
    }

    private fun requestModernPermissions() {
        val required = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            required.add(Manifest.permission.READ_MEDIA_VIDEO)
            required.add(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            required.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
                required.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
        val missing = required.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            runCatching {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
        }
    }

    override fun onDestroy() {
        viewModel.persistPlaybackPosition(commitImmediately = true)
        runCatching { unregisterReceiver(pipReceiver) }
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
        super.onDestroy()
    }
}
`,
  },
];
