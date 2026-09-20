import cytoscape, {
  type Core,
  type EdgeSingular,
  type EventObject,
  type LayoutOptions,
  type NodeSingular,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import { graphViewSignature, graphViewToElements } from './CytoscapeGraphAdapter';
import { cytoscapeStyles } from './cytoscapeStyles';
import {
  curveDistanceUpdatesForValidation,
  layoutOptionsForAttempt,
  resolveEdgeNodeIntersectionPositions,
  resolveNodeOverlapPositions,
  validateGeometry,
  type GeometryBox,
  type GeometrySnapshot,
  type GeometryValidation,
} from './graphGeometry';
import type { CytoscapeGraphElement, CytoscapeGraphView, GraphEdgeTap, GraphNodeTap, GraphPoint } from './graphTypes';

type Props = {
  view: CytoscapeGraphView | null;
  layoutOptions: LayoutOptions;
  layoutRevision: number;
  manualPositions?: Record<string, GraphPoint>;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onNodeTap: (node: GraphNodeTap) => void;
  onEdgeTap?: (edge: GraphEdgeTap) => void;
  onCanvasTap?: () => void;
  onNodePositionChange?: (nodeId: string, position: GraphPoint) => void;
  onLayoutPositionsComputed?: (viewKey: string, positions: Record<string, GraphPoint>) => void;
};

type CytoscapeLayout = ReturnType<Core['layout']>;
type LayoutMode = 'auto' | 'idle' | 'restored';
type CytoscapeCallbacks = {
  onCanvasTap?: () => void;
  onEdgeTap?: (edge: GraphEdgeTap) => void;
  onLayoutPositionsComputed?: (viewKey: string, positions: Record<string, GraphPoint>) => void;
  onNodePositionChange?: (nodeId: string, position: GraphPoint) => void;
  onNodeTap: (node: GraphNodeTap) => void;
};

type GraphDiagnostics = {
  activeViewKey: string;
  duplicatePositionCount: number;
  edgeCount: number;
  edges: Array<{
    edgeType: string;
    id: string;
    label: string;
    source: string;
    target: string;
  }>;
  eventBindingBatches: number;
  layoutInProgress: boolean;
  layoutMode: LayoutMode;
  layoutRunCount: number;
  layoutValidation?: {
    attempt: number;
    edgeNodeIntersectionCount: number;
    edgeOverlapWarningCount: number;
    nodeOverlapCount: number;
    valid: boolean;
  };
  nodeCount: number;
  nodes: Array<{
    boundary: boolean;
    id: string;
    label: string;
    position: GraphPoint;
    region: string;
    renderedPosition: GraphPoint;
  }>;
};

const MAX_VALIDATED_LAYOUT_ATTEMPTS = 3;
const MAX_DETERMINISTIC_CORRECTION_PASSES = 4;
let fcoseRegistered = false;

export function CytoscapeGraph({
  view,
  layoutOptions,
  layoutRevision,
  manualPositions = {},
  selectedNodeId = null,
  selectedEdgeId = null,
  onNodeTap,
  onEdgeTap,
  onCanvasTap,
  onNodePositionChange,
  onLayoutPositionsComputed,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const activeLayoutRef = useRef<CytoscapeLayout | null>(null);
  const layoutRunIdRef = useRef(0);
  const layoutRunCountRef = useRef(0);
  const eventBindingBatchesRef = useRef(0);
  const manualPositionsRef = useRef(manualPositions);
  const previousElementSignature = useRef<string | null>(null);
  const previousGraphKey = useRef<string | null>(null);
  const previousLayoutRevision = useRef(layoutRevision);
  const lastLayoutValidationRef = useRef<GeometryValidation | undefined>(undefined);
  const lastLayoutValidationGraphKeyRef = useRef<string | null>(null);
  const callbacks = useRef<CytoscapeCallbacks>({
    onCanvasTap,
    onEdgeTap,
    onLayoutPositionsComputed,
    onNodePositionChange,
    onNodeTap,
  });

  callbacks.current = { onCanvasTap, onEdgeTap, onLayoutPositionsComputed, onNodePositionChange, onNodeTap };
  manualPositionsRef.current = manualPositions;

  const stylesheet = useMemo(() => cytoscapeStyles, []);
  const elements = useMemo(() => (view ? graphViewToElements(view) : []), [view]);
  const graphKey = view?.viewKey ?? 'loading';
  const elementSignature = useMemo(() => (view ? graphViewSignature(view) : 'loading'), [view]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    registerCytoscapeExtensions();
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      maxZoom: 2.4,
      minZoom: 0.035,
      style: stylesheet,
    });
    cyRef.current = cy;
    if (import.meta.env.DEV) {
      (window as Window & { __semanticStudyCytoscape?: Core }).__semanticStudyCytoscape = cy;
    }

    const handleNodeTap = (event: EventObject) => {
      const node = event.target;
      const entityId = node.data('entityId');
      callbacks.current.onNodeTap({
        id: node.id(),
        boundary: Boolean(node.data('boundary')),
        entityId: typeof entityId === 'number' ? entityId : null,
        entityType: node.data('entityType'),
        topicId: typeof node.data('topicId') === 'number' ? node.data('topicId') : null,
      });
    };
    const handleEdgeTap = (event: EventObject) => {
      const edge = event.target;
      callbacks.current.onEdgeTap?.({
        id: edge.id(),
        edgeType: edge.data('edgeType'),
        relationshipId: typeof edge.data('relationshipId') === 'number' ? edge.data('relationshipId') : null,
      });
    };
    const handleCanvasTap = (event: EventObject) => {
      if (event.target === cy) callbacks.current.onCanvasTap?.();
    };
    const handleDragFree = (event: EventObject) => {
      const node = event.target;
      callbacks.current.onNodePositionChange?.(node.id(), node.position());
    };

    cy.on('tap', 'node', handleNodeTap);
    cy.on('tap', 'edge', handleEdgeTap);
    cy.on('tap', handleCanvasTap);
    cy.on('dragfree', 'node', handleDragFree);
    eventBindingBatchesRef.current += 1;

    return () => {
      activeLayoutRef.current?.stop();
      activeLayoutRef.current = null;
      cy.off('tap', 'node', handleNodeTap);
      cy.off('tap', 'edge', handleEdgeTap);
      cy.off('tap', handleCanvasTap);
      cy.off('dragfree', 'node', handleDragFree);
      if (import.meta.env.DEV) {
        const devWindow = window as Window & { __semanticStudyCytoscape?: Core };
        if (devWindow.__semanticStudyCytoscape === cy) {
          delete devWindow.__semanticStudyCytoscape;
        }
      }
      cy.destroy();
      cyRef.current = null;
    };
  }, [stylesheet]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const graphChanged = previousGraphKey.current !== graphKey;
    const layoutChanged = previousLayoutRevision.current !== layoutRevision;
    const elementsChanged = previousElementSignature.current !== elementSignature;
    previousGraphKey.current = graphKey;
    previousLayoutRevision.current = layoutRevision;
    previousElementSignature.current = elementSignature;

    applyGraphView({
      activeLayoutRef,
      callbacksRef: callbacks,
      cy,
      elements,
      eventBindingBatchesRef,
      graphKey,
      lastLayoutValidationGraphKeyRef,
      lastLayoutValidationRef,
      layoutChanged,
      layoutOptions,
      layoutRunCountRef,
      layoutRunIdRef,
      manualPositions: manualPositionsRef.current,
      shouldRunLayout: graphChanged || layoutChanged || elementsChanged,
      viewType: view?.type ?? null,
    });
  }, [elementSignature, elements, graphKey, layoutOptions, layoutRevision, view?.type]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || activeLayoutRef.current) return;
    applyManualPositions(cy, manualPositions);
    publishDiagnostics(
      cy,
      graphKey,
      layoutRunCountRef.current,
      eventBindingBatchesRef.current,
      false,
      'restored',
      lastLayoutValidationGraphKeyRef.current === graphKey ? lastLayoutValidationRef.current : undefined,
    );
    cy.forceRender();
  }, [graphKey, manualPositions]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().unselect();
    if (selectedEdgeId) cy.getElementById(selectedEdgeId).select();
    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId);
      if (node.nonempty()) {
        node.select();
      }
    }
  }, [selectedEdgeId, selectedNodeId]);

  return (
    <div
      ref={containerRef}
      className="cytoscape-graph"
      data-testid="cytoscape-graph"
      data-graph-key={graphKey}
      data-node-count={view?.nodes.length ?? 0}
      data-edge-count={view?.edges.length ?? 0}
    />
  );
}

