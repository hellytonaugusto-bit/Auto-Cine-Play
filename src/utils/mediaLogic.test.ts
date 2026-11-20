import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FOLDERS_ID,
  advanceShuffleTrack,
  buildCombinedFolder,
  countVideosRecursive,
  cycleAspectRatio,
  cyclePlaybackMode,
  filterMediaFiles,
  formatTime,
  formatTrackIndex,
  getChildFolders,
  getFolderBreadcrumbs,
  getFoldersInTreeOrder,
  getFolderSubtreeIds,
  getNextTrackIndex,
  getPreviousTrackIndex,
  goBackShuffleTrack,
  isSupportedVideoFile,
  normalizeForSearch,
  sortMediaFiles,
} from './mediaLogic';
import type { MediaFolder, VideoItem } from '../types/media';

function makeVideo(id: string, name: string, modifiedAt: number): VideoItem {
  return {
    id,
    name,
    extension: name.slice(name.lastIndexOf('.')),
    durationSec: 200,
    modifiedAt,
    sizeMb: 150,
    resolution: '1920×1080',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    decoder: 'HW',
    posterUrl: '',
    accentColor: '#38bdf8',
  };
}

const TEST_FOLDERS: MediaFolder[] = [
  {
    id: 'usb-shows',
    name: 'Shows & Clipes',
    path: '/storage/USB_OTG/Shows & Clipes',
    source: 'usb_otg',
    parentId: null,
    videos: [
      makeVideo('v1', 'pagode e forró.mp4', 1763400000000),
      makeVideo('v2', 'São João Ao Vivo 4K.mkv', 1763300000000),
      makeVideo('v3', 'Acústico MPB Sessão Completa.mp4', 1763200000000),
      makeVideo('v4', 'Serra da Mantiqueira Drone HDR.webm', 1763100000000),
      makeVideo('v5', 'Viagem Costa Verde Ao Entardecer.wmv', 1763000000000),
    ],
  },
  {
    id: 'usb-shows-pagode',
    name: 'Pagode & Samba',
    path: '/storage/USB_OTG/Shows & Clipes/Pagode & Samba',
    source: 'usb_otg',
    parentId: 'usb-shows',
    videos: [
      makeVideo('v6', 'Pagode Anos 90.mkv', 1763250000000),
      makeVideo('v7', 'Roda de Samba.mp4', 1763210000000),
    ],
  },
  {
    id: 'usb-shows-sertanejo',
    name: 'Sertanejo & Modão',
    path: '/storage/USB_OTG/Shows & Clipes/Sertanejo & Modão',
    source: 'usb_otg',
    parentId: 'usb-shows',
    videos: [makeVideo('v8', 'Modão Viola.mp4', 1763220000000)],
  },
  {
    id: 'usb-shows-sertanejo-2026',
    name: 'Ao Vivo 2026',
    path: '/storage/USB_OTG/Shows & Clipes/Sertanejo & Modão/Ao Vivo 2026',
    source: 'usb_otg',
    parentId: 'usb-shows-sertanejo',
    videos: [makeVideo('v9', 'Arena Sertaneja 2026.mkv', 1763290000000)],
  },
  {
    id: 'usb-estrada',
    name: 'Clipes Estrada',
    path: '/storage/USB_OTG/Clipes Estrada',
    source: 'usb_otg',
    parentId: null,
    videos: [makeVideo('v10', 'Serra do Mar 4K.mp4', 1763150000000)],
  },
  {
    id: 'sd-viagens-4k',
    name: '4K Viagens',
    path: '/storage/SD_CARD/4K Viagens',
    source: 'sd_card',
    parentId: null,
    videos: [makeVideo('v11', 'Serra do Rio do Rastro.mkv', 1763180000000)],
  },
];

test('normalizeForSearch strips diacritics and lowercases text', () => {
  assert.equal(normalizeForSearch('pagode e forró.mp4'), 'pagode e forro.mp4');
  assert.equal(normalizeForSearch('São João Ao Vivo 4K.mkv'), 'sao joao ao vivo 4k.mkv');
  assert.equal(normalizeForSearch('  ACÚSTICO  '), 'acustico');
});

