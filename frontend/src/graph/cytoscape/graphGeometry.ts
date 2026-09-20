import type { LayoutOptions } from 'cytoscape';

import type { GraphPoint } from './graphTypes';

export type GeometryBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type GeometryNode = {
  id: string;
  box: GeometryBox;
  position: GraphPoint;
};

export type GeometryEdge = {
  id: string;
  source: string;
  target: string;
  curveDistance: number;
  curveWeight: number;
};

export type GeometrySnapshot = {
  nodes: GeometryNode[];
  edges: GeometryEdge[];
};

export type NodeOverlap = {
  leftNodeId: string;
  rightNodeId: string;
  overlapX: number;
  overlapY: number;
};

export type EdgeNodeIntersection = {
  edgeId: string;
  nodeId: string;
};

export type EdgeOverlapWarning = {
  leftEdgeId: string;
  rightEdgeId: string;
};

export type GeometryValidation = {
  attempt: number;
  edgeNodeIntersections: EdgeNodeIntersection[];
  edgeOverlapWarnings: EdgeOverlapWarning[];
  nodeOverlaps: NodeOverlap[];
  valid: boolean;
};

const NODE_CLEARANCE = 10;
const EDGE_NODE_CLEARANCE = 8;
const EDGE_PATH_SAMPLES = 19;
const EDGE_OVERLAP_DISTANCE = 16;
const EPSILON = 0.001;

export function validateGeometry(snapshot: GeometrySnapshot, attempt = 0): GeometryValidation {
  const nodeOverlaps = findNodeOverlaps(snapshot.nodes);
  const edgeNodeIntersections = findEdgeNodeIntersections(snapshot);
  const edgeOverlapWarnings = findEdgeOverlapWarnings(snapshot);
  return {
    attempt,
    edgeNodeIntersections,
    edgeOverlapWarnings,
    nodeOverlaps,
    valid: nodeOverlaps.length === 0 && edgeNodeIntersections.length === 0 && edgeOverlapWarnings.length === 0,
  };
}

export function layoutOptionsForAttempt(baseOptions: LayoutOptions, attempt: number): LayoutOptions {
  const next = { ...((baseOptions as unknown) as Record<string, unknown>), animate: false, fit: false };
  if (attempt <= 0) return next as LayoutOptions;

  const factor = 1 + attempt * 0.32;
  multiplyOption(next, 'componentSpacing', factor);
  multiplyOption(next, 'idealEdgeLength', factor);
  multiplyOption(next, 'nodeOverlap', factor);
  multiplyOption(next, 'nodeRepulsion', factor * factor);
  multiplyOption(next, 'nodeSeparation', factor);
  multiplyOption(next, 'padding', 1 + attempt * 0.14);
  multiplyOption(next, 'tilingPaddingHorizontal', factor);
  multiplyOption(next, 'tilingPaddingVertical', factor);
  divideOption(next, 'gravity', factor);
  return next as LayoutOptions;
}

export function resolveNodeOverlapPositions(snapshot: GeometrySnapshot, maxPasses = 10): Record<string, GraphPoint> {
  const items = snapshot.nodes.map((node) => ({
    box: { ...node.box },
    id: node.id,
    position: { ...node.position },
  }));

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        const overlapX = overlapAmount(left.box.x1, left.box.x2, right.box.x1, right.box.x2, NODE_CLEARANCE);
        const overlapY = overlapAmount(left.box.y1, left.box.y2, right.box.y1, right.box.y2, NODE_CLEARANCE);
        if (overlapX <= 0 || overlapY <= 0) continue;

        changed = true;
        if (overlapX <= overlapY) {
          const direction = signOrHash(right.position.x - left.position.x, `${left.id}:${right.id}:x`);
          moveItem(left, -direction * (overlapX / 2 + 0.5), 0);
          moveItem(right, direction * (overlapX / 2 + 0.5), 0);
        } else {
          const direction = signOrHash(right.position.y - left.position.y, `${left.id}:${right.id}:y`);
          moveItem(left, 0, -direction * (overlapY / 2 + 0.5));
          moveItem(right, 0, direction * (overlapY / 2 + 0.5));
        }
      }
    }
    if (!changed) break;
  }

  const positions: Record<string, GraphPoint> = {};
  items.forEach((item, index) => {
    const original = snapshot.nodes[index].position;
    if (distance(original, item.position) > EPSILON) {
      positions[item.id] = {
        x: Number(item.position.x.toFixed(2)),
        y: Number(item.position.y.toFixed(2)),
      };
    }
  });
  return positions;
}

