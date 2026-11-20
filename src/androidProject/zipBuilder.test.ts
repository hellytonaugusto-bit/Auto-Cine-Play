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

  // Requirement: Gesture overlay with seek, brightness, volume & non-freezing pointerInput(Unit)
  const gestureKt = byPath.get('app/src/main/java/com/autocine/player/ui/GestureOverlay.kt');
  assert.ok(gestureKt, 'GestureOverlay.kt must exist');
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

  // Requirement: Clean scrollable left pane, SettingsDialog, LruCache thumbnails, and Limpar search button
  const splitKt = byPath.get('app/src/main/java/com/autocine/player/ui/SplitScreenBrowser.kt');
  assert.ok(splitKt, 'SplitScreenBrowser.kt must exist');
  assert.match(splitKt, /verticalScroll/);
  assert.match(splitKt, /fun SettingsDialog/);
  assert.match(splitKt, /LruCache/);
  assert.match(splitKt, /Dispatchers\.IO/);
  assert.match(splitKt, /text = "Limpar"/);

  // Requirement: libVLC ScaleTypes, scale reset, internal setVolume, and active-media guard
  const vlcKt = byPath.get('app/src/main/java/com/autocine/player/vlc/VlcPlayerEngine.kt');
  assert.ok(vlcKt, 'VlcPlayerEngine.kt must exist');
  assert.match(vlcKt, /player\.scale = 0f/);
  assert.match(vlcKt, /SURFACE_BEST_FIT/);
  assert.match(vlcKt, /SURFACE_FIT_SCREEN/);
  assert.match(vlcKt, /SURFACE_FILL/);
  assert.match(vlcKt, /SURFACE_16_9/);
  assert.match(vlcKt, /SURFACE_4_3/);
  assert.match(vlcKt, /setVolume\(effective\)/);
  assert.match(vlcKt, /hasActiveMediaFor/);

  // Requirement: Single persistent VLCVideoLayout in PlayerScreen (no detach/recreate on mini<->fullscreen)
  const playerScreenKt = byPath.get('app/src/main/java/com/autocine/player/ui/PlayerScreen.kt');
  assert.ok(playerScreenKt, 'PlayerScreen.kt must exist');
  assert.match(playerScreenKt, /PersistentVlcVideoSurface/);
  assert.match(playerScreenKt, /BoxWithConstraints/);
  assert.match(playerScreenKt, /setVlcVolumeFraction/);

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
