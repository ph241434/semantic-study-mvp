import { ArrowLeft, Link2, Plus, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import { DetailPanel } from '../components/DetailPanel';
import { AddNodeForm, FloatingPanel, NewFlowchartForm } from '../flowchart/FlowForms';
import { EdgeInspector, NodeInspector, type NodePatch } from '../flowchart/FlowInspector';
import { FlowNavigator } from '../flowchart/FlowNavigator';
import { FlowchartCanvas } from '../flowchart/FlowchartCanvas';
import { createViewStateStore } from '../flowchart/viewStateStore';
import type {
  Concept,
  FlowEdgeType,
  FlowNode,
  FlowchartDetail,
  FlowchartSummary,
  KnowledgeSpace,
  Question,
  Relationship,
} from '../types';

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

export type GraphDestination = 'dashboard' | 'graph' | 'study' | 'reconstruction';

type Selection = { kind: 'node'; id: number } | { kind: 'edge'; id: number } | null;
type QuickPanel = 'flowchart' | 'node' | null;

/**
 * Hierarchical flowchart workspace. Every flowchart is its own directed graph; opening a node's detailed
 * flowchart pushes onto `path` (the breadcrumb), and going back pops it. Parent views are restored from
 * `viewStates` instead of being laid out again.
 */
export function GraphPage({
  concepts,
  relationships,
  questions,
  catalogError = null,
  currentView,
  onChangeView,
  onSelectConcept,
  onCatalogChanged,
  onStudyQuestion,
}: Props) {
  const viewStates = useRef(createViewStateStore()).current;
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  const [detail, setDetail] = useState<FlowchartDetail | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [conceptPanelId, setConceptPanelId] = useState<number | null>(null);
  const [connectFrom, setConnectFrom] = useState<{ active: boolean; sourceId: number | null }>({ active: false, sourceId: null });
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentId = path.length ? path[path.length - 1] : null;

  const loadLists = useCallback(async () => {
    try {
      const [nextSpaces, nextFlowcharts] = await Promise.all([api.knowledgeSpaces(), api.flowcharts()]);
      setSpaces(nextSpaces);
      setFlowcharts(nextFlowcharts);
      return nextFlowcharts;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load flowcharts');
      return [];
    } finally {
      setListLoaded(true);
    }
  }, []);

  // Open the project's primary flowchart on first load.
  useEffect(() => {
    let active = true;
    void loadLists().then((list) => {
      if (!active || !list.length) return;
      const requested = Number(new URLSearchParams(window.location.search).get('flowchart'));
      const first = list.find((item) => item.id === requested) ?? list.find((item) => item.is_primary) ?? list[0];
      setPath((current) => (current.length ? current : [first.id]));
    });
    return () => {
      active = false;
    };
  }, [loadLists]);

  const loadDetail = useCallback(async (flowchartId: number) => {
    setLoading(true);
    try {
      const next = await api.flowchart(flowchartId);
      setDetail(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load flowchart');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentId === null) return undefined;
    let active = true;
    setLoading(true);
    api
      .flowchart(currentId)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load flowchart');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentId]);

  const names = useMemo(() => new Map(flowcharts.map((item) => [item.id, item.name])), [flowcharts]);
  const nodesById = useMemo(() => new Map((detail?.nodes ?? []).map((node) => [node.id, node])), [detail]);
  const selectedNode = selection?.kind === 'node' ? nodesById.get(selection.id) ?? null : null;
  const selectedEdge = selection?.kind === 'edge' ? detail?.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const conceptPanel = conceptPanelId ? concepts.find((item) => item.id === conceptPanelId) ?? null : null;

  // Selection is remembered per flowchart so returning to a parent restores what was selected there.
  const selections = useRef(new Map<number, Selection>());

  const navigateTo = (nextPath: number[]) => {
    if (currentId !== null) selections.current.set(currentId, selection);
    const target = nextPath.length ? nextPath[nextPath.length - 1] : null;
    setSelection(target !== null ? selections.current.get(target) ?? null : null);
    setConnectFrom({ active: false, sourceId: null });
    setPath(nextPath);
  };

  const openFlowchart = (flowchartId: number) => {
    setConceptPanelId(null);
    navigateTo([flowchartId]);
  };

  const enterChild = (flowchartId: number) => navigateTo([...path, flowchartId]);

  const goBack = () => {
    if (path.length > 1) navigateTo(path.slice(0, -1));
  };

  const goToCrumb = (index: number) => {
    if (index < path.length - 1) navigateTo(path.slice(0, index + 1));
  };

  const refreshCurrent = async () => {
    if (currentId !== null) await loadDetail(currentId);
    await loadLists();
  };

  const patchLocalNode = (node: FlowNode) => {
    setDetail((current) =>
      current ? { ...current, nodes: current.nodes.map((item) => (item.id === node.id ? node : item)) } : current,
    );
  };

  async function createEdge(sourceId: number, targetId: number) {
    if (!detail || sourceId === targetId) return;
    const source = nodesById.get(sourceId);
    let edgeType: FlowEdgeType = 'NEXT';
    let label: string | null = null;
    if (source?.node_type === 'DECISION') {
      const used = detail.edges.filter((edge) => edge.source_node_id === sourceId).map((edge) => edge.edge_type);
      edgeType = used.includes('YES') ? 'NO' : 'YES';
      label = edgeType;
    }
    try {
      const edge = await api.createFlowEdge(detail.flowchart.id, {
        source_node_id: sourceId,
        target_node_id: targetId,
        edge_type: edgeType,
        label,
      });
      setDetail((current) => (current ? { ...current, edges: [...current.edges, edge] } : current));
      setSelection({ kind: 'edge', id: edge.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect steps');
    } finally {
      setConnectFrom({ active: false, sourceId: null });
    }
  }

  const handleNodeTap = (nodeId: number) => {
    setConceptPanelId(null);
    if (connectFrom.active) {
      if (connectFrom.sourceId === null) {
        setConnectFrom({ active: true, sourceId: nodeId });
        setSelection({ kind: 'node', id: nodeId });
      } else {
        void createEdge(connectFrom.sourceId, nodeId);
      }
      return;
    }
    setSelection({ kind: 'node', id: nodeId });
  };

  async function saveNode(nodeId: number, patch: NodePatch) {
    const saved = await api.updateFlowNode(nodeId, patch);
    // Label / type changes alter the graph's shape, so re-read the flowchart and let the canvas re-layout.
    if (patch.label !== undefined || patch.node_type !== undefined) await refreshCurrent();
    else patchLocalNode(saved);
  }

  async function deleteNode(nodeId: number) {
    await api.deleteFlowNode(nodeId);
    setSelection(null);
    await refreshCurrent();
  }

  async function openDetailedFlowchart(node: FlowNode) {
    try {
      if (node.child_flowchart_id) {
        enterChild(node.child_flowchart_id);
        return;
      }
      const child = await api.createChildFlowchart(node.id);
      patchLocalNode({ ...node, child_flowchart_id: child.id, child_flowchart_name: child.name, has_child: true });
      setFlowcharts((current) => (current.some((item) => item.id === child.id) ? current : [...current, child]));
      enterChild(child.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open detailed flowchart');
    }
  }

  async function saveEdge(edgeId: number, patch: Partial<{ edge_type: FlowEdgeType; label: string | null }>) {
    const saved = await api.updateFlowEdge(edgeId, patch);
    setDetail((current) =>
      current ? { ...current, edges: current.edges.map((edge) => (edge.id === saved.id ? saved : edge)) } : current,
    );
  }

  async function deleteEdge(edgeId: number) {
    await api.deleteFlowEdge(edgeId);
    setSelection(null);
    await refreshCurrent();
  }

  const saveNodePosition = (nodeId: number, position: { x: number; y: number }) => {
    const node = nodesById.get(nodeId);
    if (node) patchLocalNode({ ...node, pos_x: position.x, pos_y: position.y });
    void api.updateFlowNode(nodeId, { pos_x: position.x, pos_y: position.y }).catch(() => {
      setError('Could not save node position');
    });
  };

  async function reorganize() {
    if (currentId === null) return;
    await api.reorganizeFlowchart(currentId);
    viewStates.clear(currentId);
    await loadDetail(currentId);
    setLayoutRevision((revision) => revision + 1);
  }

  const crumbs = path.map((id) => ({ id, name: names.get(id) ?? (detail?.flowchart.id === id ? detail.flowchart.name : `Flowchart ${id}`) }));
  const emptyWorkspace = listLoaded && !flowcharts.length && currentId === null;
  const visibleError = error ?? catalogError;

  return (
    <div className="graph-workspace graph-workspace-flow" data-testid="graph-workspace">
      <FlowchartCanvas
        detail={detail}
        viewStates={viewStates}
        layoutRevision={layoutRevision}
        selectedNodeId={selection?.kind === 'node' ? selection.id : null}
        selectedEdgeId={selection?.kind === 'edge' ? selection.id : null}
        onCanvasTap={() => {
          setSelection(null);
          setConceptPanelId(null);
        }}
        onEdgeTap={(edgeId) => {
          setConceptPanelId(null);
          setSelection({ kind: 'edge', id: edgeId });
        }}
        onNodeMoved={saveNodePosition}
        onNodeTap={handleNodeTap}
      />

      <FlowNavigator
        spaces={spaces}
        flowcharts={flowcharts}
        concepts={concepts}
        currentFlowchartId={currentId}
        onOpenFlowchart={openFlowchart}
        onSelectConcept={(conceptId) => {
          setSelection(null);
          setConceptPanelId(conceptId);
          onSelectConcept(conceptId);
        }}
      />

      <div className="graph-top-overlay flow-top-overlay">
        <div className="graph-breadcrumb" aria-label="Flowchart breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="graph-breadcrumb-item">
              {index > 0 && <span className="graph-breadcrumb-separator">/</span>}
              <button type="button" onClick={() => goToCrumb(index)}>
                {crumb.name}
              </button>
            </span>
          ))}
          {!crumbs.length && <span className="graph-breadcrumb-item">Flowcharts</span>}
        </div>
        <div className="graph-title-row">
          <button
            type="button"
            onClick={goBack}
            disabled={path.length < 2}
            className="graph-icon-button"
            title="Back to parent flowchart"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-wide text-white/[0.45]">
              {path.length > 1 ? 'Detailed flowchart' : 'Flowchart'}
            </p>
            <h1 className="truncate text-lg font-bold text-white">{detail?.flowchart.name ?? 'Semantic Study'}</h1>
            {detail?.flowchart.description && <p className="truncate text-[12px] text-white/55">{detail.flowchart.description}</p>}
          </div>
        </div>
        {(loading || visibleError || connectFrom.active) && (
          <div className={`graph-sidebar-status ${visibleError ? 'graph-sidebar-status-error' : ''}`}>
            {visibleError ??
              (connectFrom.active
                ? connectFrom.sourceId === null
                  ? 'Connect: click the step the flow leaves from'
                  : 'Connect: click the step the flow goes to'
                : 'Loading flowchart...')}
          </div>
        )}
      </div>

      <div className="graph-action-overlay">
        <button type="button" onClick={() => setQuickPanel('flowchart')} className="graph-sidebar-button">
          <Plus className="h-4 w-4" />
          New flowchart
        </button>
        <button
          type="button"
          onClick={() => setQuickPanel('node')}
          disabled={!detail}
          className="graph-sidebar-button graph-sidebar-button-primary"
        >
          <Plus className="h-4 w-4" />
          Add step
        </button>
        <button
          type="button"
          onClick={() => setConnectFrom((current) => (current.active ? { active: false, sourceId: null } : { active: true, sourceId: null }))}
          disabled={!detail}
          className={`graph-sidebar-button ${connectFrom.active ? 'graph-sidebar-button-primary' : ''}`}
          aria-pressed={connectFrom.active}
        >
          <Link2 className="h-4 w-4" />
          {connectFrom.active ? 'Cancel connect' : 'Connect steps'}
        </button>
        <button type="button" onClick={() => void reorganize()} disabled={!detail} className="graph-sidebar-button">
          <RefreshCw className="h-4 w-4" />
          Reorganize
        </button>
        <nav className="graph-mini-nav">
          {(['graph', 'study', 'dashboard', 'reconstruction'] as GraphDestination[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => onChangeView(view)}
              className={view === currentView ? 'graph-mini-nav-active' : ''}
            >
              {view === 'reconstruction' ? 'reconstruct' : view}
            </button>
          ))}
        </nav>
      </div>

      {emptyWorkspace && (
        <div className="graph-empty-state">
          <button type="button" className="graph-sidebar-button graph-sidebar-button-primary" onClick={() => setQuickPanel('flowchart')}>
            <Plus className="h-4 w-4" />
            Create your first flowchart
          </button>
        </div>
      )}
      {detail && !detail.nodes.length && !loading && (
        <div className="graph-empty-state">
          <button type="button" className="graph-sidebar-button graph-sidebar-button-primary" onClick={() => setQuickPanel('node')}>
            <Plus className="h-4 w-4" />
            Add the first step
          </button>
        </div>
      )}

      {quickPanel && (
        <FloatingPanel title={quickPanel === 'flowchart' ? 'New flowchart' : 'Add step'} onClose={() => setQuickPanel(null)}>
          {quickPanel === 'flowchart' && (
            <NewFlowchartForm
              spaces={spaces}
              defaultSpaceId={detail?.flowchart.knowledge_space_id ?? null}
              onCreated={async (flowchart) => {
                setQuickPanel(null);
                await loadLists();
                openFlowchart(flowchart.id);
              }}
            />
          )}
          {quickPanel === 'node' && detail && (
            <AddNodeForm
              concepts={concepts}
              flowchartId={detail.flowchart.id}
              onCreated={async (node) => {
                setQuickPanel(null);
                await refreshCurrent();
                setSelection({ kind: 'node', id: node.id });
              }}
            />
          )}
        </FloatingPanel>
      )}

      {selectedNode && (
        <NodeInspector
          key={selectedNode.id}
          node={selectedNode}
          concepts={concepts}
          relationships={relationships}
          onSave={saveNode}
          onDelete={deleteNode}
          onOpenChild={(node) => void openDetailedFlowchart(node)}
          onConnect={(nodeId) => setConnectFrom({ active: true, sourceId: nodeId })}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedEdge && (
        <EdgeInspector
          key={selectedEdge.id}
          edge={selectedEdge}
          sourceLabel={nodesById.get(selectedEdge.source_node_id)?.label ?? '?'}
          targetLabel={nodesById.get(selectedEdge.target_node_id)?.label ?? '?'}
          onSave={saveEdge}
          onDelete={deleteEdge}
          onClose={() => setSelection(null)}
        />
      )}
      {conceptPanel && !selectedNode && !selectedEdge && (
        <div className="graph-inspector-panel graph-floating-inspector" data-testid="concept-inspector">
          <button type="button" onClick={() => setConceptPanelId(null)} className="graph-inspector-close" title="Close Inspector">
            <X className="h-4 w-4" />
            <span className="sr-only">Close Inspector</span>
          </button>
          <DetailPanel
            concept={conceptPanel}
            relationship={null}
            relationships={relationships}
            questions={questions}
            concepts={concepts}
            onConceptSaved={async (concept) => {
              await onCatalogChanged();
              setConceptPanelId(concept.id);
            }}
            onRelationshipSaved={async () => {
              await onCatalogChanged();
            }}
            onStudyQuestion={onStudyQuestion}
            onExpandConcept={(conceptId) => {
              onSelectConcept(conceptId);
              setConceptPanelId(conceptId);
            }}
          />
        </div>
      )}
    </div>
  );
}
