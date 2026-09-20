import type { StylesheetJson } from 'cytoscape';
import type { FlowEdgeType, FlowNodeType } from '../types';

export type NodeVisual = {
  /** Cytoscape node shape. Shape (not colour alone) carries the node type. */
  shape: string;
  fill: string;
  border: string;
  borderStyle: 'solid' | 'double';
  borderWidth: number;
  /** Extra horizontal / vertical padding around the label when sizing the box. */
  padX: number;
  padY: number;
  minWidth: number;
  minHeight: number;
  maxTextWidth: number;
};

// Small semantic palette on the dark canvas: teal = start/end, slate = process, amber = decision,
// green = data flowing in/out, indigo/violet = things that hide more detail or live elsewhere.
export const NODE_STYLE_MAP: Record<FlowNodeType, NodeVisual> = {
  START: { shape: 'round-rectangle', fill: '#10302d', border: '#38d8cc', borderStyle: 'solid', borderWidth: 2, padX: 40, padY: 22, minWidth: 110, minHeight: 40, maxTextWidth: 130 },
  END: { shape: 'round-rectangle', fill: '#10302d', border: '#38d8cc', borderStyle: 'solid', borderWidth: 2, padX: 40, padY: 22, minWidth: 110, minHeight: 40, maxTextWidth: 130 },
  PROCESS: { shape: 'rectangle', fill: '#172033', border: '#6f8bbd', borderStyle: 'solid', borderWidth: 2, padX: 36, padY: 26, minWidth: 130, minHeight: 46, maxTextWidth: 150 },
  DECISION: { shape: 'diamond', fill: '#33290e', border: '#f8d477', borderStyle: 'solid', borderWidth: 2, padX: 84, padY: 58, minWidth: 150, minHeight: 84, maxTextWidth: 100 },
  INPUT_OUTPUT: { shape: 'rhomboid', fill: '#182d24', border: '#8fd98f', borderStyle: 'solid', borderWidth: 2, padX: 64, padY: 26, minWidth: 150, minHeight: 46, maxTextWidth: 130 },
  SUBPROCESS: { shape: 'rectangle', fill: '#1c2140', border: '#9aa8ff', borderStyle: 'double', borderWidth: 5, padX: 40, padY: 30, minWidth: 140, minHeight: 50, maxTextWidth: 150 },
  EXTERNAL_SYSTEM: { shape: 'hexagon', fill: '#2a2033', border: '#c9a0dc', borderStyle: 'solid', borderWidth: 2, padX: 60, padY: 30, minWidth: 150, minHeight: 56, maxTextWidth: 120 },
  DATA: { shape: 'cut-rectangle', fill: '#2b2118', border: '#e0a06b', borderStyle: 'solid', borderWidth: 2, padX: 44, padY: 26, minWidth: 130, minHeight: 46, maxTextWidth: 140 },
};

export type EdgeVisual = { color: string; lineStyle: 'solid' | 'dashed' | 'dotted' };

export const EDGE_STYLE_MAP: Record<FlowEdgeType | 'SEMANTIC', EdgeVisual> = {
  NEXT: { color: '#8b97ad', lineStyle: 'solid' },
  YES: { color: '#38d8cc', lineStyle: 'solid' },
  SUCCESS: { color: '#38d8cc', lineStyle: 'solid' },
  NO: { color: '#f59f7d', lineStyle: 'solid' },
  FAILURE: { color: '#f59f7d', lineStyle: 'solid' },
  RETRY: { color: '#c8a6ff', lineStyle: 'dashed' },
  // Not shown by default; reserved for a later "show semantic relationships" overlay.
  SEMANTIC: { color: '#5f6b80', lineStyle: 'dotted' },
};

export const FLOW_NODE_TYPES = Object.keys(NODE_STYLE_MAP) as FlowNodeType[];
export const FLOW_EDGE_TYPES: FlowEdgeType[] = ['NEXT', 'YES', 'NO', 'SUCCESS', 'FAILURE', 'RETRY'];

export function nodeVisual(type: string): NodeVisual {
  return NODE_STYLE_MAP[type as FlowNodeType] ?? NODE_STYLE_MAP.PROCESS;
}

export function edgeVisual(type: string): EdgeVisual {
  return EDGE_STYLE_MAP[type as FlowEdgeType | 'SEMANTIC'] ?? EDGE_STYLE_MAP.NEXT;
}

export const flowchartStyles = [
  {
    selector: 'node',
    style: {
      shape: 'data(shape)',
      width: 'data(width)',
      height: 'data(height)',
      label: 'data(label)',
      'background-color': 'data(fill)',
      'border-color': 'data(border)',
      'border-style': 'data(borderStyle)',
      'border-width': 'data(borderWidth)',
      color: '#e8ecf5',
      'font-family': 'Inter, system-ui, Segoe UI, sans-serif',
      'font-size': 13,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': 'data(textWidth)',
      'corner-radius': 'data(cornerRadius)',
      'overlay-opacity': 0,
    },
  },
  {
    // A node that opens a deeper flowchart shows a faint stacked "card" behind it.
    selector: 'node[?hasChild]',
    style: {
      ghost: 'yes',
      'ghost-offset-x': 5,
      'ghost-offset-y': 5,
      'ghost-opacity': 0.45,
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-color': '#ffffff', 'border-width': 3 },
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'line-color': 'data(color)',
      'line-style': 'data(lineStyle)',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(color)',
      'arrow-scale': 1.1,
      'curve-style': 'taxi',
      'taxi-direction': 'vertical',
      'taxi-turn': '50%',
      'taxi-turn-min-distance': 12,
      label: '',
      'source-label': 'data(label)',
      'source-text-offset': 26,
      'font-size': 11,
      'font-weight': 600,
      color: 'data(color)',
      'text-background-color': '#090b0f',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
      'overlay-opacity': 0,
    },
  },
  {
    // Live taxi routing (after a manual move): branches share the first vertical run out of a node, so a
    // source-anchored label would stack YES on NO. Midpoint labels sit on each edge's own horizontal run.
    selector: 'edge[!routed]',
    style: {
      label: 'data(label)',
      'source-label': '',
      'text-rotation': 'none',
    },
  },
  {
    // Routes computed by ELK: follow its bend points exactly.
    selector: 'edge[?routed][bendCount > 0]',
    style: {
      'curve-style': 'segments',
      'edge-distances': 'endpoints',
      'segment-distances': 'data(segDistances)',
      'segment-weights': 'data(segWeights)',
      'source-endpoint': 'data(sourceEndpoint)',
      'target-endpoint': 'data(targetEndpoint)',
    },
  },
  {
    // A route with no bend points is a single straight run between its two end points.
    selector: 'edge[?routed][bendCount = 0]',
    style: {
      'curve-style': 'straight',
      'source-endpoint': 'data(sourceEndpoint)',
      'target-endpoint': 'data(targetEndpoint)',
    },
  },
  {
    selector: 'edge[edgeType="SEMANTIC"]',
    style: { width: 1, 'line-style': 'dotted', opacity: 0.5, 'target-arrow-shape': 'none' },
  },
  {
    selector: 'edge:selected',
    style: { width: 3.5, 'line-color': '#ffffff', 'target-arrow-color': '#ffffff' },
  },
] as unknown as StylesheetJson;
