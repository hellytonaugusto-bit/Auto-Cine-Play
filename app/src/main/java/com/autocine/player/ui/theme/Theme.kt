package com.autocine.player.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AutomotiveDarkColors = darkColorScheme(
    primary = Color(0xFF38BDF8),
    onPrimary = Color(0xFF07090D),
    background = Color(0xFF07090D),
    surface = Color(0xFF0C1018),
    onBackground = Color(0xFFF1F5F9),
    onSurface = Color(0xFFF1F5F9),
    error = Color(0xFFEF4444)
)

@Composable
fun AutoCineTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AutomotiveDarkColors,
        content = content
    )
}
