import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '../api/client';
import { ConceptForm } from '../components/ConceptForm';
import { DetailPanel } from '../components/DetailPanel';
import { GraphCanvas } from '../components/GraphCanvas';
import { GraphToolRail, type GraphDestination } from '../components/GraphToolRail';
import { RelationshipForm } from '../components/RelationshipForm';
import { SearchBox } from '../components/SearchBox';
import {
  CLASSIC_LAYOUT_STORAGE_KEY,
  buildGraphLayout,
  classicPositionStoresEqual,
  ensureClassicPositions,
  graphLayoutModes,
  reorganizeClassicPositions,
  sanitizeClassicPositionStore,
  updateClassicPosition,
  type ClassicPositionStore,
  type GraphLayoutMode,
  type Point,
} from '../graph/layout';
import type { Concept, GraphResponse, Question, Relationship } from '../types';

type Props = {
  concepts: Concept[];
  relationships: Relationship[];
  questions: Question[];
  selectedConceptId: number | null;
  selectedRelationshipId: number | null;
  catalogLoading?: boolean;
  catalogError?: string | null;
  currentView: GraphDestination;
  onChangeView: (view: GraphDestination) => void;
  onSelectConcept: (conceptId: number) => void;
  onSelectRelationship: (relationshipId: number | null) => void;
  onCatalogChanged: () => Promise<void>;
  onStudyQuestion: (question: Question) => void;
};

type QuickPanel = 'concept' | 'relationship' | null;

const SIDEBAR_COLLAPSED_KEY = 'semantic-study.graphSidebarCollapsed';
const GRID_VISIBLE_KEY = 'semantic-study.graphGridVisible';
const GRAPH_LAYOUT_KEY = 'semantic-study.graphLayoutMode';

