import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZipBytes } from './zipBuilder';
import { ANDROID_PROJECT_FILES } from './index';

test('buildZipBytes produces valid PKZIP archive with local headers and EOCD', () => {
  const bytes = buildZipBytes(
    ANDROID_PROJECT_FILES.map((f) => ({
      path: `AutoCinePlayer/${f.path}`,
      content: f.content,
      executable: f.executable,
    }))
  );

  // Local file header signature: PK\x03\x04
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);

  // End of Central Directory record at tail (last 22 bytes): PK\x05\x06
  const eocdOffset = bytes.length - 22;
  assert.equal(bytes[eocdOffset], 0x50);
  assert.equal(bytes[eocdOffset + 1], 0x4b);
  assert.equal(bytes[eocdOffset + 2], 0x05);
  assert.equal(bytes[eocdOffset + 3], 0x06);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint16(eocdOffset + 8, true), ANDROID_PROJECT_FILES.length);
});

test('Android Kotlin project bundle includes all required architectural files and settings', () => {
  const byPath = new Map(ANDROID_PROJECT_FILES.map((f) => [f.path, f.content]));

  // Requirement 8: GitHub Actions JDK 17 + ./gradlew assembleDebug + ABI split APKs
  const workflow = byPath.get('.github/workflows/build-apk.yml');
  assert.ok(workflow, 'build-apk.yml must exist');
  assert.match(workflow, /java-version:\s*'17'/);
  assert.match(workflow, /\.\/gradlew assembleDebug/);
  assert.match(workflow, /app\/build\/outputs\/apk\/debug\/\*\.apk/);

  // Requirement 1 & 2: minSdk 24, targetSdk 35, ABI splits, libvlc-all
  const appGradle = byPath.get('app/build.gradle.kts');
  assert.ok(appGradle, 'app/build.gradle.kts must exist');
  assert.match(appGradle, /minSdk = 24/);
  assert.match(appGradle, /targetSdk = 35/);
  assert.match(appGradle, /include\("armeabi-v7a", "arm64-v8a"\)/);
  assert.match(appGradle, /org\.videolan\.android:libvlc-all/);

  // Requirement 1 & 3: Landscape, PiP, Foreground Service mediaPlayback, Android 7-15 storage permissions & Adaptive Icon
  const manifest = byPath.get('app/src/main/AndroidManifest.xml');
  assert.ok(manifest, 'AndroidManifest.xml must exist');
  assert.match(manifest, /android:screenOrientation="sensorLandscape"/);
  assert.match(manifest, /android:supportsPictureInPicture="true"/);
  assert.match(manifest, /android:foregroundServiceType="mediaPlayback"/);
  assert.match(manifest, /READ_EXTERNAL_STORAGE/);
  assert.match(manifest, /WRITE_EXTERNAL_STORAGE/);
  assert.match(manifest, /MANAGE_EXTERNAL_STORAGE/);
  assert.match(manifest, /READ_MEDIA_VIDEO/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(manifest, /RECEIVE_BOOT_COMPLETED/);
  assert.match(manifest, /\.receiver\.BootReceiver/);
  assert.match(manifest, /WRITE_SETTINGS/);

  // Requirement: BootReceiver launches MainActivity when startOnBoot is enabled
  const bootReceiverKt = byPath.get('app/src/main/java/com/autocine/player/receiver/BootReceiver.kt');
  assert.ok(bootReceiverKt, 'BootReceiver.kt must exist');
  assert.match(bootReceiverKt, /isStartOnBootEnabledSync/);
  assert.match(bootReceiverKt, /FLAG_ACTIVITY_NEW_TASK/);

  // Requirement: Unified awaitEachGesture overlay with independent left brightness, right volume, and horizontal seek
  const gestureKt = byPath.get('app/src/main/java/com/autocine/player/ui/GestureOverlay.kt');
  assert.ok(gestureKt, 'GestureOverlay.kt must exist');
  assert.match(gestureKt, /awaitEachGesture/);
  assert.match(gestureKt, /GestureAxis\.SEEK/);
  assert.match(gestureKt, /GestureAxis\.BRIGHTNESS/);
  assert.match(gestureKt, /GestureAxis\.VOLUME/);
  assert.match(gestureKt, /pointerInput\(Unit\)/);
  assert.match(gestureKt, /rememberUpdatedState/);

  // Requirement: 4 fixed UI scales + 6 color themes in Theme.kt
  const themeKt = byPath.get('app/src/main/java/com/autocine/player/ui/theme/Theme.kt');
  assert.ok(themeKt, 'Theme.kt must exist');
  assert.match(themeKt, /enum class UiScaleLevel/);
  assert.match(themeKt, /0\.85f/);
  assert.match(themeKt, /1\.30f/);
  assert.match(themeKt, /enum class AppColorTheme/);
  assert.match(themeKt, /LocalDensity provides/);

  // Requirement: Clean scrollable left pane, SettingsDialog with Iniciar com a Multimídia, collapsed AllFoldersFilterDialog, memory-bounded RGB_565 LruCache thumbnails
  const splitKt = byPath.get('app/src/main/java/com/autocine/player/ui/SplitScreenBrowser.kt');
  assert.ok(splitKt, 'SplitScreenBrowser.kt must exist');
  assert.match(splitKt, /verticalScroll/);
  assert.match(splitKt, /fun SettingsDialog/);
  assert.match(splitKt, /Iniciar com a Multimídia/);
  assert.match(splitKt, /expandedGroups by remember\(folders\) \{ mutableStateOf\(emptySet<String>\(\)\) \}/);
  assert.match(splitKt, /expandedFolderIds by remember\(folders\) \{ mutableStateOf\(emptySet<String>\(\)\) \}/);
  assert.match(splitKt, /LruCache/);
  assert.match(splitKt, /override fun sizeOf/);
  assert.match(splitKt, /Bitmap\.Config\.RGB_565/);
  assert.match(splitKt, /fun VideoListRow/);
  assert.match(splitKt, /fun SubfolderListRow/);
  assert.match(splitKt, /Dispatchers\.IO/);
  assert.match(splitKt, /ensureActive/);
  assert.match(splitKt, /text = "Limpar"/);

  // Requirement (Safety Lock + Perf): libVLC async init, low-RAM options, ScaleTypes, stop before new Media, HW decoder fallback, Vout updateVideoSurfaces, setVolumePercent
  const vlcKt = byPath.get('app/src/main/java/com/autocine/player/vlc/VlcPlayerEngine.kt');
  assert.ok(vlcKt, 'VlcPlayerEngine.kt must exist');
  assert.match(vlcKt, /initVlcAsync/);
  assert.match(vlcKt, /--file-caching=350/);
  assert.match(vlcKt, /--no-spu/);
  assert.match(vlcKt, /player\.stop\(\)/);
  assert.match(vlcKt, /media\.setHWDecoderEnabled\(true, false\)/);
  assert.match(vlcKt, /event\.voutCount > 0/);
  assert.match(vlcKt, /updateVideoSurfaces\(\)/);
  assert.match(vlcKt, /player\.scale = 0f/);
  assert.match(vlcKt, /SURFACE_BEST_FIT/);
  assert.match(vlcKt, /SURFACE_FIT_SCREEN/);
  assert.match(vlcKt, /SURFACE_FILL/);
  assert.match(vlcKt, /SURFACE_16_9/);
  assert.match(vlcKt, /SURFACE_4_3/);
  assert.match(vlcKt, /FIXED_VLC_VOLUME = 100/);
  assert.match(vlcKt, /hasActiveMediaFor/);

  // Requirement (Safety Lock + Perf): Proven VlcVideoSurface hosting in PlayerScreen + isolated progressFlow
  const playerScreenKt = byPath.get('app/src/main/java/com/autocine/player/ui/PlayerScreen.kt');
  assert.ok(playerScreenKt, 'PlayerScreen.kt must exist');
  assert.match(playerScreenKt, /fun VlcVideoSurface/);
  assert.match(playerScreenKt, /onAdjustVolume = onAdjustVolume/);
  assert.match(playerScreenKt, /progressFlow = viewModel\.playbackProgress/);

  // Requirement (Perf): Isolated FullScreenProgressBar composable so 1s ticks do not recompose the full player
  const controlsKt = byPath.get('app/src/main/java/com/autocine/player/ui/FullScreenControls.kt');
  assert.ok(controlsKt, 'FullScreenControls.kt must exist');
  assert.match(controlsKt, /fun FullScreenProgressBar/);
  assert.match(controlsKt, /progressFlow\.collectAsState\(\)/);

  // Requirement (Perf): @Immutable PlayerUiState + isolated PlaybackProgressState + Dispatchers.Default search/sort
  const viewModelKt = byPath.get('app/src/main/java/com/autocine/player/viewmodel/PlayerViewModel.kt');
  assert.ok(viewModelKt, 'PlayerViewModel.kt must exist');
  assert.match(viewModelKt, /@Immutable\s+data class PlaybackProgressState/);
  assert.match(viewModelKt, /@Immutable\s+data class PlayerUiState/);
  assert.match(viewModelKt, /Dispatchers\.Default/);

  // Requirement: Real system volume (adjustSuggestedStreamVolume + setStreamVolume, no internal VLC volume) + fresh WindowManager.LayoutParams brightness + WRITE_SETTINGS + onTrimMemory
  const mainActivityKt = byPath.get('app/src/main/java/com/autocine/player/MainActivity.kt');
  assert.ok(mainActivityKt, 'MainActivity.kt must exist');
  assert.match(mainActivityKt, /volumeControlStream = AudioManager\.STREAM_MUSIC/);
  assert.match(mainActivityKt, /adjustSuggestedStreamVolume\(/);
  assert.match(mainActivityKt, /WindowManager\.LayoutParams\(\)/);
  assert.match(mainActivityKt, /Settings\.System\.canWrite/);
  assert.match(mainActivityKt, /syncBootReceiverComponent/);
  assert.match(mainActivityKt, /override fun onTrimMemory/);

  // Requirement: Synchronous LastPlaybackSnapshot & StartOnBoot persisted for auto-resume on app reopen and boot
  const prefsKt = byPath.get('app/src/main/java/com/autocine/player/data/PreferencesManager.kt');
  assert.ok(prefsKt, 'PreferencesManager.kt must exist');
  assert.match(prefsKt, /data class LastPlaybackSnapshot/);
  assert.match(prefsKt, /fun readLastPlaybackSync/);
  assert.match(prefsKt, /fun saveLastPlaybackSync/);
  assert.match(prefsKt, /fun isStartOnBootEnabledSync/);

  // Requirement: URI accessibility check + in-memory directory cache + fast physical/DocumentsContract listing
  const storageRepoKt = byPath.get('app/src/main/java/com/autocine/player/data/StorageRepository.kt');
  assert.ok(storageRepoKt, 'StorageRepository.kt must exist');
  assert.match(storageRepoKt, /fun isVideoUriAccessible/);
  assert.match(storageRepoKt, /directoryCache/);
  assert.match(storageRepoKt, /DocumentsContract\.buildChildDocumentsUriUsingTree/);
  assert.match(storageRepoKt, /tryResolvePhysicalDirectory/);

  // Regression check: Kotlin forbids destructuring declarations using `by` delegation
  for (const file of ANDROID_PROJECT_FILES) {
    if (file.path.endsWith('.kt')) {
      assert.doesNotMatch(
        file.content,
        /\b(val|var)\s*\([^)]+\)\s+by\b/,
        `${file.path} must not use destructuring declaration with 'by'`
      );
    }
  }
});
