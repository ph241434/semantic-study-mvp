import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import { ConceptCard, EdgeInspector, NodeInspector, type EdgePatch, type NodePatch } from '../flowchart/FlowInspector';
import { FlowNavigator, type CreationRequest } from '../flowchart/FlowNavigator';
import { FlowchartCanvas } from '../flowchart/FlowchartCanvas';
import { createViewStateStore, type FlowchartViewStateStore } from '../flowchart/viewStateStore';
import type { Concept, FlowEdgeType, FlowNode, Flowchart, FlowchartDetail, KnowledgeEntry, Relationship } from '../types';

type Props = {
  entries: KnowledgeEntry[];
  /** Kept by the app so a flowchart's pan / zoom / positions survive leaving and returning to this screen. */
  viewStates?: FlowchartViewStateStore;
  onOpenKnowledge: () => void;
  onOpenConceptExplorer: (conceptId: number, name: string) => void;
  /** Optimistically merges a folder created from the sidebar into the app-wide entries list. */
  onEntryCreated?: (entry: KnowledgeEntry) => void;
};

type Selection = { kind: 'node'; id: number } | { kind: 'edge'; id: number } | null;

/** The flowchart to show first: the requested one, else the oldest top-level (not a "detail") flowchart. */
export function pickInitialFlowchart(flowcharts: Flowchart[], requestedId: number | null): Flowchart | null {
  if (!flowcharts.length) return null;
  return (
    flowcharts.find((item) => item.id === requestedId) ??
    flowcharts.filter((item) => item.used_by_count === 0).sort((a, b) => a.id - b.id)[0] ??
    flowcharts[0]
  );
}

/**
 * Hierarchical flowchart workspace. Every flowchart is its own directed graph; opening a step's detailed flowchart
 * pushes onto `path` (the breadcrumb) and Back pops it. A parent is restored from `viewStates`, not laid out again.
 * The default screen is deliberately quiet: navigator, breadcrumb, canvas and two buttons. Everything else appears
 * only when something is selected.
 */
