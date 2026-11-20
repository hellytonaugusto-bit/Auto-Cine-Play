import React, { useMemo, useState } from 'react';
import {
  Check,
  Folder,
  FolderOpen,
  HardDrive,
  Layers,
  MemoryStick,
  Minus,
  Usb,
  X,
} from 'lucide-react';
import type { MediaFolder, StorageSource } from '../types/media';
import {
  STORAGE_SOURCE_LABELS,
  getFoldersInTreeOrder,
} from '../utils/mediaLogic';

interface AllFoldersFilterModalProps {
  folders: MediaFolder[];
  includedFolderIds: string[] | null;
  onApply: (selectedIds: string[]) => void;
  onClose: () => void;
}

const SOURCE_ORDER: Exclude<StorageSource, 'all'>[] = [
  'usb_otg',
  'sd_card',
  'internal',
  'local_picked',
];

function getSourceIcon(source: Exclude<StorageSource, 'all'>) {
  switch (source) {
    case 'usb_otg':
      return <Usb className="w-5 h-5 text-sky-400 shrink-0" />;
    case 'sd_card':
      return <MemoryStick className="w-5 h-5 text-sky-400 shrink-0" />;
    case 'internal':
      return <HardDrive className="w-5 h-5 text-sky-400 shrink-0" />;
    case 'local_picked':
      return <FolderOpen className="w-5 h-5 text-sky-400 shrink-0" />;
  }
}