export function GraphPage({
  concepts,
  relationships,
  questions,
  selectedConceptId,
  selectedRelationshipId,
  catalogLoading = false,
  catalogError = null,
  currentView,
  onChangeView,
  onSelectConcept,
  onSelectRelationship,
  onCatalogChanged,
  onStudyQuestion,
}: Props) {
  const [depth, setDepth] = useState(1);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useBooleanPreference(SIDEBAR_COLLAPSED_KEY, false);
  const [showGrid, setShowGrid] = useBooleanPreference(GRID_VISIBLE_KEY, true);
  const [layoutMode, setLayoutMode] = useLayoutModePreference(GRAPH_LAYOUT_KEY, 'classic');
  const [classicPositions, setClassicPositions] = useClassicPositionPreference(CLASSIC_LAYOUT_STORAGE_KEY);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(selectedConceptId || selectedRelationshipId));
  const [viewportRevision, setViewportRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId) ?? null;
  const selectedRelationship = relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;
  const detailConcept = selectedRelationship ? null : selectedConcept;
  const graphLayout = useMemo(
    () => (graph ? buildGraphLayout(graph, layoutMode, { positions: classicPositions }) : null),
    [classicPositions, graph, layoutMode],
  );

  useEffect(() => {
    if (!selectedConceptId) {
      setGraph(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([api.graph(selectedConceptId, depth), ...Array.from(expandedIds).map((id) => api.graph(id, 1))])
      .then((graphs) => {
        if (!active) return;
        const merged = mergeGraphs(graphs, selectedConceptId, depth);
        setGraph(merged);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load graph');
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [selectedConceptId, depth, expandedIds]);

  useEffect(() => {
    if (!graph) return;

    setClassicPositions((current) => {
      const ensured = ensureClassicPositions(graph, current).positions;
      return classicPositionStoresEqual(current, ensured) ? current : ensured;
    });
  }, [graph, setClassicPositions]);

  useEffect(() => {
    if (selectedConceptId || selectedRelationshipId) {
      setInspectorOpen(true);
    }
  }, [selectedConceptId, selectedRelationshipId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape') {
        if (quickPanel) {
          setQuickPanel(null);
          return;
        }
        if (inspectorOpen) {
          closeInspector();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectorOpen, quickPanel]);

  const graphLabel = useMemo(() => {
    if (!selectedConcept) return 'No concept selected';
    return `${selectedConcept.name} + depth ${depth}`;
  }, [depth, selectedConcept]);

  function setSidebarState(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    setViewportRevision((revision) => revision + 1);
  }

  function selectConceptFromGraph(conceptId: number) {
    onSelectRelationship(null);
    onSelectConcept(conceptId);
    setInspectorOpen(true);
  }

  function selectRelationshipFromGraph(relationshipId: number) {
    onSelectRelationship(relationshipId);
    setInspectorOpen(true);
  }

  function closeInspector() {
    setInspectorOpen(false);
    onSelectRelationship(null);
  }

  function saveClassicPosition(conceptId: number, position: Point) {
    setClassicPositions((current) => updateClassicPosition(current, conceptId, position));
  }

  function reorganizeClassicGraph() {
    if (!graph) return;

    const nextVisiblePositions = reorganizeClassicPositions(graph);
    setClassicPositions((current) => ({
      ...current,
      ...nextVisiblePositions,
    }));
    setViewportRevision((revision) => revision + 1);
  }

  async function conceptCreated(concept: Concept) {
    await onCatalogChanged();
    onSelectRelationship(null);
    onSelectConcept(concept.id);
    setQuickPanel(null);
    setInspectorOpen(true);
  }

  async function relationshipCreated(relationship: Relationship) {
    await onCatalogChanged();
    onSelectRelationship(relationship.id);
    onSelectConcept(relationship.source_concept_id);
    setQuickPanel(null);
    setInspectorOpen(true);
  }

  async function relationshipDeleted() {
    onSelectRelationship(null);
    setInspectorOpen(false);
    await onCatalogChanged();
  }

  function changeDepth(nextDepth: number) {
    setDepth(nextDepth);
    setViewportRevision((revision) => revision + 1);
  }

  function changeLayoutMode(nextMode: GraphLayoutMode) {
    setLayoutMode(nextMode);
    setViewportRevision((revision) => revision + 1);
  }

  return (
    <div
      className={`graph-workspace${sidebarCollapsed ? ' graph-workspace-sidebar-collapsed' : ''}${
        inspectorOpen ? ' graph-workspace-inspector-open' : ''
      }`}
      data-testid="graph-workspace"
    >
      <div className="absolute inset-0">
        <GraphCanvas
          graph={graph}
          layout={graphLayout}
          layoutMode={layoutMode}
          classicPositions={classicPositions}
          selectedConceptId={selectedConceptId}
          selectedRelationshipId={selectedRelationshipId}
          variant="workspace"
          showGrid={showGrid}
          viewportRevision={viewportRevision}
          onSelectConcept={selectConceptFromGraph}
          onSelectRelationship={selectRelationshipFromGraph}
          onNodePositionChange={saveClassicPosition}
          onPaneClick={closeInspector}
        />
      </div>

      <GraphToolRail
        collapsed={sidebarCollapsed}
        depth={depth}
        layoutMode={layoutMode}
        graphLabel={graphLabel}
        nodeCount={graph?.nodes.length ?? 0}
        loading={catalogLoading || loading}
        error={catalogError ?? error}
        showGrid={showGrid}
        currentView={currentView}
        search={
          <SearchBox
            variant="dark"
            onSelect={(concept) => {
              onSelectRelationship(null);
              onSelectConcept(concept.id);
              setInspectorOpen(true);
              setViewportRevision((revision) => revision + 1);
            }}
          />
        }
        onCollapsedChange={setSidebarState}
        onDepthChange={changeDepth}
        onLayoutModeChange={changeLayoutMode}
        onGridChange={setShowGrid}
        onOpenConcept={() => setQuickPanel('concept')}
        onOpenRelationship={() => setQuickPanel('relationship')}
        onFitGraph={() => setViewportRevision((revision) => revision + 1)}
        onReorganize={reorganizeClassicGraph}
        onResetExpanded={() => setExpandedIds(new Set())}
        onNavigate={onChangeView}
      />

      {quickPanel && (
        <FloatingPanel title={quickPanel === 'concept' ? 'Add Concept' : 'Add Relationship'} onClose={() => setQuickPanel(null)}>
          {quickPanel === 'concept' ? (
            <ConceptForm onCreated={conceptCreated} />
          ) : (
            <RelationshipForm concepts={concepts} selectedConceptId={selectedConceptId} onCreated={relationshipCreated} />
          )}
        </FloatingPanel>
      )}

      {inspectorOpen && (detailConcept || selectedRelationship) && (
        <div className="graph-inspector-panel" data-testid="graph-inspector">
          <button type="button" onClick={closeInspector} className="graph-inspector-close" title="Close Inspector">
            <X className="h-4 w-4" />
            <span className="sr-only">Close Inspector</span>
          </button>
          <DetailPanel
            concept={detailConcept}
            relationship={selectedRelationship}
            relationships={relationships}
            questions={questions}
            concepts={concepts}
            onConceptSaved={async (concept) => {
              await onCatalogChanged();
              onSelectConcept(concept.id);
            }}
            onRelationshipSaved={async (relationship) => {
              await onCatalogChanged();
              onSelectRelationship(relationship.id);
            }}
            onRelationshipDeleted={relationshipDeleted}
            onStudyQuestion={onStudyQuestion}
            onExpandConcept={(conceptId) => {
              setExpandedIds((current) => new Set(current).add(conceptId));
            }}
          />
        </div>
      )}
    </div>
  );
}

function FloatingPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="graph-floating-backdrop" role="presentation">
      <section className="graph-floating-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="graph-icon-button" title="Close">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function mergeGraphs(graphs: GraphResponse[], centerId: number, depth: number): GraphResponse {
  const nodeMap = new Map<number, Concept>();
  const relationshipMap = new Map<number, Relationship>();
  graphs.forEach((graph) => {
    graph.nodes.forEach((node) => nodeMap.set(node.id, node));
    graph.relationships.forEach((relationship) => relationshipMap.set(relationship.id, relationship));
  });
  return {
    center_id: centerId,
    depth,
    nodes: Array.from(nodeMap.values()),
    relationships: Array.from(relationshipMap.values()),
  };
}

function useBooleanPreference(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readBooleanPreference(key, fallback));

  useEffect(() => {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  }, [key, value]);

  return [value, setValue] as const;
}

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

function useLayoutModePreference(key: string, fallback: GraphLayoutMode) {
  const [value, setValue] = useState(() => readLayoutModePreference(key, fallback));

  useEffect(() => {
    window.localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}

function readLayoutModePreference(key: string, fallback: GraphLayoutMode) {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return graphLayoutModes.includes(stored as GraphLayoutMode) ? (stored as GraphLayoutMode) : fallback;
}

function useClassicPositionPreference(key: string) {
  const [value, setValue] = useState<ClassicPositionStore>(() => readClassicPositions(key));

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function readClassicPositions(key: string) {
  if (typeof window === 'undefined') return {};
  const stored = window.localStorage.getItem(key);
  if (!stored) return {};
  try {
    return sanitizeClassicPositionStore(JSON.parse(stored) as unknown);
  } catch {
    return {};
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
