package com.autocine.player.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager

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

    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
        .build()

    private val focusRequest: AudioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(audioAttributes)
        .setAcceptsDelayedFocusGain(true)
        .setWillPauseWhenDucked(false)
        .setOnAudioFocusChangeListener(focusChangeListener)
        .build()

    fun requestFocus(): Boolean {
        if (hasFocus) return true
        val result = audioManager.requestAudioFocus(focusRequest)
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasFocus
    }

    fun abandonFocus() {
        audioManager.abandonAudioFocusRequest(focusRequest)
        hasFocus = false
        pausedByTransientLoss = false
        onDuckChanged(false)
    }
}
