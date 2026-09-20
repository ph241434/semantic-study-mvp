import cytoscape, { type Core, type EventObject } from 'cytoscape';
import { useEffect, useRef } from 'react';

import type { FlowchartDetail } from '../types';
import {
  buildFlowchartElements,
  edgeElementId,
  flowchartLayoutInputs,
  flowchartSignature,
  nodeElementId,
  parseEdgeElementId,
  parseNodeElementId,
} from './flowchartAdapter';
import type { Point } from './elkLayout';
import { layoutFlowchart, type ValidatedFlowLayout } from './flowLayout';
import { flowchartStyles } from './flowStyles';
import type { FlowchartViewStateStore } from './viewStateStore';

export const GRID_SIZE = 28;

type Props = {
  detail: FlowchartDetail | null;
  viewStates: FlowchartViewStateStore;
  /** Bumped by "Reorganize" to force a fresh automatic layout. */
  layoutRevision: number;
  selectedNodeId?: number | null;
  selectedEdgeId?: number | null;
  onNodeTap: (nodeId: number) => void;
  onEdgeTap?: (edgeId: number) => void;
  onCanvasTap?: () => void;
  onNodeMoved?: (nodeId: number, position: Point) => void;
};

type Applied = {
  flowchartId: number;
  signature: string;
  layout: ValidatedFlowLayout | null;
  routed: boolean;
};

function manualPositions(detail: FlowchartDetail): Record<string, Point> {
  const positions: Record<string, Point> = {};
  for (const node of detail.nodes) {
    if (node.pos_x !== null && node.pos_y !== null) positions[nodeElementId(node.id)] = { x: node.pos_x, y: node.pos_y };
  }
  return positions;
}

function currentPositions(cy: Core): Record<string, Point> {
  const positions: Record<string, Point> = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = { ...node.position() };
  });
  return positions;
}

