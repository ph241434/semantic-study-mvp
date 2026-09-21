import type { FlowEdgeType, FlowNodeType } from '../types';

/** How a node type is drawn. Shape, border and label carry the type; colour only reinforces it. */
export type NodeShape = 'terminal' | 'rectangle' | 'diamond' | 'parallelogram' | 'subprocess' | 'hexagon' | 'document';

export type NodeVisual = {
  shape: NodeShape;
  label: string;
  /** Fill / outline on the dark canvas. A small palette: teal terminals, slate process, amber decision, green data flow, violet detail/external. */
  fill: string;
  stroke: string;
  /** Extra room around the text so it stays inside the shape (diamonds waste the corners). */
  padX: number;
  padY: number;
  minWidth: number;
  minHeight: number;
  maxTextWidth: number;
};

export const NODE_VISUALS: Record<FlowNodeType, NodeVisual> = {
  start: { shape: 'terminal', label: 'Start', fill: '#10302d', stroke: '#38d8cc', padX: 36, padY: 18, minWidth: 104, minHeight: 38, maxTextWidth: 130 },
  end: { shape: 'terminal', label: 'End', fill: '#10302d', stroke: '#38d8cc', padX: 36, padY: 18, minWidth: 104, minHeight: 38, maxTextWidth: 130 },
  process: { shape: 'rectangle', label: 'Process', fill: '#172033', stroke: '#6f8bbd', padX: 32, padY: 22, minWidth: 128, minHeight: 44, maxTextWidth: 150 },
  decision: { shape: 'diamond', label: 'Decision', fill: '#33290e', stroke: '#f8d477', padX: 76, padY: 48, minWidth: 148, minHeight: 78, maxTextWidth: 96 },
  input_output: { shape: 'parallelogram', label: 'Input / output', fill: '#182d24', stroke: '#8fd98f', padX: 56, padY: 22, minWidth: 144, minHeight: 44, maxTextWidth: 130 },
  subprocess: { shape: 'subprocess', label: 'Subprocess', fill: '#1c2140', stroke: '#9aa8ff', padX: 44, padY: 24, minWidth: 140, minHeight: 48, maxTextWidth: 140 },
  external_system: { shape: 'hexagon', label: 'External system', fill: '#2a2033', stroke: '#c9a0dc', padX: 52, padY: 26, minWidth: 148, minHeight: 52, maxTextWidth: 120 },
  data: { shape: 'document', label: 'Data / artifact', fill: '#2b2118', stroke: '#e0a06b', padX: 40, padY: 22, minWidth: 128, minHeight: 44, maxTextWidth: 130 },
};

export const FLOW_NODE_TYPES = Object.keys(NODE_VISUALS) as FlowNodeType[];
export const FLOW_EDGE_TYPES: FlowEdgeType[] = ['normal', 'yes', 'no', 'success', 'failure', 'retry'];

export function nodeVisual(type: string): NodeVisual {
  return NODE_VISUALS[type as FlowNodeType] ?? NODE_VISUALS.process;
}

export type EdgeVisual = { color: string; dashed: boolean };

/** Process edges. Semantic relationships are a different concept and get their own (secondary) style. */
export const EDGE_VISUALS: Record<FlowEdgeType | 'semantic', EdgeVisual> = {
  normal: { color: '#8b97ad', dashed: false },
  yes: { color: '#38d8cc', dashed: false },
  success: { color: '#38d8cc', dashed: false },
  no: { color: '#f59f7d', dashed: false },
  failure: { color: '#f59f7d', dashed: false },
  retry: { color: '#c8a6ff', dashed: true },
  // Reserved for a later "show semantic relationships" overlay; never drawn by default.
  semantic: { color: '#5f6b80', dashed: true },
};

export function edgeVisual(type: string): EdgeVisual {
  return EDGE_VISUALS[type as FlowEdgeType | 'semantic'] ?? EDGE_VISUALS.normal;
}

const CHAR_WIDTH = 7.2;
const LINE_HEIGHT = 17;

/** Deterministic box size from the label, so layout can run before anything is measured. */
export function estimateNodeSize(label: string, type: string): { width: number; height: number } {
  const visual = nodeVisual(type);
  const textWidth = Math.min(visual.maxTextWidth, Math.max(1, label.length) * CHAR_WIDTH);
  const lines = Math.max(1, Math.ceil((label.length * CHAR_WIDTH) / visual.maxTextWidth));
  return {
    width: Math.max(visual.minWidth, Math.ceil(textWidth + visual.padX)),
    height: Math.max(visual.minHeight, lines * LINE_HEIGHT + visual.padY),
  };
}

// --- semantic zoom (level of detail) -------------------------------------------------------------------------------

export type LodLevel = 'low' | 'normal' | 'high';

export const LOD_LOW_BELOW = 0.55;
export const LOD_HIGH_ABOVE = 1.35;

export function lodForZoom(zoom: number): LodLevel {
  if (zoom < LOD_LOW_BELOW) return 'low';
  if (zoom > LOD_HIGH_ABOVE) return 'high';
  return 'normal';
}

export const GRID_SIZE = 28;