export function FlowchartPage({ entries, viewStates: externalViewStates, onOpenKnowledge, onOpenConceptExplorer, onEntryCreated }: Props) {
  const ownViewStates = useRef(createViewStateStore());
  const viewStates = externalViewStates ?? ownViewStates.current;

  const [flowcharts, setFlowcharts] = useState<Flowchart[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  const [detail, setDetail] = useState<FlowchartDetail | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [conceptId, setConceptId] = useState<number | null>(null);
  const [creationRequest, setCreationRequest] = useState<CreationRequest | null>(null);
  /** The one node currently in inline label-edit mode on the canvas, if any — set right after "Add step". */
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selections = useRef(new Map<number, Selection>());

  const currentId = path.length ? path[path.length - 1] : null;

  const loadFlowcharts = useCallback(async () => {
    try {
      const list = await api.flowcharts();
      setFlowcharts(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load flowcharts');
      return [];
    } finally {
      setListLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadFlowcharts().then((list) => {
      if (!active) return;
      const requested = Number(new URLSearchParams(window.location.search).get('flowchart')) || null;
      const first = pickInitialFlowchart(list, requested);
      if (first) setPath((current) => (current.length ? current : [first.id]));
    });
    api.concepts().then((list) => active && setConcepts(list)).catch(() => undefined);
    api.relationships().then((list) => active && setRelationships(list)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [loadFlowcharts]);

  const loadDetail = useCallback(async (flowchartId: number) => {
    setLoading(true);
    try {
      const next = await api.flowchart(flowchartId);
      setDetail(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the flowchart');
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
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Could not load the flowchart'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [currentId]);

  const names = useMemo(() => new Map(flowcharts.map((item) => [item.id, item.name])), [flowcharts]);
  const nodesById = useMemo(() => new Map((detail?.nodes ?? []).map((node) => [node.id, node])), [detail]);
  const selectedNode = selection?.kind === 'node' ? nodesById.get(selection.id) ?? null : null;
  const selectedEdge = selection?.kind === 'edge' ? detail?.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const conceptCard = conceptId !== null ? concepts.find((item) => item.id === conceptId) ?? null : null;

  // --- navigation: every flowchart is a clean, independent graph view -------------------------------------------------

  const navigateTo = (nextPath: number[]) => {
    if (currentId !== null) selections.current.set(currentId, selection);
    const target = nextPath.length ? nextPath[nextPath.length - 1] : null;
    setSelection(target !== null ? selections.current.get(target) ?? null : null);
    setConceptId(null);
    setPath(nextPath);
  };
  const openFlowchart = (flowchartId: number) => navigateTo([flowchartId]);
  const enterChild = (flowchartId: number) => navigateTo([...path, flowchartId]);
  const goBack = () => {
    if (path.length > 1) navigateTo(path.slice(0, -1));
  };
  const goToCrumb = (index: number) => {
    if (index < path.length - 1) navigateTo(path.slice(0, index + 1));
  };

  const refreshCurrent = async () => {
    if (currentId !== null) await loadDetail(currentId);
    await loadFlowcharts();
  };

  const patchLocalNode = (node: FlowNode) =>
    setDetail((current) => (current ? { ...current, nodes: current.nodes.map((item) => (item.id === node.id ? node : item)) } : current));

  // --- editing --------------------------------------------------------------------------------------------------------

  async function openDetail(node: FlowNode) {
    try {
      if (node.child_flowchart_id !== null) {
        enterChild(node.child_flowchart_id);
        return;
      }
      const child = await api.createFlowchart({
        name: node.label,
        description: node.description,
        folder_id: detail?.flowchart.folder_id ?? null,
      });
      const linked = await api.updateFlowNode(node.id, { child_flowchart_id: child.id });
      patchLocalNode(linked);
      setFlowcharts((current) => [...current, { ...child, used_by_count: 1 }]);
      enterChild(child.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the detailed flowchart');
    }
  }

  async function connect(sourceId: number, targetId: number) {
    if (!detail) return;
    const source = nodesById.get(sourceId);
    let edgeType: FlowEdgeType = 'normal';
    let label: string | null = null;
    if (source?.node_type === 'decision') {
      const used = detail.edges.filter((edge) => edge.source_node_id === sourceId).map((edge) => edge.edge_type);
      edgeType = used.includes('yes') ? 'no' : 'yes';
      label = edgeType.toUpperCase();
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
      setError(err instanceof Error ? err.message : 'Could not connect the steps');
    }
  }

  async function saveNode(nodeId: number, patch: NodePatch) {
    const saved = await api.updateFlowNode(nodeId, patch);
    // A new label or type changes the graph's shape, so re-read it and let the canvas lay it out again.
    if (patch.label !== undefined && patch.label !== nodesById.get(nodeId)?.label) await refreshCurrent();
    else if (patch.node_type !== undefined && patch.node_type !== nodesById.get(nodeId)?.node_type) await refreshCurrent();
    else patchLocalNode(saved);
  }

  async function deleteNode(nodeId: number) {
    await api.deleteFlowNode(nodeId);
    setSelection(null);
    await refreshCurrent();
  }

  async function saveEdge(edgeId: number, patch: EdgePatch) {
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
    if (node) patchLocalNode({ ...node, x: position.x, y: position.y });
    void api.updateFlowNode(nodeId, { x: position.x, y: position.y }).catch(() => setError('Could not save the node position'));
  };

  async function reorganize() {
    if (currentId === null) return;
    try {
      await api.reorganizeFlowchart(currentId);
      viewStates.clear(currentId);
      await loadDetail(currentId);
      setLayoutRevision((revision) => revision + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorganize');
    }
  }

  const crumbs = path.map((id) => ({
    id,
    name: names.get(id) ?? (detail?.flowchart.id === id ? detail.flowchart.name : `Flowchart ${id}`),
  }));
  const emptyWorkspace = listLoaded && flowcharts.length === 0 && currentId === null;

  async function handleFlowchartCreated(flowchart: Flowchart) {
    await loadFlowcharts();
    openFlowchart(flowchart.id);
  }

  /**
   * Creates a "New step" node immediately — no form first. The canvas is the primary editor: the node appears
   * there right away, selected, and immediately editable inline (its label input is autofocused); the existing
   * NodeInspector remains available for description/type/concept once the inline rename is done. A new node
   * always changes the flowchart's shape, so `refreshCurrent()` (and the relayout it triggers by changing
   * FlowchartCanvas's structural signature) is unavoidable here — there's no way to add a node without it, and
   * that's true today for any shape-changing edit (see `saveNode` below), not something this feature introduces.
   * The node is created with no x/y, so the existing automatic-layout fallback places it, same as any other
   * auto-positioned node; no extra placement logic is needed (see the final report for why viewport-relative
   * placement was not attempted).
   */
  async function addStep(flowchartId: number) {
    try {
      const node = await api.createFlowNode(flowchartId, { label: 'New step' });
      if (flowchartId !== currentId) {
        // Not currently open: jump to it, same as left-clicking that flowchart in the sidebar already does.
        openFlowchart(flowchartId);
        void loadFlowcharts();
      } else {
        await refreshCurrent();
      }
      setSelection({ kind: 'node', id: node.id });
      setEditingNodeId(node.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the step');
    }
  }

  async function renameNode(nodeId: number, label: string) {
    try {
      await saveNode(nodeId, { label });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the step name');
    } finally {
      setEditingNodeId(null);
    }
  }

  function cancelEditNode() {
    setEditingNodeId(null);
  }

  return (
    <div className="proto-app flow-app" data-testid="flowchart-page">
      <header className="proto-topbar flow-topbar">
        <nav className="proto-breadcrumb" aria-label="Flowchart breadcrumb" data-testid="flow-breadcrumb">
          {crumbs.length === 0 && <span className="proto-breadcrumb-item proto-breadcrumb-item-current">Flowcharts</span>}
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="proto-breadcrumb-segment">
              {index > 0 && <span className="proto-breadcrumb-separator">{'›'}</span>}
              <button
                type="button"
                className={`proto-breadcrumb-item${index === crumbs.length - 1 ? ' proto-breadcrumb-item-current' : ''}`}
                onClick={() => goToCrumb(index)}
                disabled={index === crumbs.length - 1}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="flow-toolbar">
          {(loading || error) && <span className={`flow-status${error ? ' flow-status-error' : ''}`}>{error ?? 'Loading…'}</span>}
          {path.length > 1 && (
            <button type="button" className="flow-tool-btn" onClick={goBack} aria-label="Back to parent flowchart" title="Back to parent flowchart">
              <ArrowLeft size={15} />
            </button>
          )}
          <button type="button" className="flow-tool-btn" onClick={() => detail && void addStep(detail.flowchart.id)} disabled={!detail}>
            <Plus size={15} /> Add step
          </button>
          <button type="button" className="flow-tool-btn" onClick={() => void reorganize()} disabled={!detail} title="Run the automatic layout again">
            <RefreshCw size={15} /> Reorganize
          </button>
        </div>
      </header>

      <div className="flow-body">
        <FlowNavigator
          entries={entries}
          flowcharts={flowcharts}
          concepts={concepts}
          currentFlowchartId={currentId}
          currentFolderId={detail?.flowchart.folder_id ?? null}
          creationRequest={creationRequest}
          onRequestCreation={setCreationRequest}
          onOpenFlowchart={openFlowchart}
          onSelectConcept={(id) => {
            setSelection(null);
            setConceptId(id);
          }}
          onOpenKnowledge={onOpenKnowledge}
          onEntryCreated={(entry) => onEntryCreated?.(entry)}
          onFlowchartCreated={(flowchart) => void handleFlowchartCreated(flowchart)}
          onAddStep={(flowchartId) => void addStep(flowchartId)}
        />

        <main className="flow-stage">
          {detail && (
            <FlowchartCanvas
              detail={detail}
              viewStates={viewStates}
              layoutRevision={layoutRevision}
              selectedNodeId={selection?.kind === 'node' ? selection.id : null}
              selectedEdgeId={selection?.kind === 'edge' ? selection.id : null}
              editingNodeId={editingNodeId}
              onSelectNode={(id) => {
                setConceptId(null);
                setSelection({ kind: 'node', id });
              }}
              onSelectEdge={(id) => {
                setConceptId(null);
                setSelection({ kind: 'edge', id });
              }}
              onClearSelection={() => {
                setSelection(null);
                setConceptId(null);
              }}
              onOpenDetail={(id) => {
                const node = nodesById.get(id);
                if (node && node.child_flowchart_id !== null) enterChild(node.child_flowchart_id);
              }}
              onNodeMoved={saveNodePosition}
              onConnect={(source, target) => void connect(source, target)}
              onRenameNode={(nodeId, label) => void renameNode(nodeId, label)}
              onCancelEditNode={cancelEditNode}
            />
          )}

          {emptyWorkspace && (
            <div className="flow-empty">
              <button type="button" className="flow-btn flow-btn-primary" onClick={() => setCreationRequest({ kind: 'flowchart', parentId: null })}>
                <Plus size={15} /> Create your first flowchart
              </button>
            </div>
          )}
          {detail && detail.nodes.length === 0 && !loading && (
            <div className="flow-empty">
              <button type="button" className="flow-btn flow-btn-primary" onClick={() => void addStep(detail.flowchart.id)}>
                <Plus size={15} /> Add the first step
              </button>
            </div>
          )}

          {/* Suppressed while this node is being renamed inline: the inspector's own "Step name" field only
              syncs from the node on mount, so keeping both open at once could show it a stale label. Hiding it
              during the inline edit forces a fresh mount (with the saved label) once the rename finishes. */}
          {selectedNode && editingNodeId !== selectedNode.id && (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              concepts={concepts}
              relationships={relationships}
              onSave={saveNode}
              onDelete={deleteNode}
              onOpenDetail={(node) => void openDetail(node)}
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
          {conceptCard && !selectedNode && !selectedEdge && (
            <ConceptCard
              concept={conceptCard}
              concepts={concepts}
              relationships={relationships}
              onOpenExplorer={(concept) => onOpenConceptExplorer(concept.id, concept.name)}
              onClose={() => setConceptId(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
