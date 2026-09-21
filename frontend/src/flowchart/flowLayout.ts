import { computeFlowLayout, type FlowLayoutResult, type LayoutEdgeInput, type LayoutNodeInput } from './elkLayout';
import { geometryIssueCount, validateFlowGeometry, type FlowGeometryValidation } from './flowGeometry';

/** Spacing multipliers tried in order; the first geometrically clean layout wins (bounded retries). */
export const SPACING_ATTEMPTS = [1, 1.25, 1.5, 1.75];

export type ValidatedFlowLayout = FlowLayoutResult & {
  validation: FlowGeometryValidation;
  attempts: number;
  spacingScale: number;
  /** height / width of the laid-out graph; large values mean a tall, narrow chart. */
  aspectRatio: number;
};

/**
 * Lay a flowchart out and check the result: no overlapping nodes, no edge through an unrelated node, no two edges
 * sharing a visible path. Runs ONLY when a flowchart's structure changes or the user asks to reorganise; never
 * during pan, zoom, selection or hover.
 */
export async function layoutFlowchart(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Promise<ValidatedFlowLayout> {
  let best: ValidatedFlowLayout | null = null;
  for (let attempt = 0; attempt < SPACING_ATTEMPTS.length; attempt += 1) {
    const spacingScale = SPACING_ATTEMPTS[attempt];
    const layout = await computeFlowLayout(nodes, edges, spacingScale);
    const validation = validateFlowGeometry(layout.nodes, layout.edges);
    const aspectRatio = layout.bounds.width ? layout.bounds.height / layout.bounds.width : 1;
    const candidate = { ...layout, validation, attempts: attempt + 1, spacingScale, aspectRatio };
    if (!best || geometryIssueCount(validation) < geometryIssueCount(best.validation)) best = candidate;
    if (validation.valid) return candidate;
  }
  return { ...(best as ValidatedFlowLayout), attempts: SPACING_ATTEMPTS.length };
}