function applyGraphView({
  cy,
  elements,
  graphKey,
  layoutChanged,
  layoutOptions,
  manualPositions,
  shouldRunLayout,
  viewType,
  activeLayoutRef,
  callbacksRef,
  layoutRunCountRef,
  layoutRunIdRef,
  eventBindingBatchesRef,
  lastLayoutValidationGraphKeyRef,
  lastLayoutValidationRef,
}: {
  cy: Core;
  elements: CytoscapeGraphElement[];
  graphKey: string;
  layoutChanged: boolean;
  layoutOptions: LayoutOptions;
  manualPositions: Record<string, GraphPoint>;
  shouldRunLayout: boolean;
  viewType: CytoscapeGraphView['type'] | null;
  activeLayoutRef: MutableRefObject<CytoscapeLayout | null>;
  callbacksRef: MutableRefObject<CytoscapeCallbacks>;
  layoutRunCountRef: MutableRefObject<number>;
  layoutRunIdRef: MutableRefObject<number>;
  eventBindingBatchesRef: MutableRefObject<number>;
  lastLayoutValidationGraphKeyRef: MutableRefObject<string | null>;
  lastLayoutValidationRef: MutableRefObject<GeometryValidation | undefined>;
}) {
  activeLayoutRef.current?.stop();
  activeLayoutRef.current = null;
  const layoutRunId = layoutRunIdRef.current + 1;
  layoutRunIdRef.current = layoutRunId;

  const nodeIds = nodeElementIds(elements);
  const canRestorePositions = !layoutChanged && hasCompleteManualPositions(nodeIds, manualPositions);
  const shouldAutoLayout = shouldRunLayout && !canRestorePositions;
  const layoutMode: LayoutMode = shouldAutoLayout ? 'auto' : canRestorePositions ? 'restored' : 'idle';

  cy.batch(() => {
    cy.elements().unselect();
    cy.elements().remove();
    cy.add(elements);
    if (canRestorePositions) {
      applyManualPositions(cy, manualPositions);
    } else if (viewType !== 'topic') {
      seedNodePositions(cy);
    }
  });

  publishDiagnostics(
    cy,
    graphKey,
    layoutRunCountRef.current,
    eventBindingBatchesRef.current,
    shouldAutoLayout && elements.length > 0,
    layoutMode,
  );
  if (!elements.length) {
    cy.resize();
    cy.forceRender();
    return;
  }

  if (!shouldAutoLayout) {
    finishGraphRender({
      callbacksRef,
      cy,
      eventBindingBatchesRef,
      graphKey,
      lastLayoutValidationGraphKeyRef,
      lastLayoutValidationRef,
      layoutMode,
      layoutRunCountRef,
      savePositions: false,
    });
    return;
  }

  runValidatedLayoutAttempt({
    activeLayoutRef,
    attempt: 0,
    callbacksRef,
    cy,
    eventBindingBatchesRef,
    graphKey,
    lastLayoutValidationGraphKeyRef,
    lastLayoutValidationRef,
    layoutOptions,
    layoutRunCountRef,
    layoutRunId,
    layoutRunIdRef,
    maxAttempts: layoutOptions.name === 'fcose' ? MAX_VALIDATED_LAYOUT_ATTEMPTS : 1,
  });
}

