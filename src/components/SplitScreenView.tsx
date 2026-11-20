import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronRight,
  Folder,
  HardDrive,
  Layers,
  Maximize2,
  MemoryStick,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Usb,
  X,
} from 'lucide-react';
import type {
  AspectRatioMode,
  MediaFolder,
  PlaybackMode,
  SortOption,
  StorageSource,
  VideoItem,
} from '../types/media';
import {
  ASPECT_RATIO_LABELS,
  PLAYBACK_MODE_LABELS,
  SORT_OPTION_LABELS,
  STORAGE_SOURCE_LABELS,
  countVideosRecursive,
  formatDateShort,
  formatTime,
  formatTrackIndex,
  getChildFolders,
  getFolderBreadcrumbs,
  normalizeForSearch,
} from '../utils/mediaLogic';
import { AllFoldersFilterModal } from './AllFoldersFilterModal';

interface SplitScreenViewProps {
  folders: MediaFolder[];
  selectedSource: StorageSource;
  browsedFolder: MediaFolder | null;
  allModeIncludedFolderIds: string[] | null;
  totalAllFoldersVideos: number;
  visibleVideos: VideoItem[];
  currentVideo: VideoItem | null;
  currentIndexInQueue: number;
  totalVideosInQueue: number;
  totalVideosInBrowsedFolder: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackMode: PlaybackMode;
  aspectRatio: AspectRatioMode;
  sortOption: SortOption;
  searchQuery: string;
  isRefreshing: boolean;
  miniPlayerNode: React.ReactNode;
  onSelectSource: (source: StorageSource) => void;
  onOpenFolder: (folderId: string | null) => void;
  onNavigateUp: () => void;
  onApplyAllModeFilter: (selectedIds: string[]) => void;
  onSelectVideo: (video: VideoItem) => void;
  onReturnFullscreen: () => void;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (timeSec: number) => void;
  onCyclePlaybackMode: () => void;
  onCycleAspectRatio: () => void;
  onEnterPip: () => void;
  onSearchChange: (q: string) => void;
  onRefreshFolder: () => void;
  onCycleSort: () => void;
  onDeleteVideo: (videoId: string) => void;
}

const SOURCE_TABS: { id: StorageSource; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'usb_otg', label: 'Pen Drive (USB)', shortLabel: 'Pen Drive', icon: <Usb className="w-5 h-5" /> },
  { id: 'sd_card', label: 'Cartão SD', shortLabel: 'Cartão SD', icon: <MemoryStick className="w-5 h-5" /> },
  { id: 'internal', label: 'Memória Interna', shortLabel: 'Interna', icon: <HardDrive className="w-5 h-5" /> },
];

