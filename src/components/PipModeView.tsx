import React from 'react';
import {
  ArrowUpRight,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { VideoItem } from '../types/media';
import { formatTime } from '../utils/mediaLogic';

interface PipModeViewProps {
  video: VideoItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  pipVideoNode: React.ReactNode;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onExpandFullscreen: () => void;
}

export const PipModeView: React.FC<PipModeViewProps> = ({
  video,
  isPlaying,
  currentTime,
  duration,
  pipVideoNode,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onExpandFullscreen,
}) => {
  return (
    <div
      data-testid="pip-mode-view"
      className="relative w-full h-full bg-[#090D14] text-slate-100 overflow-hidden select-none"
    >
      {/* Simulated Automotive Navigation App (Waze / Maps) Backdrop */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full opacity-90"
      >
        <defs>
          <linearGradient id="navBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0D1420" />
            <stop offset="100%" stopColor="#090D14" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#navBg)" />
        {/* Urban road grid lines */}
        <g stroke="#182334" strokeWidth="10" fill="none">
          <path d="M 0 210 L 1440 280" />
          <path d="M 0 540 L 1440 480" />
          <path d="M 290 0 L 220 900" />
          <path d="M 760 0 L 820 900" />
          <path d="M 1180 0 L 1120 900" />
        </g>
        <g stroke="#1E2C42" strokeWidth="4" fill="none">
          <path d="M 0 380 L 1440 340" />
          <path d="M 0 710 L 1440 690" />
          <path d="M 520 0 L 490 900" />
          <path d="M 970 0 L 990 900" />
        </g>
        {/* Active Navigation Route */}
        <path
          d="M 505 880 L 515 510 Q 518 475 555 470 L 795 452 Q 830 448 826 410 L 792 140"
          stroke="#38BDF8"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.92"
        />
        <path
          d="M 505 880 L 515 510 Q 518 475 555 470 L 795 452 Q 830 448 826 410 L 792 140"
          stroke="#BAE6FD"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray="16 14"
        />
        {/* Vehicle Navigation Arrow */}
        <g transform="translate(510, 620)">
          <circle r="24" fill="#38BDF8" fillOpacity="0.18" />
          <polygon points="0,-16 13,14 0,7 -13,14" fill="#38BDF8" stroke="#07090D" strokeWidth="2" />
        </g>
      </svg>

      {/* Top Navigation Banner (Simulating Waze / Maps running while AutoCine is in PiP) */}
      <div className="relative z-10 p-6 flex items-start justify-between gap-4">
        <div className="rounded-2xl bg-[#0D131F]/92 backdrop-blur-md border border-white/10 px-6 py-4 shadow-2xl flex items-center gap-4 max-w-lg">
          <div className="w-14 h-14 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-8 h-8" />
          </div>
          <div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">350 m</div>
            <div className="text-sm text-slate-300">Vire à direita na Av. Paulista · Modo Navegação</div>
            <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
              14 min · 6,4 km · AutoCine ativo em janela Picture-in-Picture
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING PICTURE-IN-PICTURE (PiP) WINDOW */}
      <div
        data-testid="pip-floating-window"
        className="absolute right-6 bottom-6 z-30 w-[390px] sm:w-[440px] rounded-2xl overflow-hidden bg-black border border-white/20 shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col"
      >
        <div className="relative w-full aspect-video bg-black">
          {pipVideoNode}

          {/* Top PiP Title + Large Expand */}
          <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/85 to-transparent px-3.5 pt-2.5 pb-6 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-white truncate">
              {video ? video.name : 'AutoCine PiP'}
            </span>
            <button
              type="button"
              onClick={onExpandFullscreen}
              aria-label="Voltar para tela cheia"
              className="min-w-[46px] min-h-[46px] rounded-xl bg-white/18 hover:bg-white/28 text-white flex items-center justify-center transition cursor-pointer"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom PiP Quick Controls (Prev / Play-Pause / Next) — 9" scaled */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/92 via-black/65 to-transparent px-3.5 pt-6 pb-3 flex items-center justify-between gap-2">
            <span className="font-mono-code text-sm text-slate-200 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevious}
                aria-label="Anterior no PiP"
                className="w-12 h-12 rounded-full bg-white/16 hover:bg-white/28 text-white flex items-center justify-center transition cursor-pointer"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onTogglePlayPause}
                aria-label={isPlaying ? 'Pausar no PiP' : 'Reproduzir no PiP'}
                className="w-14 h-14 rounded-full bg-sky-400 hover:bg-sky-300 text-[#07090D] flex items-center justify-center transition cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="Próximo no PiP"
                className="w-12 h-12 rounded-full bg-white/16 hover:bg-white/28 text-white flex items-center justify-center transition cursor-pointer"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
