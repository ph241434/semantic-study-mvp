import { describe, expect, it } from 'vitest';

import { backEdgeLanePoints, pathFromPoints, pointAlong, polylineMidpoint } from './flowPaths';

describe('edge path helpers', () => {
  it('builds a straight path, and rounds corners of a bent one', () => {
    expect(pathFromPoints([{ x: 0, y: 0 }, { x: 0, y: 50 }])).toBe('M 0 0 L 0 50');
    const bent = pathFromPoints([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }], 8);
    expect(bent).toContain('Q 0 40'); // quadratic corner at the bend
    expect(bent.startsWith('M 0 0')).toBe(true);
    expect(bent.endsWith('L 60 40')).toBe(true);
    expect(pathFromPoints([])).toBe('');
  });

  it('never rounds a corner more than half of its shorter side', () => {
    const tiny = pathFromPoints([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 40, y: 4 }], 20);
    expect(tiny).toContain('L 0 2 Q 0 4 2 4'); // radius clamped to 2
  });

  it('finds a point along the route and its midpoint', () => {
    const route = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
    expect(pointAlong(route, 40)).toEqual({ x: 0, y: 40 });
    expect(pointAlong(route, 150)).toEqual({ x: 50, y: 100 });
    expect(pointAlong(route, 9999)).toEqual({ x: 100, y: 100 });
    expect(polylineMidpoint(route)).toEqual({ x: 0, y: 100 });
  });

  it('routes a loop along an outer lane beyond both boxes when nodes were moved by hand', () => {
    const source = { x: 200, y: 400 }; // bottom-centre of the source
    const target = { x: 100, y: 100 }; // top-centre of the (higher) target
    const lane = backEdgeLanePoints(source, target, 120, 140);
    const laneX = Math.max(200 + 60, 100 + 70) + 40;
    expect(lane[0]).toEqual(source);
    expect(lane[lane.length - 1]).toEqual(target);
    expect(lane.filter((point) => point.x === laneX)).toHaveLength(2); // the vertical run beside everything
    expect(Math.max(...lane.map((point) => point.x))).toBe(laneX);
    // It re-enters the target from above, so the arrowhead points down into it.
    expect(lane[lane.length - 2].y).toBeLessThan(target.y);
  });
});
