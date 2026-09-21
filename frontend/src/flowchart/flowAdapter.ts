import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { FlowNode, FlowchartDetail } from '../types';
import type { LayoutEdgeInput, LayoutNodeInput, Point } from './elkLayout';
import type { ValidatedFlowLayout } from './flowLayout';
import { edgeVisual, estimateNodeSize, nodeVisual } from './flowStyles';

export const nodeElementId = (id: number) => `n${id}`;
export const edgeElementId = (id: number) => `e${id}`;
export const parseNodeElementId = (value: string): number | null => (/^n\d+$/.test(value) ? Number(value.slice(1)) : null);
export const parseEdgeElementId = (value: string): number | null => (/^e\d+$/.test(value) ? Number(value.slice(1)) : null);

export type FlowNodeData = Record<string, unknown> & {
  label: string;
  nodeType: FlowNode['node_type'];
  hasChild: boolean;
  conceptName: string | null;
  width: number;
  height: number;
};

export type FlowEdgeData = Record<string, unknown> & {
  edgeType: string;
  label: string;
  color: string;
  dashed: boolean;
  backEdge: boolean;
  /** ELK's route in flow coordinates, used while no node has been moved by hand. */
  points: Point[] | null;
  sourceWidth: number;
  targetWidth: number;
};

export type FlowRfNode = Node<FlowNodeData, 'flow'>;
export type FlowRfEdge = Edge<FlowEdgeData, 'flow'>;

export function layoutInputs(detail: FlowchartDetail): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
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

/**
 * Everything that changes the SHAPE of the graph. Descriptions, child links, concept links and manual positions do
 * not: editing those must not re-run the layout.
 */
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

/** Nodes that carry a saved manual position (top-left, flow coordinates). */
export function manualPositions(detail: FlowchartDetail): Record<string, Point> {
  const positions: Record<string, Point> = {};
  for (const node of detail.nodes) {
    if (node.x !== null && node.y !== null) positions[nodeElementId(node.id)] = { x: node.x, y: node.y };
  }
  return positions;
}

export function buildFlowNodes(detail: FlowchartDetail, positions: Record<string, Point>): FlowRfNode[] {
  return detail.nodes.map((node) => {
    const id = nodeElementId(node.id);
    const size = estimateNodeSize(node.label, node.node_type);
    return {
      id,
      type: 'flow',
      position: positions[id] ?? { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      data: {
        label: node.label,
        nodeType: node.node_type,
        hasChild: node.child_flowchart_id !== null,
        conceptName: node.concept_name,
        width: size.width,
        height: size.height,
      },
    };
  });
}

export function buildFlowEdges(detail: FlowchartDetail, layout: ValidatedFlowLayout | null, routed: boolean): FlowRfEdge[] {
  const routes = new Map((layout?.edges ?? []).map((edge) => [edge.id, edge]));
  const sizes = new Map(detail.nodes.map((node) => [node.id, estimateNodeSize(node.label, node.node_type)]));
  return detail.edges.map((edge) => {
    const id = edgeElementId(edge.id);
    const visual = edgeVisual(edge.edge_type);
    const route = routes.get(id);
    return {
      id,
      type: 'flow',
      source: nodeElementId(edge.source_node_id),
      target: nodeElementId(edge.target_node_id),
      sourceHandle: 'out',
      targetHandle: 'in',
      markerEnd: { type: MarkerType.ArrowClosed, color: visual.color, width: 14, height: 14 },
      data: {
        edgeType: edge.edge_type,
        label: edge.label ?? '',
        color: visual.color,
        // A loop reads as a loop even when it is typed "normal".
        dashed: visual.dashed || Boolean(route?.backEdge),
        backEdge: Boolean(route?.backEdge),
        points: routed && route ? route.points : null,
        sourceWidth: sizes.get(edge.source_node_id)?.width ?? 0,
        targetWidth: sizes.get(edge.target_node_id)?.width ?? 0,
      },
    };
  });
}
