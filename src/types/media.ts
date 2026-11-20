export type StorageSource = 'all' | 'usb_otg' | 'sd_card' | 'internal' | 'local_picked';

export type AspectRatioMode = 'fit' | 'fill' | 'stretch' | '16:9' | '4:3';

export type PlaybackMode = 'sequential' | 'shuffle' | 'repeat-one';

export type SortOption = 'name-asc' | 'name-desc' | 'date-desc';

export type AudioFocusState = 'gained' | 'ducked' | 'lost';

export type GestureType = 'seek' | 'volume' | 'brightness';

export type ViewMode = 'fullscreen' | 'split' | 'pip';

export interface VideoItem {
  id: string;
  name: string;
  extension: string;
  durationSec: number;
  modifiedAt: number; // epoch ms
  sizeMb: number;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  decoder: 'HW' | 'SW';
  posterUrl: string;
  objectUrl?: string; // Present when loaded from user's real local disk/USB
  accentColor: string;
  folderName?: string; // Populated when aggregating all folders together
}

export interface MediaFolder {
  id: string;
  name: string;
  path: string;
  source: StorageSource;
  parentId: string | null;
  videos: VideoItem[];
}

export interface PersistedPlayerState {
  selectedSource: StorageSource;
  selectedFolderId: string | null;
  currentVideoId: string | null;
  playbackMode: PlaybackMode;
  aspectRatio: AspectRatioMode;
  sortOption: SortOption;
  volume: number;
  brightness: number;
  reverseMuteHardware: boolean;
  allModeIncludedFolderIds: string[] | null; // null = all folders included by default
}

export interface ActiveGestureHUD {
  type: GestureType;
  value: number; // 0..100 for volume/brightness, targetTime (sec) for seek
  deltaSeconds?: number;
  durationSec?: number;
}
