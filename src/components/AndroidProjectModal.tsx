import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FolderGit2,
  X,
} from 'lucide-react';
import {
  ANDROID_PROJECT_FILES,
  downloadAndroidProjectZip,
  type AndroidProjectFile,
} from '../androidProject';

interface AndroidProjectModalProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<AndroidProjectFile['category'], string> = {
  github: 'GitHub Actions (CI)',
  gradle: 'Gradle & SDK 35',
  manifest: 'AndroidManifest',
  core: 'Core (libVLC / Service / SAF)',
  ui: 'Jetpack Compose UI & Gestos',
  resources: 'Recursos & Docs',
};

const REQUIREMENTS_VERIFIED = [
  '100% Paisagem + Tela Cheia Imersiva (Android 15 · minSdk 35 / targetSdk 35)',
  'libVLC (org.videolan.android:libvlc-all:3.6.0) com HW + Fallback SW',
  'Foreground Service (mediaPlayback) + AudioFocusRequest (Ducking Waze / Pausa Spotify)',
  'Picture-in-Picture (PiP) automático com ações Prev / Play-Pause / Next',
  'Gestos nativos Compose: Horizontal (Seek), Esquerda (Brilho), Direita (Volume)',
  'Split-Screen Mini-Player + SAF USB OTG / SD / DataStore + Busca NFD sem acentos',
  'Workflow .github/workflows/build-apk.yml pronto (JDK 17 + ./gradlew assembleDebug)',
];

export const AndroidProjectModal: React.FC<AndroidProjectModalProps> = ({ onClose }) => {
  const [selectedPath, setSelectedPath] = useState<string>(ANDROID_PROJECT_FILES[0].path);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const selectedFile =
    ANDROID_PROJECT_FILES.find((f) => f.path === selectedPath) ?? ANDROID_PROJECT_FILES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard API restricted fallback */
    }
  };

  const handleDownloadZip = () => {
    downloadAndroidProjectZip();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const categories: AndroidProjectFile['category'][] = [
    'github',
    'gradle',
    'manifest',
    'core',
    'ui',
    'resources',
  ];

  return (
    <div
      data-testid="android-project-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-project-title"
      className="fixed inset-0 z-50 bg-[#07090D] text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <header className="px-6 py-4 border-b border-white/10 bg-[#0B0F17] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <FolderGit2 className="w-6 h-6 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <h2
              id="android-project-title"
              className="font-display text-lg font-semibold text-white truncate"
            >
              AutoCinePlayer — Projeto Android Nativo (Kotlin + Jetpack Compose)
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {ANDROID_PROJECT_FILES.length} arquivos prontos para compilar · Android 15 (SDK 35) · libVLC 3.6.0 · GitHub Actions APK
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadZip}
            className="min-h-[46px] px-5 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-95 text-[#07090D] text-sm font-bold flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
          >
            {downloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{downloaded ? 'ZIP Baixado!' : 'Baixar Projeto Android (.zip)'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualizador do projeto Android"
            className="min-w-[46px] min-h-[46px] rounded-xl bg-white/8 hover:bg-white/15 text-slate-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Split: File Tree Left + Code Viewer Right */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* File Tree Sidebar */}
        <aside className="w-[330px] border-r border-white/10 bg-[#0A0E16] overflow-y-auto auto-scroll p-4 flex flex-col gap-5 shrink-0">
          {categories.map((cat) => {
            const catFiles = ANDROID_PROJECT_FILES.filter((f) => f.category === cat);
            if (catFiles.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="px-2 text-xs font-semibold text-slate-400 mb-1.5">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <ul className="flex flex-col gap-1">
                  {catFiles.map((file) => {
                    const isSelected = file.path === selectedFile.path;
                    const shortName = file.path.split('/').pop() ?? file.path;
                    return (
                      <li key={file.path}>
                        <button
                          type="button"
                          onClick={() => setSelectedPath(file.path)}
                          className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-xs flex items-center gap-2.5 transition cursor-pointer ${
                            isSelected
                              ? 'bg-sky-500/20 text-white font-semibold'
                              : 'text-slate-300 hover:bg-white/6 hover:text-white'
                          }`}
                        >
                          <FileCode2
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'text-sky-400' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate">{shortName}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* Compact Technical Checklist */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="px-2 text-xs font-semibold text-slate-300 mb-2">
              Requisitos Implementados
            </h3>
            <ul className="flex flex-col gap-2 px-1">
              {REQUIREMENTS_VERIFIED.map((req) => (
                <li key={req} className="flex items-start gap-2 text-[11px] text-slate-400 leading-snug">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Code Viewer Pane */}
        <section className="flex-1 flex flex-col min-w-0 bg-[#07090D]">
          <div className="px-6 py-3.5 border-b border-white/8 bg-[#0C1018] flex items-center justify-between gap-4 shrink-0">
            <div className="min-w-0">
              <div className="font-mono-code text-sm font-medium text-sky-300 truncate">
                {selectedFile.path}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">{selectedFile.summary}</div>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[40px] px-3.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-100 flex items-center gap-2 transition shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado' : 'Copiar arquivo'}</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto auto-scroll p-6">
            <pre className="font-mono-code text-xs md:text-[13px] leading-relaxed text-slate-200 whitespace-pre">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
};