export const AllFoldersFilterModal: React.FC<AllFoldersFilterModalProps> = ({
  folders,
  includedFolderIds,
  onApply,
  onClose,
}) => {
  const allFolderIds = useMemo(() => folders.map((f) => f.id), [folders]);

  const [draftSelected, setDraftSelected] = useState<Set<string>>(() => {
    if (includedFolderIds === null) {
      return new Set(allFolderIds);
    }
    const valid = includedFolderIds.filter((id) => allFolderIds.includes(id));
    return new Set(valid);
  });

  const selectedVideoCount = useMemo(() => {
    return folders.reduce(
      (sum, f) => (draftSelected.has(f.id) ? sum + f.videos.length : sum),
      0
    );
  }, [folders, draftSelected]);

  const toggleFolder = (folderId: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const toggleSourceAll = (source: Exclude<StorageSource, 'all'>) => {
    const sourceIds = folders.filter((f) => f.source === source).map((f) => f.id);
    if (sourceIds.length === 0) return;

    setDraftSelected((prev) => {
      const next = new Set(prev);
      const allChecked = sourceIds.every((id) => next.has(id));
      if (allChecked) {
        sourceIds.forEach((id) => next.delete(id));
      } else {
        sourceIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSelectAll = () => setDraftSelected(new Set(allFolderIds));
  const handleClearAll = () => setDraftSelected(new Set());

  const activeSources = SOURCE_ORDER.filter((src) =>
    folders.some((f) => f.source === src)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="all-folders-filter-title"
      data-testid="all-folders-filter-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl bg-[#0D1320] border border-white/14 shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 bg-[#090D16]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-sky-400 shrink-0" />
              <h3
                id="all-folders-filter-title"
                className="font-display text-lg md:text-xl font-semibold text-white truncate"
              >
                Selecionar Pastas para &ldquo;Todas&rdquo;
              </h3>
            </div>
            <p className="mt-0.5 text-xs md:text-sm text-slate-400 tabular-nums">
              {draftSelected.size} de {folders.length} pastas selecionadas · {selectedVideoCount} vídeos
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar filtro de pastas"
            className="min-w-[46px] min-h-[46px] rounded-xl bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="shrink-0 px-5 py-2.5 border-b border-white/8 bg-[#0B101A] flex items-center justify-between gap-2">
          <span className="text-xs md:text-sm text-slate-400">
            Marque um armazenamento inteiro ou escolha pastas e subpastas específicas:
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectAll}
              className="min-h-[42px] px-4 rounded-xl bg-white/8 hover:bg-white/15 text-sm font-medium text-sky-300 transition whitespace-nowrap cursor-pointer"
            >
              Marcar todas
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="min-h-[42px] px-4 rounded-xl bg-white/8 hover:bg-white/15 text-sm font-medium text-slate-300 transition whitespace-nowrap cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Scrollable Storage & Folder Tree */}
        <div className="flex-1 min-h-0 overflow-y-auto auto-scroll p-4 space-y-3">
          {activeSources.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <p className="text-base font-medium text-slate-200">
                Nenhuma pasta encontrada nos armazenamentos
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Conecte um Pen Drive, Cartão SD ou adicione vídeos na Memória Interna.
              </p>
            </div>
          ) : (
          activeSources.map((source) => {
            const treeItems = getFoldersInTreeOrder(folders, source);
            const sourceIds = treeItems.map((t) => t.folder.id);
            const checkedCount = sourceIds.filter((id) => draftSelected.has(id)).length;
            const allChecked = checkedCount === sourceIds.length && sourceIds.length > 0;
            const someChecked = checkedCount > 0 && !allChecked;
            const totalSourceVideos = treeItems.reduce(
              (sum, t) => sum + t.folder.videos.length,
              0
            );

            return (
              <section
                key={source}
                className="rounded-2xl bg-[#090D16] border border-white/10 overflow-hidden"
              >
                {/* Storage Volume Master Toggle */}
                <button
                  type="button"
                  data-testid={`filter-source-${source}`}
                  onClick={() => toggleSourceAll(source)}
                  className="w-full min-h-[54px] px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-between gap-3 text-left transition cursor-pointer border-b border-white/8"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center border-2 transition shrink-0 ${
                        allChecked || someChecked
                          ? 'bg-sky-400 border-sky-400 text-[#07090D]'
                          : 'border-slate-500 bg-transparent text-transparent'
                      }`}
                    >
                      {allChecked ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : someChecked ? (
                        <Minus className="w-4 h-4 stroke-[3]" />
                      ) : null}
                    </span>
                    {getSourceIcon(source)}
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-white truncate">
                        {STORAGE_SOURCE_LABELS[source]}
                      </div>
                      <div className="text-xs text-slate-400 tabular-nums">
                        {checkedCount} de {sourceIds.length} pastas · {totalSourceVideos} vídeos
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-sky-400 shrink-0">
                    {allChecked ? 'Desmarcar local' : 'Marcar local'}
                  </span>
                </button>

                {/* Indented Folders & Subfolders */}
                <div className="divide-y divide-white/5">
                  {treeItems.map(({ folder, depth }) => {
                    const checked = draftSelected.has(folder.id);
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        data-testid={`filter-folder-${folder.id}`}
                        onClick={() => toggleFolder(folder.id)}
                        style={{ paddingLeft: `${16 + depth * 26}px` }}
                        className={`w-full min-h-[50px] pr-4 py-2 flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                          checked ? 'bg-sky-500/10 hover:bg-sky-500/15' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition shrink-0 ${
                              checked
                                ? 'bg-sky-400 border-sky-400 text-[#07090D]'
                                : 'border-slate-600 bg-transparent text-transparent'
                            }`}
                          >
                            {checked && <Check className="w-4 h-4 stroke-[3]" />}
                          </span>
                          <Folder
                            className={`w-5 h-5 shrink-0 ${
                              checked ? 'text-sky-400' : 'text-slate-500'
                            }`}
                          />
                          <div className="min-w-0">
                            <div
                              className={`text-sm md:text-base truncate ${
                                checked ? 'font-semibold text-white' : 'font-medium text-slate-300'
                              }`}
                            >
                              {folder.name}
                            </div>
                            {depth > 0 && (
                              <div className="text-xs text-slate-500 truncate">
                                Subpasta · {folder.path}
                              </div>
                            )}
                          </div>
                        </div>

                        <span className="text-xs md:text-sm font-mono-code text-slate-400 tabular-nums shrink-0">
                          {folder.videos.length} {folder.videos.length === 1 ? 'vídeo' : 'vídeos'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-white/10 bg-[#090D16] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 rounded-xl bg-white/8 hover:bg-white/15 text-base font-medium text-slate-200 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="apply-all-folders-filter-btn"
            onClick={() => onApply(Array.from(draftSelected))}
            className="min-h-[48px] px-6 rounded-xl bg-sky-400 hover:bg-sky-300 text-base font-semibold text-[#07090D] shadow-lg shadow-sky-500/20 transition cursor-pointer"
          >
            Aplicar ({selectedVideoCount} vídeos)
          </button>
        </div>
      </div>
    </div>
  );
};
