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
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.IBinder
import android.provider.Settings
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
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
    ) { /* Permissões Android 15 (READ_MEDIA_VIDEO + POST_NOTIFICATIONS) tratadas */ }

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

        registerReceiver(
            pipReceiver,
            IntentFilter(PIP_ACTION_CONTROL),
            RECEIVER_NOT_EXPORTED
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

    /**
     * IMPORTANTE: Nunca pausamos a reprodução em onPause() ou onStop().
     * Assim, o vídeo/áudio continuam rodando em segundo plano mesmo durante a Câmera de Ré.
     */
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
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun enterPipNow() {
        val params = buildPipParams(viewModel.uiState.value.isPlaying)
        setPictureInPictureParams(params)
        enterPictureInPictureMode(params)
    }

    private fun updatePipParams(isPlaying: Boolean) {
        setPictureInPictureParams(buildPipParams(isPlaying))
    }

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
        return PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .setAutoEnterEnabled(isPlaying)
            .setSeamlessResizeEnabled(true)
            .setActions(actions)
            .build()
    }

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
        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.POST_NOTIFICATIONS
            )
        )
        if (!Environment.isExternalStorageManager()) {
            // Opcional: o usuário também pode usar SAF diretamente para Pen Drive OTG
            runCatching {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
        }
    }

    override fun onDestroy() {
        unregisterReceiver(pipReceiver)
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
        super.onDestroy()
    }
}
