package com.autocine.player.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.autocine.player.MainActivity
import com.autocine.player.data.PreferencesManager

/**
 * Inicializa automaticamente o AutoCine Player quando a central multimídia é ligada
 * (após horas desligada em Cold Boot ou QuickBoot ACC), caso a opção
 * "Iniciar com a Multimídia" esteja ativada nas Configurações.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED
        )
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        val ctx = context ?: return
        val action = intent?.action ?: return
        if (action !in BOOT_ACTIONS) return

        // Leitura síncrona compatível com Direct Boot / Cold Boot
        val prefs = PreferencesManager(ctx)
        if (!prefs.isStartOnBootEnabledSync()) return

        runCatching {
            val launchIntent = Intent(ctx, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra("launched_from_boot", true)
            }
            ctx.startActivity(launchIntent)
        }
    }
}
