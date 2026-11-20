import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppColorTheme,
  AspectRatioMode,
  MediaFolder,
  PersistedPlayerState,
  PlaybackMode,
  SortOption,
  StorageSource,
  UiScaleLevel,
  VideoItem,
  ViewMode,
} from './types/media';
import {
  ALL_FOLDERS_ID,
  ASPECT_RATIO_LABELS,
  PLAYBACK_MODE_LABELS,
  SORT_OPTION_LABELS,
  advanceShuffleTrack,
  buildCombinedFolder,
  cycleAspectRatio,
  cyclePlaybackMode,
  filterMediaFiles,
  getNextTrackIndex,
  getPreviousTrackIndex,
  goBackShuffleTrack,
  sortMediaFiles,
} from './utils/mediaLogic';
import { getColorThemePreset, getUiScalePreset } from './utils/themeConfig';
import { VideoStage } from './components/VideoStage';
import { FullScreenControls } from './components/FullScreenControls';
import { SplitScreenView } from './components/SplitScreenView';
import { PipModeView } from './components/PipModeView';
import { SettingsModal } from './components/SettingsModal';

const STORAGE_KEY = 'autocine_headunit_state_v1';

function loadPersistedState(): PersistedPlayerState {
  const defaults: PersistedPlayerState = {
    selectedSource: 'usb_otg',
    selectedFolderId: null,
    currentVideoId: null,
    playbackMode: 'sequential',
    aspectRatio: 'fit',
    sortOption: 'name-asc',
    volume: 85,
    brightness: 95,
    reverseMuteHardware: true,
    allModeIncludedFolderIds: null,
    uiScaleLevel: 'default',
    colorTheme: 'automotive_blue',
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedPlayerState>;
    return {
      selectedSource: parsed.selectedSource ?? defaults.selectedSource,
      selectedFolderId:
        parsed.selectedFolderId !== undefined ? parsed.selectedFolderId : defaults.selectedFolderId,
      currentVideoId: parsed.currentVideoId ?? defaults.currentVideoId,
      playbackMode: parsed.playbackMode ?? defaults.playbackMode,
      aspectRatio: parsed.aspectRatio ?? defaults.aspectRatio,
      sortOption: parsed.sortOption ?? defaults.sortOption,
      volume: typeof parsed.volume === 'number' ? parsed.volume : defaults.volume,
      brightness: typeof parsed.brightness === 'number' ? parsed.brightness : defaults.brightness,
      reverseMuteHardware:
        typeof parsed.reverseMuteHardware === 'boolean'
          ? parsed.reverseMuteHardware
          : defaults.reverseMuteHardware,
      allModeIncludedFolderIds: Array.isArray(parsed.allModeIncludedFolderIds)
        ? parsed.allModeIncludedFolderIds
        : null,
      uiScaleLevel: parsed.uiScaleLevel ?? defaults.uiScaleLevel,
      colorTheme: parsed.colorTheme ?? defaults.colorTheme,
    };
  } catch {
    return defaults;
  }
}

