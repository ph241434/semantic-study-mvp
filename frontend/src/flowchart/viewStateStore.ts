import type { Point } from './elkLayout';
import type { ValidatedFlowLayout } from './flowLayout';

export type Viewport = { x: number; y: number; zoom: number };

/**
 * Everything needed to redraw a flowchart exactly as the user left it without running layout again.
 * (Selection is remembered by the page, which also owns the inspector.)
 */
export type FlowchartViewState = {
  signature: string;
  /** Top-left node positions in flow coordinates. */
  positions: Record<string, Point>;
  layout: ValidatedFlowLayout | null;
  /** Whether ELK's edge routes still match the node positions (false once a node was moved by hand). */
  routed: boolean;
  /** Nodes placed by hand; they keep their position when the layout is recomputed after an edit. */
  manualIds: string[];
  viewport: Viewport;
};

export type FlowchartViewStateStore = {
  save: (flowchartId: number, state: FlowchartViewState) => void;
  /** Update only the viewport of an existing entry (cheap; called when a pan/zoom gesture ends). */
  saveViewport: (flowchartId: number, viewport: Viewport) => void;
  get: (flowchartId: number) => FlowchartViewState | undefined;
  clear: (flowchartId: number) => void;
};

export function createViewStateStore(): FlowchartViewStateStore {
  const states = new Map<number, FlowchartViewState>();
  return {
    save: (flowchartId, state) => {
      states.set(flowchartId, {
        ...state,
        positions: Object.fromEntries(Object.entries(state.positions).map(([id, point]) => [id, { ...point }])),
        manualIds: [...state.manualIds],
        viewport: { ...state.viewport },
      });
    },
    saveViewport: (flowchartId, viewport) => {
      const existing = states.get(flowchartId);
      if (existing) existing.viewport = { ...viewport };
    },
    get: (flowchartId) => states.get(flowchartId),
    clear: (flowchartId) => {
      states.delete(flowchartId);
    },
  };
}
