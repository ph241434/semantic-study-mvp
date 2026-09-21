import { ChevronDown, ChevronRight, FileText, Folder, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Concept, Flowchart, KnowledgeEntry } from '../types';

type Props = {
  entries: KnowledgeEntry[];
  flowcharts: Flowchart[];
  concepts: Concept[];
  currentFlowchartId: number | null;
  onOpenFlowchart: (flowchartId: number) => void;
  onSelectConcept: (conceptId: number) => void;
  onNewFlowchart: () => void;
  onOpenKnowledge: () => void;
};

type FolderNode = { entry: KnowledgeEntry; children: FolderNode[]; flowcharts: Flowchart[] };

/** Builds the folder tree, keeping only folders that (directly or below) contain flowcharts. */
export function buildFolderTree(entries: KnowledgeEntry[], flowcharts: Flowchart[]): { folders: FolderNode[]; unfiled: Flowchart[] } {
  const byParent = new Map<number | null, KnowledgeEntry[]>();
  for (const entry of entries) {
    if (entry.entry_type !== 'folder') continue;
    byParent.set(entry.parent_id, [...(byParent.get(entry.parent_id) ?? []), entry]);
  }
  const sortEntries = (list: KnowledgeEntry[]) => list.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const ordered = (list: Flowchart[]) => list.slice().sort((a, b) => a.used_by_count - b.used_by_count || a.id - b.id);

  const build = (parentId: number | null): FolderNode[] =>
    sortEntries(byParent.get(parentId) ?? [])
      .map((entry) => ({
        entry,
        children: build(entry.id),
        flowcharts: ordered(flowcharts.filter((item) => item.folder_id === entry.id)),
      }))
      .filter((node) => node.flowcharts.length > 0 || node.children.length > 0);

  const knownFolders = new Set(entries.filter((entry) => entry.entry_type === 'folder').map((entry) => entry.id));
  return {
    folders: build(null),
    unfiled: ordered(flowcharts.filter((item) => item.folder_id === null || !knownFolders.has(item.folder_id))),
  };
}

/** Navigation only: projects (folders), their flowcharts, and the concept registry. It is never a graph. */
export function FlowNavigator({
  entries,
  flowcharts,
  concepts,
  currentFlowchartId,
  onOpenFlowchart,
  onSelectConcept,
  onNewFlowchart,
  onOpenKnowledge,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [conceptsOpen, setConceptsOpen] = useState(false);
  const [query, setQuery] = useState('');

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

  if (collapsed) {
    return (
      <button type="button" className="flow-nav-toggle" onClick={() => setCollapsed(false)} title="Show navigator" aria-label="Show navigator">
        <PanelLeftOpen size={16} />
      </button>
    );
  }

  const flowchartRow = (flowchart: Flowchart, depth: number) => (
    <button
      key={flowchart.id}
      type="button"
      className={`flow-nav-row flow-nav-file${flowchart.id === currentFlowchartId ? ' flow-nav-active' : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      onClick={() => onOpenFlowchart(flowchart.id)}
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
        <button type="button" className="flow-nav-row flow-nav-folder" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(key)}>
          {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <Folder size={14} />
          <span className="flow-nav-name">{node.entry.name}</span>
        </button>
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
          <button type="button" onClick={onNewFlowchart} title="New flowchart" aria-label="New flowchart">
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => setCollapsed(true)} title="Hide navigator" aria-label="Hide navigator">
            <PanelLeftClose size={15} />
          </button>
        </span>
      </div>
      <div className="flow-nav-scroll">
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
    </nav>
  );
}