function runValidatedLayoutAttempt({
  activeLayoutRef,
  attempt,
  callbacksRef,
  cy,
  eventBindingBatchesRef,
  graphKey,
  lastLayoutValidationGraphKeyRef,
  lastLayoutValidationRef,
  layoutOptions,
  layoutRunCountRef,
  layoutRunId,
  layoutRunIdRef,
  maxAttempts,
}: {
  activeLayoutRef: MutableRefObject<CytoscapeLayout | null>;
  attempt: number;
  callbacksRef: MutableRefObject<CytoscapeCallbacks>;
  cy: Core;
  eventBindingBatchesRef: MutableRefObject<number>;
  graphKey: string;
  lastLayoutValidationGraphKeyRef: MutableRefObject<string | null>;
  lastLayoutValidationRef: MutableRefObject<GeometryValidation | undefined>;
  layoutOptions: LayoutOptions;
  layoutRunCountRef: MutableRefObject<number>;
  layoutRunId: number;
  layoutRunIdRef: MutableRefObject<number>;
  maxAttempts: number;
}) {
  layoutRunCountRef.current += 1;
  const layout = cy.layout(layoutOptionsForAttempt(layoutOptions, attempt));
  activeLayoutRef.current = layout;
  layout.one('layoutstop', () => {
    if (layoutRunIdRef.current !== layoutRunId) return;

    activeLayoutRef.current = null;
    const snapshot = collectGeometrySnapshot(cy);
    let validation = validateGeometry(snapshot, attempt);

    if (!validation.valid && attempt < maxAttempts - 1) {
      applyCurveDistanceUpdates(cy, curveDistanceUpdatesForValidation(snapshot, validation, attempt));
      runValidatedLayoutAttempt({
        activeLayoutRef,
        attempt: attempt + 1,
        callbacksRef,
        cy,
        eventBindingBatchesRef,
        graphKey,
        lastLayoutValidationGraphKeyRef,
        lastLayoutValidationRef,
        layoutOptions,
        layoutRunCountRef,
        layoutRunId,
        layoutRunIdRef,
        maxAttempts,
      });
      return;
    }

    validation = applyDeterministicCorrections(cy, validation, attempt);
    finishGraphRender({
      callbacksRef,
      cy,
      eventBindingBatchesRef,
      graphKey,
      lastLayoutValidationGraphKeyRef,
      lastLayoutValidationRef,
      layoutMode: 'auto',
      layoutRunCountRef,
      savePositions: true,
      validation,
    });
  });
  layout.run();
}

