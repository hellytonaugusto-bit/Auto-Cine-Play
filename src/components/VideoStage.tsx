import React, { useEffect, useRef, useState } from 'react';
import { FastForward, Rewind, Sun, Volume2, VolumeX } from 'lucide-react';
import type { ActiveGestureHUD, AspectRatioMode, GestureType, VideoItem } from '../types/media';
import {
  computeSeekGesture,
  computeVerticalGestureValue,
  detectGestureAxis,
} from '../utils/gestureLogic';
import { formatTime } from '../utils/mediaLogic';

interface VideoStageProps {
  video: VideoItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  aspectRatio: AspectRatioMode;
  brightness: number; // 10..100
  volume: number; // 0..100
  effectiveVolume: number; // 0..100 (after ducking/reverse mute)
  enableGestures: boolean;
  onTapStage: () => void;
  onSeekCommit: (targetTimeSec: number) => void;
  onVolumeChange: (nextVolume: number) => void;
  onBrightnessChange: (nextBrightness: number) => void;
  onVideoTimeSync?: (timeSec: number, durationSec: number) => void;
  onVideoEnded?: () => void;
  compact?: boolean;
}

function getAspectContainerClass(aspectRatio: AspectRatioMode): string {
  switch (aspectRatio) {
    case 'fit':
      return 'w-full h-full flex items-center justify-center';
    case 'fill':
      return 'w-full h-full flex items-center justify-center overflow-hidden';
    case 'stretch':
      return 'w-full h-full';
    case '16:9':
      return 'w-full h-full flex items-center justify-center';
    case '4:3':
      return 'w-full h-full flex items-center justify-center';
  }
}

function getMediaStyle(aspectRatio: AspectRatioMode): React.CSSProperties {
  switch (aspectRatio) {
    case 'fit':
      return { width: '100%', height: '100%', objectFit: 'contain' };
    case 'fill':
      return { width: '100%', height: '100%', objectFit: 'cover' };
    case 'stretch':
      return { width: '100%', height: '100%', objectFit: 'fill' };
    case '16:9':
      return {
        aspectRatio: '16 / 9',
        maxWidth: '100%',
        maxHeight: '100%',
        width: '100%',
        objectFit: 'fill',
      };
    case '4:3':
      return {
        aspectRatio: '4 / 3',
        maxWidth: '100%',
        maxHeight: '100%',
        height: '100%',
        objectFit: 'fill',
      };
  }
}

