package com.autocine.player.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

enum class UiScaleLevel(val label: String, val factor: Float) {
    SMALL("Pequeno", 0.85f),
    DEFAULT("Padrão", 1.0f),
    LARGE("Grande", 1.15f),
    EXTRA_LARGE("Extra Grande", 1.30f)
}

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
    val palette = AutoCinePalette(
        accent = colorTheme.accent,
        accentDark = colorTheme.accentDark,
        accentContainer = colorTheme.accentContainer,
        accentSoft = colorTheme.accentSoft,
        onAccent = colorTheme.onAccent
    )

    val colorScheme = darkColorScheme(
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

    val baseDensity = LocalDensity.current
    val scaledDensity = Density(
        density = baseDensity.density * uiScaleLevel.factor,
        fontScale = baseDensity.fontScale * uiScaleLevel.factor
    )

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