function applyDeterministicCorrections(cy: Core, initialValidation: GeometryValidation, attempt: number) {
  let validation = initialValidation;
  for (let pass = 0; pass < MAX_DETERMINISTIC_CORRECTION_PASSES && !validation.valid; pass += 1) {
    const snapshot = collectGeometrySnapshot(cy);
    const nodePositions = resolveNodeOverlapPositions(snapshot);
    const edgeNodePositions = resolveEdgeNodeIntersectionPositions(
      snapshot,
      validation.edgeNodeIntersections,
      attempt + pass,
    );
    const curveDistances = curveDistanceUpdatesForValidation(snapshot, validation, attempt + pass);
    const nodesChanged = applyNodePositions(cy, { ...nodePositions, ...edgeNodePositions });
    const curvesChanged = applyCurveDistanceUpdates(cy, curveDistances);
    const changed = nodesChanged || curvesChanged;
    if (!changed) break;
    validation = validateGeometry(collectGeometrySnapshot(cy), attempt);
  }
  return validation;
}

function finishGraphRender({
  callbacksRef,
  cy,
  eventBindingBatchesRef,
  graphKey,
  lastLayoutValidationGraphKeyRef,
  lastLayoutValidationRef,
  layoutMode,
  layoutRunCountRef,
  savePositions,
  validation,
}: {
  callbacksRef: MutableRefObject<CytoscapeCallbacks>;
  cy: Core;
  eventBindingBatchesRef: MutableRefObject<number>;
  graphKey: string;
  lastLayoutValidationGraphKeyRef: MutableRefObject<string | null>;
  lastLayoutValidationRef: MutableRefObject<GeometryValidation | undefined>;
  layoutMode: LayoutMode;
  layoutRunCountRef: MutableRefObject<number>;
  savePositions: boolean;
  validation?: GeometryValidation;
}) {
  cy.resize();
  if (cy.elements().length > 0) cy.fit(cy.elements(), 90);
  if (savePositions) {
    lastLayoutValidationGraphKeyRef.current = graphKey;
    lastLayoutValidationRef.current = validation;
    callbacksRef.current.onLayoutPositionsComputed?.(graphKey, collectNodePositions(cy));
  }
  publishDiagnostics(cy, graphKey, layoutRunCountRef.current, eventBindingBatchesRef.current, false, layoutMode, validation);
  cy.forceRender();
}

function applyManualPositions(cy: Core, manualPositions: Record<string, GraphPoint>) {
  Object.entries(manualPositions).forEach(([nodeId, position]) => {
    const node = cy.getElementById(nodeId);
    if (node.nonempty() && isGraphPoint(position)) {
      node.position(position);
    }
  });
}

function applyNodePositions(cy: Core, positions: Record<string, GraphPoint>) {
  let changed = false;
  Object.entries(positions).forEach(([nodeId, position]) => {
    const node = cy.getElementById(nodeId);
    if (node.nonempty() && isGraphPoint(position)) {
      node.position(position);
      changed = true;
    }
  });
  return changed;
}

function applyCurveDistanceUpdates(cy: Core, updates: Record<string, number>) {
  let changed = false;
  Object.entries(updates).forEach(([edgeId, curveDistance]) => {
    const edge = cy.getElementById(edgeId);
    if (edge.nonempty() && Number.isFinite(curveDistance) && edge.data('curveDistance') !== curveDistance) {
      edge.data('curveDistance', curveDistance);
      changed = true;
    }
  });
  return changed;
}

function seedNodePositions(cy: Core) {
  const nodes = cy.nodes().toArray().sort((left, right) => left.id().localeCompare(right.id()));
  if (!nodes.length) return;

  const columns = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / columns);
  const spacing = 190;
  nodes.forEach((node, index) => {
    const seedPosition = node.data('seedPosition') as GraphPoint | undefined;
    if (isGraphPoint(seedPosition)) {
      node.position(seedPosition);
      return;
    }
    const column = index % columns;
    const row = Math.floor(index / columns);
    node.position({
      x: (column - (columns - 1) / 2) * spacing,
      y: (row - (rows - 1) / 2) * spacing,
    });
  });
}

