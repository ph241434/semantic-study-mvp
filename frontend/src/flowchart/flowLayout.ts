import { computeFlowLayout, type FlowLayoutResult, type LayoutEdgeInput, type LayoutNodeInput } from './elkLayout';
import { geometryIssueCount, validateFlowGeometry, type FlowGeometryValidation } from './flowGeometry';

/** Spacing multipliers tried in order; the first geometrically clean layout wins. */
export const SPACING_ATTEMPTS = [1, 1.25, 1.5, 1.75];

export type ValidatedFlowLayout = FlowLayoutResult & {
  validation: FlowGeometryValidation;
  attempts: number;
  spacingScale: number;
};

export async function layoutFlowchart(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Promise<ValidatedFlowLayout> {
  let best: ValidatedFlowLayout | null = null;
  for (let attempt = 0; attempt < SPACING_ATTEMPTS.length; attempt += 1) {
    const spacingScale = SPACING_ATTEMPTS[attempt];
    const layout = await computeFlowLayout(nodes, edges, spacingScale);
    const validation = validateFlowGeometry(layout.nodes, layout.edges);
    const candidate = { ...layout, validation, attempts: attempt + 1, spacingScale };
    if (!best || geometryIssueCount(validation) < geometryIssueCount(best.validation)) best = candidate;
    if (validation.valid) return candidate;
  }
  return { ...(best as ValidatedFlowLayout), attempts: SPACING_ATTEMPTS.length };
}
