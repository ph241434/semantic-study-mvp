import { describe, expect, it } from 'vitest';

import {
  curveDistanceUpdatesForValidation,
  edgePathPoints,
  layoutOptionsForAttempt,
  resolveEdgeNodeIntersectionPositions,
  resolveNodeOverlapPositions,
  validateGeometry,
  type GeometrySnapshot,
} from './graphGeometry';

describe('Cytoscape graph geometry validation', () => {
  it('detects and resolves visible node overlaps', () => {
    const snapshot: GeometrySnapshot = {
      edges: [],
      nodes: [
        node('concept:1', 0, 0, 80),
        node('concept:2', 20, 0, 80),
      ],
    };

    expect(validateGeometry(snapshot).nodeOverlaps).toHaveLength(1);

    const positions = resolveNodeOverlapPositions(snapshot);
    expect(Object.keys(positions)).toEqual(['concept:1', 'concept:2']);

    const corrected: GeometrySnapshot = {
      edges: [],
      nodes: snapshot.nodes.map((item) => {
        const position = positions[item.id] ?? item.position;
        const dx = position.x - item.position.x;
        const dy = position.y - item.position.y;
        return {
          ...item,
          box: {
            x1: item.box.x1 + dx,
            x2: item.box.x2 + dx,
            y1: item.box.y1 + dy,
            y2: item.box.y2 + dy,
          },
          position,
        };
      }),
    };
    expect(validateGeometry(corrected).nodeOverlaps).toHaveLength(0);
  });

  it('detects edge-node intersections and proposes deterministic curve updates', () => {
    const snapshot: GeometrySnapshot = {
      edges: [
        {
          id: 'relationship:1',
          source: 'concept:1',
          target: 'concept:2',
          curveDistance: 0,
          curveWeight: 0.5,
        },
      ],
      nodes: [
        node('concept:1', -100, 0, 40),
        node('concept:2', 100, 0, 40),
        node('concept:3', 0, 0, 48),
      ],
    };

    const validation = validateGeometry(snapshot);

    expect(validation.edgeNodeIntersections).toContainEqual({ edgeId: 'relationship:1', nodeId: 'concept:3' });
    expect(curveDistanceUpdatesForValidation(snapshot, validation, 0)['relationship:1']).not.toBe(0);
    expect(resolveEdgeNodeIntersectionPositions(snapshot, validation.edgeNodeIntersections, 0)['concept:3'].y).not.toBe(0);
  });

  it('flags near-identical semantic edge paths', () => {
    const snapshot: GeometrySnapshot = {
      edges: [
        { id: 'relationship:1', source: 'concept:1', target: 'concept:2', curveDistance: 40, curveWeight: 0.5 },
        { id: 'relationship:2', source: 'concept:1', target: 'concept:2', curveDistance: 40, curveWeight: 0.5 },
      ],
      nodes: [node('concept:1', -120, 0, 40), node('concept:2', 120, 0, 40)],
    };

    expect(validateGeometry(snapshot).edgeOverlapWarnings).toContainEqual({
      leftEdgeId: 'relationship:1',
      rightEdgeId: 'relationship:2',
    });
  });

  it('scales supported layout spacing options on retry without enabling animation or fit', () => {
    const options = layoutOptionsForAttempt(
      ({
        name: 'fcose',
        animate: true,
        fit: true,
        gravity: 0.18,
        idealEdgeLength: 155,
        nodeRepulsion: 8200,
        tilingPaddingHorizontal: 105,
      } as unknown) as Parameters<typeof layoutOptionsForAttempt>[0],
      2,
    ) as unknown as Record<string, unknown>;

    expect(options.animate).toBe(false);
    expect(options.fit).toBe(false);
    expect(options.idealEdgeLength).toBeGreaterThan(155);
    expect(options.nodeRepulsion).toBeGreaterThan(8200);
    expect(options.gravity).toBeLessThan(0.18);
  });

  it('samples unbundled bezier edge paths from Cytoscape curve data', () => {
    const points = edgePathPoints(
      { id: 'relationship:1', source: 'concept:1', target: 'concept:2', curveDistance: 50, curveWeight: 0.5 },
      new Map([
        ['concept:1', node('concept:1', 0, 0, 40)],
        ['concept:2', node('concept:2', 100, 0, 40)],
      ]),
      5,
    );

    expect(points).toHaveLength(5);
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[2].y).toBeGreaterThan(0);
  });
});

function node(id: string, x: number, y: number, size: number) {
  return {
    id,
    box: {
      x1: x - size / 2,
      x2: x + size / 2,
      y1: y - size / 2,
      y2: y + size / 2,
    },
    position: { x, y },
  };
}
