import { BUILD_AND_MANIFEST_FILES, type AndroidProjectFile } from './buildAndManifestFiles';
import { KOTLIN_CORE_FILES } from './kotlinCoreFiles';
import { KOTLIN_UI_FILES } from './kotlinUiFiles';
import { triggerZipDownload } from './zipBuilder';

export type { AndroidProjectFile };

export const ANDROID_PROJECT_FILES: AndroidProjectFile[] = [
  ...BUILD_AND_MANIFEST_FILES,
  ...KOTLIN_CORE_FILES,
  ...KOTLIN_UI_FILES,
];

export function downloadAndroidProjectZip(): void {
  const entries = ANDROID_PROJECT_FILES.map((file) => ({
    path: `AutoCinePlayer/${file.path}`,
    content: file.content,
    executable: file.executable,
  }));
  triggerZipDownload(entries, 'AutoCinePlayer-Android-Kotlin.zip');
}
