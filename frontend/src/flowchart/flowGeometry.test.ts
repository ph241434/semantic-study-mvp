import { describe, expect, it } from 'vitest';

import type { LayoutEdgeResult, LayoutNodeResult } from './elkLayout';
import { edgesOverlapLength, segmentIntersectsRect, validateFlowGeometry } from './flowGeometry';
import { createViewStateStore } from './viewStateStore';

const box = (id: string, x: number, y: number, width = 100, height = 40): LayoutNodeResult => ({ id, x, y, width, height });
const edge = (id: string, source: string, target: string, points: Array<[number, number]>): LayoutEdgeResult => ({
  id,
  source,
  target,
  points: points.map(([x, y]) => ({ x, y })),
  backEdge: false,
});

describe('flow geometry validation', () => {
  it('detects overlapping node boxes', () => {
    const result = validateFlowGeometry([box('a', 0, 0), box('b', 50, 10), box('c', 300, 0)], []);
    expect(result.valid).toBe(false);
    expect(result.nodeOverlaps).toEqual([['a', 'b']]);
  });

  it('detects an edge passing through an unrelated node but not its own endpoints', () => {
    const nodes = [box('a', 0, 0), box('mid', 0, 100), box('b', 0, 200)];
    const through = edge('e1', 'a', 'b', [[50, 40], [50, 200]]);
    const around = edge('e2', 'a', 'b', [[50, 40], [50, 70], [160, 70], [160, 170], [50, 170], [50, 200]]);
    expect(validateFlowGeometry(nodes, [through]).edgeNodeIntersections).toEqual([{ edgeId: 'e1', nodeId: 'mid' }]);
    expect(validateFlowGeometry(nodes, [around]).edgeNodeIntersections).toEqual([]);
    expect(segmentIntersectsRect({ x: -20, y: 20 }, { x: 200, y: 20 }, box('a', 0, 0))).toBe(true);
    expect(segmentIntersectsRect({ x: -20, y: 60 }, { x: 200, y: 60 }, box('a', 0, 0))).toBe(false);
  });

  it('flags edges sharing a visible path (including opposite directions) but not clean crossings', () => {
    const forward = edge('f', 'a', 'b', [[50, 40], [50, 200]]);
    const backward = edge('r', 'b', 'a', [[50, 200], [50, 40]]);
    const crossing = edge('x', 'c', 'd', [[-40, 120], [200, 120]]);
    expect(edgesOverlapLength(forward.points, backward.points)).toBeGreaterThan(100);
    expect(edgesOverlapLength(forward.points, crossing.points)).toBe(0);
    const nodes = [box('a', 0, 0), box('b', 0, 200), box('c', -200, 100), box('d', 300, 100)];
    const result = validateFlowGeometry(nodes, [forward, backward, crossing]);
    expect(result.edgeOverlaps).toEqual([['f', 'r']]);
  });
});

describe('flowchart view-state store', () => {
  const state = (zoom: number) => ({
    signature: 'sig',
    layout: null,
    positions: { n1: { x: 1, y: 2 } },
    routed: true,
    pan: { x: 10, y: 20 },
    zoom,
  });

  it('keeps independent snapshots per flowchart and copies on save', () => {
    const store = createViewStateStore();
    const parent = state(1.5);
    store.save(1, parent);
    store.save(2, state(0.5));
    parent.positions.n1.x = 999; // mutation after save must not leak into the store
    expect(store.get(1)).toMatchObject({ zoom: 1.5, positions: { n1: { x: 1, y: 2 } } });
    expect(store.get(2)?.zoom).toBe(0.5);
    store.clear(1);
    expect(store.get(1)).toBeUndefined();
    expect(store.get(2)).toBeDefined();
  });
});
