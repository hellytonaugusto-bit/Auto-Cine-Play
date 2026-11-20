import React from 'react';
import { Check, Settings, X } from 'lucide-react';
import type { AppColorTheme, UiScaleLevel } from '../types/media';
import { COLOR_THEME_PRESETS, UI_SCALE_PRESETS } from '../utils/themeConfig';

interface SettingsModalProps {
  uiScaleLevel: UiScaleLevel;
  colorTheme: AppColorTheme;
  onSelectUiScale: (scale: UiScaleLevel) => void;
  onSelectColorTheme: (theme: AppColorTheme) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  uiScaleLevel,
  colorTheme,
  onSelectUiScale,
  onSelectColorTheme,
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] rounded-2xl bg-[#0F141E] border border-white/14 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5" style={{ color: 'var(--ac-accent)' }} />
            <h3
              id="settings-modal-title"
              className="font-display text-lg font-semibold text-white"
            >
              Configurações
            </h3>
          </div>
          <button
            type="button"
            data-testid="close-settings-btn"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="min-w-[40px] min-h-[40px] rounded-xl bg-white/8 hover:bg-white/15 text-slate-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto auto-scroll px-5 py-3.5 flex flex-col gap-3.5">
          {/* 1. Interface Size (4 Fixed Levels) */}
          <section>
            <h4 className="text-sm font-semibold text-white">Tamanho da Interface</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Ajusta proporcionalmente textos, ícones e botões em todo o aplicativo.
            </p>
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {UI_SCALE_PRESETS.map((preset) => {
                const selected = preset.id === uiScaleLevel;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`scale-option-${preset.id}`}
                    aria-pressed={selected}
                    onClick={() => onSelectUiScale(preset.id)}
                    className="min-h-[48px] px-3 py-1.5 rounded-xl text-sm font-semibold flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                    style={
                      selected
                        ? {
                            backgroundColor: 'var(--ac-accent)',
                            color: 'var(--ac-on-accent)',
                            border: '2px solid var(--ac-accent)',
                          }
                        : {
                            backgroundColor: '#162033',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255,255,255,0.12)',
                          }
                    }
                  >
                    <span>{preset.label}</span>
                    <span className="text-[11px] font-mono-code opacity-80">
                      {preset.percentLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-white/10" />

          {/* 2. Color Theme Presets */}
          <section>
            <h4 className="text-sm font-semibold text-white">Tema de Cores</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Altera a paleta de destaques, botões ativos, bordas e barra de progresso.
            </p>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COLOR_THEME_PRESETS.map((preset) => {
                const selected = preset.id === colorTheme;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`theme-option-${preset.id}`}
                    aria-pressed={selected}
                    onClick={() => onSelectColorTheme(preset.id)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-3 text-left transition cursor-pointer"
                    style={
                      selected
                        ? {
                            backgroundColor: preset.accentSoft,
                            border: `2px solid ${preset.accent}`,
                            color: '#FFFFFF',
                          }
                        : {
                            backgroundColor: '#162033',
                            border: '1px solid rgba(255,255,255,0.10)',
                            color: '#E2E8F0',
                          }
                    }
                  >
                    <span
                      className="w-5 h-5 rounded-full shrink-0 border-2 border-white/80 flex items-center justify-center"
                      style={{ backgroundColor: preset.accent }}
                    >
                      {selected && (
                        <Check
                          className="w-3 h-3"
                          style={{ color: preset.onAccent }}
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <span className="text-sm font-semibold text-white truncate">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-white/10 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-6 rounded-xl text-sm font-semibold transition cursor-pointer"
            style={{
              backgroundColor: 'var(--ac-accent)',
              color: 'var(--ac-on-accent)',
            }}
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