export const VideoStage: React.FC<VideoStageProps> = ({
  video,
  isPlaying,
  currentTime,
  duration,
  aspectRatio,
  brightness,
  volume,
  effectiveVolume,
  enableGestures,
  onTapStage,
  onSeekCommit,
  onVolumeChange,
  onBrightnessChange,
  onVideoTimeSync,
  onVideoEnded,
  compact = false,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hudClearTimerRef = useRef<number | null>(null);
  const [gestureHud, setGestureHud] = useState<ActiveGestureHUD | null>(null);
  const [imageError, setImageError] = useState(false);

  const gestureStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    startTime: number;
    startVolume: number;
    startBrightness: number;
    lockedAxis: GestureType | null;
    lastSeekTarget: number;
    didDrag: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    startVolume: 80,
    startBrightness: 90,
    lockedAxis: null,
    lastSeekTarget: 0,
    didDrag: false,
  });

  useEffect(() => {
    setImageError(false);
  }, [video?.id]);

  // Keep real <video> element synchronized when user loads local files from USB/Disk
  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !video?.objectUrl) return;
    el.volume = Math.min(Math.max(effectiveVolume / 100, 0), 1);
  }, [effectiveVolume, video?.objectUrl]);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !video?.objectUrl) return;
    if (isPlaying) {
      el.play().catch(() => {
        /* Browser autoplay policy safeguard */
      });
    } else {
      el.pause();
    }
  }, [isPlaying, video?.objectUrl, video?.id]);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !video?.objectUrl) return;
    if (Math.abs(el.currentTime - currentTime) > 1.2) {
      el.currentTime = currentTime;
    }
  }, [currentTime, video?.objectUrl]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Never intercept gestures when starting inside an interactive control
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-no-gesture="true"]')) {
      return;
    }

    if (!enableGestures) {
      onTapStage();
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (hudClearTimerRef.current) {
      window.clearTimeout(hudClearTimerRef.current);
      hudClearTimerRef.current = null;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    gestureStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: currentTime,
      startVolume: volume,
      startBrightness: brightness,
      lockedAxis: null,
      lastSeekTarget: currentTime,
      didDrag: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = gestureStateRef.current;
    if (st.pointerId !== e.pointerId || !enableGestures) return;

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const localStartX = st.startX - rect.left;

    if (!st.lockedAxis) {
      const detected = detectGestureAxis(dx, dy, localStartX, rect.width);
      if (!detected) return;
      st.lockedAxis = detected;
      st.didDrag = true;
    }

    if (st.lockedAxis === 'seek') {
      const { targetTime, deltaSeconds } = computeSeekGesture(
        st.startTime,
        dx,
        rect.width,
        duration
      );
      st.lastSeekTarget = targetTime;
      setGestureHud({
        type: 'seek',
        value: targetTime,
        deltaSeconds,
        durationSec: duration,
      });
    } else if (st.lockedAxis === 'brightness') {
      const nextBrightness = computeVerticalGestureValue(
        st.startBrightness,
        dy,
        rect.height,
        15,
        100
      );
      onBrightnessChange(nextBrightness);
      setGestureHud({
        type: 'brightness',
        value: nextBrightness,
      });
    } else if (st.lockedAxis === 'volume') {
      const nextVolume = computeVerticalGestureValue(
        st.startVolume,
        dy,
        rect.height,
        0,
        100
      );
      onVolumeChange(nextVolume);
      setGestureHud({
        type: 'volume',
        value: nextVolume,
      });
    }
  };

  const finishGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const st = gestureStateRef.current;
    if (st.pointerId !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!cancelled) {
      if (st.didDrag && st.lockedAxis === 'seek') {
        onSeekCommit(st.lastSeekTarget);
      } else if (!st.didDrag) {
        onTapStage();
      }
    }

    const wasDrag = st.didDrag;
    gestureStateRef.current.pointerId = null;
    gestureStateRef.current.lockedAxis = null;

    if (wasDrag && !cancelled) {
      if (hudClearTimerRef.current) window.clearTimeout(hudClearTimerRef.current);
      hudClearTimerRef.current = window.setTimeout(() => {
        setGestureHud(null);
      }, 450);
    } else {
      setGestureHud(null);
    }
  };

  // Gentle deterministic Ken Burns camera motion driven by currentTime when playing demo clips
  const panPhase = (currentTime % 40) / 40;
  const panX = Math.sin(panPhase * Math.PI * 2) * 1.4;
  const panScale = 1.03 + Math.sin(panPhase * Math.PI) * 0.035;

  // Optical brightness filter (dimming overlay preserves true blacks without washing out contrast)
  const brightnessFactor = Math.min(Math.max(brightness / 100, 0.15), 1);

  return (
    <div
      ref={stageRef}
      data-testid="video-stage"
      data-aspect-ratio={aspectRatio}
      data-brightness={brightness}
      data-volume={volume}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishGesture(e, false)}
      onPointerCancel={(e) => finishGesture(e, true)}
      className="relative w-full h-full bg-black overflow-hidden select-none touch-none"
    >
      {/* Video / Simulated HD Media Frame */}
      <div
        className={`${getAspectContainerClass(aspectRatio)} pointer-events-none`}
        style={{
          filter: `brightness(${brightnessFactor})`,
          transition: gestureHud ? 'none' : 'filter 120ms ease-out',
        }}
      >
        {video ? (
          video.objectUrl ? (
            <video
              ref={videoElRef}
              src={video.objectUrl}
              playsInline
              style={getMediaStyle(aspectRatio)}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (onVideoTimeSync && Number.isFinite(el.duration) && el.duration > 0) {
                  onVideoTimeSync(el.currentTime, el.duration);
                }
              }}
              onEnded={() => onVideoEnded?.()}
            />
          ) : !imageError ? (
            <div
              className="relative overflow-hidden bg-[#06080C]"
              style={getMediaStyle(aspectRatio)}
            >
              <img
                src={video.posterUrl}
                alt={video.name}
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="w-full h-full will-change-transform select-none pointer-events-none"
                style={{
                  objectFit:
                    aspectRatio === 'stretch' || aspectRatio === '16:9' || aspectRatio === '4:3'
                      ? 'fill'
                      : aspectRatio === 'fill'
                      ? 'cover'
                      : 'contain',
                  transform: isPlaying
                    ? `scale(${panScale.toFixed(4)}) translate3d(${panX.toFixed(2)}%, 0, 0)`
                    : 'scale(1.01)',
                  transition: 'transform 950ms linear',
                }}
              />
              {/* Subtle filmic vignette for crisp automotive contrast */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/25"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-[#0A0E16] to-black text-slate-300 px-6 text-center">
              <p className="font-display text-xl font-semibold text-white">{video.name}</p>
              <p className="mt-2 text-sm text-slate-400">
                {video.resolution} · {video.videoCodec} · {video.audioCodec}
              </p>
            </div>
          )
        ) : (
          <div
            className={`w-full h-full flex flex-col items-center bg-[#06090F] text-slate-400 px-6 text-center ${
              compact ? 'justify-center' : 'justify-start pt-[15vh]'
            }`}
          >
            {compact ? (
              <p className="text-sm font-medium text-slate-400">Nenhum vídeo selecionado</p>
            ) : (
              <>
                <p className="font-display text-lg md:text-xl font-medium text-slate-200">
                  Nenhum vídeo selecionado
                </p>
                <p className="mt-1 text-xs md:text-sm text-slate-500">
                  Toque em Pastas / Lista para acessar Pen Drive, Cartão SD ou Memória Interna.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Live Gesture Navigation HUD Overlay (Seek / Brightness / Volume) — positioned above large center buttons */}
      {gestureHud && !compact && (
        <div
          data-testid="gesture-hud"
          data-gesture-type={gestureHud.type}
          className="pointer-events-none absolute inset-x-0 top-[14%] z-40 flex items-center justify-center"
        >
          <div className="min-w-[260px] rounded-2xl bg-[#090D15]/92 backdrop-blur-md border border-white/12 px-8 py-5 shadow-2xl flex flex-col items-center gap-3">
            {gestureHud.type === 'seek' && (
              <>
                {(gestureHud.deltaSeconds ?? 0) >= 0 ? (
                  <FastForward className="w-11 h-11 text-sky-400" />
                ) : (
                  <Rewind className="w-11 h-11 text-sky-400" />
                )}
                <div className="font-display text-3xl font-bold text-white tabular-nums">
                  {(gestureHud.deltaSeconds ?? 0) >= 0 ? '+' : ''}
                  {gestureHud.deltaSeconds ?? 0}s
                </div>
                <div className="text-base font-mono-code text-slate-300 tabular-nums">
                  {formatTime(gestureHud.value)} / {formatTime(gestureHud.durationSec ?? duration)}
                </div>
              </>
            )}

            {gestureHud.type === 'brightness' && (
              <>
                <Sun className="w-10 h-10 text-amber-400" />
                <div className="text-xl font-semibold text-white tabular-nums">
                  Brilho {gestureHud.value}%
                </div>
                <div className="w-52 h-3 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${gestureHud.value}%` }}
                  />
                </div>
              </>
            )}

            {gestureHud.type === 'volume' && (
              <>
                {gestureHud.value === 0 ? (
                  <VolumeX className="w-10 h-10 text-slate-400" />
                ) : (
                  <Volume2 className="w-10 h-10 text-sky-400" />
                )}
                <div className="text-xl font-semibold text-white tabular-nums">
                  Volume {gestureHud.value}%
                </div>
                <div className="w-52 h-3 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full"
                    style={{ width: `${gestureHud.value}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
