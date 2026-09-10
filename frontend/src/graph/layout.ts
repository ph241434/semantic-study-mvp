import { UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';

import type { Concept, GraphResponse, Relationship } from '../types';

export const GRAPH_GRID_SIZE = 24;
export const GRAPH_NODE_WIDTH = 176;
export const GRAPH_NODE_HEIGHT = 68;

const COMMUNITY_PADDING = 74;
const CLASSIC_EDGE_LENGTH = 250;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const graphLayoutModes = ['layered', 'classic', 'clustered'] as const;
export type GraphLayoutMode = (typeof graphLayoutModes)[number];

export const graphLayoutLabels: Record<GraphLayoutMode, string> = {
  layered: 'Layered',
  classic: 'Classic',
  clustered: 'Clustered',
};

export const relationshipCommunityWeights = {
  DEFAULT: 1,
  REQUIRES: 1,
  PART_OF: 1,
  IS_A: 1,
  USES: 1,
  CONTRASTS_WITH: 1,
  EXAMPLE_OF: 1,
  CAUSES: 1,
  IMPLIES: 1,
  SOLVES: 1,
  DERIVED_FROM: 1,
  IMPLEMENTED_BY: 1,
  PRODUCES: 1,
  DEPENDS_ON: 1,
  SUPPORTS: 1,
} as const satisfies Record<string, number>;

export type Point = {
  x: number;
  y: number;
};

export type Bounds = Point & {
  width: number;
  height: number;
};

export type PortSide = 'top' | 'right' | 'bottom' | 'left';

export type DetectedCommunity = {
  id: number;
  stableKey: string;
  label: string;
  nodeIds: number[];
  internalRelationshipCount: number;
};

export type CommunityDetectionResult = {
  communities: DetectedCommunity[];
  nodeCommunity: Map<number, number>;
  signature: string;
};

export type LayoutNode = {
  concept: Concept;
  position: Point;
  communityId: number | null;
};

export type RoutedRelationship = {
  relationship: Relationship;
  lane: number;
  laneOffset: number;
  sourceSide: PortSide;
  targetSide: PortSide;
  sourceCommunityId: number | null;
  targetCommunityId: number | null;
  isCrossCommunity: boolean;
  obstacleCount: number;
};

export type LayoutCommunity = DetectedCommunity & {
  bounds: Bounds;
  center: Point;
};

export type GraphLayoutResult = {
  mode: GraphLayoutMode;
  signature: string;
  gridSize: number;
  nodes: LayoutNode[];
  relationships: RoutedRelationship[];
  communities: LayoutCommunity[];
};

type CacheStats = {
  communityComputations: number;
  layoutComputations: number;
  communityEntries: number;
  layoutEntries: number;
};

const communityCache = new Map<string, CommunityDetectionResult>();
const layoutCache = new Map<string, GraphLayoutResult>();
const cacheStats: CacheStats = {
  communityComputations: 0,
  layoutComputations: 0,
  communityEntries: 0,
  layoutEntries: 0,
};

export function relationshipCommunityWeight(relationshipType: string) {
  const key = relationshipType.trim().toUpperCase();
  return relationshipCommunityWeights[key as keyof typeof relationshipCommunityWeights] ?? relationshipCommunityWeights.DEFAULT;
}

export function clearGraphLayoutCaches() {
  communityCache.clear();
  layoutCache.clear();
  cacheStats.communityComputations = 0;
  cacheStats.layoutComputations = 0;
  cacheStats.communityEntries = 0;
  cacheStats.layoutEntries = 0;
}

export function getGraphLayoutCacheStats(): CacheStats {
  return {
    ...cacheStats,
    communityEntries: communityCache.size,
    layoutEntries: layoutCache.size,
  };
}

export function graphStructureSignature(graph: GraphResponse, scopeKey = 'current') {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${node.concept_type}:${node.name}`)
    .sort((left, right) => left.localeCompare(right));
  const relationships = graph.relationships
    .map(
      (relationship) =>
        `${relationship.id}:${relationship.source_concept_id}>${relationship.target_concept_id}:${relationship.relationship_type}`,
    )
    .sort((left, right) => left.localeCompare(right));
  return `${scopeKey}|center:${graph.center_id}|depth:${graph.depth}|nodes:${nodes.join(',')}|relationships:${relationships.join(',')}`;
}

export function detectCommunities(graph: GraphResponse, scopeKey = 'current'): CommunityDetectionResult {
  const signature = graphStructureSignature(graph, scopeKey);
  const cached = communityCache.get(signature);
  if (cached) return cached;

  cacheStats.communityComputations += 1;

  const sortedNodeIds = graph.nodes.map((node) => node.id).sort((left, right) => left - right);
  const knownNodeIds = new Set(sortedNodeIds);
  const adjacency = buildAdjacencyMap(sortedNodeIds, graph.relationships);
  const detectionGraph = new UndirectedGraph<Record<string, never>, { weight: number }>();

  sortedNodeIds.forEach((nodeId) => {
    detectionGraph.addNode(String(nodeId), {});
  });

  const edgeWeights = new Map<string, { source: number; target: number; weight: number }>();
  graph.relationships
    .filter(
      (relationship) =>
        relationship.source_concept_id !== relationship.target_concept_id &&
        knownNodeIds.has(relationship.source_concept_id) &&
        knownNodeIds.has(relationship.target_concept_id),
    )
    .sort((left, right) => left.id - right.id)
    .forEach((relationship) => {
      const source = Math.min(relationship.source_concept_id, relationship.target_concept_id);
      const target = Math.max(relationship.source_concept_id, relationship.target_concept_id);
      const key = `${source}:${target}`;
      const current = edgeWeights.get(key) ?? { source, target, weight: 0 };
      current.weight += relationshipCommunityWeight(relationship.relationship_type);
      edgeWeights.set(key, current);
    });

  Array.from(edgeWeights.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, edge]) => {
      detectionGraph.addUndirectedEdgeWithKey(key, String(edge.source), String(edge.target), { weight: edge.weight });
    });

  const rawMapping =
    sortedNodeIds.length <= 1
      ? Object.fromEntries(sortedNodeIds.map((nodeId, index) => [String(nodeId), index]))
      : louvain(detectionGraph, {
          getEdgeWeight: 'weight',
          randomWalk: false,
          rng: createStableRng(signature),
          resolution: 1,
        });

  const rawGroups = new Map<number, number[]>();
  sortedNodeIds.forEach((nodeId, fallbackCommunity) => {
    const communityId = rawMapping[String(nodeId)] ?? fallbackCommunity;
    rawGroups.set(communityId, [...(rawGroups.get(communityId) ?? []), nodeId]);
  });

  const splitGroups = Array.from(rawGroups.values()).flatMap((group) => splitDisconnectedCommunity(group, adjacency));
  const sortedGroups = splitGroups
    .map((group) => group.slice().sort((left, right) => left - right))
    .sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));

  const nodeCommunity = new Map<number, number>();
  const communities = sortedGroups.map((nodeIds, index) => {
    const id = index + 1;
    nodeIds.forEach((nodeId) => nodeCommunity.set(nodeId, id));
    return {
      id,
      stableKey: nodeIds.join('.'),
      label: `Community ${id}`,
      nodeIds,
      internalRelationshipCount: countInternalRelationships(nodeIds, graph.relationships),
    };
  });

  const result: CommunityDetectionResult = {
    communities,
    nodeCommunity,
    signature,
  };
  communityCache.set(signature, result);
  return result;
}

export function buildGraphLayout(
  graph: GraphResponse,
  mode: GraphLayoutMode,
  scopeKey = 'current',
): GraphLayoutResult {
  const signature = `${mode}|${graphStructureSignature(graph, scopeKey)}`;
  const cached = layoutCache.get(signature);
  if (cached) return cached;

  cacheStats.layoutComputations += 1;

  const communityResult = mode === 'clustered' ? detectCommunities(graph, scopeKey) : null;
  const positions =
    mode === 'clustered'
      ? clusteredPositions(graph, communityResult!)
      : mode === 'classic'
        ? classicPositions(graph)
        : layeredPositions(graph);
  const nodeCommunity = communityResult?.nodeCommunity ?? new Map<number, number>();
  const routedRelationships = routeRelationships(graph.relationships, positions, nodeCommunity);
  const layoutCommunities =
    communityResult?.communities.map((community) => ({
      ...community,
      bounds: boundsForNodeIds(community.nodeIds, positions),
      center: centerOfBounds(boundsForNodeIds(community.nodeIds, positions)),
    })) ?? [];

  const result: GraphLayoutResult = {
    mode,
    signature,
    gridSize: GRAPH_GRID_SIZE,
    nodes: graph.nodes
      .slice()
      .sort((left, right) => left.id - right.id)
      .map((concept) => ({
        concept,
        position: positions.get(concept.id) ?? snapPoint({ x: 0, y: 0 }),
        communityId: nodeCommunity.get(concept.id) ?? null,
      })),
    relationships: routedRelationships,
    communities: layoutCommunities,
  };

  layoutCache.set(signature, result);
  return result;
}

export function distanceMap(centerId: number, relationships: Relationship[]) {
  const distances = new Map<number, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length) {
    const current = queue.shift()!;
    const currentDistance = distances.get(current) ?? 0;
    relationships.forEach((relationship) => {
      const neighbor =
        relationship.source_concept_id === current
          ? relationship.target_concept_id
          : relationship.target_concept_id === current
            ? relationship.source_concept_id
            : null;
      if (neighbor !== null && !distances.has(neighbor)) {
        distances.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    });
  }
  return distances;
}

export function routeRelationships(
  relationships: Relationship[],
  positions: Map<number, Point>,
  nodeCommunity: Map<number, number> = new Map(),
): RoutedRelationship[] {
  const knownRelationships = relationships.filter(
    (relationship) => positions.has(relationship.source_concept_id) && positions.has(relationship.target_concept_id),
  );
  const groups = new Map<string, Relationship[]>();
  knownRelationships.forEach((relationship) => {
    const key = relationshipPairKey(relationship);
    groups.set(key, [...(groups.get(key) ?? []), relationship]);
  });

  const nodeRects = Array.from(positions.entries()).map(([nodeId, position]) => ({
    nodeId,
    rect: nodeRect(position),
  }));

  return Array.from(groups.values())
    .flatMap((group) => {
      const sortedGroup = group
        .slice()
        .sort(
          (left, right) =>
            left.source_concept_id - right.source_concept_id ||
            left.target_concept_id - right.target_concept_id ||
            left.relationship_type.localeCompare(right.relationship_type) ||
            left.id - right.id,
        );
      return sortedGroup.map((relationship, index) => {
        const lane = index - (sortedGroup.length - 1) / 2;
        const sourcePosition = positions.get(relationship.source_concept_id)!;
        const targetPosition = positions.get(relationship.target_concept_id)!;
        const sourceCenter = nodeCenter(sourcePosition);
        const targetCenter = nodeCenter(targetPosition);
        const obstacleCount = nodeRects.filter(
          ({ nodeId, rect }) =>
            nodeId !== relationship.source_concept_id &&
            nodeId !== relationship.target_concept_id &&
            lineIntersectsRect(sourceCenter, targetCenter, rect),
        ).length;
        const laneDirection = lane === 0 ? deterministicSign(relationship) : Math.sign(lane);
        const laneOffset = roundToGrid(lane * 34 + laneDirection * obstacleCount * GRAPH_GRID_SIZE, 2);
        const sourceCommunity = nodeCommunity.get(relationship.source_concept_id) ?? null;
        const targetCommunity = nodeCommunity.get(relationship.target_concept_id) ?? null;
        return {
          relationship,
          lane,
          laneOffset,
          sourceSide: sideToward(sourceCenter, targetCenter),
          targetSide: sideToward(targetCenter, sourceCenter),
          sourceCommunityId: sourceCommunity,
          targetCommunityId: targetCommunity,
          isCrossCommunity: Boolean(sourceCommunity && targetCommunity && sourceCommunity !== targetCommunity),
          obstacleCount,
        };
      });
    })
    .sort((left, right) => left.relationship.id - right.relationship.id);
}

export function relationshipPairKey(relationship: Pick<Relationship, 'source_concept_id' | 'target_concept_id'>) {
  const source = Math.min(relationship.source_concept_id, relationship.target_concept_id);
  const target = Math.max(relationship.source_concept_id, relationship.target_concept_id);
  return `${source}:${target}`;
}

export function snapPoint(point: Point, gridSize = GRAPH_GRID_SIZE): Point {
  return {
    x: normalizeZero(Math.round(point.x / gridSize) * gridSize),
    y: normalizeZero(Math.round(point.y / gridSize) * gridSize),
  };
}

export function lineIntersectsRect(start: Point, end: Point, rect: Bounds) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;

  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

export function generateSyntheticGraph(nodeCount: number, relationshipCount: number): GraphResponse {
  const nodes = Array.from({ length: nodeCount }, (_, index) =>
    syntheticConcept(index + 1, `Synthetic ${index + 1}`, index % 3 === 0 ? 'algorithm' : 'concept'),
  );
  const relationships: Relationship[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  while (relationships.length < relationshipCount && cursor < relationshipCount * 12) {
    const source = (cursor % nodeCount) + 1;
    const jump = 1 + ((cursor * 7) % Math.max(1, nodeCount - 1));
    const target = ((source + jump - 1) % nodeCount) + 1;
    const key = `${source}:${target}:${relationships.length % 5}`;
    cursor += 1;
    if (source === target || seen.has(key)) continue;
    seen.add(key);
    relationships.push(syntheticRelationship(relationships.length + 1, source, target));
  }
  return {
    center_id: 1,
    depth: 3,
    nodes,
    relationships,
  };
}

function layeredPositions(graph: GraphResponse) {
  const distances = distanceMap(graph.center_id, graph.relationships);
  const maxDistance = Math.max(0, ...Array.from(distances.values()));
  const degrees = degreeMap(graph.relationships);
  const groups = graph.nodes.reduce<Map<number, Concept[]>>((acc, concept) => {
    const distance = distances.get(concept.id) ?? maxDistance + 1;
    acc.set(distance, [...(acc.get(distance) ?? []), concept]);
    return acc;
  }, new Map());
  const positions = new Map<number, Point>();

  Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .forEach(([distance, concepts]) => {
      const ordered = stableConceptOrder(concepts, degrees);
      if (distance === 0) {
        ordered.forEach((concept) => positions.set(concept.id, snapPoint({ x: -GRAPH_NODE_WIDTH / 2, y: -GRAPH_NODE_HEIGHT / 2 })));
        return;
      }
      const radius = 250 + (distance - 1) * 220;
      ordered.forEach((concept, index) => {
        const angle =
          ordered.length <= 1
            ? -Math.PI / 2
            : (index / ordered.length) * Math.PI * 2 - Math.PI / 2 + (distance % 2) * 0.22;
        positions.set(
          concept.id,
          snapPoint({
            x: Math.cos(angle) * radius - GRAPH_NODE_WIDTH / 2,
            y: Math.sin(angle) * radius - GRAPH_NODE_HEIGHT / 2,
          }),
        );
      });
    });

  return positions;
}

function classicPositions(graph: GraphResponse) {
  const concepts = graph.nodes.slice().sort((left, right) => left.id - right.id);
  const positions = new Map<number, Point>();
  const velocities = new Map<number, Point>();
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const relationships = graph.relationships.filter(
    (relationship) => conceptIds.has(relationship.source_concept_id) && conceptIds.has(relationship.target_concept_id),
  );
  const iterations = concepts.length > 300 ? 38 : concepts.length > 120 ? 54 : 76;

  concepts.forEach((concept, index) => {
    const angle = index * GOLDEN_ANGLE;
    const radius = index === 0 ? 0 : 150 + Math.sqrt(index) * 72;
    positions.set(concept.id, {
      x: Math.cos(angle) * radius - GRAPH_NODE_WIDTH / 2,
      y: Math.sin(angle) * radius - GRAPH_NODE_HEIGHT / 2,
    });
    velocities.set(concept.id, { x: 0, y: 0 });
  });

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const cooling = 1 - iteration / iterations;
    for (let leftIndex = 0; leftIndex < concepts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < concepts.length; rightIndex += 1) {
        const left = concepts[leftIndex];
        const right = concepts[rightIndex];
        const leftCenter = nodeCenter(positions.get(left.id)!);
        const rightCenter = nodeCenter(positions.get(right.id)!);
        const vector = normalizedVector(leftCenter, rightCenter);
        const force = Math.min(18, 52000 / Math.max(160, vector.distance * vector.distance)) * cooling;
        applyForce(velocities, left.id, -vector.x * force, -vector.y * force);
        applyForce(velocities, right.id, vector.x * force, vector.y * force);
      }
    }

    relationships.forEach((relationship) => {
      const sourceCenter = nodeCenter(positions.get(relationship.source_concept_id)!);
      const targetCenter = nodeCenter(positions.get(relationship.target_concept_id)!);
      const vector = normalizedVector(sourceCenter, targetCenter);
      const force = (vector.distance - CLASSIC_EDGE_LENGTH) * 0.035 * cooling;
      applyForce(velocities, relationship.source_concept_id, vector.x * force, vector.y * force);
      applyForce(velocities, relationship.target_concept_id, -vector.x * force, -vector.y * force);
    });

    concepts.forEach((concept) => {
      const position = positions.get(concept.id)!;
      const velocity = velocities.get(concept.id)!;
      const anchorPull = concept.id === graph.center_id ? 0.04 : 0.006;
      velocity.x += (-position.x - GRAPH_NODE_WIDTH / 2) * anchorPull * cooling;
      velocity.y += (-position.y - GRAPH_NODE_HEIGHT / 2) * anchorPull * cooling;
      positions.set(concept.id, {
        x: position.x + clamp(velocity.x, -24, 24),
        y: position.y + clamp(velocity.y, -24, 24),
      });
      velocities.set(concept.id, {
        x: velocity.x * 0.62,
        y: velocity.y * 0.62,
      });
    });
  }

  concepts.forEach((concept) => {
    positions.set(concept.id, snapPoint(positions.get(concept.id)!));
  });

  return positions;
}

function clusteredPositions(graph: GraphResponse, communityResult: CommunityDetectionResult) {
  const positions = new Map<number, Point>();
  const degrees = degreeMap(graph.relationships);
  const communities = communityResult.communities;
  const largestCommunitySize = Math.max(1, ...communities.map((community) => community.nodeIds.length));
  const ringRadius = communities.length <= 1 ? 0 : Math.max(430, communities.length * 190, Math.sqrt(largestCommunitySize) * 150);

  communities.forEach((community, communityIndex) => {
    const communityAngle =
      communities.length <= 1 ? 0 : (communityIndex / communities.length) * Math.PI * 2 - Math.PI / 2 + 0.18;
    const communityCenter = {
      x: Math.cos(communityAngle) * ringRadius,
      y: Math.sin(communityAngle) * ringRadius,
    };
    const members = community.nodeIds
      .map((nodeId) => graph.nodes.find((concept) => concept.id === nodeId))
      .filter((concept): concept is Concept => Boolean(concept));
    const orderedMembers = stableConceptOrder(members, degrees);
    const columns = Math.max(1, Math.ceil(Math.sqrt(orderedMembers.length)));
    const rows = Math.max(1, Math.ceil(orderedMembers.length / columns));
    const cellWidth = GRAPH_NODE_WIDTH + 72;
    const cellHeight = GRAPH_NODE_HEIGHT + 72;

    orderedMembers.forEach((concept, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(
        concept.id,
        snapPoint({
          x: communityCenter.x + (column - (columns - 1) / 2) * cellWidth - GRAPH_NODE_WIDTH / 2,
          y: communityCenter.y + (row - (rows - 1) / 2) * cellHeight - GRAPH_NODE_HEIGHT / 2,
        }),
      );
    });
  });

  return positions;
}

function boundsForNodeIds(nodeIds: number[], positions: Map<number, Point>): Bounds {
  const points = nodeIds.map((nodeId) => positions.get(nodeId)).filter((point): point is Point => Boolean(point));
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x + GRAPH_NODE_WIDTH));
  const maxY = Math.max(...points.map((point) => point.y + GRAPH_NODE_HEIGHT));

  return {
    x: snapPoint({ x: minX - COMMUNITY_PADDING, y: 0 }).x,
    y: snapPoint({ x: 0, y: minY - COMMUNITY_PADDING }).y,
    width: Math.ceil((maxX - minX + COMMUNITY_PADDING * 2) / GRAPH_GRID_SIZE) * GRAPH_GRID_SIZE,
    height: Math.ceil((maxY - minY + COMMUNITY_PADDING * 2) / GRAPH_GRID_SIZE) * GRAPH_GRID_SIZE,
  };
}

function centerOfBounds(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function buildAdjacencyMap(nodeIds: number[], relationships: Relationship[]) {
  const adjacency = new Map<number, Set<number>>();
  nodeIds.forEach((nodeId) => adjacency.set(nodeId, new Set()));
  relationships.forEach((relationship) => {
    if (!adjacency.has(relationship.source_concept_id) || !adjacency.has(relationship.target_concept_id)) return;
    if (relationship.source_concept_id === relationship.target_concept_id) return;
    adjacency.get(relationship.source_concept_id)!.add(relationship.target_concept_id);
    adjacency.get(relationship.target_concept_id)!.add(relationship.source_concept_id);
  });
  return adjacency;
}

function splitDisconnectedCommunity(nodeIds: number[], adjacency: Map<number, Set<number>>) {
  const remaining = new Set(nodeIds);
  const groups: number[][] = [];
  while (remaining.size) {
    const start = Array.from(remaining).sort((left, right) => left - right)[0];
    const queue = [start];
    const group: number[] = [];
    remaining.delete(start);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (remaining.has(neighbor) && nodeIds.includes(neighbor)) {
          remaining.delete(neighbor);
          queue.push(neighbor);
        }
      });
    }
    groups.push(group);
  }
  return groups;
}

function countInternalRelationships(nodeIds: number[], relationships: Relationship[]) {
  const nodeSet = new Set(nodeIds);
  return relationships.filter(
    (relationship) =>
      relationship.source_concept_id !== relationship.target_concept_id &&
      nodeSet.has(relationship.source_concept_id) &&
      nodeSet.has(relationship.target_concept_id),
  ).length;
}

function degreeMap(relationships: Relationship[]) {
  const degrees = new Map<number, number>();
  relationships.forEach((relationship) => {
    degrees.set(relationship.source_concept_id, (degrees.get(relationship.source_concept_id) ?? 0) + 1);
    degrees.set(relationship.target_concept_id, (degrees.get(relationship.target_concept_id) ?? 0) + 1);
  });
  return degrees;
}

function stableConceptOrder(concepts: Concept[], degrees: Map<number, number>) {
  return concepts
    .slice()
    .sort(
      (left, right) =>
        (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0) ||
        left.name.localeCompare(right.name) ||
        left.id - right.id,
    );
}

function nodeRect(position: Point): Bounds {
  return {
    x: position.x,
    y: position.y,
    width: GRAPH_NODE_WIDTH,
    height: GRAPH_NODE_HEIGHT,
  };
}

function nodeCenter(position: Point): Point {
  return {
    x: position.x + GRAPH_NODE_WIDTH / 2,
    y: position.y + GRAPH_NODE_HEIGHT / 2,
  };
}

function sideToward(source: Point, target: Point): PortSide {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function pointInRect(point: Point, rect: Bounds) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const direction1 = orientation(a, b, c);
  const direction2 = orientation(a, b, d);
  const direction3 = orientation(c, d, a);
  const direction4 = orientation(c, d, b);

  if (direction1 === 0 && onSegment(a, c, b)) return true;
  if (direction2 === 0 && onSegment(a, d, b)) return true;
  if (direction3 === 0 && onSegment(c, a, d)) return true;
  if (direction4 === 0 && onSegment(c, b, d)) return true;

  return direction1 !== direction2 && direction3 !== direction4;
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function normalizedVector(source: Point, target: Point) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: dx / distance,
    y: dy / distance,
    distance,
  };
}

function applyForce(velocities: Map<number, Point>, conceptId: number, x: number, y: number) {
  const velocity = velocities.get(conceptId)!;
  velocity.x += x;
  velocity.y += y;
}

function deterministicSign(relationship: Relationship) {
  return (relationship.id + relationship.source_concept_id + relationship.target_concept_id) % 2 === 0 ? 1 : -1;
}

function roundToGrid(value: number, step: number) {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function createStableRng(seedInput: string) {
  let seed = 2166136261;
  for (let index = 0; index < seedInput.length; index += 1) {
    seed ^= seedInput.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return (seed >>> 0) / 4294967296;
  };
}

function syntheticConcept(id: number, name: string, conceptType: Concept['concept_type']): Concept {
  return {
    id,
    name,
    description: '',
    concept_type: conceptType,
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function syntheticRelationship(id: number, sourceId: number, targetId: number): Relationship {
  const types = ['USES', 'REQUIRES', 'IS_A', 'CONTRASTS_WITH', 'DEPENDS_ON'];
  return {
    id,
    source_concept_id: sourceId,
    target_concept_id: targetId,
    relationship_type: types[id % types.length],
    description: '',
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: null,
    target_name: null,
  };
}
