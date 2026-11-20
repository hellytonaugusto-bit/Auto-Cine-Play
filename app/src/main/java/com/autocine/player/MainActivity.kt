package com.autocine.player

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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.documentfile.provider.DocumentFile
import com.autocine.player.data.StorageSlot
import com.autocine.player.service.VideoPlaybackService
import com.autocine.player.ui.PlayerScreen
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.AutoCineTheme
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.viewmodel.PlayerViewModel
import com.autocine.player.vlc.VlcPlayerEngine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
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
            val fallbackName = when (pendingPickerSlot) {
                StorageSlot.USB -> "Pen Drive"
                StorageSlot.SD_CARD -> "Cartão SD"
                StorageSlot.INTERNAL -> "Memória Interna"
                StorageSlot.ALL -> "Pasta"
            }
            val name = DocumentFile.fromTreeUri(this, uri)?.name ?: uri.lastPathSegment ?: fallbackName
            viewModel.onFolderSelected(uri.toString(), name, pendingPickerSlot)
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
            val appearanceFlow = remember {
                viewModel.uiState
                    .map { it.colorTheme to it.uiScaleLevel }
                    .distinctUntilChanged()
            }
            val appearance by appearanceFlow.collectAsState(
                initial = AppColorTheme.AUTOMOTIVE_BLUE to UiScaleLevel.DEFAULT
            )
            val (colorTheme, uiScaleLevel) = appearance
            AutoCineTheme(
                colorTheme = colorTheme,
                uiScaleLevel = uiScaleLevel
            ) {
                PlayerScreen(
                    viewModel = viewModel,
                    engine = activeEngine,
                    onEnterPip = { enterPipNow() },
                    onPickFolderForSlot = { slot ->
                        pendingPickerSlot = slot
                        openFolderLauncher.launch(null)
                    },
                    onAdjustBrightness = { fraction -> setWindowBrightness(fraction) },
                    onGetBrightness = { getWindowBrightness() },
                    onAdjustVolume = { fraction -> setMediaVolume(fraction) },
                    onGetVolume = { getMediaVolume() }
                )
            }
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
     * Ajusta o volume de mídia do sistema Android (AudioManager.STREAM_MUSIC) via setStreamVolume
     * com FLAG_SHOW_UI e retorna a porcentagem real atual (getStreamVolume / getStreamMaxVolume).
     */
    private fun setMediaVolume(fraction: Float): Float {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return fraction.coerceIn(0f, 1f)
        val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        val target = (fraction.coerceIn(0f, 1f) * maxVol).roundToInt().coerceIn(0, maxVol)
        if (target != current) {
            runCatching {
                audioManager.setStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    target,
                    AudioManager.FLAG_SHOW_UI
                )
            }
        }
        val actual = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).coerceIn(0, maxVol)
        return (actual.toFloat() / maxVol.toFloat()).coerceIn(0f, 1f)
    }

    private fun getMediaVolume(): Float {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return 0.5f
        val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).coerceIn(0, maxVol)
        return (current.toFloat() / maxVol.toFloat()).coerceIn(0f, 1f)
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
        viewModel.persistPlaybackPosition(commitImmediately = true)
        runCatching { unregisterReceiver(pipReceiver) }
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
        super.onDestroy()
    }
}
