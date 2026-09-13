import type { Concept, GraphResponse, Relationship } from '../types';

export const GRAPH_GRID_SIZE = 24;
export const GRAPH_NODE_WIDTH = 176;
export const GRAPH_NODE_HEIGHT = 68;
export const CLASSIC_LAYOUT_STORAGE_KEY = 'semantic-study.classicPositions.v1';

const CLASSIC_NODE_GAP_X = GRAPH_NODE_WIDTH + 104;
const CLASSIC_NODE_GAP_Y = GRAPH_NODE_HEIGHT + 112;
const CLASSIC_RING_SPACING = 280;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const graphLayoutModes = ['classic'] as const;
export type GraphLayoutMode = (typeof graphLayoutModes)[number];

export const graphLayoutLabels: Record<GraphLayoutMode, string> = {
  classic: 'Classic',
};

export type Point = {
  x: number;
  y: number;
};

export type PortSide = 'top' | 'right' | 'bottom' | 'left';

export type ClassicPositionStore = Record<string, Point>;

export type SemanticGraphNode = {
  id: string;
  conceptId: number;
  label: string;
  conceptType: Concept['concept_type'];
  mastery: number;
  confidence: number;
  concept: Concept;
};

export type SemanticGraphEdge = {
  id: string;
  relationshipId: number;
  source: string;
  target: string;
  relationshipType: string;
  label: string;
  mastery: number;
  confidence: number;
  relationship: Relationship;
};

export type VisualGraphData = {
  nodes: SemanticGraphNode[];
  edges: SemanticGraphEdge[];
};

export type LayoutNode = SemanticGraphNode & {
  position: Point;
};

export type RoutedRelationship = SemanticGraphEdge & {
  sourceSide: PortSide;
  targetSide: PortSide;
  parallelIndex: number;
  parallelCount: number;
  curveOffset: number;
  bidirectional: boolean;
};

export type LayoutCommunity = {
  id: number;
  stableKey: string;
  label: string;
  nodeIds: number[];
  internalRelationshipCount: number;
  bounds: { x: number; y: number; width: number; height: number };
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

type BuildGraphLayoutOptions = {
  positions?: ClassicPositionStore;
  scopeKey?: string;
};

type CacheStats = {
  layoutComputations: number;
  routeComputations: number;
  initialPlacementComputations: number;
  reorganizeComputations: number;
  communityComputations: number;
  communityEntries: number;
  layoutEntries: number;
};

const cacheStats: CacheStats = {
  layoutComputations: 0,
  routeComputations: 0,
  initialPlacementComputations: 0,
  reorganizeComputations: 0,
  communityComputations: 0,
  communityEntries: 0,
  layoutEntries: 0,
};

export function clearGraphLayoutCaches() {
  cacheStats.layoutComputations = 0;
  cacheStats.routeComputations = 0;
  cacheStats.initialPlacementComputations = 0;
  cacheStats.reorganizeComputations = 0;
  cacheStats.communityComputations = 0;
  cacheStats.communityEntries = 0;
  cacheStats.layoutEntries = 0;
}

export function getGraphLayoutCacheStats(): CacheStats {
  return { ...cacheStats };
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

export function toVisualGraphData(graph: GraphResponse): VisualGraphData {
  const visibleIds = new Set(graph.nodes.map((node) => node.id));
  const nodes = graph.nodes
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((concept) => ({
      id: String(concept.id),
      conceptId: concept.id,
      label: concept.name,
      conceptType: concept.concept_type,
      mastery: concept.mastery_score,
      confidence: concept.confidence,
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
      label: relationship.relationship_type,
      mastery: relationship.mastery_score,
      confidence: relationship.confidence,
      relationship,
    }));

  return { nodes, edges };
}

export function buildGraphLayout(
  graph: GraphResponse,
  mode: GraphLayoutMode = 'classic',
  options: BuildGraphLayoutOptions = {},
): GraphLayoutResult {
  if (mode !== 'classic') {
    throw new Error(`Unsupported graph layout mode: ${mode}`);
  }

  cacheStats.layoutComputations += 1;

  const visualGraph = toVisualGraphData(graph);
  const ensured = ensureClassicPositions(graph, options.positions ?? {});
  const positionMap = positionStoreToMap(ensured.positions);
  const routes = routeRelationships(
    visualGraph.edges.map((edge) => edge.relationship),
    positionMap,
  );

  return {
    mode: 'classic',
    signature: graphStructureSignature(graph, options.scopeKey),
    gridSize: GRAPH_GRID_SIZE,
    nodes: visualGraph.nodes.map((node) => ({
      ...node,
      position: positionMap.get(node.conceptId) ?? centerNodeAt({ x: 0, y: 0 }),
    })),
    relationships: routes,
    communities: [],
  };
}

export function ensureClassicPositions(
  graph: GraphResponse,
  savedPositions: ClassicPositionStore,
): { positions: ClassicPositionStore; addedConceptIds: number[] } {
  const positions = sanitizeClassicPositionStore(savedPositions);
  const placed = positionStoreToMap(positions);
  const addedConceptIds: number[] = [];

  graph.nodes
    .slice()
    .sort((left, right) => left.id - right.id)
    .forEach((concept) => {
      if (placed.has(concept.id)) return;

      cacheStats.initialPlacementComputations += 1;
      const position = initialClassicPosition(concept, graph, placed);
      positions[String(concept.id)] = position;
      placed.set(concept.id, position);
      addedConceptIds.push(concept.id);
    });

  return { positions, addedConceptIds };
}

export function reorganizeClassicPositions(graph: GraphResponse): ClassicPositionStore {
  cacheStats.reorganizeComputations += 1;

  const distances = distanceMap(graph.center_id, graph.relationships);
  const maxDistance = Math.max(0, ...Array.from(distances.values()));
  const degrees = degreeMap(graph.relationships);
  const groups = new Map<number, Concept[]>();

  graph.nodes.forEach((concept) => {
    const distance = distances.get(concept.id) ?? maxDistance + 1;
    groups.set(distance, [...(groups.get(distance) ?? []), concept]);
  });

  const positions = new Map<number, Point>();
  Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .forEach(([distance, concepts]) => {
      const ordered = stableConceptOrder(concepts, degrees);
      if (distance === 0) {
        ordered.forEach((concept) => positions.set(concept.id, centerNodeAt({ x: 0, y: 0 })));
        return;
      }

      const radius = CLASSIC_RING_SPACING + (distance - 1) * 220;
      ordered.forEach((concept, index) => {
        const angle =
          ordered.length === 1
            ? 0
            : (index / ordered.length) * Math.PI * 2 - Math.PI / 2 + (distance % 2) * 0.18;
        const preferred = centerNodeAt({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
        positions.set(concept.id, findOpenPosition(preferred, positions));
      });
    });

  return mapToPositionStore(positions);
}

export function updateClassicPosition(
  positions: ClassicPositionStore,
  conceptId: number,
  position: Point,
): ClassicPositionStore {
  return {
    ...sanitizeClassicPositionStore(positions),
    [String(conceptId)]: snapPoint(position),
  };
}

export function sanitizeClassicPositionStore(raw: unknown): ClassicPositionStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const store: ClassicPositionStore = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!/^\d+$/.test(key) || !isPoint(value)) return;
    store[key] = snapPoint(value);
  });
  return store;
}

