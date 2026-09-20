import type { Point } from './elkLayout';
import type { ValidatedFlowLayout } from './flowLayout';

/** Everything needed to redraw a flowchart exactly as the user left it, without re-running layout.
 * (Selection is remembered by the page, which also drives the inspector.) */
export type FlowchartViewState = {
  signature: string;
  layout: ValidatedFlowLayout | null;
  positions: Record<string, Point>;
  routed: boolean;
  pan: Point;
  zoom: number;
};

export type FlowchartViewStateStore = {
  save: (flowchartId: number, state: FlowchartViewState) => void;
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
        pan: { ...state.pan },
      });
    },
    get: (flowchartId) => states.get(flowchartId),
    clear: (flowchartId) => {
      states.delete(flowchartId);
    },
  };
}
