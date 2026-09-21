import type { Point } from './elkLayout';

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** SVG path through the points with softly rounded corners (orthogonal routes read better than sharp elbows). */
export function pathFromPoints(points: Point[], radius = 8): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const before = distance(previous, corner);
    const after = distance(corner, next);
    const r = Math.min(radius, before / 2, after / 2);
    if (r < 0.5) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const entry = { x: corner.x - ((corner.x - previous.x) / before) * r, y: corner.y - ((corner.y - previous.y) / before) * r };
    const exit = { x: corner.x + ((next.x - corner.x) / after) * r, y: corner.y + ((next.y - corner.y) / after) * r };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

/** The point ``along`` pixels from the start of the polyline (clamped to its end). */
export function pointAlong(points: Point[], along: number): Point {
  let remaining = along;
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = distance(points[i], points[i + 1]);
    if (length >= remaining && length > 0) {
      const t = remaining / length;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

export function polylineMidpoint(points: Point[]): Point {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) total += distance(points[i], points[i + 1]);
  return pointAlong(points, total / 2);
}

/**
 * Route for a loop edge after nodes have been moved by hand (ELK's route is stale then): leave the source, run down
 * an outer lane beside both boxes, and re-enter the target from above. Cheap, and needs only sizes and end points.
 */
export function backEdgeLanePoints(
  source: Point,
  target: Point,
  sourceWidth: number,
  targetWidth: number,
  clearance = 18,
  lane = 40,
): Point[] {
  const laneX = Math.max(source.x + sourceWidth / 2, target.x + targetWidth / 2) + lane;
  return [
    source,
    { x: source.x, y: source.y + clearance },
    { x: laneX, y: source.y + clearance },
    { x: laneX, y: target.y - clearance },
    { x: target.x, y: target.y - clearance },
    target,
  ];
}