const VideoRowThumbnail: React.FC<{
  item: VideoItem;
  isActive: boolean;
  isPlaying: boolean;
}> = ({ item, isActive, isPlaying }) => {
  const [thumbSrc, setThumbSrc] = useState<string>(item.posterUrl);

  useEffect(() => {
    setThumbSrc(item.posterUrl);
    if (!item.objectUrl) return;

    let cancelled = false;
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.preload = 'metadata';
    videoEl.src = item.objectUrl;

    const captureFrame = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 108;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          if (dataUrl && dataUrl.length > 100 && !cancelled) {
            setThumbSrc(dataUrl);
          }
        }
      } catch {
        /* Fallback cleanly to posterUrl */
      }
    };

    const onLoadedData = () => {
      try {
        videoEl.currentTime = Math.min(1.5, Math.max(0, (videoEl.duration || 2) * 0.15));
      } catch {
        captureFrame();
      }
    };

    videoEl.addEventListener('loadeddata', onLoadedData, { once: true });
    videoEl.addEventListener('seeked', captureFrame, { once: true });

    return () => {
      cancelled = true;
      videoEl.removeEventListener('loadeddata', onLoadedData);
      videoEl.removeEventListener('seeked', captureFrame);
      videoEl.src = '';
    };
  }, [item.objectUrl, item.posterUrl]);

  return (
    <div
      data-testid="video-row-thumbnail"
      className={`relative w-24 h-14 sm:w-28 sm:h-16 rounded-xl overflow-hidden bg-black shrink-0 border transition ${
        isActive ? 'border-sky-400 shadow-md shadow-sky-500/25' : 'border-white/12'
      }`}
    >
      <img
        src={thumbSrc}
        alt={`Miniatura de ${item.name}`}
        loading="lazy"
        draggable={false}
        className="w-full h-full object-cover"
      />

      {/* Subtle bottom vignette for crisp duration legibility */}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

      {/* Duration stamp */}
      <span className="absolute right-1.5 bottom-1 font-mono-code text-[11px] font-semibold text-white tabular-nums drop-shadow">
        {formatTime(item.durationSec)}
      </span>

      {/* Active playback indicator overlay */}
      {isActive && (
        <div className="absolute inset-0 bg-black/35 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-sky-400/95 text-[#07090D] flex items-center justify-center shadow-lg">
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const SplitScreenView: React.FC<SplitScreenViewProps> = ({
  folders,
  selectedSource,
  browsedFolder,
  allModeIncludedFolderIds,
  totalAllFoldersVideos,
  visibleVideos,
  currentVideo,
  currentIndexInQueue,
  totalVideosInQueue,
  totalVideosInBrowsedFolder,
  isPlaying,
  currentTime,
  duration,
  playbackMode,
  aspectRatio,
  sortOption,
  searchQuery,
  isRefreshing,
  miniPlayerNode,
  onSelectSource,
  onOpenFolder,
  onNavigateUp,
  onApplyAllModeFilter,
  onSelectVideo,
  onReturnFullscreen,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onCyclePlaybackMode,
  onCycleAspectRatio,
  onEnterPip,
  onSearchChange,
  onRefreshFolder,
  onCycleSort,
  onDeleteVideo,
}) => {
  const [pendingDelete, setPendingDelete] = useState<VideoItem | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const breadcrumbNavRef = useRef<HTMLElement | null>(null);

  // Immediate child subfolders inside the currently browsed folder (or drive root)
  const childSubfolders = useMemo(() => {
    if (selectedSource === 'all') return [];
    const parentId = browsedFolder ? browsedFolder.id : null;
    const raw = getChildFolders(folders, selectedSource, parentId);
    const q = normalizeForSearch(searchQuery);
    if (!q) return raw;
    return raw.filter((f) => normalizeForSearch(f.name).includes(q));
  }, [browsedFolder, folders, searchQuery, selectedSource]);

  // Ancestor breadcrumbs for the currently browsed folder
  const breadcrumbs = useMemo(() => {
    if (selectedSource === 'all' || !browsedFolder) return [];
    return getFolderBreadcrumbs(folders, browsedFolder.id);
  }, [browsedFolder, folders, selectedSource]);

  // Keep deepest active folder visible in horizontal breadcrumb bar
  useEffect(() => {
    if (breadcrumbNavRef.current) {
      breadcrumbNavRef.current.scrollLeft = breadcrumbNavRef.current.scrollWidth;
    }
  }, [breadcrumbs.length, browsedFolder?.id, selectedSource]);

  // Show subfolders at top when entering a folder with subfolders; otherwise center active video
  useEffect(() => {
    if (childSubfolders.length > 0 && listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    } else if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentVideo?.id, browsedFolder?.id, childSubfolders.length]);

  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  const isAllMode = selectedSource === 'all';
  const currentDriveLabel =
    selectedSource === 'all' ? 'Todas as Pastas' : STORAGE_SOURCE_LABELS[selectedSource];

  const headerTitle = isAllMode
    ? 'Todas as Pastas'
    : browsedFolder
      ? browsedFolder.name
      : currentDriveLabel;

  const headerSubtitle = isAllMode
    ? `${browsedFolder?.path ?? ''} · ${visibleVideos.length} de ${totalVideosInBrowsedFolder} vídeos`
    : browsedFolder
      ? `${browsedFolder.path} · ${childSubfolders.length > 0 ? `${childSubfolders.length} subpasta(s) · ` : ''}${visibleVideos.length} vídeo(s)`
      : `${childSubfolders.length} pasta(s) na raiz do armazenamento`;

  const hasCustomAllFilter =
    allModeIncludedFolderIds !== null && allModeIncludedFolderIds.length < folders.length;

  return (
    <div
      data-testid="split-screen-view"
      className="w-full h-full bg-[#07090D] text-slate-100 flex flex-row overflow-hidden"
    >
      {/* LEFT COLUMN (43%): Original sleek Turn-1 Mini-Player & controls, scaled UP for 9" touch */}
      <aside className="w-[43%] min-w-[380px] max-w-[580px] h-full border-r border-white/8 bg-[#0B0F17] p-3 xl:p-4 flex flex-col justify-between gap-2.5 xl:gap-3.5 overflow-y-auto auto-scroll">
        <div className="flex flex-col gap-2.5 xl:gap-3">
          {/* Continuous Mini-Player Frame — Tap video to return immediately to Fullscreen */}
          <div className="relative w-full aspect-video max-h-[168px] xl:max-h-none rounded-2xl overflow-hidden bg-black border border-white/12 shadow-xl">
            {miniPlayerNode}
            <button
              type="button"
              onClick={onReturnFullscreen}
              aria-label="Expandir vídeo para tela cheia"
              className="absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-3 xl:p-4 text-left cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-xs xl:text-sm font-medium text-white">
                <Maximize2 className="w-4 h-4 text-sky-400" />
                <span>Toque no vídeo para voltar à tela cheia</span>
              </span>
            </button>
          </div>

          {/* Active Track Title + Thick 9" Scrubber */}
          <div className="px-0.5">
            <h2 className="font-display text-base xl:text-lg font-semibold text-white truncate">
              {currentVideo
                ? `${formatTrackIndex(currentIndexInQueue, totalVideosInQueue)} - ${currentVideo.name}`
                : 'Nenhum vídeo em reprodução'}
            </h2>
            {currentVideo && (
              <p className="text-xs xl:text-sm text-slate-400 mt-0.5 tabular-nums truncate">
                {currentVideo.resolution} · {currentVideo.videoCodec} · {currentVideo.audioCodec} · libVLC {currentVideo.decoder}
              </p>
            )}
            <div className="mt-2 xl:mt-3 flex items-center gap-3">
              <span className="font-mono-code text-xs xl:text-sm text-slate-200 tabular-nums w-11">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                aria-label="Progresso do mini-player"
                min={0}
                max={Math.max(duration, 1)}
                step={1}
                value={Math.min(currentTime, Math.max(duration, 1))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="auto-scrubber flex-1"
                style={{
                  background: `linear-gradient(to right, #38bdf8 ${progressPercent}%, rgba(255,255,255,0.22) ${progressPercent}%)`,
                  height: '10px',
                  borderRadius: '9999px',
                }}
              />
              <span className="font-mono-code text-xs xl:text-sm text-slate-400 tabular-nums w-11 text-right">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Oversized 9" Transport Buttons (56px on 600p, 64px on larger screens) */}
          <div className="flex items-center justify-between gap-2 xl:gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Vídeo anterior"
              className="flex-1 min-h-[56px] xl:min-h-[64px] rounded-2xl bg-white/8 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition cursor-pointer"
            >
              <SkipBack className="w-7 h-7 xl:w-8 xl:h-8 fill-current" />
            </button>
            <button
              type="button"
              onClick={onTogglePlayPause}
              aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
              className="flex-[1.35] min-h-[56px] xl:min-h-[64px] rounded-2xl bg-sky-400 hover:bg-sky-300 active:scale-95 text-[#07090D] flex items-center justify-center shadow-lg shadow-sky-500/20 transition cursor-pointer"
            >
              {isPlaying ? <Pause className="w-7 h-7 xl:w-8 xl:h-8 fill-current" /> : <Play className="w-7 h-7 xl:w-8 xl:h-8 fill-current ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Próximo vídeo"
              className="flex-1 min-h-[56px] xl:min-h-[64px] rounded-2xl bg-white/8 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition cursor-pointer"
            >
              <SkipForward className="w-7 h-7 xl:w-8 xl:h-8 fill-current" />
            </button>
            <button
              type="button"
              onClick={onEnterPip}
              aria-label="Ativar Picture-in-Picture"
              className="min-w-[56px] min-h-[56px] xl:min-w-[64px] xl:min-h-[64px] rounded-2xl bg-white/8 hover:bg-white/15 active:scale-95 text-sky-400 flex items-center justify-center transition cursor-pointer"
            >
              <PictureInPicture2 className="w-6 h-6 xl:w-7 xl:h-7" />
            </button>
          </div>

          {/* Oversized Mode + Aspect Row */}
          <div className="grid grid-cols-2 gap-2 xl:gap-2.5">
            <button
              type="button"
              onClick={onCyclePlaybackMode}
              className="min-h-[46px] xl:min-h-[54px] px-3 xl:px-4 rounded-xl bg-white/6 hover:bg-white/12 text-sm font-medium text-slate-100 flex items-center justify-center gap-2 transition whitespace-nowrap cursor-pointer"
            >
              {playbackMode === 'sequential' && <Repeat className="w-5 h-5 text-sky-400" />}
              {playbackMode === 'shuffle' && <Shuffle className="w-5 h-5 text-sky-400" />}
              {playbackMode === 'repeat-one' && <Repeat1 className="w-5 h-5 text-sky-400" />}
              <span>{PLAYBACK_MODE_LABELS[playbackMode]}</span>
            </button>
            <button
              type="button"
              onClick={onCycleAspectRatio}
              className="min-h-[46px] xl:min-h-[54px] px-3 xl:px-4 rounded-xl bg-white/6 hover:bg-white/12 text-sm font-medium text-slate-100 flex items-center justify-center gap-2 transition whitespace-nowrap cursor-pointer"
            >
              <Maximize2 className="w-5 h-5 text-sky-400" />
              <span>{ASPECT_RATIO_LABELS[aspectRatio]}</span>
            </button>
          </div>
        </div>

        {/* Storage Volumes (Todas as Pastas + USB OTG / SD Card / Internal + Real Local Files) */}
        <div className="pt-2.5 xl:pt-3 border-t border-white/8 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium text-slate-400">
              Armazenamento
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Split Control: Todas (N) + 1-tap Filter icon */}
            <div
              className={`min-h-[48px] xl:min-h-[58px] rounded-xl flex items-stretch overflow-hidden transition ${
                selectedSource === 'all'
                  ? 'bg-sky-500/22 border-2 border-sky-400/70'
                  : 'bg-white/6 border border-transparent'
              }`}
            >
              <button
                type="button"
                data-testid="all-folders-btn"
                onClick={() => onSelectSource('all')}
                className="flex-1 min-w-0 px-2.5 text-sm font-semibold text-sky-100 hover:bg-white/8 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Layers className="w-4 h-4 xl:w-5 xl:h-5 text-sky-400 shrink-0" />
                <span className="truncate">Todas ({totalAllFoldersVideos})</span>
              </button>
              <button
                type="button"
                data-testid="open-all-filter-btn"
                onClick={() => setFilterModalOpen(true)}
                aria-label="Selecionar pastas incluídas em Todas"
                title="Escolher quais pastas entram em Todas"
                className={`w-11 xl:w-12 border-l border-white/10 hover:bg-white/12 flex items-center justify-center transition cursor-pointer shrink-0 ${
                  hasCustomAllFilter ? 'text-sky-300' : 'text-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 xl:w-5 xl:h-5" />
              </button>
            </div>

            {SOURCE_TABS.map((tab) => {
              const active = selectedSource === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`source-tab-${tab.id}`}
                  onClick={() => onSelectSource(tab.id)}
                  className={`min-h-[48px] xl:min-h-[58px] px-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition cursor-pointer ${
                    active
                      ? 'bg-sky-500/20 text-sky-100 border-2 border-sky-400/60'
                      : 'bg-white/6 text-slate-300 hover:bg-white/12 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span className="truncate max-w-full">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* RIGHT COLUMN (57%): Hierarchical Folder Explorer + 16:9 Video Thumbnail List */}
      <main className="flex-1 h-full flex flex-col min-w-0 bg-[#07090D]">
        <div className="px-5 pt-4 pb-3 border-b border-white/8 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold text-white truncate">
                {headerTitle}
              </h2>
              <p className="text-xs md:text-sm text-slate-400 truncate tabular-nums">
                {headerSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAllMode && (
                <button
                  type="button"
                  data-testid="header-filter-folders-btn"
                  onClick={() => setFilterModalOpen(true)}
                  className="min-h-[52px] px-3.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 active:scale-95 border border-sky-400/45 text-sm md:text-base font-semibold text-sky-200 flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="w-5 h-5 text-sky-300" />
                  <span>Filtrar Pastas</span>
                </button>
              )}

              <button
                type="button"
                onClick={onCycleSort}
                aria-label={`Ordenar lista: ${SORT_OPTION_LABELS[sortOption]}`}
                className="min-h-[52px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 active:scale-95 text-sm md:text-base font-medium text-slate-100 flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
              >
                <ArrowUpDown className="w-5 h-5 text-sky-400" />
                <span className="hidden sm:inline">{SORT_OPTION_LABELS[sortOption]}</span>
              </button>

              <button
                type="button"
                onClick={onRefreshFolder}
                aria-label="Atualizar pasta atual"
                className="min-h-[52px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 active:scale-95 text-sm md:text-base font-medium text-slate-100 flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-5 h-5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span className="hidden md:inline">Atualizar</span>
              </button>
            </div>
          </div>

          {/* Interactive Breadcrumb Navigation Bar (when exploring Pen Drive / SD / Interna) */}
          {!isAllMode && (
            <div className="flex items-center gap-2 min-w-0">
              {browsedFolder && (
                <button
                  type="button"
                  data-testid="folder-back-btn"
                  onClick={onNavigateUp}
                  className="min-h-[42px] px-3.5 rounded-xl bg-white/10 hover:bg-white/18 active:scale-95 text-sm font-semibold text-white flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-sky-400" />
                  <span>Voltar</span>
                </button>
              )}

              <nav
                ref={breadcrumbNavRef}
                aria-label="Caminho de pastas"
                data-testid="folder-breadcrumbs"
                className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto pb-0.5"
              >
                <button
                  type="button"
                  onClick={() => onOpenFolder(null)}
                  className={`min-h-[42px] px-3 rounded-xl text-sm font-medium whitespace-nowrap transition cursor-pointer shrink-0 ${
                    !browsedFolder
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                      : 'bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white'
                  }`}
                >
                  {currentDriveLabel}
                </button>

                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      <button
                        type="button"
                        onClick={() => onOpenFolder(crumb.id)}
                        className={`min-h-[42px] px-3 rounded-xl text-sm font-medium whitespace-nowrap transition cursor-pointer shrink-0 ${
                          isLast
                            ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                            : 'bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Large 9" Accent-Insensitive Partial Search Bar */}
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
            <label htmlFor="video-search-input" className="sr-only">
              Pesquisar pasta ou vídeo
            </label>
            <input
              id="video-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder='Pesquisa parcial sem acentos (ex: "gode", "forro", "serra")...'
              className="w-full min-h-[52px] pl-12 pr-12 rounded-xl bg-[#0F141E] border border-white/12 focus:border-sky-400/70 focus:outline-none text-base text-white placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 min-w-[44px] min-h-[44px] rounded-xl hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Explorer: Subfolder Cards first, then Video Thumbnail List */}
        <div
          ref={listContainerRef}
          data-testid="video-file-list"
          className="flex-1 overflow-y-auto auto-scroll px-3 py-2"
        >
          {/* Subfolders Section */}
          {childSubfolders.length > 0 && (
            <div data-testid="subfolder-list" className="mb-2 flex flex-col gap-1.5">
              {childSubfolders.map((sub) => {
                const nestedChildrenCount = getChildFolders(folders, sub.source, sub.id).length;
                const totalRecursiveVideos = countVideosRecursive(folders, sub.id);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    data-testid={`subfolder-card-${sub.id}`}
                    onClick={() => onOpenFolder(sub.id)}
                    className="w-full min-h-[60px] px-3.5 py-2.5 rounded-2xl bg-[#0D1320] hover:bg-[#141D2F] active:scale-[0.99] border border-white/8 hover:border-sky-400/40 flex items-center gap-3 text-left transition cursor-pointer"
                  >
                    <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center shrink-0">
                      <Folder className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-white truncate">
                        {sub.name}
                      </div>
                      <div className="text-xs md:text-sm text-slate-400 tabular-nums truncate">
                        {nestedChildrenCount > 0
                          ? `${nestedChildrenCount} ${nestedChildrenCount === 1 ? 'subpasta' : 'subpastas'} · `
                          : ''}
                        {totalRecursiveVideos} {totalRecursiveVideos === 1 ? 'vídeo' : 'vídeos'}
                        {nestedChildrenCount > 0 ? ' no total' : ''}
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Video Files List */}
          {visibleVideos.length === 0 && childSubfolders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="font-display text-lg font-medium text-slate-300">
                {searchQuery
                  ? `Nenhum resultado encontrado para "${searchQuery}"`
                  : isAllMode
                    ? folders.length === 0
                      ? 'Nenhum vídeo encontrado nos armazenamentos'
                      : 'Nenhuma pasta marcada em "Todas"'
                    : 'Nenhuma pasta ou vídeo encontrado'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {searchQuery
                  ? 'Tente outro trecho do nome ou limpe a busca.'
                  : isAllMode
                    ? folders.length === 0
                      ? 'Conecte um Pen Drive, Cartão SD ou copie vídeos na Memória Interna e toque em Atualizar.'
                      : 'Toque em "Filtrar Pastas" acima para escolher quais pastas exibir.'
                    : 'Conecte o armazenamento ou toque em Atualizar para escanear.'}
              </p>
              {isAllMode && !searchQuery && folders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(true)}
                  className="mt-4 min-h-[52px] px-6 rounded-xl bg-sky-400 hover:bg-sky-300 text-base font-semibold text-[#07090D] transition cursor-pointer"
                >
                  Selecionar Pastas
                </button>
              )}
            </div>
          ) : (
            visibleVideos.length > 0 && (
              <ul className="flex flex-col divide-y divide-white/5">
                {visibleVideos.map((item, idx) => {
                  const isActive = item.id === currentVideo?.id;
                  return (
                    <li key={item.id}>
                      <div
                        ref={isActive ? activeRowRef : null}
                        data-active={isActive ? 'true' : 'false'}
                        className={`flex items-center gap-2 rounded-2xl my-1 transition ${
                          isActive ? 'bg-sky-500/18' : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectVideo(item)}
                          className="flex-1 min-w-0 min-h-[84px] px-3.5 py-2.5 flex items-center gap-3.5 text-left cursor-pointer"
                        >
                          <span
                            className={`font-mono-code text-sm font-bold tabular-nums w-6 shrink-0 text-right ${
                              isActive ? 'text-sky-400' : 'text-slate-500'
                            }`}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          <VideoRowThumbnail
                            item={item}
                            isActive={isActive}
                            isPlaying={isPlaying}
                          />

                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-base md:text-lg truncate ${
                                isActive ? 'font-semibold text-white' : 'font-medium text-slate-100'
                              }`}
                            >
                              {item.name}
                            </div>
                            <div className="mt-1 text-xs md:text-sm text-slate-400 tabular-nums truncate">
                              {isAllMode && item.folderName && (
                                <>
                                  <span className="text-sky-300 font-medium">{item.folderName}</span>
                                  {' · '}
                                </>
                              )}
                              {item.extension.replace('.', '').toUpperCase()} · {item.videoCodec} · {item.sizeMb} MB · {formatDateShort(item.modifiedAt)}
                            </div>
                          </div>

                          {isActive && (
                            <span className="hidden xl:inline text-sm font-semibold text-sky-400 shrink-0 pr-1">
                              {isPlaying ? 'Tocando' : 'Pausado'}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          aria-label={`Excluir ${item.name}`}
                          className="min-w-[58px] min-h-[58px] mr-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/12 flex items-center justify-center transition shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </main>

      {/* Manual Folder Selection Modal for "Todas as Pastas" */}
      {filterModalOpen && (
        <AllFoldersFilterModal
          folders={folders}
          includedFolderIds={allModeIncludedFolderIds}
          onApply={(ids) => {
            setFilterModalOpen(false);
            onApplyAllModeFilter(ids);
          }}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {/* Delete Confirmation Modal — Oversized 9" touch buttons */}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#0F141E] border border-white/14 p-6 shadow-2xl">
            <h3 id="delete-dialog-title" className="font-display text-xl font-semibold text-white">
              Excluir arquivo?
            </h3>
            <p className="mt-2.5 text-base text-slate-300 leading-relaxed">
              Deseja apagar permanentemente{' '}
              <span className="font-semibold text-white">&ldquo;{pendingDelete.name}&rdquo;</span> da pasta{' '}
              <span className="text-slate-200">{pendingDelete.folderName ?? browsedFolder?.name ?? currentDriveLabel}</span>?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="min-h-[54px] px-6 rounded-xl bg-white/10 hover:bg-white/18 text-base font-medium text-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDelete.id;
                  setPendingDelete(null);
                  onDeleteVideo(id);
                }}
                className="min-h-[54px] px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-base font-semibold text-white transition cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
