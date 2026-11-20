import type { AspectRatioMode, MediaFolder, PlaybackMode, SortOption, StorageSource, VideoItem } from '../types/media';

export const ALL_FOLDERS_ID = '__all_folders__';

export const STORAGE_SOURCE_LABELS: Record<Exclude<StorageSource, 'all'>, string> = {
  usb_otg: 'Pen Drive (USB)',
  sd_card: 'Cartão SD',
  internal: 'Memória Interna',
  local_picked: 'Arquivos Locais',
};

/**
 * Returns direct child folders under a given parentId (or root folders when parentId === null)
 * within a specific storage source.
 */
export function getChildFolders(
  folders: MediaFolder[],
  source: StorageSource,
  parentId: string | null
): MediaFolder[] {
  return folders.filter((f) => f.source === source && f.parentId === parentId);
}

/**
 * Returns the breadcrumb chain from root down to the target folderId.
 */
export function getFolderBreadcrumbs(
  folders: MediaFolder[],
  folderId: string | null
): MediaFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: MediaFolder[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Computes nesting depth (0 for root folder, 1 for subfolder, 2 for sub-subfolder, etc.)
 */
export function getFolderDepth(folders: MediaFolder[], folderId: string): number {
  return Math.max(0, getFolderBreadcrumbs(folders, folderId).length - 1);
}

/**
 * Returns a folder's ID plus all nested descendant subfolder IDs.
 */
export function getFolderSubtreeIds(folders: MediaFolder[], folderId: string): string[] {
  const result: string[] = [folderId];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const f of folders) {
      if (f.parentId === currentId && !result.includes(f.id)) {
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}

/**
 * Counts total videos inside a folder and all its nested subfolders.
 */
export function countVideosRecursive(folders: MediaFolder[], folderId: string): number {
  const ids = new Set(getFolderSubtreeIds(folders, folderId));
  return folders.reduce((sum, f) => (ids.has(f.id) ? sum + f.videos.length : sum), 0);
}

/**
 * Orders folders inside a storage source in depth-first tree order for clear UI indentation.
 */
export function getFoldersInTreeOrder(
  folders: MediaFolder[],
  source: StorageSource
): { folder: MediaFolder; depth: number }[] {
  const sourceFolders = folders.filter((f) => f.source === source);
  const result: { folder: MediaFolder; depth: number }[] = [];

  const visit = (parentId: string | null, depth: number) => {
    const children = sourceFolders.filter((f) => f.parentId === parentId);
    for (const child of children) {
      result.push({ folder: child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit(null, 0);
  return result;
}

/**
 * Aggregates videos from either all folders or a user-selected subset of folders
 * into a single unified playlist, annotating each video with its origin folder name.
 */
export function buildCombinedFolder(
  folders: MediaFolder[],
  includedFolderIds?: string[] | null
): MediaFolder {
  const allowedSet =
    includedFolderIds === undefined || includedFolderIds === null
      ? null
      : new Set(includedFolderIds);

  const selectedFolders = allowedSet
    ? folders.filter((f) => allowedSet.has(f.id))
    : folders;

  const seenIds = new Set<string>();
  const combinedVideos: VideoItem[] = [];

  for (const folder of selectedFolders) {
    for (const video of folder.videos) {
      if (seenIds.has(video.id)) continue;
      seenIds.add(video.id);
      combinedVideos.push({
        ...video,
        folderName: video.folderName ?? folder.name,
      });
    }
  }

  const isAllSelected = selectedFolders.length === folders.length;
  const pathSummary = isAllSelected
    ? `${folders.length} pastas selecionadas · Todos os armazenamentos`
    : selectedFolders.length === 0
      ? 'Nenhuma pasta selecionada — toque em Filtrar Pastas'
      : `${selectedFolders.length} de ${folders.length} pastas selecionadas`;

  return {
    id: ALL_FOLDERS_ID,
    name: 'Todas as Pastas',
    path: pathSummary,
    source: 'all',
    parentId: null,
    videos: combinedVideos,
  };
}

export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.ts',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.m4v',
  '.vob',
] as const;

export const ASPECT_RATIO_ORDER: readonly AspectRatioMode[] = [
  'fit',
  'fill',
  'stretch',
  '16:9',
  '4:3',
];

export const PLAYBACK_MODE_ORDER: readonly PlaybackMode[] = [
  'sequential',
  'shuffle',
  'repeat-one',
];

export const ASPECT_RATIO_LABELS: Record<AspectRatioMode, string> = {
  fit: 'Ajustar',
  fill: 'Preencher',
  stretch: 'Esticar',
  '16:9': '16:9',
  '4:3': '4:3',
};

export const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  sequential: 'Sequencial',
  shuffle: 'Aleatório',
  'repeat-one': 'Repetir',
};

export const SORT_OPTION_LABELS: Record<SortOption, string> = {
  'name-asc': 'Nome (A–Z)',
  'name-desc': 'Nome (Z–A)',
  'date-desc': 'Mais recentes',
};

/**
 * Strips diacritics (accents) and lowercases text for substring search.
 * Mirrors Kotlin's Normalizer.normalize(input, Normalizer.Form.NFD).
 * Example: normalizeForSearch("pagode e forró.mp4") -> "pagode e forro.mp4"
 */
export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isSupportedVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function filterMediaFiles(files: VideoItem[], query: string): VideoItem[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return files;
  return files.filter((file) =>
    normalizeForSearch(file.name).includes(normalizedQuery)
  );
}

export function sortMediaFiles(files: VideoItem[], sortOption: SortOption): VideoItem[] {
  const copy = [...files];
  switch (sortOption) {
    case 'name-asc':
      return copy.sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })
      );
    case 'name-desc':
      return copy.sort((a, b) =>
        b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base', numeric: true })
      );
    case 'date-desc':
      return copy.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }
}

export function cyclePlaybackMode(current: PlaybackMode): PlaybackMode {
  const idx = PLAYBACK_MODE_ORDER.indexOf(current);
  return PLAYBACK_MODE_ORDER[(idx + 1) % PLAYBACK_MODE_ORDER.length];
}

export function cycleAspectRatio(current: AspectRatioMode): AspectRatioMode {
  const idx = ASPECT_RATIO_ORDER.indexOf(current);
  return ASPECT_RATIO_ORDER[(idx + 1) % ASPECT_RATIO_ORDER.length];
}

export function getNextTrackIndex(
  currentIndex: number,
  total: number,
  mode: PlaybackMode,
  randomFn: () => number = Math.random
): number {
  if (total <= 0) return -1;
  if (total === 1) return 0;

  if (mode === 'repeat-one') {
    return currentIndex;
  }

  if (mode === 'shuffle') {
    let candidate = Math.floor(randomFn() * total);
    if (candidate === currentIndex) {
      candidate = (candidate + 1) % total;
    }
    return candidate;
  }

  return (currentIndex + 1) % total;
}

export function getPreviousTrackIndex(currentIndex: number, total: number): number {
  if (total <= 0) return -1;
  if (total === 1) return 0;
  return (currentIndex - 1 + total) % total;
}

export interface ShuffleStepResult {
  nextVideoId: string | null;
  history: string[];
}

/**
 * Advances to a random track in Shuffle mode while recording currentVideoId in the back-history stack.
 * Prefers tracks not played recently in the current cycle so random navigation feels fresh,
 * and never repeats currentVideoId when the playlist has more than 1 file.
 */
export function advanceShuffleTrack(
  playlistIds: string[],
  currentVideoId: string | null,
  history: string[],
  randomFn: () => number = Math.random
): ShuffleStepResult {
  if (playlistIds.length === 0) return { nextVideoId: null, history: [] };
  if (playlistIds.length === 1) return { nextVideoId: playlistIds[0], history: [] };

  const validSet = new Set(playlistIds);
  const cleanedHistory = history.filter((id) => validSet.has(id));
  const nextHistory =
    currentVideoId && validSet.has(currentVideoId)
      ? [...cleanedHistory, currentVideoId].slice(-200)
      : cleanedHistory;

  const recentWindow = new Set(nextHistory.slice(-(playlistIds.length - 1)));
  if (currentVideoId) recentWindow.add(currentVideoId);

  let pool = playlistIds.filter((id) => !recentWindow.has(id));
  if (pool.length === 0) {
    pool = playlistIds.filter((id) => id !== currentVideoId);
  }
  if (pool.length === 0) {
    pool = playlistIds;
  }

  const pickIdx = Math.min(pool.length - 1, Math.floor(randomFn() * pool.length));
  return {
    nextVideoId: pool[pickIdx],
    history: nextHistory,
  };
}

/**
 * Steps backward in Shuffle mode by popping the previously played random track from history.
 * Skips removed/duplicate IDs and falls back to playlist-order previous when history is empty.
 */
export function goBackShuffleTrack(
  playlistIds: string[],
  currentVideoId: string | null,
  history: string[]
): ShuffleStepResult {
  if (playlistIds.length === 0) return { nextVideoId: null, history: [] };
  if (playlistIds.length === 1) return { nextVideoId: playlistIds[0], history: [] };

  const validSet = new Set(playlistIds);
  const remaining = history.filter((id) => validSet.has(id));

  while (remaining.length > 0) {
    const prevId = remaining.pop()!;
    if (prevId !== currentVideoId) {
      return {
        nextVideoId: prevId,
        history: remaining,
      };
    }
  }

  const currentIdx = currentVideoId ? playlistIds.indexOf(currentVideoId) : 0;
  const fallbackIdx = getPreviousTrackIndex(currentIdx >= 0 ? currentIdx : 0, playlistIds.length);
  return {
    nextVideoId: playlistIds[fallbackIdx] ?? null,
    history: [],
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export function formatTrackIndex(index: number, total: number): string {
  const safeTotal = Math.max(total, 0);
  const padLen = Math.max(2, String(safeTotal).length);
  const displayIndex = safeTotal === 0 ? 0 : Math.min(Math.max(index + 1, 1), safeTotal);
  return `${String(displayIndex).padStart(padLen, '0')}/${String(safeTotal).padStart(padLen, '0')}`;
}

export function formatDateShort(epochMs: number): string {
  const d = new Date(epochMs);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
