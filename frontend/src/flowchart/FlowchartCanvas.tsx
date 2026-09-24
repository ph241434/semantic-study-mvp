import {
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useStoreApi,
  type Connection,
  type NodeChange,
  type OnMoveEnd,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { FlowchartDetail } from '../types';
import { FlowEdgeView } from './FlowEdgeView';
import { FlowchartNode } from './FlowchartNode';
import {
  buildFlowEdges,
  buildFlowNodes,
  edgeElementId,
  flowchartSignature,
  layoutInputs,
  manualPositions,
  nodeElementId,
  parseEdgeElementId,
  parseNodeElementId,
  type FlowRfNode,
} from './flowAdapter';
import type { Point } from './elkLayout';
import { layoutFlowchart, type ValidatedFlowLayout } from './flowLayout';
import { GRID_SIZE, lodForZoom } from './flowStyles';
import type { FlowchartViewStateStore, Viewport } from './viewStateStore';

const nodeTypes = { flow: FlowchartNode };
const edgeTypes = { flow: FlowEdgeView };
const FIT_OPTIONS = { padding: 0.14, maxZoom: 1 } as const;

type Props = {
  detail: FlowchartDetail;
  viewStates: FlowchartViewStateStore;
  /** Bumped by "Reorganize": forces a fresh automatic layout and a fit-to-view. */
  layoutRevision: number;
  selectedNodeId: number | null;
  selectedEdgeId: number | null;
  /** The one node currently in inline label-edit mode, if any (set right after "Add step" creates it). */
  editingNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  onSelectEdge: (edgeId: number) => void;
  onClearSelection: () => void;
  onOpenDetail: (nodeId: number) => void;
  onNodeMoved: (nodeId: number, position: Point) => void;
  onConnect: (sourceNodeId: number, targetNodeId: number) => void;
  onRenameNode: (nodeId: number, label: string) => void;
  onCancelEditNode: () => void;
};

/**
 * Pan and zoom are pure viewport operations: React Flow moves its viewport transform and nothing else. This hook is
 * the ONLY thing that reacts to a viewport change, and it does so by writing a few CSS variables / one attribute on
 * the container directly, so the grid follows the graph and the level of detail can switch without a React render,
 * layout, geometry validation or network request.
 */
function useViewportEffects(containerRef: RefObject<HTMLElement | null>) {
  const store = useStoreApi();
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let lastLod = '';
    const apply = (transform: [number, number, number]) => {
      const [x, y, zoom] = transform;
      container.style.setProperty('--grid-size', `${GRID_SIZE * zoom}px`);
      container.style.setProperty('--grid-x', `${x}px`);
      container.style.setProperty('--grid-y', `${y}px`);
      const lod = lodForZoom(zoom);
      if (lod !== lastLod) {
        lastLod = lod;
        container.dataset.lod = lod;
      }
    };
    apply(store.getState().transform);
    return store.subscribe((state, previous) => {
      if (state.transform !== previous.transform) apply(state.transform);
    });
  }, [containerRef, store]);
}

