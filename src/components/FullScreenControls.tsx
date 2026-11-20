import React from 'react';
import {
  FolderOpen,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type {
  AspectRatioMode,
  PlaybackMode,
  VideoItem,
} from '../types/media';
import {
  ASPECT_RATIO_LABELS,
  PLAYBACK_MODE_LABELS,
  formatTime,
  formatTrackIndex,
} from '../utils/mediaLogic';

interface FullScreenControlsProps {
  visible: boolean;
  video: VideoItem | null;
  currentIndex: number;
  totalVideos: number;
  isAllFoldersMode?: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackMode: PlaybackMode;
  aspectRatio: AspectRatioMode;
  volume: number;
  brightness: number;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (timeSec: number) => void;
  onCyclePlaybackMode: () => void;
  onCycleAspectRatio: () => void;
  onOpenSplitList: () => void;
  onEnterPip: () => void;
  onResetHideTimer: () => void;
}

export const FullScreenControls: React.FC<FullScreenControlsProps> = ({
  visible,
  video,
  currentIndex,
  totalVideos,
  isAllFoldersMode = false,
  isPlaying,
  currentTime,
  duration,
  playbackMode,
  aspectRatio,
  volume,
  brightness,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onCyclePlaybackMode,
  onCycleAspectRatio,
  onOpenSplitList,
  onEnterPip,
  onResetHideTimer,
}) => {

  const trackPrefix = formatTrackIndex(currentIndex, totalVideos);
  const titleText = video
    ? `${trackPrefix} - ${video.name}`
    : '00/00 - Selecione uma pasta (Pen Drive / SD)';

  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-200 ${
        visible ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}
      aria-hidden={!visible}
    >
      {/* TOP BAR — Original sleek glass design, oversized for 9" head-unit screens */}
      <header
        data-no-gesture="true"
        onPointerDown={onResetHideTimer}
        className={`pointer-events-auto w-full bg-gradient-to-b from-black/85 via-black/55 to-transparent px-6 pt-5 pb-10 flex items-start justify-between gap-4 ${
          visible ? '' : 'pointer-events-none'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h1
            data-testid="track-header-title"
            className="font-display text-2xl md:text-[28px] font-semibold text-white tracking-tight truncate drop-shadow"
          >
            {titleText}
          </h1>
          {video && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-200/90 tabular-nums">
              {isAllFoldersMode && (
                <>
                  <span className="text-sky-300 font-medium">
                    Todas as Pastas{video.folderName ? ` · ${video.folderName}` : ''}
                  </span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                </>
              )}
              <span>{video.resolution}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{video.videoCodec}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{video.audioCodec}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>libVLC {video.decoder}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>Brilho {brightness}%</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>Volume {volume}%</span>
            </div>
          )}
        </div>

        {/* Large 9"-friendly Top-Right Frosted Glass PiP Button */}
        <div className="relative flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onResetHideTimer();
              onEnterPip();
            }}
            aria-label="Ativar modo Picture-in-Picture (PiP)"
            className="min-h-[58px] px-5 rounded-2xl bg-white/12 hover:bg-white/22 active:scale-95 text-white text-base font-medium backdrop-blur-md border border-white/12 flex items-center gap-2.5 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PictureInPicture2 className="w-6 h-6 text-sky-400" />
            <span>PiP</span>
          </button>
        </div>
      </header>

      {/* EXTRA-LARGE 9" AUTOMOTIVE CENTER CONTROLS (Original Turn-1 signature design, scaled way up!) */}
      <div
        data-no-gesture="true"
        onPointerDown={onResetHideTimer}
        className={`pointer-events-auto self-center flex items-center justify-center gap-10 md:gap-16 ${
          visible ? '' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Vídeo anterior (controle central)"
          className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#0A0F18]/80 hover:bg-[#131C2B]/92 active:scale-95 backdrop-blur-md border-2 border-white/18 text-white flex items-center justify-center shadow-2xl transition cursor-pointer"
        >
          <SkipBack className="w-11 h-11 md:w-12 md:h-12 fill-current" />
        </button>

        <button
          type="button"
          onClick={onTogglePlayPause}
          aria-label={isPlaying ? 'Pausar vídeo (controle central)' : 'Reproduzir vídeo (controle central)'}
          className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-sky-400 hover:bg-sky-300 active:scale-95 text-[#06090F] flex items-center justify-center shadow-2xl shadow-sky-500/35 transition cursor-pointer"
        >
          {isPlaying ? (
            <Pause className="w-13 h-13 md:w-14 md:h-14 fill-current" />
          ) : (
            <Play className="w-13 h-13 md:w-14 md:h-14 fill-current ml-1.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          aria-label="Próximo vídeo (controle central)"
          className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#0A0F18]/80 hover:bg-[#131C2B]/92 active:scale-95 backdrop-blur-md border-2 border-white/18 text-white flex items-center justify-center shadow-2xl transition cursor-pointer"
        >
          <SkipForward className="w-11 h-11 md:w-12 md:h-12 fill-current" />
        </button>
      </div>

      {/* BOTTOM BAR — Original Turn-1 sleek frosted button aesthetic, oversized 64px+ for 9" touch */}
      <footer
        data-no-gesture="true"
        onPointerDown={onResetHideTimer}
        className={`pointer-events-auto w-full bg-gradient-to-t from-black/92 via-black/70 to-transparent px-6 pt-10 pb-6 flex flex-col gap-4 ${
          visible ? '' : 'pointer-events-none'
        }`}
      >
        {/* Thick 9"-friendly Automotive Scrubber */}
        <div className="flex items-center gap-4">
          <span
            data-testid="time-current"
            className="font-mono-code text-base md:text-lg font-semibold text-white tabular-nums w-16 text-right"
          >
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center h-9">
            <input
              type="range"
              aria-label="Linha do tempo do vídeo"
              min={0}
              max={Math.max(duration, 1)}
              step={1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(e) => {
                onResetHideTimer();
                onSeek(Number(e.target.value));
              }}
              className="auto-scrubber w-full"
              style={{
                background: `linear-gradient(to right, #38bdf8 ${progressPercent}%, rgba(255,255,255,0.24) ${progressPercent}%)`,
                height: '12px',
                borderRadius: '9999px',
              }}
            />
          </div>
          <span
            data-testid="time-duration"
            className="font-mono-code text-base md:text-lg text-slate-200 tabular-nums w-16"
          >
            {formatTime(duration)}
          </span>
        </div>

        {/* Bottom Control Row — Oversized 64px–68px Touch Hitboxes */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Playback Mode + Aspect Ratio */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onResetHideTimer();
                onCyclePlaybackMode();
              }}
              aria-label={`Modo de reprodução: ${PLAYBACK_MODE_LABELS[playbackMode]}`}
              className="min-h-[64px] px-5 rounded-2xl bg-white/12 hover:bg-white/22 active:scale-95 backdrop-blur-md border border-white/12 text-white text-base font-medium flex items-center gap-3 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {playbackMode === 'sequential' && <Repeat className="w-6 h-6 text-sky-400" />}
              {playbackMode === 'shuffle' && <Shuffle className="w-6 h-6 text-sky-400" />}
              {playbackMode === 'repeat-one' && <Repeat1 className="w-6 h-6 text-sky-400" />}
              <span>{PLAYBACK_MODE_LABELS[playbackMode]}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onResetHideTimer();
                onCycleAspectRatio();
              }}
              aria-label={`Proporção de tela: ${ASPECT_RATIO_LABELS[aspectRatio]}`}
              className="min-h-[64px] px-5 rounded-2xl bg-white/12 hover:bg-white/22 active:scale-95 backdrop-blur-md border border-white/12 text-white text-base font-medium flex items-center gap-3 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Maximize2 className="w-6 h-6 text-sky-400" />
              <span>{ASPECT_RATIO_LABELS[aspectRatio]}</span>
            </button>
          </div>

          {/* Center: Large Quick Transport (Prev / Play-Pause / Next) */}
          <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Retroceder vídeo"
              className="min-w-[66px] min-h-[64px] rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-white flex items-center justify-center transition cursor-pointer"
            >
              <SkipBack className="w-8 h-8" />
            </button>
            <button
              type="button"
              onClick={onTogglePlayPause}
              aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
              className="min-w-[74px] min-h-[64px] rounded-2xl bg-white/18 hover:bg-white/28 active:scale-95 border border-white/15 text-white flex items-center justify-center transition cursor-pointer"
            >
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Próximo vídeo"
              className="min-w-[66px] min-h-[64px] rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-white flex items-center justify-center transition cursor-pointer"
            >
              <SkipForward className="w-8 h-8" />
            </button>
          </div>

          {/* Right: Oversized Folders / File List CTA */}
          <button
            type="button"
            onClick={() => {
              onResetHideTimer();
              onOpenSplitList();
            }}
            aria-label="Abrir pastas e lista de arquivos"
            className="min-h-[64px] px-6 rounded-2xl bg-slate-800/92 hover:bg-slate-700 active:scale-95 border border-white/18 text-white text-base font-semibold flex items-center gap-3 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-6 h-6 text-sky-400" />
            <span>Pastas / Lista</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