export function FlowchartCanvas({
  detail,
  viewStates,
  layoutRevision,
  selectedNodeId = null,
  selectedEdgeId = null,
  onNodeTap,
  onEdgeTap,
  onCanvasTap,
  onNodeMoved,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const runIdRef = useRef(0);
  const appliedRef = useRef<Applied | null>(null);
  const detailRef = useRef(detail);
  const callbacks = useRef({ onNodeTap, onEdgeTap, onCanvasTap, onNodeMoved });
  const selectionRef = useRef({ node: selectedNodeId, edge: selectedEdgeId });
  const revisionRef = useRef(layoutRevision);
  selectionRef.current = { node: selectedNodeId, edge: selectedEdgeId };
  detailRef.current = detail;
  callbacks.current = { onNodeTap, onEdgeTap, onCanvasTap, onNodeMoved };

  const flowchartId = detail?.flowchart.id ?? null;
  const signature = detail ? flowchartSignature(detail) : 'empty';

  const saveViewState = () => {
    const cy = cyRef.current;
    const applied = appliedRef.current;
    if (!cy || !applied) return;
    viewStates.save(applied.flowchartId, {
      signature: applied.signature,
      layout: applied.layout,
      positions: currentPositions(cy),
      routed: applied.routed,
      pan: cy.pan(),
      zoom: cy.zoom(),
    });
  };
  const saveViewStateRef = useRef(saveViewState);
  saveViewStateRef.current = saveViewState;

  // One Cytoscape instance for the lifetime of the canvas.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      maxZoom: 2.4,
      minZoom: 0.1,
      style: flowchartStyles,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;
    if (import.meta.env.DEV) (window as Window & { __flowchartCy?: Core }).__flowchartCy = cy;

    const syncGrid = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const pan = cy.pan();
      const size = GRID_SIZE * cy.zoom();
      wrapper.style.setProperty('--grid-size', `${size}px`);
      wrapper.style.setProperty('--grid-x', `${pan.x}px`);
      wrapper.style.setProperty('--grid-y', `${pan.y}px`);
    };
    const unrouteEdges = () => {
      const applied = appliedRef.current;
      if (!applied?.routed) return;
      applied.routed = false;
      cy.batch(() => {
        cy.edges().forEach((edge) => {
          edge.data('routed', false);
        });
      });
    };

    const handleNodeTap = (event: EventObject) => {
      const id = parseNodeElementId(event.target.id());
      if (id !== null) callbacks.current.onNodeTap(id);
    };
    const handleEdgeTap = (event: EventObject) => {
      const id = parseEdgeElementId(event.target.id());
      if (id !== null) callbacks.current.onEdgeTap?.(id);
    };
    const handleCanvasTap = (event: EventObject) => {
      if (event.target === cy) callbacks.current.onCanvasTap?.();
    };
    const handleDragFree = (event: EventObject) => {
      const id = parseNodeElementId(event.target.id());
      if (id !== null) callbacks.current.onNodeMoved?.(id, { ...event.target.position() });
    };

    cy.on('viewport', syncGrid);
    cy.on('tap', 'node', handleNodeTap);
    cy.on('tap', 'edge', handleEdgeTap);
    cy.on('tap', handleCanvasTap);
    cy.on('drag', 'node', unrouteEdges);
    cy.on('dragfree', 'node', handleDragFree);
    syncGrid();

    return () => {
      saveViewStateRef.current();
      cy.destroy();
      cyRef.current = null;
      if (import.meta.env.DEV) delete (window as Window & { __flowchartCy?: Core }).__flowchartCy;
    };
  }, []);

  // Switch flowcharts / apply structural edits: stop stale work, save, replace atomically, restore or lay out.
  useEffect(() => {
    const cy = cyRef.current;
    const current = detailRef.current;
    const wrapper = wrapperRef.current;
    if (!cy) return undefined;

    const runId = ++runIdRef.current; // invalidates any layout still in flight
    // "Reorganize" bumps the revision: that must lay the graph out afresh, never restore a snapshot.
    const forceLayout = revisionRef.current !== layoutRevision;
    saveViewState();
    if (forceLayout && detailRef.current) viewStates.clear(detailRef.current.flowchart.id);
    // A structural edit to the flowchart already on screen keeps the user's pan and zoom.
    const sameChartEdit = appliedRef.current?.flowchartId === detailRef.current?.flowchart.id && revisionRef.current === layoutRevision;
    const keptViewport = sameChartEdit && cy.nodes().nonempty() ? { pan: { ...cy.pan() }, zoom: cy.zoom() } : null;
    revisionRef.current = layoutRevision;

    const finish = (
      elements: ReturnType<typeof buildFlowchartElements>,
      applied: Applied,
      viewport?: { pan: Point; zoom: number },
    ) => {
      cy.batch(() => {
        cy.elements().remove();
        cy.add(elements);
      });
      appliedRef.current = applied;
      cy.resize();
      if (viewport) {
        cy.zoom(viewport.zoom);
        cy.pan(viewport.pan);
      } else if (keptViewport) {
        cy.zoom(keptViewport.zoom);
        cy.pan(keptViewport.pan);
      } else if (cy.nodes().nonempty()) {
        cy.fit(cy.elements(), 60);
        if (cy.zoom() > 1) {
          cy.zoom(1);
          cy.center(cy.elements());
        }
      }
      // Selection is owned by the page (remembered per flowchart); apply whatever it currently asks for.
      const { node, edge } = selectionRef.current;
      if (edge !== null) cy.getElementById(edgeElementId(edge)).select();
      if (node !== null) cy.getElementById(nodeElementId(node)).select();
      if (wrapper) {
        wrapper.dataset.graphKey = String(applied.flowchartId);
        wrapper.dataset.nodeCount = String(cy.nodes().length);
        wrapper.dataset.edgeCount = String(cy.edges().length);
        wrapper.dataset.layoutValid = applied.layout ? String(applied.layout.validation.valid) : 'restored';
        wrapper.dataset.layoutAttempts = String(applied.layout?.attempts ?? 0);
      }
      cy.forceRender();
    };

    if (!current) {
      cy.elements().remove();
      appliedRef.current = null;
      return undefined;
    }

    const saved = viewStates.get(current.flowchart.id);
    if (saved && saved.signature === signature) {
      // Coming back to a flowchart: rebuild from the snapshot, no layout.
      finish(
        buildFlowchartElements(current, { layout: saved.layout, positions: saved.positions, routed: saved.routed }),
        { flowchartId: current.flowchart.id, signature, layout: saved.layout, routed: saved.routed },
        saved,
      );
      return undefined;
    }

    const manual = manualPositions(current);
    const hasManual = Object.keys(manual).length > 0;
    const inputs = flowchartLayoutInputs(current);
    void layoutFlowchart(inputs.nodes, inputs.edges).then((layout) => {
      if (runId !== runIdRef.current) return;
      finish(
        buildFlowchartElements(current, { layout, positions: manual, routed: !hasManual }),
        { flowchartId: current.flowchart.id, signature, layout, routed: !hasManual },
      );
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowchartId, signature, layoutRevision]);

  // Child-flowchart links change without changing the graph's shape, so update the marker in place.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !detail) return;
    for (const node of detail.nodes) {
      const element = cy.getElementById(nodeElementId(node.id));
      if (element.nonempty() && Boolean(element.data('hasChild')) !== node.has_child) element.data('hasChild', node.has_child);
    }
  }, [detail]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (selectedEdgeId !== null) cy.getElementById(edgeElementId(selectedEdgeId)).select();
    if (selectedNodeId !== null) cy.getElementById(nodeElementId(selectedNodeId)).select();
  }, [selectedEdgeId, selectedNodeId, flowchartId, signature]);

  return (
    <div ref={wrapperRef} className="flow-canvas" data-testid="flow-canvas">
      <div ref={containerRef} className="flow-canvas-cy" />
    </div>
  );
}
