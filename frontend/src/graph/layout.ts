import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

import type { Concept, GraphResponse, Relationship } from '../types';

export const GRAPH_NODE_WIDTH = 168;
export const GRAPH_NODE_HEIGHT = 52;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SEED_RADIUS_STEP = 46;
const LINK_DISTANCE = 220;
const CHARGE_STRENGTH = -900;
const COLLIDE_RADIUS = Math.hypot(GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT) / 2 + 36;
const ROOT_ANCHOR_STRENGTH = 0.12;
const NODE_ANCHOR_STRENGTH = 0.015;
const SIMULATION_TICKS = 300;

export type Point = { x: number; y: number };

export type SemanticGraphNode = {
  id: string;
  conceptId: number;
  label: string;
  concept: Concept;
};

export type SemanticGraphEdge = {
  id: string;
  relationshipId: number;
  source: string;
  target: string;
  relationshipType: string;
  relationship: Relationship;
};

export type VisualGraphData = {
  nodes: SemanticGraphNode[];
  edges: SemanticGraphEdge[];
};

export type LayoutNode = SemanticGraphNode & {
  position: Point;
  isRoot: boolean;
};

export type RoutedEdge = SemanticGraphEdge & {
  path: string;
  labelX: number;
  labelY: number;
};

export type ForceGraphLayout = {
  nodes: LayoutNode[];
  edges: RoutedEdge[];
};

type SimNode = {
  id: string;
  x: number;
  y: number;
  isRoot: boolean;
};

export function toVisualGraphData(graph: GraphResponse): VisualGraphData {
  const visibleIds = new Set(graph.nodes.map((node) => node.id));
  const nodes = graph.nodes
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((concept) => ({
      id: String(concept.id),
      conceptId: concept.id,
      label: concept.name,
      concept,
    }));

  const edges = graph.relationships
    .filter(
      (relationship) =>
        visibleIds.has(relationship.source_concept_id) && visibleIds.has(relationship.target_concept_id),
    )
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((relationship) => ({
      id: String(relationship.id),
      relationshipId: relationship.id,
      source: String(relationship.source_concept_id),
      target: String(relationship.target_concept_id),
      relationshipType: relationship.relationship_type,
      relationship,
    }));

  return { nodes, edges };
}

/**
 * Concepts are addressed directly by id from the filesystem layer, so a concept with no
 * relationships is still validly reachable as a graph root -- "no deeper structure" is simply
 * "no relationships to visualize".
 */
export function isLeafGraph(graph: GraphResponse): boolean {
  return graph.relationships.length === 0;
}

export function graphSignature(graph: GraphResponse): string {
  const nodeIds = graph.nodes.map((node) => node.id).sort((left, right) => left - right);
  const relationshipIds = graph.relationships.map((relationship) => relationship.id).sort((left, right) => left - right);
  return `${graph.center_id}|${nodeIds.join(',')}|${relationshipIds.join(',')}`;
}

function seedPosition(conceptId: number, index: number): Point {
  const angle = conceptId * GOLDEN_ANGLE;
  const radius = SEED_RADIUS_STEP * Math.sqrt(index + 1);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function nodeCenter(position: Point): Point {
  return { x: position.x + GRAPH_NODE_WIDTH / 2, y: position.y + GRAPH_NODE_HEIGHT / 2 };
}

/** Point where the ray from `center` toward `towardPoint` exits the node rectangle. */
function intersectRectangle(center: Point, towardPoint: Point): Point {
  const dx = towardPoint.x - center.x;
  const dy = towardPoint.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfWidth = GRAPH_NODE_WIDTH / 2;
  const halfHeight = GRAPH_NODE_HEIGHT / 2;
  const scaleX = dx !== 0 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/**
 * Fruchterman-Reingold-style force layout (repel all nodes, attract linked nodes, settle over a
 * bounded number of iterations) implemented with d3-force. Initial positions are seeded
 * deterministically from concept ids, and the simulation itself has no randomness once seeds are
 * distinct, so the same graph produces the same layout every time it is (re)computed.
 */
export function computeForceLayout(graph: GraphResponse, rootId: number): ForceGraphLayout {
  const visual = toVisualGraphData(graph);

  const simNodes: SimNode[] = visual.nodes.map((node, index) => {
    const isRoot = node.conceptId === rootId;
    const seed = isRoot ? { x: 0, y: 0 } : seedPosition(node.conceptId, index);
    return { id: node.id, x: seed.x, y: seed.y, isRoot };
  });

  const simLinks = visual.edges.map((edge) => ({ source: edge.source, target: edge.target }));

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(CHARGE_STRENGTH))
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((node) => node.id)
        .distance(LINK_DISTANCE)
        .strength(0.85),
    )
    .force('collide', forceCollide<SimNode>().radius(COLLIDE_RADIUS).strength(1))
    .force('center', forceCenter(0, 0))
    .force(
      'anchorX',
      forceX<SimNode>(0).strength((node) => (node.isRoot ? ROOT_ANCHOR_STRENGTH : NODE_ANCHOR_STRENGTH)),
    )
    .force(
      'anchorY',
      forceY<SimNode>(0).strength((node) => (node.isRoot ? ROOT_ANCHOR_STRENGTH : NODE_ANCHOR_STRENGTH)),
    )
    .stop();

  for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
    simulation.tick();
  }

  const centerById = new Map(simNodes.map((node) => [node.id, { x: node.x, y: node.y }]));

  const layoutNodes: LayoutNode[] = visual.nodes.map((node) => {
    const center = centerById.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      isRoot: node.conceptId === rootId,
      position: { x: center.x - GRAPH_NODE_WIDTH / 2, y: center.y - GRAPH_NODE_HEIGHT / 2 },
    };
  });

  const nodeById = new Map(layoutNodes.map((node) => [node.id, node]));

  const routedEdges: RoutedEdge[] = visual.edges.map((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      return { ...edge, path: '', labelX: 0, labelY: 0 };
    }

    const sourceCenter = nodeCenter(source.position);
    const targetCenter = nodeCenter(target.position);
    const start = intersectRectangle(sourceCenter, targetCenter);
    const end = intersectRectangle(targetCenter, sourceCenter);

    return {
      ...edge,
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
    };
  });

  return { nodes: layoutNodes, edges: routedEdges };
}
