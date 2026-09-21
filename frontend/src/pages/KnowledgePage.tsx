import { FileText, Folder } from 'lucide-react';
import { useMemo } from 'react';

import type { FilesystemBreadcrumbSegment, KnowledgeEntry } from '../types';

type Props = {
  folderId: number | null;
  entries: KnowledgeEntry[];
  onNavigateFolder: (folderId: number | null) => void;
  onOpenConcept: (conceptId: number, name: string, fromFolderId: number | null) => void;
  onOpenFlowcharts?: () => void;
};

export function KnowledgePage({ folderId, entries, onNavigateFolder, onOpenConcept, onOpenFlowcharts }: Props) {
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const children = useMemo(
    () =>
      entries
        .filter((entry) => entry.parent_id === folderId)
        .slice()
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [entries, folderId],
  );

  const breadcrumb = useMemo(() => ancestorPath(folderId, entriesById), [folderId, entriesById]);

  return (
    <div className="proto-app">
      <header className="proto-topbar">
        <nav className="proto-breadcrumb" aria-label="Breadcrumb" data-testid="knowledge-breadcrumb">
          {breadcrumb.map((segment, index) => (
            <span key={`${segment.id ?? 'root'}-${index}`} className="proto-breadcrumb-segment">
              {index > 0 && <span className="proto-breadcrumb-separator">{'›'}</span>}
              <button
                type="button"
                className={`proto-breadcrumb-item${index === breadcrumb.length - 1 ? ' proto-breadcrumb-item-current' : ''}`}
                onClick={() => onNavigateFolder(segment.id)}
                disabled={index === breadcrumb.length - 1}
              >
                {segment.name}
              </button>
            </span>
          ))}
        </nav>
        {onOpenFlowcharts && (
          <button type="button" className="proto-btn" onClick={onOpenFlowcharts}>
            Flowcharts
          </button>
        )}
      </header>

      <main className="proto-main">
        {children.length === 0 ? (
          <p className="proto-fs-empty" data-testid="knowledge-empty">
            This folder is empty.
          </p>
        ) : (
          <div className="proto-fs-list" data-testid="knowledge-list">
            {children.map((entry) =>
              entry.entry_type === 'folder' ? (
                <button
                  key={entry.id}
                  type="button"
                  className="proto-fs-row proto-fs-row-folder"
                  data-entry-type="folder"
                  onClick={() => onNavigateFolder(entry.id)}
                >
                  <Folder className="proto-fs-row-icon h-4 w-4" />
                  <span className="proto-fs-row-name">{entry.name}</span>
                </button>
              ) : (
                <button
                  key={entry.id}
                  type="button"
                  className="proto-fs-row proto-fs-row-concept"
                  data-entry-type="concept"
                  onClick={() => entry.concept_id !== null && onOpenConcept(entry.concept_id, entry.name, folderId)}
                >
                  <FileText className="proto-fs-row-icon h-4 w-4" />
                  <span className="proto-fs-row-name">{entry.name}</span>
                </button>
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ancestorPath(folderId: number | null, entriesById: Map<number, KnowledgeEntry>): FilesystemBreadcrumbSegment[] {
  const path: FilesystemBreadcrumbSegment[] = [];
  let currentId = folderId;

  while (currentId !== null) {
    const entry = entriesById.get(currentId);
    if (!entry) break;
    path.unshift({ id: entry.id, name: entry.name });
    currentId = entry.parent_id;
  }

  path.unshift({ id: null, name: 'Knowledge' });
  return path;
}
