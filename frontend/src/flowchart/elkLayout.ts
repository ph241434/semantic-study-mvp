import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

export type Point = { x: number; y: number };

export type LayoutNodeInput = { id: string; width: number; height: number; shape?: string };
export type LayoutEdgeInput = { id: string; source: string; target: string };

export type LayoutNodeResult = { id: string; x: number; y: number; width: number; height: number };

export type LayoutEdgeResult = {
  id: string;
  source: string;
  target: string;
  /** start point, bend points…, end point in graph coordinates (start/end sit on the node outlines). */
  points: Point[];
  /** True when the edge returns to an earlier (higher) step, i.e. a loop / feedback edge. */
  backEdge: boolean;
};

export type FlowLayoutResult = {
  nodes: LayoutNodeResult[];
  edges: LayoutEdgeResult[];
  bounds: { x: number; y: number; width: number; height: number };
};

/**
 * Directed layered layout (ELK "layered"), flowing TOP → BOTTOM.
 *
 * - Cycles are legal: MODEL_ORDER cycle breaking treats an edge that returns to an earlier-listed step as the back-edge
 *   and routes them back upward around the outside of the forward flow.
 * - Merges / multiple incoming edges are ordinary layered-graph structure; nodes are never duplicated.
 * - Orthogonal routing keeps edges off unrelated nodes; `spacingScale` widens every gap on retry.
 */
export function elkLayoutOptions(spacingScale = 1): Record<string, string> {
  const s = (value: number) => String(Math.round(value * spacingScale));
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.spacing.nodeNodeBetweenLayers': s(80),
    'elk.spacing.nodeNode': s(60),
    'elk.layered.spacing.edgeNodeBetweenLayers': s(40),
    'elk.spacing.edgeNode': s(30),
    'elk.layered.spacing.edgeEdgeBetweenLayers': s(25),
    'elk.spacing.edgeEdge': s(20),
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': s(80),
    'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
  };
}

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elkInstance: Elk | null = null;

function getElk(): Elk {
  elkInstance ??= new ELK() as unknown as Elk;
  return elkInstance;
}

/** Diamond outlines sit inside their bounding box; pull an ELK end point on the box onto the diamond. */
function snapToOutline(point: Point, node: LayoutNodeResult, shape: string | undefined): Point {
  if (shape !== 'diamond') return point;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = Math.abs(point.x - cx) / (node.width / 2);
  const dy = Math.abs(point.y - cy) / (node.height / 2);
  const onVerticalSide = Math.abs(point.y - node.y) < 1 || Math.abs(point.y - (node.y + node.height)) < 1;
  if (onVerticalSide) {
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
): Promise<FlowLayoutResult> {
  if (!nodes.length) return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: elkLayoutOptions(spacingScale),
    children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: edges.map(
      (edge): ElkExtendedEdge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }),
    ),
  };
  const result = await getElk().layout(graph);

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

  const routed: LayoutEdgeResult[] = [];
  for (const edge of edges) {
    const source = placed.get(edge.source);
    const target = placed.get(edge.target);
    if (!source || !target) continue;
    const elkEdge = (result.edges ?? []).find((candidate) => candidate.id === edge.id) as ElkExtendedEdge | undefined;
    const section = elkEdge?.sections?.[0];
    let points: Point[];
    if (section) {
      points = [
        snapToOutline(section.startPoint, source, shapes.get(edge.source)),
        ...(section.bendPoints ?? []),
        snapToOutline(section.endPoint, target, shapes.get(edge.target)),
      ];
    } else {
      points = [
        { x: source.x + source.width / 2, y: source.y + source.height },
        { x: target.x + target.width / 2, y: target.y },
      ];
    }
    const backEdge = target.y + target.height / 2 <= source.y + source.height / 2 - 1;
    routed.push({ id: edge.id, source: edge.source, target: edge.target, points, backEdge });
  }

  const all = [...placed.values()];
  const minX = Math.min(...all.map((n) => n.x));
  const minY = Math.min(...all.map((n) => n.y));
  const maxX = Math.max(...all.map((n) => n.x + n.width));
  const maxY = Math.max(...all.map((n) => n.y + n.height));
  return {
    nodes: all,
    edges: routed,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}