export default function App() {
  const initialPrefs = useMemo(() => loadPersistedState(), []);

  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [selectedSource, setSelectedSource] = useState<StorageSource>(initialPrefs.selectedSource);
  // browsedFolderId: directory currently open in Split-Screen (null = root of selectedSource)
  const [browsedFolderId, setBrowsedFolderId] = useState<string | null>(initialPrefs.selectedFolderId);
  // playingFolderId: folder (or ALL_FOLDERS_ID) backing the active playback queue
  const [playingFolderId, setPlayingFolderId] = useState<string>(
    initialPrefs.selectedSource === 'all'
      ? ALL_FOLDERS_ID
      : initialPrefs.selectedFolderId ?? ALL_FOLDERS_ID
  );
  const [allModeIncludedFolderIds, setAllModeIncludedFolderIds] = useState<string[] | null>(
    initialPrefs.allModeIncludedFolderIds
  );
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(initialPrefs.currentVideoId);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(initialPrefs.playbackMode);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>(initialPrefs.aspectRatio);
  const [sortOption, setSortOption] = useState<SortOption>(initialPrefs.sortOption);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [volume, setVolume] = useState<number>(initialPrefs.volume);
  const [brightness, setBrightness] = useState<number>(initialPrefs.brightness);
  const [reverseMuteHardware] = useState<boolean>(initialPrefs.reverseMuteHardware);
  const [uiScaleLevel, setUiScaleLevel] = useState<UiScaleLevel>(initialPrefs.uiScaleLevel);
  const [colorTheme, setColorTheme] = useState<AppColorTheme>(initialPrefs.colorTheme);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const [viewMode, setViewMode] = useState<ViewMode>('fullscreen');
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const hideTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const shuffleHistoryRef = useRef<string[]>([]);

  const activeScalePreset = useMemo(() => getUiScalePreset(uiScaleLevel), [uiScaleLevel]);
  const activeColorPreset = useMemo(() => getColorThemePreset(colorTheme), [colorTheme]);

  // Apply dynamic theme CSS variables on :root so all views and modals update instantly
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ac-accent', activeColorPreset.accent);
    root.style.setProperty('--ac-accent-hover', activeColorPreset.accentHover);
    root.style.setProperty('--ac-accent-dark', activeColorPreset.accentDark);
    root.style.setProperty('--ac-accent-soft', activeColorPreset.accentSoft);
    root.style.setProperty('--ac-accent-border', activeColorPreset.accentBorder);
    root.style.setProperty('--ac-accent-text', activeColorPreset.accentText);
    root.style.setProperty('--ac-on-accent', activeColorPreset.onAccent);
  }, [activeColorPreset]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Combined virtual folder respecting the user's manual folder filter
  const allFoldersCombined = useMemo(
    () => buildCombinedFolder(folders, allModeIncludedFolderIds),
    [folders, allModeIncludedFolderIds]
  );

  // Folder currently open in the Split-Screen explorer (null = root directory of selectedSource)
  const browsedFolder: MediaFolder | null = useMemo(() => {
    if (selectedSource === 'all' || browsedFolderId === ALL_FOLDERS_ID) {
      return allFoldersCombined;
    }
    if (!browsedFolderId) return null;
    return folders.find((f) => f.id === browsedFolderId) ?? null;
  }, [allFoldersCombined, browsedFolderId, folders, selectedSource]);

  // Folder backing the active playback queue
  const playingFolder: MediaFolder | null = useMemo(() => {
    if (playingFolderId === ALL_FOLDERS_ID) {
      return allFoldersCombined;
    }
    return folders.find((f) => f.id === playingFolderId) ?? folders[0] ?? null;
  }, [allFoldersCombined, folders, playingFolderId]);

  // Sorted playlist for the active playback queue (Fullscreen / Next / Prev / Mini-Player)
  const sortedPlayingVideos = useMemo(
    () => (playingFolder ? sortMediaFiles(playingFolder.videos, sortOption) : []),
    [playingFolder, sortOption]
  );

  // Sorted & filtered videos shown in the Split-Screen right-hand explorer
  const sortedBrowsedVideos = useMemo(
    () => (browsedFolder ? sortMediaFiles(browsedFolder.videos, sortOption) : []),
    [browsedFolder, sortOption]
  );

  const visibleVideos = useMemo(
    () => filterMediaFiles(sortedBrowsedVideos, searchQuery),
    [sortedBrowsedVideos, searchQuery]
  );

  // Active video item & index inside the active playback queue
  const currentIndexInQueue = useMemo(() => {
    if (!currentVideoId) return sortedPlayingVideos.length > 0 ? 0 : -1;
    const idx = sortedPlayingVideos.findIndex((v) => v.id === currentVideoId);
    return idx >= 0 ? idx : sortedPlayingVideos.length > 0 ? 0 : -1;
  }, [sortedPlayingVideos, currentVideoId]);

  const currentVideo: VideoItem | null =
    currentIndexInQueue >= 0 ? sortedPlayingVideos[currentIndexInQueue] : null;

  const duration = currentVideo?.durationSec ?? 0;

  // Persist folder, manual All-Folders filter, playback mode, aspect ratio, sort, volume, brightness, UI scale & theme
  useEffect(() => {
    const payload: PersistedPlayerState = {
      selectedSource,
      selectedFolderId: browsedFolderId,
      currentVideoId: currentVideo?.id ?? null,
      playbackMode,
      aspectRatio,
      sortOption,
      volume,
      brightness,
      reverseMuteHardware,
      allModeIncludedFolderIds,
      uiScaleLevel,
      colorTheme,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* Storage quota safeguard */
    }
  }, [
    browsedFolderId,
    selectedSource,
    currentVideo?.id,
    playbackMode,
    aspectRatio,
    sortOption,
    volume,
    brightness,
    reverseMuteHardware,
    allModeIncludedFolderIds,
    uiScaleLevel,
    colorTheme,
  ]);

  // Auto-hide fullscreen controls after 4.5s of inactivity
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (viewMode === 'fullscreen' && isPlaying) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 4500);
    }
  }, [viewMode, isPlaying]);

  useEffect(() => {
    if (controlsVisible) {
      resetHideTimer();
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [controlsVisible, resetHideTimer]);

  // Persistent Foreground-Service-like playback timer (NEVER pauses in Split-Screen, PiP, or Reverse Camera!)
  const handleNext = useCallback(() => {
    if (sortedPlayingVideos.length === 0) return;

    if (playbackMode === 'shuffle') {
      const playlistIds = sortedPlayingVideos.map((v) => v.id);
      const result = advanceShuffleTrack(
        playlistIds,
        currentVideo?.id ?? null,
        shuffleHistoryRef.current
      );
      shuffleHistoryRef.current = result.history;
      if (result.nextVideoId) {
        setCurrentVideoId(result.nextVideoId);
        setCurrentTime(0);
        setIsPlaying(true);
      }
      return;
    }

    const nextIdx = getNextTrackIndex(currentIndexInQueue, sortedPlayingVideos.length, playbackMode);
    if (nextIdx >= 0) {
      setCurrentVideoId(sortedPlayingVideos[nextIdx].id);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [sortedPlayingVideos, currentVideo?.id, currentIndexInQueue, playbackMode]);

  const handlePrevious = useCallback(() => {
    if (sortedPlayingVideos.length === 0) return;

    if (playbackMode === 'shuffle') {
      const playlistIds = sortedPlayingVideos.map((v) => v.id);
      const result = goBackShuffleTrack(
        playlistIds,
        currentVideo?.id ?? null,
        shuffleHistoryRef.current
      );
      shuffleHistoryRef.current = result.history;
      if (result.nextVideoId) {
        setCurrentVideoId(result.nextVideoId);
        setCurrentTime(0);
        setIsPlaying(true);
      }
      return;
    }

    const prevIdx = getPreviousTrackIndex(currentIndexInQueue, sortedPlayingVideos.length);
    if (prevIdx >= 0) {
      setCurrentVideoId(sortedPlayingVideos[prevIdx].id);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [sortedPlayingVideos, currentVideo?.id, currentIndexInQueue, playbackMode]);

  useEffect(() => {
    // Only tick the simulated timer when playing non-local demo videos
    if (!isPlaying || !currentVideo || currentVideo.objectUrl) return;
    const id = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev + 1 >= currentVideo.durationSec) {
          // Advance according to playbackMode
          window.setTimeout(() => handleNext(), 0);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, currentVideo, handleNext]);

  const handleTogglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleSeek = useCallback((targetSec: number) => {
    const clamped = Math.min(Math.max(targetSec, 0), Math.max(duration, 0));
    setCurrentTime(clamped);
  }, [duration]);

  const handleCyclePlaybackMode = useCallback(() => {
    setPlaybackMode((prev) => {
      const next = cyclePlaybackMode(prev);
      if (next !== 'shuffle') {
        shuffleHistoryRef.current = [];
      }
      showToast(`Modo: ${PLAYBACK_MODE_LABELS[next]}`);
      return next;
    });
  }, [showToast]);

  const handleCycleAspectRatio = useCallback(() => {
    setAspectRatio((prev) => {
      const next = cycleAspectRatio(prev);
      showToast(`Proporção: ${ASPECT_RATIO_LABELS[next]}`);
      return next;
    });
  }, [showToast]);

  const handleSelectSource = useCallback(
    (source: StorageSource) => {
      if (source === 'all') {
        if (playingFolderId !== ALL_FOLDERS_ID) {
          shuffleHistoryRef.current = [];
        }
        setSelectedSource('all');
        setBrowsedFolderId(ALL_FOLDERS_ID);
        setPlayingFolderId(ALL_FOLDERS_ID);
        setSearchQuery('');
        const stillInAll =
          currentVideoId && allFoldersCombined.videos.some((v) => v.id === currentVideoId);
        if (!stillInAll && allFoldersCombined.videos.length > 0) {
          setCurrentVideoId(allFoldersCombined.videos[0].id);
          setCurrentTime(0);
          setIsPlaying(true);
        }
        showToast(`Todas as pastas (${allFoldersCombined.videos.length} vídeos)`);
        return;
      }

      setSelectedSource(source);
      setSearchQuery('');
      const rootFolders = folders.filter((f) => f.source === source && f.parentId === null);
      if (rootFolders.length > 1) {
        // Show the drive's root folder explorer so the driver can pick any folder/subfolder
        setBrowsedFolderId(null);
      } else if (rootFolders.length === 1) {
        setBrowsedFolderId(rootFolders[0].id);
      } else {
        setBrowsedFolderId(null);
      }
    },
    [allFoldersCombined.videos, currentVideoId, folders, showToast]
  );

  const handleOpenFolder = useCallback(
    (folderId: string | null) => {
      if (folderId === null) {
        setBrowsedFolderId(null);
        setSearchQuery('');
        return;
      }
      const target = folders.find((f) => f.id === folderId);
      if (!target) return;
      setSelectedSource(target.source);
      setBrowsedFolderId(target.id);
      setSearchQuery('');
    },
    [folders]
  );

  const handleNavigateUp = useCallback(() => {
    if (!browsedFolder || browsedFolder.source === 'all') return;
    setBrowsedFolderId(browsedFolder.parentId);
    setSearchQuery('');
  }, [browsedFolder]);

  const handleSelectVideo = useCallback(
    (video: VideoItem) => {
      const nextPlayingFolderId =
        selectedSource === 'all' || browsedFolderId === ALL_FOLDERS_ID
          ? ALL_FOLDERS_ID
          : browsedFolderId ?? playingFolderId;

      if (nextPlayingFolderId !== playingFolderId) {
        shuffleHistoryRef.current = [];
      } else if (
        playbackMode === 'shuffle' &&
        currentVideo?.id &&
        currentVideo.id !== video.id
      ) {
        shuffleHistoryRef.current = [...shuffleHistoryRef.current, currentVideo.id].slice(-200);
      }

      setPlayingFolderId(nextPlayingFolderId);
      setCurrentVideoId(video.id);
      setCurrentTime(0);
      setIsPlaying(true);
    },
    [browsedFolderId, currentVideo?.id, playbackMode, playingFolderId, selectedSource]
  );

  const handleApplyAllModeFilter = useCallback(
    (selectedIds: string[]) => {
      const normalized = selectedIds.length === folders.length ? null : selectedIds;
      setAllModeIncludedFolderIds(normalized);
      setSelectedSource('all');
      setBrowsedFolderId(ALL_FOLDERS_ID);
      setPlayingFolderId(ALL_FOLDERS_ID);
      setSearchQuery('');

      const nextCombined = buildCombinedFolder(folders, normalized);
      const stillIncluded =
        currentVideoId && nextCombined.videos.some((v) => v.id === currentVideoId);
      if (!stillIncluded) {
        const first = nextCombined.videos[0] ?? null;
        setCurrentVideoId(first?.id ?? null);
        setCurrentTime(0);
        setIsPlaying(Boolean(first));
      }

      showToast(
        `Filtro aplicado: ${selectedIds.length} pasta(s) · ${nextCombined.videos.length} vídeos`
      );
    },
    [currentVideoId, folders, showToast]
  );

  const handleCycleSort = useCallback(() => {
    const order: SortOption[] = ['name-asc', 'name-desc', 'date-desc'];
    setSortOption((prev) => {
      const next = order[(order.indexOf(prev) + 1) % order.length];
      showToast(`Ordenação: ${SORT_OPTION_LABELS[next]}`);
      return next;
    });
  }, [showToast]);

  const handleRefreshFolder = useCallback(() => {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setIsRefreshing(false);
      if (selectedSource === 'all') {
        showToast(`Todas as pastas atualizadas (${allFoldersCombined.videos.length} vídeos)`);
      } else {
        const count = browsedFolder?.videos.length ?? 0;
        showToast(`Armazenamento atualizado (${count} vídeos)`);
      }
    }, 350);
  }, [allFoldersCombined.videos.length, browsedFolder, selectedSource, showToast]);

  const handleDeleteVideo = useCallback(
    (videoId: string) => {
      const deletingCurrent = currentVideo?.id === videoId;
      const nextFallbackId = deletingCurrent
        ? sortedPlayingVideos.find((v) => v.id !== videoId)?.id ?? null
        : currentVideoId;

      setFolders((prev) =>
        prev.map((folder) => {
          if (!folder.videos.some((v) => v.id === videoId)) return folder;
          return { ...folder, videos: folder.videos.filter((v) => v.id !== videoId) };
        })
      );

      if (deletingCurrent) {
        setCurrentVideoId(nextFallbackId);
        setCurrentTime(0);
        if (!nextFallbackId) setIsPlaying(false);
      }
      showToast('Arquivo excluído da pasta');
    },
    [currentVideo?.id, currentVideoId, showToast, sortedPlayingVideos]
  );

  // Keyboard shortcuts for desktop testing & steering-wheel media keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlayPause();
      } else if (e.code === 'ArrowRight') {
        handleSeek(currentTime + 10);
      } else if (e.code === 'ArrowLeft') {
        handleSeek(currentTime - 10);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlayPause, handleSeek, currentTime]);

  const sharedVideoStage = (compact: boolean, enableGestures: boolean) => (
    <VideoStage
      video={currentVideo}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      aspectRatio={aspectRatio}
      brightness={brightness}
      volume={volume}
      effectiveVolume={volume}
      enableGestures={enableGestures}
      compact={compact}
      onTapStage={() => {
        if (viewMode === 'fullscreen') {
          setControlsVisible((v) => !v);
        }
      }}
      onSeekCommit={(targetSec) => {
        handleSeek(targetSec);
      }}
      onVolumeChange={(nextVol) => setVolume(nextVol)}
      onBrightnessChange={(nextBri) => setBrightness(nextBri)}
      onVideoTimeSync={(t, dur) => {
        setCurrentTime(t);
        if (currentVideo?.objectUrl && Math.abs(currentVideo.durationSec - dur) > 1) {
          setFolders((prev) =>
            prev.map((f) =>
              f.videos.some((v) => v.id === currentVideo.id)
                ? {
                    ...f,
                    videos: f.videos.map((v) =>
                      v.id === currentVideo.id ? { ...v, durationSec: Math.round(dur) } : v
                    ),
                  }
                : f
            )
          );
        }
      }}
      onVideoEnded={handleNext}
    />
  );

  return (
    <div
      data-testid="autocine-app"
      data-view-mode={viewMode}
      data-playing={isPlaying ? 'true' : 'false'}
      data-ui-scale={uiScaleLevel}
      data-color-theme={colorTheme}
      className="relative w-screen h-screen bg-[#07090D] overflow-hidden select-none"
    >
      <div
        className="w-full h-full"
        style={{ zoom: activeScalePreset.scaleFactor }}
      >
        {/* MODE 1: FULLSCREEN IMMERSIVE PLAYER */}
        {viewMode === 'fullscreen' && (
          <div className="relative w-full h-full">
            {sharedVideoStage(false, true)}

            <FullScreenControls
              visible={controlsVisible}
              video={currentVideo}
              currentIndex={currentIndexInQueue}
              totalVideos={sortedPlayingVideos.length}
              isAllFoldersMode={playingFolderId === ALL_FOLDERS_ID}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              playbackMode={playbackMode}
              aspectRatio={aspectRatio}
              volume={volume}
              brightness={brightness}
              onTogglePlayPause={handleTogglePlayPause}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onSeek={handleSeek}
              onCyclePlaybackMode={handleCyclePlaybackMode}
              onCycleAspectRatio={handleCycleAspectRatio}
              onOpenSplitList={() => setViewMode('split')}
              onEnterPip={() => setViewMode('pip')}
              onResetHideTimer={resetHideTimer}
            />
          </div>
        )}

        {/* MODE 2: SPLIT-SCREEN MINI-PLAYER + HIERARCHICAL FOLDER EXPLORER */}
        {viewMode === 'split' && (
          <SplitScreenView
            folders={folders}
            selectedSource={selectedSource}
            browsedFolder={browsedFolder}
            allModeIncludedFolderIds={allModeIncludedFolderIds}
            totalAllFoldersVideos={allFoldersCombined.videos.length}
            visibleVideos={visibleVideos}
            currentVideo={currentVideo}
            totalVideosInBrowsedFolder={sortedBrowsedVideos.length}
            isPlaying={isPlaying}
            sortOption={sortOption}
            searchQuery={searchQuery}
            isRefreshing={isRefreshing}
            miniPlayerNode={sharedVideoStage(true, false)}
            onSelectSource={handleSelectSource}
            onOpenFolder={handleOpenFolder}
            onNavigateUp={handleNavigateUp}
            onApplyAllModeFilter={handleApplyAllModeFilter}
            onSelectVideo={handleSelectVideo}
            onReturnFullscreen={() => {
              setViewMode('fullscreen');
              setControlsVisible(true);
            }}
            onTogglePlayPause={handleTogglePlayPause}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onEnterPip={() => setViewMode('pip')}
            onSearchChange={setSearchQuery}
            onRefreshFolder={handleRefreshFolder}
            onOpenSettings={() => setSettingsOpen(true)}
            onCycleSort={handleCycleSort}
            onDeleteVideo={handleDeleteVideo}
          />
        )}

        {/* MODE 3: PICTURE-IN-PICTURE (PiP) OVER NAVIGATION */}
        {viewMode === 'pip' && (
          <PipModeView
            video={currentVideo}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            pipVideoNode={sharedVideoStage(true, false)}
            onTogglePlayPause={handleTogglePlayPause}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onExpandFullscreen={() => {
              setViewMode('fullscreen');
              setControlsVisible(true);
            }}
          />
        )}

        {/* SETTINGS MODAL (UI Scale + Color Theme) */}
        {settingsOpen && (
          <SettingsModal
            uiScaleLevel={uiScaleLevel}
            colorTheme={colorTheme}
            onSelectUiScale={(scale) => {
              setUiScaleLevel(scale);
              showToast(`Tamanho da interface: ${getUiScalePreset(scale).label}`);
            }}
            onSelectColorTheme={(theme) => {
              setColorTheme(theme);
              showToast(`Tema: ${getColorThemePreset(theme).label}`);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* CLEAN AUTOMOTIVE FEEDBACK TOAST */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-[#0D1320]/95 backdrop-blur-md border border-white/15 px-5 py-2.5 text-sm font-medium text-white shadow-2xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