function collectGeometrySnapshot(cy: Core): GeometrySnapshot {
  const nodes = cy.nodes().toArray().map((node) => {
    const box = node.boundingBox({ includeLabels: true, includeOverlays: false });
    return {
      box: boxFromCytoscape(box),
      id: node.id(),
      position: node.position(),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = cy.edges('[edgeType = "semantic"]').toArray().flatMap((edge) => {
    const source = edge.source().id();
    const target = edge.target().id();
    if (!nodeIds.has(source) || !nodeIds.has(target)) return [];
    return [
      {
        curveDistance: numberData(edge, 'curveDistance', 46),
        curveWeight: numberData(edge, 'curveWeight', 0.5),
        id: edge.id(),
        source,
        target,
      },
    ];
  });

  return { edges, nodes };
}

function boxFromCytoscape(box: { x1: number; x2: number; y1: number; y2: number }): GeometryBox {
  return {
    x1: Number(box.x1.toFixed(2)),
    x2: Number(box.x2.toFixed(2)),
    y1: Number(box.y1.toFixed(2)),
    y2: Number(box.y2.toFixed(2)),
  };
}

function numberData(edge: EdgeSingular, key: string, fallback: number) {
  const value = edge.data(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function collectNodePositions(cy: Core) {
  const positions: Record<string, GraphPoint> = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = roundPoint(node.position());
  });
  return positions;
}

function nodeElementIds(elements: CytoscapeGraphElement[]) {
  return elements.flatMap((element) => {
    const id = element.data?.id;
    return element.group === 'nodes' && typeof id === 'string' ? [id] : [];
  });
}

function hasCompleteManualPositions(nodeIds: string[], manualPositions: Record<string, GraphPoint>) {
  return nodeIds.length > 0 && nodeIds.every((nodeId) => isGraphPoint(manualPositions[nodeId]));
}

function publishDiagnostics(
  cy: Core,
  activeViewKey: string,
  layoutRunCount: number,
  eventBindingBatches: number,
  layoutInProgress: boolean,
  layoutMode: LayoutMode = 'idle',
  layoutValidation?: GeometryValidation,
) {
  if (!import.meta.env.DEV) return;
  const nodes = cy.nodes().map((node) => ({
    boundary: Boolean(node.data('boundary')),
    id: node.id(),
    label: String(node.data('label') ?? ''),
    position: roundPoint(node.position()),
    region: String(node.data('region') ?? ''),
    renderedPosition: roundPoint(node.renderedPosition()),
  }));
  const diagnostics: GraphDiagnostics = {
    activeViewKey,
    duplicatePositionCount: duplicatePositions(cy.nodes().toArray()),
    edgeCount: cy.edges().length,
    edges: cy.edges().map((edge) => ({
      edgeType: String(edge.data('edgeType') ?? ''),
      id: edge.id(),
      label: String(edge.data('label') ?? ''),
      source: edge.source().id(),
      target: edge.target().id(),
    })),
    eventBindingBatches,
    layoutInProgress,
    layoutMode,
    layoutRunCount,
    layoutValidation: layoutValidation
      ? {
          attempt: layoutValidation.attempt,
          edgeNodeIntersectionCount: layoutValidation.edgeNodeIntersections.length,
          edgeOverlapWarningCount: layoutValidation.edgeOverlapWarnings.length,
          nodeOverlapCount: layoutValidation.nodeOverlaps.length,
          valid: layoutValidation.valid,
        }
      : undefined,
    nodeCount: cy.nodes().length,
    nodes,
  };
  (window as Window & { __semanticStudyGraphDiagnostics?: GraphDiagnostics }).__semanticStudyGraphDiagnostics =
    diagnostics;
  cy.container()?.setAttribute('data-graph-diagnostics', JSON.stringify(diagnostics));
}

function duplicatePositions(nodes: NodeSingular[]) {
  const buckets = new Map<string, number>();
  nodes.forEach((node) => {
    const position = node.position();
    const key = `${Math.round(position.x)}:${Math.round(position.y)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return Array.from(buckets.values()).reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function registerCytoscapeExtensions() {
  if (fcoseRegistered) return;
  cytoscape.use(fcose);
  fcoseRegistered = true;
}

function isGraphPoint(value: unknown): value is GraphPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as GraphPoint;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function roundPoint(point: GraphPoint): GraphPoint {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  };
}