export function resolveEdgeNodeIntersectionPositions(
  snapshot: GeometrySnapshot,
  intersections: EdgeNodeIntersection[],
  attempt: number,
): Record<string, GraphPoint> {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  const counts = new Map<string, number>();
  const updates = new Map<string, GraphPoint>();

  [...intersections]
    .sort((left, right) => `${left.nodeId}:${left.edgeId}`.localeCompare(`${right.nodeId}:${right.edgeId}`))
    .forEach((intersection) => {
      const node = nodes.get(intersection.nodeId);
      const edge = edges.get(intersection.edgeId);
      if (!node || !edge) return;

      const path = edgePathPoints(edge, nodes);
      const nearest = nearestPointOnPolyline(node.position, path);
      let dx = node.position.x - nearest.x;
      let dy = node.position.y - nearest.y;
      let length = Math.hypot(dx, dy);
      if (length <= EPSILON) {
        const source = nodes.get(edge.source);
        const target = nodes.get(edge.target);
        if (source && target) {
          dx = -(target.position.y - source.position.y);
          dy = target.position.x - source.position.x;
          length = Math.hypot(dx, dy);
        }
      }
      if (length <= EPSILON) {
        dx = deterministicSign(`${intersection.nodeId}:${intersection.edgeId}:x`);
        dy = deterministicSign(`${intersection.nodeId}:${intersection.edgeId}:y`);
        length = Math.hypot(dx, dy);
      }

      const count = counts.get(node.id) ?? 0;
      const current = updates.get(node.id) ?? node.position;
      const distanceToMove = 96 + attempt * 34 + count * 24;
      updates.set(node.id, {
        x: Number((current.x + (dx / length) * distanceToMove).toFixed(2)),
        y: Number((current.y + (dy / length) * distanceToMove).toFixed(2)),
      });
      counts.set(node.id, count + 1);
    });

  return Object.fromEntries(updates);
}

export function curveDistanceUpdatesForValidation(
  snapshot: GeometrySnapshot,
  validation: Pick<GeometryValidation, 'edgeNodeIntersections' | 'edgeOverlapWarnings'>,
  attempt: number,
): Record<string, number> {
  const edgeIds = new Set<string>();
  validation.edgeNodeIntersections.forEach((intersection) => edgeIds.add(intersection.edgeId));
  validation.edgeOverlapWarnings.forEach((warning) => {
    edgeIds.add(warning.leftEdgeId);
    edgeIds.add(warning.rightEdgeId);
  });

  const updates: Record<string, number> = {};
  Array.from(edgeIds).sort().forEach((edgeId, index) => {
    const edge = snapshot.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const sign = Math.abs(edge.curveDistance) > EPSILON ? Math.sign(edge.curveDistance) : deterministicSign(edge.id);
    const step = 38 + attempt * 18 + index * 10;
    const minimum = 56 + attempt * 16;
    updates[edgeId] = Number((sign * Math.max(Math.abs(edge.curveDistance) + step, minimum)).toFixed(2));
  });
  return updates;
}

export function edgePathPoints(edge: GeometryEdge, nodes: Map<string, GeometryNode>, samples = EDGE_PATH_SAMPLES): GraphPoint[] {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return [];

  const start = source.position;
  const end = target.position;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return [start, end];

  const weight = Number.isFinite(edge.curveWeight) ? edge.curveWeight : 0.5;
  const anchor = {
    x: start.x + dx * weight,
    y: start.y + dy * weight,
  };
  const control = {
    x: anchor.x + (-dy / length) * edge.curveDistance,
    y: anchor.y + (dx / length) * edge.curveDistance,
  };

  return Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
  });
}

function findNodeOverlaps(nodes: GeometryNode[]): NodeOverlap[] {
  const overlaps: NodeOverlap[] = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const overlapX = overlapAmount(left.box.x1, left.box.x2, right.box.x1, right.box.x2, NODE_CLEARANCE);
      const overlapY = overlapAmount(left.box.y1, left.box.y2, right.box.y1, right.box.y2, NODE_CLEARANCE);
      if (overlapX > 0 && overlapY > 0) {
        overlaps.push({
          leftNodeId: left.id,
          overlapX: Number(overlapX.toFixed(2)),
          overlapY: Number(overlapY.toFixed(2)),
          rightNodeId: right.id,
        });
      }
    }
  }
  return overlaps;
}

function findEdgeNodeIntersections(snapshot: GeometrySnapshot): EdgeNodeIntersection[] {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const intersections: EdgeNodeIntersection[] = [];

  snapshot.edges.forEach((edge) => {
    const points = edgePathPoints(edge, nodes);
    if (points.length < 2) return;
    snapshot.nodes.forEach((node) => {
      if (node.id === edge.source || node.id === edge.target) return;
      const box = inflateBox(node.box, EDGE_NODE_CLEARANCE);
      if (polylineIntersectsBox(points, box)) {
        intersections.push({ edgeId: edge.id, nodeId: node.id });
      }
    });
  });

  return intersections;
}

