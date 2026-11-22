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
