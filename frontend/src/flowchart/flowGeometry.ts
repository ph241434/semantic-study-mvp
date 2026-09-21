import type { LayoutEdgeResult, LayoutNodeResult, Point } from './elkLayout';

export type Rect = { x: number; y: number; width: number; height: number };

export type FlowGeometryValidation = {
  valid: boolean;
  nodeOverlaps: Array<[string, string]>;
  edgeNodeIntersections: Array<{ edgeId: string; nodeId: string }>;
  edgeOverlaps: Array<[string, string]>;
};

/** Minimum gap between two node boxes. */
export const NODE_CLEARANCE = 6;
/** Edges may touch their own endpoints; every other node box is shrunk-free but inflated by this. */
export const EDGE_NODE_CLEARANCE = 2;
/** Two edges must share less than this much collinear length to count as independent. */
export const EDGE_OVERLAP_LENGTH = 8;

const rectsOverlap = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

/** Liang–Barsky: does the segment p→q cross the (open) rectangle? */
export function segmentIntersectsRect(p: Point, q: Point, rect: Rect, inflate = 0): boolean {
  const xMin = rect.x - inflate;
  const xMax = rect.x + rect.width + inflate;
  const yMin = rect.y - inflate;
  const yMax = rect.y + rect.height + inflate;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (delta: number, distance: number) => {
    if (delta === 0) return distance >= 0;
    const ratio = distance / delta;
    if (delta < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
    return true;
  };
  return (
    clip(-dx, p.x - xMin) &&
    clip(dx, xMax - p.x) &&
    clip(-dy, p.y - yMin) &&
    clip(dy, yMax - p.y) &&
    t1 - t0 > 1e-9
  );
}

/** Length of the collinear overlap between two axis-aligned or identical-direction segments. */
function collinearOverlap(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const tol = 1;
  const aVertical = Math.abs(a1.x - a2.x) < tol;
  const bVertical = Math.abs(b1.x - b2.x) < tol;
  const aHorizontal = Math.abs(a1.y - a2.y) < tol;
  const bHorizontal = Math.abs(b1.y - b2.y) < tol;
  if (aVertical && bVertical && Math.abs(a1.x - b1.x) < tol) {
    return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
  }
  if (aHorizontal && bHorizontal && Math.abs(a1.y - b1.y) < tol) {
    return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
  }
  return 0;
}

export function edgesOverlapLength(a: Point[], b: Point[]): number {
  let total = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      total += collinearOverlap(a[i], a[i + 1], b[j], b[j + 1]);
    }
  }
  return total;
}

export function validateFlowGeometry(nodes: LayoutNodeResult[], edges: LayoutEdgeResult[]): FlowGeometryValidation {
  const nodeOverlaps: Array<[string, string]> = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (rectsOverlap(nodes[i], nodes[j], NODE_CLEARANCE)) nodeOverlaps.push([nodes[i].id, nodes[j].id]);
    }
  }

  const edgeNodeIntersections: Array<{ edgeId: string; nodeId: string }> = [];
  for (const edge of edges) {
    for (const node of nodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      for (let i = 0; i < edge.points.length - 1; i += 1) {
        if (segmentIntersectsRect(edge.points[i], edge.points[i + 1], node, EDGE_NODE_CLEARANCE)) {
          edgeNodeIntersections.push({ edgeId: edge.id, nodeId: node.id });
          break;
        }
      }
    }
  }

  const edgeOverlaps: Array<[string, string]> = [];
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      if (edgesOverlapLength(edges[i].points, edges[j].points) > EDGE_OVERLAP_LENGTH) {
        edgeOverlaps.push([edges[i].id, edges[j].id]);
      }
    }
  }

  return {
    valid: !nodeOverlaps.length && !edgeNodeIntersections.length && !edgeOverlaps.length,
    nodeOverlaps,
    edgeNodeIntersections,
    edgeOverlaps,
  };
}

export const geometryIssueCount = (validation: FlowGeometryValidation) =>
  validation.nodeOverlaps.length + validation.edgeNodeIntersections.length + validation.edgeOverlaps.length;