test('filterMediaFiles matches partial substrings ignoring case and accents', () => {
  const videos = TEST_FOLDERS[0].videos;
  const godeMatches = filterMediaFiles(videos, 'gode');
  assert.equal(godeMatches.length, 1);
  assert.equal(godeMatches[0].name, 'pagode e forró.mp4');

  const forroMatches = filterMediaFiles(videos, 'FORRO');
  assert.equal(forroMatches.length, 1);
  assert.equal(forroMatches[0].name, 'pagode e forró.mp4');

  const saoMatches = filterMediaFiles(videos, 'sao');
  assert.equal(saoMatches.length, 2); // matches "São João..." and "Sessão..."

  const joaoMatches = filterMediaFiles(videos, 'joao');
  assert.equal(joaoMatches.length, 1);
  assert.equal(joaoMatches[0].name, 'São João Ao Vivo 4K.mkv');
});

test('sortMediaFiles sorts by name-asc, name-desc, and date-desc', () => {
  const videos = TEST_FOLDERS[0].videos;
  const asc = sortMediaFiles(videos, 'name-asc');
  const desc = sortMediaFiles(videos, 'name-desc');
  const newest = sortMediaFiles(videos, 'date-desc');

  assert.equal(asc[0].name, 'Acústico MPB Sessão Completa.mp4');
  assert.equal(desc[0].name, 'Viagem Costa Verde Ao Entardecer.wmv');
  assert.ok(newest[0].modifiedAt >= newest[1].modifiedAt);
  assert.ok(newest[1].modifiedAt >= newest[newest.length - 1].modifiedAt);
});

test('cycleAspectRatio loops through all 5 requested modes', () => {
  assert.equal(cycleAspectRatio('fit'), 'fill');
  assert.equal(cycleAspectRatio('fill'), 'stretch');
  assert.equal(cycleAspectRatio('stretch'), '16:9');
  assert.equal(cycleAspectRatio('16:9'), '4:3');
  assert.equal(cycleAspectRatio('4:3'), 'fit');
});

test('cyclePlaybackMode loops through sequential, shuffle, repeat-one', () => {
  assert.equal(cyclePlaybackMode('sequential'), 'shuffle');
  assert.equal(cyclePlaybackMode('shuffle'), 'repeat-one');
  assert.equal(cyclePlaybackMode('repeat-one'), 'sequential');
});

test('getNextTrackIndex and getPreviousTrackIndex behave across modes', () => {
  assert.equal(getNextTrackIndex(0, 5, 'sequential'), 1);
  assert.equal(getNextTrackIndex(4, 5, 'sequential'), 0);
  assert.equal(getNextTrackIndex(2, 5, 'repeat-one'), 2);
  assert.equal(getNextTrackIndex(2, 5, 'shuffle', () => 0.41), 3); // avoids repeating index 2
  assert.equal(getPreviousTrackIndex(0, 5), 4);
  assert.equal(getPreviousTrackIndex(3, 5), 2);
});

test('supported video extensions include all critical libVLC containers', () => {
  for (const ext of ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.mpg', '.3gp']) {
    assert.equal(isSupportedVideoFile(`video_test${ext}`), true);
  }
  assert.equal(isSupportedVideoFile('document.pdf'), false);
});

test('formatTime and formatTrackIndex format cleanly', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(84), '01:24');
  assert.equal(formatTime(3665), '01:01:05');
  assert.equal(formatTrackIndex(2, 45), '03/45');
  assert.equal(formatTrackIndex(0, 8), '01/08');
});

test('buildCombinedFolder aggregates all folders or a manual subset cleanly', () => {
  const combinedAll = buildCombinedFolder(TEST_FOLDERS);
  const expectedTotal = TEST_FOLDERS.reduce((acc, f) => acc + f.videos.length, 0);

  assert.equal(combinedAll.id, ALL_FOLDERS_ID);
  assert.equal(combinedAll.source, 'all');
  assert.equal(combinedAll.videos.length, expectedTotal);
  assert.equal(combinedAll.videos[0].folderName, TEST_FOLDERS[0].name);

  // Manual subset selection: only Pagode & Samba (2) + 4K Viagens (1) = 3 videos
  const subset = buildCombinedFolder(TEST_FOLDERS, ['usb-shows-pagode', 'sd-viagens-4k']);
  assert.equal(subset.videos.length, 3);
  assert.ok(subset.path.includes('2 de'));

  // Empty manual subset returns 0 videos safely
  const emptySubset = buildCombinedFolder(TEST_FOLDERS, []);
  assert.equal(emptySubset.videos.length, 0);

  // Cross-folder partial search: "serra" matches videos across multiple folders
  const serraMatches = filterMediaFiles(combinedAll.videos, 'serra');
  assert.equal(serraMatches.length, 3);
  const matchedFolders = new Set(serraMatches.map((v) => v.folderName));
  assert.equal(matchedFolders.size, 3);

  // Deduplication safeguard
  const duplicated = buildCombinedFolder([TEST_FOLDERS[0], TEST_FOLDERS[0]]);
  assert.equal(duplicated.videos.length, TEST_FOLDERS[0].videos.length);
});

