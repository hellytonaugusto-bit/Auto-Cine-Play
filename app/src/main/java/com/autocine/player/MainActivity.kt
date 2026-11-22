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
import android.os.SystemClock
import android.provider.Settings
import android.util.Rational
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.annotation.RequiresApi
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
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
import java.util.concurrent.Executors
import kotlin.math.abs
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
    private var visualVolumeFraction: Float = 0.5f
    private var lastUiFlagElapsedMs: Long = 0L
    private var currentBrightnessFraction: Float = -1f
    private var lastAppliedSysBrightness: Int = -1
    private var screenDimAlpha by mutableFloatStateOf(0f)

    private val hardwareControlExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "AutoCine-HwCtrl").apply { isDaemon = true }
    }

    private val audioManager: AudioManager? by lazy(LazyThreadSafetyMode.NONE) {
        getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }
    private val minMusicVolume: Int by lazy(LazyThreadSafetyMode.NONE) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            audioManager?.getStreamMinVolume(AudioManager.STREAM_MUSIC)?.coerceAtLeast(0) ?: 0
        } else {
            0
        }
    }
    private val maxMusicVolume: Int by lazy(LazyThreadSafetyMode.NONE) {
        audioManager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC)?.coerceAtLeast(minMusicVolume + 1) ?: 15
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
            val onStepVolumeCb = remember { { steps: Int -> stepMediaVolume(steps) } }
            val onGetVolumeCb = remember { { getMediaVolume() } }

            AutoCineTheme(
                colorTheme = colorTheme,
                uiScaleLevel = uiScaleLevel
            ) {
                PlayerScreen(
                    viewModel = viewModel,
                    engine = activeEngine,
                    screenDimAlpha = screenDimAlpha,
                    onEnterPip = onEnterPipCb,
                    onPickFolderForSlot = onPickFolderCb,
                    onAdjustBrightness = onAdjustBrightnessCb,
                    onGetBrightness = onGetBrightnessCb,
                    onStepVolume = onStepVolumeCb,
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

    /**
     * Controle de brilho triplo (funciona 100% mesmo em centrais onde o MCU trava o backlight LCD):
     * 1) Aplica WindowManager.LayoutParams novo (copyFrom) com screenBrightness atualizado.
     * 2) Se WRITE_SETTINGS estiver liberado, atualiza também o backlight real do sistema fora da Main Thread.
     * 3) Aplica atenuação visual translúcida suave (screenDimAlpha: 0f em 100% até no máximo 0.78f em 5%),
     *    garantindo resposta visual imediata em 60fps ao deslizar na metade esquerda.
     */
    private fun setWindowBrightness(fraction: Float) {
        val clamped = fraction.coerceIn(0.05f, 1.0f)
        currentBrightnessFraction = clamped

        val updatedParams = WindowManager.LayoutParams().apply {
            copyFrom(window.attributes)
            screenBrightness = clamped
        }
        window.attributes = updatedParams

        val canWriteSystem = runCatching { Settings.System.canWrite(this) }.getOrDefault(false)
        if (canWriteSystem) {
            // Com WRITE_SETTINGS liberado, o hardware controla 30%-100% e o dimmer noturno suaviza abaixo de 30%
            screenDimAlpha = if (clamped < 0.30f) {
                ((0.30f - clamped) / 0.25f * 0.45f).coerceIn(0f, 0.45f)
            } else {
                0f
            }
            val sysTarget = (clamped * 255f).roundToInt().coerceIn(12, 255)
            if (sysTarget != lastAppliedSysBrightness) {
                lastAppliedSysBrightness = sysTarget
                hardwareControlExecutor.execute {
                    runCatching {
                        Settings.System.putInt(
                            contentResolver,
                            Settings.System.SCREEN_BRIGHTNESS_MODE,
                            Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
                        )
                        Settings.System.putInt(
                            contentResolver,
                            Settings.System.SCREEN_BRIGHTNESS,
                            sysTarget
                        )
                    }
                }
            }
        } else {
            // Sem WRITE_SETTINGS (ou quando o MCU ignora screenBrightness): atenuação visual instantânea (0% em 100%)
            screenDimAlpha = ((1f - clamped) * 0.78f).coerceIn(0f, 0.78f)
        }
    }

    private fun getWindowBrightness(): Float {
        if (currentBrightnessFraction in 0.05f..1.0f) {
            return currentBrightnessFraction
        }
        val canWriteSystem = runCatching { Settings.System.canWrite(this) }.getOrDefault(false)
        if (!canWriteSystem) {
            // Começa em 100% (alinhado com screenDimAlpha == 0f) para não dar salto ao iniciar o arraste
            return 1.0f
        }
        val sysBrightness = runCatching {
            val raw = Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS)
            val maxScale = if (raw > 255) 4095f else 255f
            raw / maxScale
        }.getOrDefault(0.85f)
        return sysBrightness.coerceIn(0.05f, 1.0f)
    }

    /**
     * Controla exclusivamente o volume REAL da multimídia Android/MCU por degraus relativos rápidos:
     * - Executa AudioManager.adjustSuggestedStreamVolume em thread dedicada (zero bloqueio na Main Thread).
     * - Nunca usa volume interno na libVLC (travada em 100%).
     * - Suporta vários degraus em um único deslize suave e limita FLAG_SHOW_UI a cada 220ms para
     *   eliminar completamente o atraso da janela de volume do sistema.
     */
    private fun stepMediaVolume(steps: Int): Float {
        if (steps == 0) return visualVolumeFraction
        val am = audioManager ?: return visualVolumeFraction
        val range = (maxMusicVolume - minMusicVolume).coerceAtLeast(15)
        val stepDelta = steps.toFloat() / range.toFloat()
        visualVolumeFraction = (visualVolumeFraction + stepDelta).coerceIn(0f, 1f)

        val direction = if (steps > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        val count = abs(steps).coerceAtMost(6)

        hardwareControlExecutor.execute {
            val now = SystemClock.elapsedRealtime()
            val showUi = (now - lastUiFlagElapsedMs) >= 220L
            if (showUi) {
                lastUiFlagElapsedMs = now
            }
            runCatching {
                for (i in 0 until count) {
                    val flags = if (showUi && i == count - 1) AudioManager.FLAG_SHOW_UI else 0
                    am.adjustSuggestedStreamVolume(
                        direction,
                        AudioManager.STREAM_MUSIC,
                        flags
                    )
                }
            }
        }
        return visualVolumeFraction
    }

    private fun getMediaVolume(): Float {
        val am = audioManager ?: return visualVolumeFraction
        val minVol = minMusicVolume
        val maxVol = maxMusicVolume
        val range = (maxVol - minVol).coerceAtLeast(1)
        val current = am.getStreamVolume(AudioManager.STREAM_MUSIC).coerceIn(minVol, maxVol)
        visualVolumeFraction = ((current - minVol).toFloat() / range.toFloat()).coerceIn(0f, 1f)
        return visualVolumeFraction
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
        hardwareControlExecutor.shutdownNow()
        runCatching { unregisterReceiver(pipReceiver) }
        if (isBound) {
            unbindService(serviceConnection)
            isBound = false
        }
        super.onDestroy()
    }
}
