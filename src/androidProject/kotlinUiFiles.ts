import type { AndroidProjectFile } from './buildAndManifestFiles';

export const KOTLIN_UI_FILES: AndroidProjectFile[] = [
  {
    path: 'app/src/main/java/com/autocine/player/MainActivity.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Activity 100% paisagem e tela cheia imersiva, auto-PiP no Home/Waze, RemoteActions PiP, brilho da tela e permissões Android 15',
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
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.documentfile.provider.DocumentFile
import com.autocine.player.service.VideoPlaybackService
import com.autocine.player.ui.PlayerScreen
import com.autocine.player.ui.theme.AutoCineTheme
import com.autocine.player.viewmodel.PlayerViewModel

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
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val svc = (binder as VideoPlaybackService.LocalBinder).getService()
            playbackService = svc
            isBound = true
            viewModel.bindService(svc)
            updatePipParams(viewModel.uiState.value.isPlaying)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            isBound = false
            playbackService = null
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
            val name = DocumentFile.fromTreeUri(this, uri)?.name ?: uri.lastPathSegment ?: "Pasta USB"
            viewModel.onFolderSelected(uri.toString(), name)
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Permissões de armazenamento/notificações (Android 7 ao 15+) tratadas */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        enableImmersiveFullscreen()
        requestModernPermissions()

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
            AutoCineTheme {
                PlayerScreen(
                    viewModel = viewModel,
                    getEngine = { playbackService?.engine },
                    onEnterPip = { enterPipNow() },
                    onPickFolder = { openFolderLauncher.launch(null) },
                    onAdjustBrightness = { fraction -> setWindowBrightness(fraction) },
                    onGetBrightness = { getWindowBrightness() },
                    onAdjustVolume = { fraction -> setMediaVolume(fraction) },
                    onGetVolume = { getMediaVolume() }
                )
            }
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
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
        val params = window.attributes
        params.screenBrightness = fraction.coerceIn(0.05f, 1.0f)
        window.attributes = params
    }

    private fun getWindowBrightness(): Float {
        val current = window.attributes.screenBrightness
        return if (current in 0f..1f) current else 0.75f
    }

    private fun setMediaVolume(fraction: Float) {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val target = (fraction.coerceIn(0f, 1f) * max).toInt()
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
    }

    private fun getMediaVolume(): Float {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return am.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max.toFloat()
    }

    private fun requestModernPermissions() {
        val permissionsToRequest = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionsToRequest.add(Manifest.permission.READ_MEDIA_VIDEO)
            permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
                permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
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
  {
    path: 'app/src/main/java/com/autocine/player/ui/GestureOverlay.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Navegação por gestos nativa: swipe horizontal (Seek), swipe vertical esquerdo (Brilho) e swipe vertical direito (Volume)',
    content: `package com.autocine.player.ui

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var activeAxis by remember { mutableStateOf(GestureAxis.NONE) }
    var hudValue by remember { mutableFloatStateOf(0f) }
    var hudSeekTargetMs by remember { mutableLongStateOf(0L) }
    var hudSeekDeltaSec by remember { mutableLongStateOf(0L) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(onTap = { onTapToggleControls() })
            }
            .pointerInput(positionMs, durationMs) {
                var totalDx = 0f
                var totalDy = 0f
                var startX = 0f
                var startValue = 0f
                var startPosMs = 0L

                detectDragGestures(
                    onDragStart = { offset ->
                        totalDx = 0f
                        totalDy = 0f
                        startX = offset.x
                        startPosMs = positionMs
                        activeAxis = GestureAxis.NONE
                    },
                    onDragEnd = {
                        if (activeAxis == GestureAxis.SEEK) {
                            onSeekCommit(hudSeekTargetMs)
                        }
                        activeAxis = GestureAxis.NONE
                    },
                    onDragCancel = {
                        activeAxis = GestureAxis.NONE
                    },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        totalDx += dragAmount.x
                        totalDy += dragAmount.y

                        if (activeAxis == GestureAxis.NONE) {
                            val threshold = 24f
                            if (abs(totalDx) < threshold && abs(totalDy) < threshold) return@detectDragGestures
                            activeAxis = when {
                                abs(totalDx) >= abs(totalDy) * 1.15f -> GestureAxis.SEEK
                                startX < size.width / 2f -> {
                                    startValue = onGetBrightness()
                                    GestureAxis.BRIGHTNESS
                                }
                                else -> {
                                    startValue = onGetVolume()
                                    GestureAxis.VOLUME
                                }
                            }
                        }

                        when (activeAxis) {
                            GestureAxis.SEEK -> {
                                val spanMs = minOf(durationMs.coerceAtLeast(1L), 90_000L)
                                val deltaMs = ((totalDx / size.width.coerceAtLeast(1)) * spanMs).toLong()
                                val target = (startPosMs + deltaMs).coerceIn(0L, durationMs.coerceAtLeast(0L))
                                hudSeekTargetMs = target
                                hudSeekDeltaSec = (target - startPosMs) / 1000L
                            }
                            GestureAxis.BRIGHTNESS -> {
                                val effectiveH = size.height * 0.65f
                                val next = (startValue + (-totalDy / effectiveH)).coerceIn(0.05f, 1f)
                                hudValue = next
                                onAdjustBrightness(next)
                            }
                            GestureAxis.VOLUME -> {
                                val effectiveH = size.height * 0.65f
                                val next = (startValue + (-totalDy / effectiveH)).coerceIn(0f, 1f)
                                hudValue = next
                                onAdjustVolume(next)
                            }
                            GestureAxis.NONE -> Unit
                        }
                    }
                )
            }
    ) {
        AnimatedVisibility(
            visible = activeAxis != GestureAxis.NONE,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xD90A0D14))
                    .padding(horizontal = 28.dp, vertical = 20.dp)
            ) {
                when (activeAxis) {
                    GestureAxis.SEEK -> {
                        val forward = hudSeekDeltaSec >= 0
                        Icon(
                            imageVector = if (forward) Icons.Rounded.FastForward else Icons.Rounded.FastRewind,
                            contentDescription = "Avanço por gesto",
                            tint = Color(0xFF38BDF8),
                            modifier = Modifier.size(36.dp)
                        )
                        Spacer(Modifier.height(8.dp))
                        val sign = if (forward) "+" else ""
                        Text(
                            text = "$sign\${hudSeekDeltaSec}s",
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "\${formatMs(hudSeekTargetMs)} / \${formatMs(durationMs)}",
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
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Brilho \${(hudValue * 100).roundToInt()}%",
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
                            tint = Color(0xFF38BDF8),
                            modifier = Modifier.size(34.dp)
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Volume \${(hudValue * 100).roundToInt()}%",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = { hudValue },
                            color = Color(0xFF38BDF8),
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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/PlayerScreen.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Tela principal alternando instantaneamente entre Tela Cheia, Split-Screen (Mini-Player + Lista) e PiP sem interromper a reprodução',
    content: `package com.autocine.player.ui

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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/FullScreenControls.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Controles automotivos modernos otimizados para telas de 9": botões centrais extragrandes (88-108dp), barra superior completa e barra inferior com botões amplos (64dp)',
    content: `package com.autocine.player.ui

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
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/SplitScreenBrowser.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Modo Split-Screen 9": Mini-Player contínuo à esquerda + Navegação por pastas/subpastas (breadcrumbs e Voltar) + Seletor manual do modo Todas + Miniaturas em cache (LruCache)',
    content: `package com.autocine.player.ui

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.LruCache
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PictureInPictureAlt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SortByAlpha
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.VideoFileItem
import com.autocine.player.viewmodel.PlayerUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private object VideoThumbnailMemoryCache {
    private val cache = LruCache<String, ImageBitmap>(60)
    fun get(key: String): ImageBitmap? = cache.get(key)
    fun put(key: String, bitmap: ImageBitmap) { cache.put(key, bitmap) }
}

@Composable
private fun VideoListThumbnail(
    item: VideoFileItem,
    isCurrent: Boolean,
    isPlaying: Boolean
) {
    val context = LocalContext.current
    var bitmap by remember(item.id) { mutableStateOf(VideoThumbnailMemoryCache.get(item.id)) }

    LaunchedEffect(item.id) {
        if (bitmap == null) {
            val loaded = withContext(Dispatchers.IO) {
                runCatching {
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(context, item.uri)
                        val frame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                            retriever.getScaledFrameAtTime(
                                1_500_000L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                                192,
                                108
                            )
                        } else {
                            retriever.getFrameAtTime(
                                1_500_000L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC
                            )?.let { full ->
                                val scaled = Bitmap.createScaledBitmap(full, 192, 108, true)
                                if (scaled != full) full.recycle()
                                scaled
                            }
                        }
                        frame?.asImageBitmap()
                    } finally {
                        retriever.release()
                    }
                }.getOrNull()
            }
            if (loaded != null) {
                VideoThumbnailMemoryCache.put(item.id, loaded)
                bitmap = loaded
            }
        }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .width(96.dp)
            .height(54.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFF0F172A))
            .border(
                width = if (isCurrent) 2.dp else 1.dp,
                color = if (isCurrent) Color(0xFF38BDF8) else Color(0x1FFFFFFF),
                shape = RoundedCornerShape(10.dp)
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
                        .background(Color(0xFF38BDF8))
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = Color(0xFF07090D),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun SplitScreenLeftPane(
    state: PlayerUiState,
    videoSurface: @Composable () -> Unit,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onCycleMode: () -> Unit,
    onCycleAspect: () -> Unit,
    onEnterPip: () -> Unit,
    onPickFolder: () -> Unit,
    onPlayAllFolders: () -> Unit,
    onOpenAllFilter: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        verticalArrangement = Arrangement.SpaceBetween,
        modifier = modifier.background(Color(0xFF0C1018), RoundedCornerShape(18.dp)).padding(14.dp)
    ) {
        // Quadro do Mini-Player (tocar aqui volta imediatamente para Tela Cheia)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black, RoundedCornerShape(14.dp))
        ) {
            videoSurface()
        }

        Column {
            Text(
                text = state.currentVideo?.name ?: "Nenhum vídeo selecionado",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Toque no vídeo acima para tela cheia · \${formatMs(state.positionMs)} / \${formatMs(state.durationMs)}",
                color = Color(0xFF94A3B8),
                fontSize = 13.sp
            )
        }

        // Controles rápidos extragrandes abaixo do Mini-Player (otimizados para 9")
        Row(
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            IconButton(onClick = onPrev, modifier = Modifier.size(60.dp)) {
                Icon(Icons.Rounded.SkipPrevious, contentDescription = "Anterior", tint = Color.White, modifier = Modifier.size(36.dp))
            }
            Surface(onClick = onTogglePlayPause, shape = RoundedCornerShape(16.dp), color = Color(0xFF38BDF8), modifier = Modifier.size(64.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = "Play/Pause",
                        tint = Color(0xFF07090D),
                        modifier = Modifier.size(38.dp)
                    )
                }
            }
            IconButton(onClick = onNext, modifier = Modifier.size(60.dp)) {
                Icon(Icons.Rounded.SkipNext, contentDescription = "Próximo", tint = Color.White, modifier = Modifier.size(36.dp))
            }
            IconButton(onClick = onEnterPip, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Rounded.PictureInPictureAlt, contentDescription = "PiP", tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
            }
        }

        // Botões de Todas as Pastas (com filtro manual) vs Escolher Pasta (USB/SD/Interna)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = onPlayAllFolders,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (state.isAllFoldersMode) Color(0xFF0284C7) else Color(0xFF1E293B)
                ),
                modifier = Modifier.weight(1f).height(54.dp)
            ) {
                Icon(Icons.Rounded.Layers, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Todas", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Surface(
                onClick = onOpenAllFilter,
                shape = RoundedCornerShape(14.dp),
                color = if (state.selectedAllFolderIds != null) Color(0xFF0369A1) else Color(0xFF1E293B),
                modifier = Modifier.size(54.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Rounded.Tune,
                        contentDescription = "Escolher pastas de Todas",
                        tint = Color(0xFF38BDF8),
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            Button(
                onClick = onPickFolder,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (!state.isAllFoldersMode) Color(0xFF1E293B) else Color(0xFF111827)
                ),
                modifier = Modifier.weight(1f).height(54.dp)
            ) {
                Icon(Icons.Rounded.FolderOpen, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Pasta USB", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onCycleMode) { Text(state.playbackMode.label, color = Color(0xFF38BDF8), fontSize = 15.sp) }
            TextButton(onClick = onCycleAspect) { Text(state.aspectRatio.label, color = Color(0xFFCBD5E1), fontSize = 15.sp) }
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
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onCycleSort: () -> Unit,
    onRequestDelete: (VideoFileItem) -> Unit,
    onConfirmDelete: () -> Unit,
    onCancelDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    LaunchedEffect(state.currentVideo?.id, state.visibleVideos.size) {
        val activeIdx = state.visibleVideos.indexOfFirst { it.id == state.currentVideo?.id }
        if (activeIdx >= 0) {
            listState.animateScrollToItem(activeIdx + state.currentSubfolders.size)
        }
    }

    Column(
        modifier = modifier
            .background(Color(0xFF0A0D14))
            .padding(16.dp)
    ) {
        // Cabeçalho da pasta + Filtrar Pastas (no modo Todas) + Ordenar + Atualizar
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
                val subtitle = buildString {
                    if (state.currentSubfolders.isNotEmpty()) {
                        append("\${state.currentSubfolders.size} subpastas · ")
                    }
                    append("\${state.visibleVideos.size} vídeos")
                }
                Text(
                    text = subtitle,
                    color = Color(0xFF94A3B8),
                    fontSize = 14.sp
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.isAllFoldersMode) {
                    Surface(onClick = onOpenAllFilter, shape = RoundedCornerShape(12.dp), color = Color(0xFF0369A1)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                            Icon(Icons.Rounded.Tune, contentDescription = "Filtrar Pastas", tint = Color.White, modifier = Modifier.size(22.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Filtrar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Surface(onClick = onCycleSort, shape = RoundedCornerShape(12.dp), color = Color(0xFF1E293B)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Icon(Icons.Rounded.SortByAlpha, contentDescription = "Ordenar", tint = Color(0xFF38BDF8), modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(state.sortOrder.label, color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(onClick = onRefresh, shape = RoundedCornerShape(12.dp), color = Color(0xFF1E293B)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = Color(0xFF38BDF8), modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Atualizar", color = Color.White, fontSize = 14.sp)
                    }
                }
            }
        }

        // Barra de Breadcrumbs + botão Voltar quando dentro de subpastas
        if (!state.isAllFoldersMode && state.folderBreadcrumbs.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
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
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = Color(0xFF38BDF8), modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Voltar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(10.dp))
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
                        color = if (isLast) Color(0xFF38BDF8) else Color(0xFFCBD5E1),
                        fontSize = 14.sp,
                        fontWeight = if (isLast) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier
                            .clickable { onNavigateBreadcrumb(idx) }
                            .padding(horizontal = 4.dp, vertical = 6.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Campo de Busca Parcial (ignora maiúsculas/minúsculas e acentos)
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            placeholder = { Text("Pesquisar vídeo (ex: gode, forro)...") },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            // Cards grandes de Subpastas acima da lista de vídeos
            if (!state.isAllFoldersMode && state.currentSubfolders.isNotEmpty()) {
                items(state.currentSubfolders, key = { "sub_\${it.id}" }) { sub ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color(0xFF111827))
                            .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(14.dp))
                            .clickable { onOpenSubfolder(sub) }
                            .padding(horizontal = 14.dp, vertical = 14.dp)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0x2638BDF8))
                        ) {
                            Icon(Icons.Rounded.Folder, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
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
                                text = if (sub.videoCount > 0) "\${sub.videoCount} vídeos diretos · Toque para abrir" else "Pasta com subpastas · Toque para abrir",
                                color = Color(0xFF94A3B8),
                                fontSize = 13.sp
                            )
                        }
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
                    }
                }
            }

            itemsIndexed(state.visibleVideos, key = { _, item -> item.id }) { index, item ->
                val isCurrent = item.id == state.currentVideo?.id
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isCurrent) Color(0x2638BDF8) else Color.Transparent, RoundedCornerShape(14.dp))
                        .clickable { onSelectVideo(item) }
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = "%02d".format(index + 1),
                        color = if (isCurrent) Color(0xFF38BDF8) else Color(0xFF64748B),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(30.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    VideoListThumbnail(
                        item = item,
                        isCurrent = isCurrent,
                        isPlaying = state.isPlaying
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
                        if (state.isAllFoldersMode && item.folderName.isNotEmpty()) {
                            Text(
                                text = item.folderName,
                                color = Color(0xFF38BDF8),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    IconButton(onClick = { onRequestDelete(item) }, modifier = Modifier.size(52.dp)) {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = "Excluir \${item.name}",
                            tint = Color(0xFF94A3B8)
                        )
                    }
                }
                HorizontalDivider(color = Color(0x14FFFFFF))
            }
        }
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("Excluir")
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelDelete) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
private fun AllFoldersFilterDialog(
    folders: List<FolderEntry>,
    initialSelectedIds: Set<String>?,
    onDismiss: () -> Unit,
    onApply: (Set<String>?) -> Unit
) {
    var draftSelected by remember(folders, initialSelectedIds) {
        mutableStateOf(
            initialSelectedIds ?: folders.map { it.id }.toSet()
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
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
                    TextButton(onClick = { draftSelected = folders.map { it.id }.toSet() }) {
                        Text("Marcar todas", color = Color(0xFF38BDF8))
                    }
                    TextButton(onClick = { draftSelected = emptySet() }) {
                        Text("Limpar", color = Color(0xFF94A3B8))
                    }
                }
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp)) {
                    items(folders, key = { it.id }) { folder ->
                        val checked = folder.id in draftSelected
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    draftSelected = if (checked) draftSelected - folder.id else draftSelected + folder.id
                                }
                                .padding(start = (folder.depth * 18).dp, top = 6.dp, bottom = 6.dp, end = 6.dp)
                        ) {
                            Checkbox(
                                checked = checked,
                                onCheckedChange = { isChecked ->
                                    draftSelected = if (isChecked) draftSelected + folder.id else draftSelected - folder.id
                                },
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF38BDF8))
                            )
                            Spacer(Modifier.width(6.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = folder.name,
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "\${folder.sourceLabel} · \${folder.videoCount} vídeos",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val allIds = folders.map { it.id }.toSet()
                    val normalized = if (draftSelected == allIds) null else draftSelected
                    onApply(normalized)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
            ) {
                Text("Aplicar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
`,
  },
  {
    path: 'app/src/main/java/com/autocine/player/ui/theme/Theme.kt',
    category: 'ui',
    language: 'kotlin',
    summary: 'Tema Material 3 automotivo escuro de alto contraste para leitura segura diurna e noturna',
    content: `package com.autocine.player.ui.theme

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
`,
  },
];
