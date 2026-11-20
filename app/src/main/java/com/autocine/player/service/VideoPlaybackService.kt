package com.autocine.player.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.autocine.player.MainActivity
import com.autocine.player.R
import com.autocine.player.audio.AudioFocusController
import com.autocine.player.vlc.VlcPlayerEngine

class VideoPlaybackService : Service() {

    companion object {
        const val CHANNEL_ID = "autocine_playback_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PREV = "com.autocine.player.ACTION_PREV"
        const val ACTION_TOGGLE = "com.autocine.player.ACTION_TOGGLE"
        const val ACTION_NEXT = "com.autocine.player.ACTION_NEXT"

        fun start(context: Context) {
            val intent = Intent(context, VideoPlaybackService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }
    }

    inner class LocalBinder : Binder() {
        fun getService(): VideoPlaybackService = this@VideoPlaybackService
    }

    private val binder = LocalBinder()
    lateinit var engine: VlcPlayerEngine
        private set
    lateinit var audioFocus: AudioFocusController
        private set

    private lateinit var mediaSession: MediaSessionCompat
    private var currentTitle: String = "AutoCine Player"
    private var isPlayingNow: Boolean = false

    var onExternalPrev: (() -> Unit)? = null
    var onExternalNext: (() -> Unit)? = null
    var onExternalToggle: (() -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        engine = VlcPlayerEngine(this)
        audioFocus = AudioFocusController(
            context = this,
            onPauseRequired = { engine.pause() },
            onResumeAllowed = { engine.play() },
            onDuckChanged = { ducked -> engine.setDucking(ducked) }
        )

        mediaSession = MediaSessionCompat(this, "AutoCineMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    if (audioFocus.requestFocus()) engine.play()
                }
                override fun onPause() = engine.pause()
                override fun onSkipToNext() { onExternalNext?.invoke() }
                override fun onSkipToPrevious() { onExternalPrev?.invoke() }
            })
            isActive = true
        }

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREV -> onExternalPrev?.invoke()
            ACTION_TOGGLE -> onExternalToggle?.invoke()
            ACTION_NEXT -> onExternalNext?.invoke()
        }
        return START_STICKY
    }

    fun updateNotification(title: String, playing: Boolean) {
        currentTitle = title
        isPlayingNow = playing
        val state = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            )
            .setState(
                if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                engine.getPositionMs(),
                1f
            )
            .build()
        mediaSession.setPlaybackState(state)

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val prevPending = serviceActionIntent(ACTION_PREV, 1)
        val togglePending = serviceActionIntent(ACTION_TOGGLE, 2)
        val nextPending = serviceActionIntent(ACTION_NEXT, 3)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(if (isPlayingNow) "Reproduzindo em segundo plano" else "Pausado")
            .setContentIntent(openAppIntent)
            .setOngoing(isPlayingNow)
            .setSilent(true)
            .addAction(android.R.drawable.ic_media_previous, getString(R.string.pip_action_prev), prevPending)
            .addAction(
                if (isPlayingNow) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlayingNow) getString(R.string.pip_action_pause) else getString(R.string.pip_action_play),
                togglePending
            )
            .addAction(android.R.drawable.ic_media_next, getString(R.string.pip_action_next), nextPending)
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
    }

    private fun serviceActionIntent(action: String, code: Int): PendingIntent {
        val intent = Intent(this, VideoPlaybackService::class.java).setAction(action)
        return PendingIntent.getService(
            this,
            code,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        audioFocus.abandonFocus()
        mediaSession.release()
        engine.release()
        super.onDestroy()
    }
}