function ViewportEffects({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  useViewportEffects(containerRef);
  return null;
}

export function FlowchartCanvas(props: Props) {
  // One canvas instance per flowchart: switching flowcharts replaces the whole graph (nothing can accumulate).
  return (
    <ReactFlowProvider>
      <FlowchartCanvasInner key={props.detail.flowchart.id} {...props} />
    </ReactFlowProvider>
  );
}

function FlowchartCanvasInner({
  detail,
  viewStates,
  layoutRevision,
  selectedNodeId,
  selectedEdgeId,
  editingNodeId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onOpenDetail,
  onNodeMoved,
  onConnect,
  onRenameNode,
  onCancelEditNode,
}: Props) {
  const flowchartId = detail.flowchart.id;
  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const signature = useMemo(() => flowchartSignature(detail), [detail]);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  // Coming back to a flowchart: restore the snapshot and skip layout entirely.
  const [initial] = useState(() => {
    const saved = viewStates.get(flowchartId);
    return saved && saved.signature === flowchartSignature(detail) ? saved : undefined;
  });

  const [nodes, setNodes] = useState<FlowRfNode[]>(() => (initial ? buildFlowNodes(detail, initial.positions) : []));
  const [layout, setLayout] = useState<ValidatedFlowLayout | null>(initial?.layout ?? null);
  const [routed, setRouted] = useState(initial?.routed ?? true);
  const [ready, setReady] = useState(Boolean(initial));

  const nodesRef = useRef(nodes);
  const layoutRef = useRef(layout);
  const routedRef = useRef(routed);
  nodesRef.current = nodes;
  layoutRef.current = layout;
  routedRef.current = routed;

  const manualIds = useRef<Set<string>>(new Set(initial?.manualIds ?? Object.keys(manualPositions(detail))));
  const viewportRef = useRef<Viewport>(initial?.viewport ?? { x: 0, y: 0, zoom: 1 });
  const appliedSignature = useRef<string | null>(initial ? signature : null);
  const appliedRevision = useRef(layoutRevision);
  const callbacks = useRef({ onSelectNode, onSelectEdge, onClearSelection, onOpenDetail, onNodeMoved, onConnect, onRenameNode, onCancelEditNode });
  callbacks.current = { onSelectNode, onSelectEdge, onClearSelection, onOpenDetail, onNodeMoved, onConnect, onRenameNode, onCancelEditNode };

  const saveState = useCallback(() => {
    if (appliedSignature.current === null) return;
    const positions: Record<string, Point> = {};
    for (const node of nodesRef.current) positions[node.id] = { ...node.position };
    viewStates.save(flowchartId, {
      signature: appliedSignature.current,
      positions,
      layout: layoutRef.current,
      routed: routedRef.current,
      manualIds: [...manualIds.current],
      viewport: viewportRef.current,
    });
  }, [flowchartId, viewStates]);
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  // Save the view when leaving this flowchart (the component is replaced on switch).
  useEffect(() => () => saveStateRef.current(), []);

  // Layout runs ONLY here: on first display, when the graph's structure changes, or on Reorganize.
  useEffect(() => {
    const revisionChanged = appliedRevision.current !== layoutRevision;
    if (!revisionChanged && appliedSignature.current === signature) return undefined;
    appliedRevision.current = layoutRevision;
    if (revisionChanged) manualIds.current.clear();

    let cancelled = false; // switching or re-laying out stops the run that is still in flight
    const current = detailRef.current;
    const inputs = layoutInputs(current);
    void layoutFlowchart(inputs.nodes, inputs.edges).then((result) => {
      if (cancelled) return;
      const positions: Record<string, Point> = {};
      for (const node of result.nodes) positions[node.id] = { x: node.x, y: node.y };
      if (!revisionChanged) {
        // Hand-placed nodes keep their spot (saved ones from the server, plus any moved this session).
        Object.assign(positions, manualPositions(detailRef.current));
        for (const node of nodesRef.current) if (manualIds.current.has(node.id)) positions[node.id] = { ...node.position };
        for (const id of Object.keys(manualPositions(detailRef.current))) manualIds.current.add(id);
      }
      appliedSignature.current = signature;
      setLayout(result);
      setNodes(buildFlowNodes(detailRef.current, positions));
      setRouted(manualIds.current.size === 0);
      setReady(true);
      if (revisionChanged) {
        void Promise.resolve(rf.fitView(FIT_OPTIONS)).then(() => {
          viewportRef.current = rf.getViewport();
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signature, layoutRevision, rf]);

  // Non-structural edits (child link, concept name) refresh node data in place: no layout, no new elements.
  useEffect(() => {
    setNodes((previous) => {
      let changed = false;
      const byId = new Map(detail.nodes.map((node) => [nodeElementId(node.id), node]));
      const next = previous.map((node) => {
        const source = byId.get(node.id);
        if (!source) return node;
        const hasChild = source.child_flowchart_id !== null;
        if (node.data.hasChild === hasChild && node.data.conceptName === source.concept_name) return node;
        changed = true;
        return { ...node, data: { ...node.data, hasChild, conceptName: source.concept_name } };
      });
      return changed ? next : previous;
    });
  }, [detail]);

  const onNodesChange = useCallback((changes: NodeChange<FlowRfNode>[]) => {
    // Selection is owned by the page (it drives the inspector), so React Flow's own select changes are ignored.
    const applicable = changes.filter((change) => change.type !== 'select' && change.type !== 'remove');
    if (applicable.length) setNodes((previous) => applyNodeChanges(applicable, previous));
  }, []);

  const renderNodes = useMemo(() => {
    const selectedElementId = selectedNodeId !== null ? nodeElementId(selectedNodeId) : null;
    const editingElementId = editingNodeId !== null ? nodeElementId(editingNodeId) : null;
    return nodes.map((node) => {
      if (node.id !== selectedElementId && node.id !== editingElementId) return node;
      const next = node.id === selectedElementId ? { ...node, selected: true } : node;
      if (node.id !== editingElementId) return next;
      const id = parseNodeElementId(node.id);
      if (id === null) return next;
      return {
        ...next,
        data: {
          ...next.data,
          editing: {
            onSave: (label: string) => callbacks.current.onRenameNode(id, label),
            onCancel: () => callbacks.current.onCancelEditNode(),
          },
        },
      };
    });
  }, [nodes, selectedNodeId, editingNodeId]);

  const edges = useMemo(() => {
    const built = buildFlowEdges(detail, layout, routed);
    const selectedId = selectedEdgeId !== null ? edgeElementId(selectedEdgeId) : null;
    return selectedId ? built.map((edge) => (edge.id === selectedId ? { ...edge, selected: true } : edge)) : built;
  }, [detail, layout, routed, selectedEdgeId]);

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      viewportRef.current = viewport;
      viewStates.saveViewport(flowchartId, viewport);
    },
    [flowchartId, viewStates],
  );

  const onConnectNodes = useCallback((connection: Connection) => {
    const source = parseNodeElementId(connection.source);
    const target = parseNodeElementId(connection.target);
    if (source !== null && target !== null && source !== target) callbacks.current.onConnect(source, target);
  }, []);

  if (!ready) return <div className="flow-canvas flow-canvas-loading" data-testid="flow-canvas" data-flowchart-id={flowchartId} />;

  return (
    <div
      ref={containerRef}
      className="flow-canvas"
      data-testid="flow-canvas"
      data-flowchart-id={flowchartId}
      data-node-count={nodes.length}
      data-edge-count={edges.length}
      data-layout-valid={layout ? String(layout.validation.valid) : 'restored'}
      data-layout-aspect={layout ? layout.aspectRatio.toFixed(2) : ''}
    >
      <ReactFlow<FlowRfNode>
        nodes={renderNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => {
          const id = parseNodeElementId(node.id);
          if (id !== null) callbacks.current.onSelectNode(id);
        }}
        onNodeDoubleClick={(_event, node) => {
          const id = parseNodeElementId(node.id);
          if (id !== null) callbacks.current.onOpenDetail(id);
        }}
        onEdgeClick={(_event, edge) => {
          const id = parseEdgeElementId(edge.id);
          if (id !== null) callbacks.current.onSelectEdge(id);
        }}
        onPaneClick={() => callbacks.current.onClearSelection()}
        onNodeDragStart={() => setRouted(false)}
        onNodeDragStop={(_event, node) => {
          manualIds.current.add(node.id);
          const id = parseNodeElementId(node.id);
          if (id !== null) callbacks.current.onNodeMoved(id, { ...node.position });
          nodesRef.current = nodesRef.current.map((item) => (item.id === node.id ? { ...item, position: { ...node.position } } : item));
          routedRef.current = false;
          saveStateRef.current();
        }}
        onConnect={onConnectNodes}
        onMoveEnd={onMoveEnd}
        onInit={() => {
          if (!initial) viewportRef.current = rf.getViewport();
        }}
        defaultViewport={initial?.viewport}
        fitView={!initial}
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.1}
        maxZoom={2.2}
        connectionRadius={36}
        deleteKeyCode={null}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        nodesFocusable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <ViewportEffects containerRef={containerRef} />
      </ReactFlow>
    </div>
  );
}