function findEdgeOverlapWarnings(snapshot: GeometrySnapshot): EdgeOverlapWarning[] {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const paths = new Map(snapshot.edges.map((edge) => [edge.id, edgePathPoints(edge, nodes)]));
  const warnings: EdgeOverlapWarning[] = [];

  for (let leftIndex = 0; leftIndex < snapshot.edges.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < snapshot.edges.length; rightIndex += 1) {
      const left = snapshot.edges[leftIndex];
      const right = snapshot.edges[rightIndex];
      const leftPath = paths.get(left.id) ?? [];
      const rightPath = paths.get(right.id) ?? [];
      if (leftPath.length < 5 || rightPath.length < 5) continue;
      const ratio = Math.max(pathNearRatio(leftPath, rightPath), pathNearRatio(leftPath, [...rightPath].reverse()));
      if (ratio >= 0.72) {
        warnings.push({ leftEdgeId: left.id, rightEdgeId: right.id });
      }
    }
  }

  return warnings;
}

function multiplyOption(options: Record<string, unknown>, key: string, factor: number) {
  if (typeof options[key] === 'number') {
    options[key] = Number(((options[key] as number) * factor).toFixed(2));
  }
}

function divideOption(options: Record<string, unknown>, key: string, factor: number) {
  if (typeof options[key] === 'number') {
    options[key] = Number(((options[key] as number) / factor).toFixed(3));
  }
}

function moveItem(item: { box: GeometryBox; position: GraphPoint }, dx: number, dy: number) {
  item.position.x += dx;
  item.position.y += dy;
  item.box.x1 += dx;
  item.box.x2 += dx;
  item.box.y1 += dy;
  item.box.y2 += dy;
}

function overlapAmount(leftMin: number, leftMax: number, rightMin: number, rightMax: number, clearance: number) {
  return Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin) + clearance;
}

function polylineIntersectsBox(points: GraphPoint[], box: GeometryBox) {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsBox(points[index - 1], points[index], box)) return true;
  }
  return false;
}

function segmentIntersectsBox(start: GraphPoint, end: GraphPoint, box: GeometryBox) {
  if (pointInBox(start, box) || pointInBox(end, box)) return true;
  const corners = [
    { x: box.x1, y: box.y1 },
    { x: box.x2, y: box.y1 },
    { x: box.x2, y: box.y2 },
    { x: box.x1, y: box.y2 },
  ];
  return corners.some((corner, index) => segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length]));
}

function segmentsIntersect(a: GraphPoint, b: GraphPoint, c: GraphPoint, d: GraphPoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (Math.abs(abC) <= EPSILON && onSegment(a, c, b)) return true;
  if (Math.abs(abD) <= EPSILON && onSegment(a, d, b)) return true;
  if (Math.abs(cdA) <= EPSILON && onSegment(c, a, d)) return true;
  if (Math.abs(cdB) <= EPSILON && onSegment(c, b, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function orientation(a: GraphPoint, b: GraphPoint, c: GraphPoint) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: GraphPoint, b: GraphPoint, c: GraphPoint) {
  return (
    b.x >= Math.min(a.x, c.x) - EPSILON
    && b.x <= Math.max(a.x, c.x) + EPSILON
    && b.y >= Math.min(a.y, c.y) - EPSILON
    && b.y <= Math.max(a.y, c.y) + EPSILON
  );
}

function pointInBox(point: GraphPoint, box: GeometryBox) {
  return point.x >= box.x1 && point.x <= box.x2 && point.y >= box.y1 && point.y <= box.y2;
}

function inflateBox(box: GeometryBox, padding: number): GeometryBox {
  return {
    x1: box.x1 - padding,
    x2: box.x2 + padding,
    y1: box.y1 - padding,
    y2: box.y2 + padding,
  };
}

function pathNearRatio(left: GraphPoint[], right: GraphPoint[]) {
  const start = 2;
  const end = Math.min(left.length, right.length) - 3;
  if (end <= start) return 0;

  let near = 0;
  let total = 0;
  for (let index = start; index <= end; index += 1) {
    const rightIndex = Math.round((index / (left.length - 1)) * (right.length - 1));
    if (distance(left[index], right[rightIndex]) <= EDGE_OVERLAP_DISTANCE) near += 1;
    total += 1;
  }
  return total ? near / total : 0;
}

function nearestPointOnPolyline(point: GraphPoint, path: GraphPoint[]) {
  if (path.length === 0) return point;
  let best = path[0];
  let bestDistance = distance(point, best);
  for (let index = 1; index < path.length; index += 1) {
    const candidate = nearestPointOnSegment(point, path[index - 1], path[index]);
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

function nearestPointOnSegment(point: GraphPoint, start: GraphPoint, end: GraphPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return start;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
}

function signOrHash(value: number, seed: string) {
  if (Math.abs(value) > EPSILON) return Math.sign(value);
  return deterministicSign(seed);
}

function deterministicSign(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 2 === 0 ? 1 : -1;
}

function distance(left: GraphPoint, right: GraphPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