export function classicPositionStoresEqual(left: ClassicPositionStore, right: ClassicPositionStore) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) return false;
    return left[key].x === right[key].x && left[key].y === right[key].y;
  });
}

export function routeRelationships(
  relationships: Relationship[],
  positions: Map<number, Point>,
): RoutedRelationship[] {
  cacheStats.routeComputations += 1;

  const knownRelationships = relationships.filter(
    (relationship) => positions.has(relationship.source_concept_id) && positions.has(relationship.target_concept_id),
  );
  const groups = new Map<string, Relationship[]>();
  knownRelationships.forEach((relationship) => {
    const key = relationshipPairKey(relationship);
    groups.set(key, [...(groups.get(key) ?? []), relationship]);
  });

  return Array.from(groups.values())
    .flatMap((group) => {
      const sortedGroup = group
        .slice()
        .sort(
          (left, right) =>
            left.source_concept_id - right.source_concept_id ||
            left.target_concept_id - right.target_concept_id ||
            left.id - right.id ||
            left.relationship_type.localeCompare(right.relationship_type),
        );
      const hasBidirectional = sortedGroup.some((relationship) =>
        sortedGroup.some(
          (candidate) =>
            candidate.id !== relationship.id &&
            candidate.source_concept_id === relationship.target_concept_id &&
            candidate.target_concept_id === relationship.source_concept_id,
        ),
      );

      return sortedGroup.map((relationship, index) => {
        const sourcePosition = positions.get(relationship.source_concept_id)!;
        const targetPosition = positions.get(relationship.target_concept_id)!;
        const { sourceSide, targetSide } = chooseConnectionSides(sourcePosition, targetPosition);
        const centeredIndex = index - (sortedGroup.length - 1) / 2;

        return {
          id: String(relationship.id),
          relationshipId: relationship.id,
          source: String(relationship.source_concept_id),
          target: String(relationship.target_concept_id),
          relationshipType: relationship.relationship_type,
          label: relationship.relationship_type,
          mastery: relationship.mastery_score,
          confidence: relationship.confidence,
          relationship,
          sourceSide,
          targetSide,
          parallelIndex: index,
          parallelCount: sortedGroup.length,
          curveOffset: Math.round(centeredIndex * 42),
          bidirectional: hasBidirectional,
        };
      });
    })
    .sort((left, right) => left.relationshipId - right.relationshipId);
}

export function chooseConnectionSides(sourcePosition: Point, targetPosition: Point) {
  const sourceCenter = nodeCenter(sourcePosition);
  const targetCenter = nodeCenter(targetPosition);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      sourceSide: dx >= 0 ? 'right' : 'left',
      targetSide: dx >= 0 ? 'left' : 'right',
    } satisfies { sourceSide: PortSide; targetSide: PortSide };
  }

  return {
    sourceSide: dy >= 0 ? 'bottom' : 'top',
    targetSide: dy >= 0 ? 'top' : 'bottom',
  } satisfies { sourceSide: PortSide; targetSide: PortSide };
}

