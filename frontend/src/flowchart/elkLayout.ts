import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

export type Point = { x: number; y: number };

export type LayoutNodeInput = { id: string; width: number; height: number; shape?: string };
export type LayoutEdgeInput = { id: string; source: string; target: string };

/** Top-left position and size of one node in flow coordinates. */
export type LayoutNodeResult = { id: string; x: number; y: number; width: number; height: number };

export type LayoutEdgeResult = {
  id: string;
  source: string;
  target: string;
  /** Start point, bend points..., end point in flow coordinates (start and end sit on the node outlines). */
  points: Point[];
  /** True when the edge returns to an earlier (higher) step: a loop / feedback edge. */
  backEdge: boolean;
};

export type FlowLayoutResult = {
  nodes: LayoutNodeResult[];
  edges: LayoutEdgeResult[];
  bounds: { x: number; y: number; width: number; height: number };
};

/**
 * Directed layered layout (ELK "layered") flowing TOP -> BOTTOM.
 *
 * - Cycles are legal. MODEL_ORDER cycle breaking treats an edge that points back to an earlier-listed step as the
 *   feedback edge, and ELK routes it up the outside of the forward flow.
 * - Merges and multiple incoming edges are ordinary layered-graph structure; no node is ever duplicated.
 * - Orthogonal routing keeps edges off unrelated nodes. ``spacingScale`` widens every gap on validation retries.
 * - Parallel branches, independent inputs and merges use horizontal space (NETWORK_SIMPLEX placement + crossing
 *   minimisation); layer gaps are kept modest so a serial chain does not become needlessly tall.
 */
export function elkLayoutOptions(spacingScale = 1, extra: Record<string, string> = {}): Record<string, string> {
  const s = (value: number) => String(Math.round(value * spacingScale));
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.spacing.nodeNodeBetweenLayers': s(40),
    'elk.spacing.nodeNode': s(44),
    'elk.layered.spacing.edgeNodeBetweenLayers': s(28),
    'elk.spacing.edgeNode': s(24),
    'elk.layered.spacing.edgeEdgeBetweenLayers': s(20),
    'elk.spacing.edgeEdge': s(18),
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': s(64),
    'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
    'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    ...extra,
  };
}

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elkInstance: Elk | null = null;

// ELK is large, so it is loaded the first time a flowchart needs laying out rather than with the app.
async function getElk(): Promise<Elk> {
  if (!elkInstance) {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
    elkInstance = new ELK() as unknown as Elk;
  }
  return elkInstance;
}

/** Diamond outlines sit inside their bounding box; pull an ELK end point on the box onto the diamond outline. */
function snapToOutline(point: Point, node: LayoutNodeResult, shape: string | undefined): Point {
  if (shape !== 'diamond') return point;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = Math.abs(point.x - cx) / (node.width / 2);
  const dy = Math.abs(point.y - cy) / (node.height / 2);
  const onHorizontalSide = Math.abs(point.y - node.y) < 1 || Math.abs(point.y - (node.y + node.height)) < 1;
  if (onHorizontalSide) {
    const inset = 1 - Math.min(1, dx);
    return { x: point.x, y: cy + Math.sign(point.y - cy) * (node.height / 2) * inset };
  }
  const inset = 1 - Math.min(1, dy);
  return { x: cx + Math.sign(point.x - cx) * (node.width / 2) * inset, y: point.y };
}

export async function computeFlowLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  spacingScale = 1,
  extraOptions: Record<string, string> = {},
): Promise<FlowLayoutResult> {
  if (!nodes.length) return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: elkLayoutOptions(spacingScale, extraOptions),
    children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: edges.map((edge): ElkExtendedEdge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };
  const result = await (await getElk()).layout(graph);

  const placed = new Map<string, LayoutNodeResult>();
  const shapes = new Map(nodes.map((node) => [node.id, node.shape]));
  for (const child of result.children ?? []) {
    placed.set(child.id, {
      id: child.id,
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
    });
  }

  const elkEdges = new Map((result.edges ?? []).map((edge) => [edge.id, edge as ElkExtendedEdge]));
  const routed: LayoutEdgeResult[] = [];
  for (const edge of edges) {
    const source = placed.get(edge.source);
    const target = placed.get(edge.target);
    if (!source || !target) continue;
    const section = elkEdges.get(edge.id)?.sections?.[0];
    const points: Point[] = section
      ? [
          snapToOutline(section.startPoint, source, shapes.get(edge.source)),
          ...(section.bendPoints ?? []),
          snapToOutline(section.endPoint, target, shapes.get(edge.target)),
        ]
      : [
          { x: source.x + source.width / 2, y: source.y + source.height },
          { x: target.x + target.width / 2, y: target.y },
        ];
    const backEdge = target.y + target.height / 2 <= source.y + source.height / 2 - 1;
    routed.push({ id: edge.id, source: edge.source, target: edge.target, points, backEdge });
  }

  const all = [...placed.values()];
  const minX = Math.min(...all.map((n) => n.x));
  const minY = Math.min(...all.map((n) => n.y));
  const maxX = Math.max(...all.map((n) => n.x + n.width));
  const maxY = Math.max(...all.map((n) => n.y + n.height));
  return { nodes: all, edges: routed, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
