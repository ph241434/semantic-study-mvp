import { ChevronDown, ChevronRight, FileText, Folder, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { InlineCreatePanel, NewFlowchartForm, NewFolderForm } from './FlowForms';
import type { Concept, Flowchart, KnowledgeEntry } from '../types';

export type CreationRequest = { kind: 'folder'; parentId: number | null } | { kind: 'flowchart'; parentId: number | null };

type Props = {
  entries: KnowledgeEntry[];
  flowcharts: Flowchart[];
  concepts: Concept[];
  currentFlowchartId: number | null;
  currentFolderId: number | null;
  creationRequest: CreationRequest | null;
  onRequestCreation: (request: CreationRequest | null) => void;
  onOpenFlowchart: (flowchartId: number) => void;
  onSelectConcept: (conceptId: number) => void;
  onOpenKnowledge: () => void;
  onEntryCreated: (entry: KnowledgeEntry) => void;
  onFlowchartCreated: (flowchart: Flowchart) => void;
  /** Adds a "New step" node to this flowchart immediately — no form first. The canvas/inspector is where it gets edited. */
  onAddStep: (flowchartId: number) => void;
};

type FolderNode = { entry: KnowledgeEntry; children: FolderNode[]; flowcharts: Flowchart[] };
type MenuTarget = { kind: 'root' } | { kind: 'folder'; id: number; name: string } | { kind: 'flowchart'; id: number; name: string };

/** Builds the folder tree from the real KnowledgeEntry hierarchy. Every persisted folder is rendered, at whatever
 * depth and however many flowcharts it holds (including none) — the sidebar mirrors the database, like a real
 * filesystem, so a folder stays visible across a refresh or a restart because it exists, not because of what it
 * currently contains. */
export function buildFolderTree(entries: KnowledgeEntry[], flowcharts: Flowchart[]): { folders: FolderNode[]; unfiled: Flowchart[] } {
  const byParent = new Map<number | null, KnowledgeEntry[]>();
  for (const entry of entries) {
    if (entry.entry_type !== 'folder') continue;
    byParent.set(entry.parent_id, [...(byParent.get(entry.parent_id) ?? []), entry]);
  }
  const sortEntries = (list: KnowledgeEntry[]) => list.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const ordered = (list: Flowchart[]) => list.slice().sort((a, b) => a.used_by_count - b.used_by_count || a.id - b.id);

  const build = (parentId: number | null): FolderNode[] =>
    sortEntries(byParent.get(parentId) ?? []).map((entry) => ({
      entry,
      children: build(entry.id),
      flowcharts: ordered(flowcharts.filter((item) => item.folder_id === entry.id)),
    }));

  const knownFolders = new Set(entries.filter((entry) => entry.entry_type === 'folder').map((entry) => entry.id));
  return {
    folders: build(null),
    unfiled: ordered(flowcharts.filter((item) => item.folder_id === null || !knownFolders.has(item.folder_id))),
  };
}

/** The folder's own id plus every ancestor above it, nearest first. Used to auto-expand a path to a target folder. */
function ancestorFolderIds(entries: KnowledgeEntry[], folderId: number | null): number[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ids: number[] = [];
  let current = folderId;
  while (current !== null) {
    ids.push(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return ids;
}

/** Navigation only: projects (folders), their flowcharts, and the concept registry. It is never a graph. */
export function FlowNavigator({
  entries,
  flowcharts,
  concepts,
  currentFlowchartId,
  currentFolderId,
  creationRequest,
  onRequestCreation,
  onOpenFlowchart,
  onSelectConcept,
  onOpenKnowledge,
  onEntryCreated,
  onFlowchartCreated,
  onAddStep,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [conceptsOpen, setConceptsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);

  const tree = useMemo(() => buildFolderTree(entries, flowcharts), [entries, flowcharts]);
  const matchingConcepts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return concepts.filter((concept) => !term || concept.name.toLowerCase().includes(term)).slice(0, 60);
  }, [concepts, query]);

  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A folder/flowchart creation request may be triggered from outside the sidebar (nav header button), or target a
  // folder that's currently collapsed. Reveal the navigator and open a path down to the target so the inline
  // form triggered by it is actually visible, without touching anything the graph/canvas cares about.
  useEffect(() => {
    if (!creationRequest) return;
    setCollapsed(false);
    const ids = ancestorFolderIds(entries, creationRequest.parentId);
    if (ids.length === 0) return;
    setClosed((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(`folder-${id}`));
      return next;
    });
  }, [creationRequest, entries]);

  if (collapsed) {
    return (
      <button type="button" className="flow-nav-toggle" onClick={() => setCollapsed(false)} title="Show navigator" aria-label="Show navigator">
        <PanelLeftOpen size={16} />
      </button>
    );
  }

  function openMenu(event: ReactMouseEvent, target: MenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, target });
  }

  function menuItems(target: MenuTarget): ContextMenuItem[] {
    if (target.kind === 'flowchart') {
      return [{ label: 'Add step', onSelect: () => onAddStep(target.id) }];
    }
    const parentId = target.kind === 'folder' ? target.id : null;
    return [
      { label: 'New folder', onSelect: () => onRequestCreation({ kind: 'folder', parentId }) },
      { label: 'New flowchart', onSelect: () => onRequestCreation({ kind: 'flowchart', parentId }) },
    ];
  }

  const flowchartRow = (flowchart: Flowchart, depth: number) => (
    <button
      key={flowchart.id}
      type="button"
      className={`flow-nav-row flow-nav-file${flowchart.id === currentFlowchartId ? ' flow-nav-active' : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      onClick={() => onOpenFlowchart(flowchart.id)}
      onContextMenu={(event) => openMenu(event, { kind: 'flowchart', id: flowchart.id, name: flowchart.name })}
      title={flowchart.description || flowchart.name}
    >
      <FileText size={14} />
      <span className="flow-nav-name">{flowchart.name}</span>
      {flowchart.used_by_count > 0 && <span className="flow-nav-badge">detail</span>}
    </button>
  );

  const folderRow = (node: FolderNode, depth: number) => {
    const key = `folder-${node.entry.id}`;
    const isClosed = closed.has(key);
    return (
      <div key={key}>
        <button
          type="button"
          className="flow-nav-row flow-nav-folder"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggle(key)}
          onContextMenu={(event) => openMenu(event, { kind: 'folder', id: node.entry.id, name: node.entry.name })}
        >
          {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <Folder size={14} />
          <span className="flow-nav-name">{node.entry.name}</span>
        </button>
        {creationRequest?.kind === 'folder' && creationRequest.parentId === node.entry.id && (
          <div style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
            <InlineCreatePanel title="New folder" onCancel={() => onRequestCreation(null)}>
              <NewFolderForm
                parentId={node.entry.id}
                parentName={node.entry.name}
                onCreated={(entry) => {
                  onRequestCreation(null);
                  onEntryCreated(entry);
                }}
              />
            </InlineCreatePanel>
          </div>
        )}
        {creationRequest?.kind === 'flowchart' && creationRequest.parentId === node.entry.id && (
          <div style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
            <InlineCreatePanel title="New flowchart" onCancel={() => onRequestCreation(null)}>
              <NewFlowchartForm
                folderId={node.entry.id}
                folderName={node.entry.name}
                onCreated={(flowchart) => {
                  onRequestCreation(null);
                  onFlowchartCreated(flowchart);
                }}
              />
            </InlineCreatePanel>
          </div>
        )}
        {!isClosed && (
          <>
            {node.flowcharts.map((flowchart) => flowchartRow(flowchart, depth + 1))}
            {node.children.map((child) => folderRow(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <nav className="flow-nav" aria-label="Projects and flowcharts" data-testid="flow-navigator">
      <div className="flow-nav-header">
        <span>Flowcharts</span>
        <span className="flow-nav-header-actions">
          <button
            type="button"
            onClick={() => onRequestCreation({ kind: 'flowchart', parentId: currentFolderId })}
            title="New flowchart"
            aria-label="New flowchart"
          >
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => setCollapsed(true)} title="Hide navigator" aria-label="Hide navigator">
            <PanelLeftClose size={15} />
          </button>
        </span>
      </div>
      <div className="flow-nav-scroll" data-testid="flow-nav-scroll" onContextMenu={(event) => openMenu(event, { kind: 'root' })}>
        {creationRequest?.kind === 'folder' && creationRequest.parentId === null && (
          <InlineCreatePanel title="New folder" onCancel={() => onRequestCreation(null)}>
            <NewFolderForm
              parentId={null}
              parentName={null}
              onCreated={(entry) => {
                onRequestCreation(null);
                onEntryCreated(entry);
              }}
            />
          </InlineCreatePanel>
        )}
        {creationRequest?.kind === 'flowchart' && creationRequest.parentId === null && (
          <InlineCreatePanel title="New flowchart" onCancel={() => onRequestCreation(null)}>
            <NewFlowchartForm
              folderId={null}
              folderName={null}
              onCreated={(flowchart) => {
                onRequestCreation(null);
                onFlowchartCreated(flowchart);
              }}
            />
          </InlineCreatePanel>
        )}
        {tree.folders.length === 0 && tree.unfiled.length === 0 && <p className="flow-nav-empty">No flowcharts yet.</p>}
        {tree.folders.map((node) => folderRow(node, 0))}
        {tree.unfiled.length > 0 && (
          <div>
            <div className="flow-nav-row flow-nav-section">Unfiled</div>
            {tree.unfiled.map((flowchart) => flowchartRow(flowchart, 0))}
          </div>
        )}

        <button type="button" className="flow-nav-row flow-nav-folder" onClick={() => setConceptsOpen((open) => !open)} aria-expanded={conceptsOpen}>
          {conceptsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="flow-nav-name">Concepts</span>
          <span className="flow-nav-badge">{concepts.length}</span>
        </button>
        {conceptsOpen && (
          <>
            <input
              className="flow-nav-search"
              aria-label="Search concepts"
              placeholder="Search concepts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {matchingConcepts.map((concept) => (
              <button key={concept.id} type="button" className="flow-nav-row flow-nav-file" onClick={() => onSelectConcept(concept.id)}>
                <span className="flow-nav-name">{concept.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <button type="button" className="flow-nav-footer" onClick={onOpenKnowledge}>
        Knowledge browser
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.target)} onClose={() => setMenu(null)} />}
    </nav>
  );
}