export function classicRelationshipPath(
  source: Point,
  target: Point,
  curveOffset: number,
): { path: string; labelX: number; labelY: number } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const directionX = dx / distance;
  const directionY = dy / distance;
  const normalX = -directionY;
  const normalY = directionX;
  const controlDistance = Math.min(260, Math.max(80, distance * 0.36));
  const offsetX = normalX * curveOffset;
  const offsetY = normalY * curveOffset;
  const control1 = {
    x: source.x + directionX * controlDistance + offsetX,
    y: source.y + directionY * controlDistance + offsetY,
  };
  const control2 = {
    x: target.x - directionX * controlDistance + offsetX,
    y: target.y - directionY * controlDistance + offsetY,
  };
  const label = cubicPoint(source, control1, control2, target, 0.5);

  return {
    path: `M ${source.x},${source.y} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${target.x},${target.y}`,
    labelX: label.x,
    labelY: label.y,
  };
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

function initialClassicPosition(concept: Concept, graph: GraphResponse, placed: Map<number, Point>) {
  const placedRelatedCenters = graph.relationships
    .map((relationship) => {
      if (relationship.source_concept_id === concept.id) return placed.get(relationship.target_concept_id);
      if (relationship.target_concept_id === concept.id) return placed.get(relationship.source_concept_id);
      return undefined;
    })
    .filter((position): position is Point => Boolean(position))
    .map(nodeCenter);

  if (placed.size === 0 || concept.id === graph.center_id) {
    return findOpenPosition(centerNodeAt({ x: 0, y: 0 }), placed);
  }

  if (placedRelatedCenters.length) {
    const average = averagePoint(placedRelatedCenters);
    const angle = concept.id * GOLDEN_ANGLE;
    return findOpenPosition(
      centerNodeAt({
        x: average.x + Math.cos(angle) * CLASSIC_NODE_GAP_X,
        y: average.y + Math.sin(angle) * CLASSIC_NODE_GAP_Y,
      }),
      placed,
    );
  }

  const angle = placed.size * GOLDEN_ANGLE;
  const radius = CLASSIC_RING_SPACING + Math.sqrt(placed.size) * 96;
  return findOpenPosition(
    centerNodeAt({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }),
    placed,
  );
}

function findOpenPosition(preferred: Point, placed: Map<number, Point>): Point {
  const preferredSlot = snapPoint(preferred);
  if (!collidesWithAny(preferredSlot, placed)) return preferredSlot;

  for (let ring = 1; ring <= 48; ring += 1) {
    for (let column = -ring; column <= ring; column += 1) {
      for (let row = -ring; row <= ring; row += 1) {
        if (Math.abs(column) !== ring && Math.abs(row) !== ring) continue;
        const candidate = snapPoint({
          x: preferredSlot.x + column * CLASSIC_NODE_GAP_X,
          y: preferredSlot.y + row * CLASSIC_NODE_GAP_Y,
        });
        if (!collidesWithAny(candidate, placed)) return candidate;
      }
    }
  }

  return snapPoint({
    x: preferredSlot.x + (placed.size + 1) * CLASSIC_NODE_GAP_X,
    y: preferredSlot.y,
  });
}

function collidesWithAny(candidate: Point, placed: Map<number, Point>) {
  return Array.from(placed.values()).some((position) => nodesOverlap(candidate, position));
}

function nodesOverlap(left: Point, right: Point) {
  return Math.abs(left.x - right.x) < GRAPH_NODE_WIDTH + 48 && Math.abs(left.y - right.y) < GRAPH_NODE_HEIGHT + 48;
}

function positionStoreToMap(store: ClassicPositionStore) {
  return new Map(Object.entries(store).map(([conceptId, position]) => [Number(conceptId), position]));
}

function mapToPositionStore(map: Map<number, Point>) {
  return Object.fromEntries(Array.from(map.entries()).map(([conceptId, position]) => [String(conceptId), position]));
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

function centerNodeAt(center: Point): Point {
  return snapPoint({
    x: center.x - GRAPH_NODE_WIDTH / 2,
    y: center.y - GRAPH_NODE_HEIGHT / 2,
  });
}

function nodeCenter(position: Point): Point {
  return {
    x: position.x + GRAPH_NODE_WIDTH / 2,
    y: position.y + GRAPH_NODE_HEIGHT / 2,
  };
}

function averagePoint(points: Point[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function cubicPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x:
      inverse * inverse * inverse * start.x +
      3 * inverse * inverse * t * control1.x +
      3 * inverse * t * t * control2.x +
      t * t * t * end.x,
    y:
      inverse * inverse * inverse * start.y +
      3 * inverse * inverse * t * control1.y +
      3 * inverse * t * t * control2.y +
      t * t * t * end.y,
  };
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const maybePoint = value as Partial<Point>;
  return Number.isFinite(maybePoint.x) && Number.isFinite(maybePoint.y);
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
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
