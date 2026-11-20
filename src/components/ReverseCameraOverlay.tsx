import React from 'react';
import { CameraOff, Volume2, VolumeX } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { formatTime } from '../utils/mediaLogic';

interface ReverseCameraOverlayProps {
  video: VideoItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  reverseMuteHardware: boolean;
  onToggleReverseMuteHardware: () => void;
  onDisengageReverse: () => void;
}

export const ReverseCameraOverlay: React.FC<ReverseCameraOverlayProps> = ({
  video,
  isPlaying,
  currentTime,
  duration,
  reverseMuteHardware,
  onToggleReverseMuteHardware,
  onDisengageReverse,
}) => {
  return (
    <div
      data-testid="reverse-camera-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sobreposição da Câmera de Ré"
      className="fixed inset-0 z-50 bg-[#070A0F] text-white flex flex-col justify-between overflow-hidden"
    >
      {/* Realistic wide-angle rear camera perspective canvas */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="rearAsphalt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#161C26" />
            <stop offset="45%" stopColor="#1E2530" />
            <stop offset="100%" stopColor="#0D1117" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#rearAsphalt)" />
        {/* Horizon & garage/curb reference */}
        <rect x="0" y="0" width="1440" height="240" fill="#0B0F17" />
        <line x1="0" y1="240" x2="1440" y2="240" stroke="#334155" strokeWidth="3" />

        {/* Dynamic Parking Distance Guide Lines (Green -> Yellow -> Red) */}
        <g fill="none" strokeWidth="6" strokeLinecap="round">
          {/* Far safe zone (Green) */}
          <path d="M 460 360 L 390 480" stroke="#22C55E" />
          <path d="M 980 360 L 1050 480" stroke="#22C55E" />
          <line x1="460" y1="360" x2="980" y2="360" stroke="#22C55E" strokeDasharray="20 14" strokeWidth="4" />

          {/* Caution zone (Amber) */}
          <path d="M 380 500 L 300 640" stroke="#F59E0B" />
          <path d="M 1060 500 L 1140 640" stroke="#F59E0B" />
          <line x1="380" y1="500" x2="1060" y2="500" stroke="#F59E0B" strokeDasharray="18 12" strokeWidth="4" />

          {/* Stop zone (Red) */}
          <path d="M 288 665 L 220 790" stroke="#EF4444" />
          <path d="M 1152 665 L 1220 790" stroke="#EF4444" />
          <line x1="288" y1="665" x2="1152" y2="665" stroke="#EF4444" strokeWidth="5" />
        </g>
      </svg>

      {/* Top Warning & Disengage Button */}
      <div className="relative z-10 p-6 flex items-center justify-between gap-4 bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            Câmera de Ré Ativa (Sobreposição do Sistema)
          </h2>
          <p className="text-sm text-slate-300 mt-0.5">
            Verifique os arredores ao manobrar · VideoPlaybackService continua rodando sem pausar
          </p>
        </div>

        <button
          type="button"
          onClick={onDisengageReverse}
          className="min-h-[52px] px-5 rounded-xl bg-sky-400 hover:bg-sky-300 text-[#07090D] text-sm font-bold flex items-center gap-2.5 shadow-xl transition cursor-pointer"
        >
          <CameraOff className="w-5 h-5" />
          <span>Desengatar Ré (Voltar ao Player)</span>
        </button>
      </div>

      {/* Bottom Background Service Proof Bar + Hardware Reverse Mute Toggle */}
      <div className="relative z-10 p-6 bg-gradient-to-t from-black/90 via-black/75 to-transparent flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-sky-400">
            Segundo Plano (Foreground Service) — {isPlaying ? 'Reproduzindo continuamente' : 'Pausado'}
          </div>
          <div className="text-base font-semibold text-white truncate mt-0.5">
            {video ? video.name : 'Sem mídia ativa'}
          </div>
          <div
            data-testid="reverse-bg-timer"
            className="font-mono-code text-sm text-slate-300 tabular-nums mt-0.5"
          >
            Progresso sem interrupção: {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleReverseMuteHardware}
          className="min-h-[48px] px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm text-slate-100 flex items-center gap-2.5 transition cursor-pointer"
        >
          {reverseMuteHardware ? (
            <VolumeX className="w-4 h-4 text-amber-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>
            Mudo na Ré (Config. da Central):{' '}
            <strong>{reverseMuteHardware ? 'Ativado (Hardware)' : 'Desativado'}</strong>
          </span>
        </button>
      </div>
    </div>
  );
};