test('hierarchical folder navigation returns child subfolders, breadcrumbs, tree order, and recursive counts', () => {
  // Root folders inside Pen Drive (usb_otg)
  const usbRoots = getChildFolders(TEST_FOLDERS, 'usb_otg', null);
  assert.deepEqual(
    usbRoots.map((f) => f.id),
    ['usb-shows', 'usb-estrada']
  );

  // Subfolders inside Shows & Clipes
  const showChildren = getChildFolders(TEST_FOLDERS, 'usb_otg', 'usb-shows');
  assert.deepEqual(
    showChildren.map((f) => f.id),
    ['usb-shows-pagode', 'usb-shows-sertanejo']
  );

  // Breadcrumbs for 3-level deep subfolder: Shows & Clipes > Sertanejo & Modão > Ao Vivo 2026
  const crumbs = getFolderBreadcrumbs(TEST_FOLDERS, 'usb-shows-sertanejo-2026');
  assert.deepEqual(
    crumbs.map((f) => f.name),
    ['Shows & Clipes', 'Sertanejo & Modão', 'Ao Vivo 2026']
  );

  // Subtree IDs and recursive video count for Shows & Clipes (5 direct + 2 + 1 + 1 = 9)
  assert.equal(getFolderSubtreeIds(TEST_FOLDERS, 'usb-shows').length, 4);
  assert.equal(countVideosRecursive(TEST_FOLDERS, 'usb-shows'), 9);

  // Tree order preserves depth indentation for the filter modal
  const tree = getFoldersInTreeOrder(TEST_FOLDERS, 'usb_otg');
  const deepNode = tree.find((entry) => entry.folder.id === 'usb-shows-sertanejo-2026');
  assert.equal(deepNode?.depth, 2);
});

test('shuffle history advances randomly and returns to exact previously played random files on back', () => {
  const playlist = ['v1', 'v2', 'v3', 'v4', 'v5'];

  // Start at v1, advance 3 times with deterministic random picks
  const step1 = advanceShuffleTrack(playlist, 'v1', [], () => 0.6); // pool [v2,v3,v4,v5] -> v4
  assert.equal(step1.nextVideoId, 'v4');
  assert.deepEqual(step1.history, ['v1']);

  const step2 = advanceShuffleTrack(playlist, step1.nextVideoId, step1.history, () => 0.1); // pool [v2,v3,v5] -> v2
  assert.equal(step2.nextVideoId, 'v2');
  assert.deepEqual(step2.history, ['v1', 'v4']);

  const step3 = advanceShuffleTrack(playlist, step2.nextVideoId, step2.history, () => 0.9); // pool [v3,v5] -> v5
  assert.equal(step3.nextVideoId, 'v5');
  assert.deepEqual(step3.history, ['v1', 'v4', 'v2']);

  // Go back step by step: v5 -> v2 -> v4 -> v1
  const back1 = goBackShuffleTrack(playlist, step3.nextVideoId, step3.history);
  assert.equal(back1.nextVideoId, 'v2');
  assert.deepEqual(back1.history, ['v1', 'v4']);

  const back2 = goBackShuffleTrack(playlist, back1.nextVideoId, back1.history);
  assert.equal(back2.nextVideoId, 'v4');
  assert.deepEqual(back2.history, ['v1']);

  const back3 = goBackShuffleTrack(playlist, back2.nextVideoId, back2.history);
  assert.equal(back3.nextVideoId, 'v1');
  assert.deepEqual(back3.history, []);

  // Going back when history is empty falls back cleanly without crashing
  const backFallback = goBackShuffleTrack(playlist, back3.nextVideoId, back3.history);
  assert.equal(backFallback.nextVideoId, 'v5');
  assert.deepEqual(backFallback.history, []);

  // Deleted track in history is skipped safely
  const filteredPlaylist = ['v1', 'v3', 'v5'];
  const backAfterDelete = goBackShuffleTrack(filteredPlaylist, 'v5', ['v1', 'v4', 'v2']);
  assert.equal(backAfterDelete.nextVideoId, 'v1');
});

