package com.autocine.player.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresApi

class AudioFocusController(
    context: Context,
    private val onPauseRequired: () -> Unit,
    private val onResumeAllowed: () -> Unit,
    private val onDuckChanged: (Boolean) -> Unit
) {
    private val audioManager =
        context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var pausedByTransientLoss = false
    private var hasFocus = false

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasFocus = true
                onDuckChanged(false)
                if (pausedByTransientLoss) {
                    pausedByTransientLoss = false
                    onResumeAllowed()
                }
            }
            AudioManager.AUDIOFOCUS_LOSS -> {
                // Outro app assumiu áudio exclusivo (Spotify, YouTube, Rádio, Ligação longa)
                hasFocus = false
                pausedByTransientLoss = false
                onDuckChanged(false)
                onPauseRequired()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Interrupção temporária (ex.: chamada curta ou assistente de voz)
                pausedByTransientLoss = true
                onDuckChanged(false)
                onPauseRequired()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // Navegação GPS (Waze / Google Maps): apenas reduz volume sem pausar
                onDuckChanged(true)
            }
        }
    }

    private val focusRequestOreo: AudioFocusRequest? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createFocusRequestOreo()
        } else {
            null
        }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun createFocusRequestOreo(): AudioFocusRequest {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
            .build()

        return AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(audioAttributes)
            .setAcceptsDelayedFocusGain(true)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()
    }

    fun requestFocus(): Boolean {
        if (hasFocus) return true
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = focusRequestOreo ?: return false
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasFocus
    }

    fun abandonFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequestOreo?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusChangeListener)
        }
        hasFocus = false
        pausedByTransientLoss = false
        onDuckChanged(false)
    }
}
