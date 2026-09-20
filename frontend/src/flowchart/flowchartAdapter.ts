import type { ElementDefinition } from 'cytoscape';
import type { FlowNode, FlowchartDetail } from '../types';
import type { LayoutEdgeInput, LayoutEdgeResult, LayoutNodeInput, Point } from './elkLayout';
import type { ValidatedFlowLayout } from './flowLayout';
import { edgeVisual, nodeVisual } from './flowStyles';

const CHAR_WIDTH = 7;
const LINE_HEIGHT = 17;

export const nodeElementId = (id: number) => `n${id}`;
export const edgeElementId = (id: number) => `e${id}`;
export const parseNodeElementId = (elementId: string): number | null => (/^n\d+$/.test(elementId) ? Number(elementId.slice(1)) : null);
export const parseEdgeElementId = (elementId: string): number | null => (/^e\d+$/.test(elementId) ? Number(elementId.slice(1)) : null);

export function estimateNodeSize(label: string, type: string): { width: number; height: number; textWidth: number } {
  const visual = nodeVisual(type);
  const textWidth = visual.maxTextWidth;
  const lines = Math.max(1, Math.ceil((label.length * CHAR_WIDTH) / textWidth));
  const singleLine = Math.min(textWidth, label.length * CHAR_WIDTH);
  return {
    width: Math.max(visual.minWidth, Math.ceil(singleLine + visual.padX)),
    height: Math.max(visual.minHeight, lines * LINE_HEIGHT + visual.padY),
    textWidth,
  };
}

export function flowchartLayoutInputs(detail: FlowchartDetail): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
  return {
    nodes: detail.nodes.map((node) => {
      const size = estimateNodeSize(node.label, node.node_type);
      return { id: nodeElementId(node.id), width: size.width, height: size.height, shape: nodeVisual(node.node_type).shape };
    }),
    edges: detail.edges.map((edge) => ({
      id: edgeElementId(edge.id),
      source: nodeElementId(edge.source_node_id),
      target: nodeElementId(edge.target_node_id),
    })),
  };
}

/** Everything that changes the *shape* of the graph (not where nodes sit, nor descriptions / child links). */
export function flowchartSignature(detail: FlowchartDetail): string {
  const nodes = detail.nodes
    .map((node) => `${node.id}:${node.label}:${node.node_type}`)
    .sort()
    .join('|');
  const edges = detail.edges
    .map((edge) => `${edge.id}:${edge.source_node_id}>${edge.target_node_id}:${edge.edge_type}:${edge.label ?? ''}`)
    .sort()
    .join('|');
  return `${detail.flowchart.id}#${nodes}#${edges}`;
}

/**
 * Turn an ELK route (absolute points) into Cytoscape `segments` data. Cytoscape measures segment weights /
 * distances against the line between the two manual end points (`edge-distances: endpoints`), with the
 * normal (-dy, dx) / length.
 */
export function routeEdgeData(points: Point[], sourceCenter: Point, targetCenter: Point) {
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const length = Math.sqrt(lengthSquared);
  const bends = points.slice(1, -1);
  return {
    routed: true,
    bendCount: bends.length,
    segWeights: bends.map((p) => ((p.x - start.x) * dx + (p.y - start.y) * dy) / lengthSquared),
    segDistances: bends.map((p) => ((p.x - start.x) * -dy + (p.y - start.y) * dx) / length),
    sourceEndpoint: `${round(start.x - sourceCenter.x)}px ${round(start.y - sourceCenter.y)}px`,
    targetEndpoint: `${round(end.x - targetCenter.x)}px ${round(end.y - targetCenter.y)}px`,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

export type BuildOptions = {
  /** Auto layout to take positions and ELK routes from. */
  layout?: ValidatedFlowLayout | null;
  /** Positions (node centres, by element id) that win over the auto layout. */
  positions?: Record<string, Point>;
  /** Use ELK's routed edges. Turned off once nodes have been moved by hand. */
  routed?: boolean;
};

function nodeData(node: FlowNode) {
  const visual = nodeVisual(node.node_type);
  const size = estimateNodeSize(node.label, node.node_type);
  return {
    id: nodeElementId(node.id),
    flowNodeId: node.id,
    label: node.label,
    nodeType: node.node_type,
    hasChild: node.has_child,
    shape: visual.shape,
    fill: visual.fill,
    border: visual.border,
    borderStyle: visual.borderStyle,
    borderWidth: visual.borderWidth,
    width: size.width,
    height: size.height,
    textWidth: size.textWidth,
    cornerRadius: node.node_type === 'START' || node.node_type === 'END' ? Math.round(size.height / 2) : 6,
  };
}

/** Build the exact element set for one flowchart. Never includes anything from another flowchart. */
export function buildFlowchartElements(detail: FlowchartDetail, options: BuildOptions = {}): ElementDefinition[] {
  const { layout = null, positions = {}, routed = true } = options;
  const placed = new Map<string, Point>();
  for (const item of layout?.nodes ?? []) {
    placed.set(item.id, { x: item.x + item.width / 2, y: item.y + item.height / 2 });
  }
  for (const [id, point] of Object.entries(positions)) placed.set(id, point);
  const routes = new Map<string, LayoutEdgeResult>((layout?.edges ?? []).map((edge) => [edge.id, edge]));

  const nodes: ElementDefinition[] = detail.nodes.map((node) => {
    const id = nodeElementId(node.id);
    const position = placed.get(id);
    return { group: 'nodes', data: nodeData(node), ...(position ? { position: { ...position } } : {}) };
  });

  const edges: ElementDefinition[] = detail.edges.map((edge) => {
    const id = edgeElementId(edge.id);
    const visual = edgeVisual(edge.edge_type);
    const route = routes.get(id);
    const source = placed.get(nodeElementId(edge.source_node_id));
    const target = placed.get(nodeElementId(edge.target_node_id));
    const backEdge = route?.backEdge ?? false;
    const base = {
      id,
      flowEdgeId: edge.id,
      source: nodeElementId(edge.source_node_id),
      target: nodeElementId(edge.target_node_id),
      edgeType: edge.edge_type,
      label: edge.label ?? '',
      color: visual.color,
      // Loops read as loops even when their type is NEXT.
      lineStyle: backEdge ? 'dashed' : visual.lineStyle,
      backEdge,
    };
    const useRoute = routed && route && source && target && route.points.length >= 2;
    return {
      group: 'edges',
      data: useRoute ? { ...base, ...routeEdgeData(route.points, source, target) } : { ...base, routed: false },
    };
  });

  return [...nodes, ...edges];
}
