import { beforeEach, describe, expect, it } from 'vitest';

import type { Concept, GraphResponse, Relationship } from '../types';
import {
  GRAPH_GRID_SIZE,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  buildGraphLayout,
  chooseConnectionSides,
  classicPositionStoresEqual,
  classicRelationshipPath,
  clearGraphLayoutCaches,
  distanceMap,
  ensureClassicPositions,
  generateSyntheticGraph,
  getGraphLayoutCacheStats,
  graphLayoutModes,
  graphStructureSignature,
  reorganizeClassicPositions,
  routeRelationships,
  snapPoint,
  toVisualGraphData,
  updateClassicPosition,
  type ClassicPositionStore,
  type Point,
} from './layout';

describe('classic graph data boundary', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('projects semantic graph data into visual nodes and visible edges', () => {
    const graph: GraphResponse = {
      ...graphOf(2, [[10, 1, 2, 'USES']]),
      relationships: [relationship(10, 1, 2, 'USES'), relationship(11, 1, 99, 'REQUIRES')],
    };

    const visual = toVisualGraphData(graph);

    expect(visual.nodes.map((node) => node.conceptId)).toEqual([1, 2]);
    expect(visual.nodes[0]).toMatchObject({
      id: '1',
      label: 'Concept 1',
      conceptType: 'algorithm',
      mastery: 0.5,
    });
    expect(visual.edges.map((edge) => edge.relationshipId)).toEqual([10]);
    expect(visual.edges[0]).toMatchObject({
      source: '1',
      target: '2',
      label: 'USES',
    });
  });

  it('exposes only the Classic layout mode for the rewrite stop point', () => {
    expect(graphLayoutModes).toEqual(['classic']);
  });

  it('keeps graph signatures scoped to semantic graph structure, not saved coordinates', () => {
    const graph = graphOf(2, [[10, 1, 2, 'USES']]);
    const signature = graphStructureSignature(graph, 'space:current');

    expect(signature).toContain('space:current');
    expect(signature).toContain('1>2:USES');
    expect(signature).not.toContain('240');
  });
});

describe('classic position model', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('uses valid saved positions and creates only missing positions', () => {
    const graph = graphOf(3, [
      [10, 1, 2, 'USES'],
      [11, 1, 3, 'REQUIRES'],
    ]);
    const saved = {
      '1': { x: -96, y: -24 },
      '2': { x: 264, y: -24 },
    };

    const ensured = ensureClassicPositions(graph, saved);

    expect(ensured.addedConceptIds).toEqual([3]);
    expect(ensured.positions['1']).toEqual(saved['1']);
    expect(ensured.positions['2']).toEqual(saved['2']);
    expect(ensured.positions['3']).toBeDefined();
    expect(noOverlaps(Object.values(ensured.positions))).toBe(true);
  });

  it('does not move existing nodes when a new concept enters the visible graph', () => {
    const saved = {
      '1': { x: -96, y: -24 },
      '2': { x: 264, y: -24 },
    };
    const expandedGraph = graphOf(3, [
      [10, 1, 2, 'USES'],
      [11, 2, 3, 'REQUIRES'],
    ]);

    const ensured = ensureClassicPositions(expandedGraph, saved).positions;

    expect(ensured['1']).toEqual(saved['1']);
    expect(ensured['2']).toEqual(saved['2']);
    expect(ensured['3']).toBeDefined();
  });

  it('updates one manual coordinate without changing semantic graph data', () => {
    const before: ClassicPositionStore = {
      '1': { x: -96, y: -24 },
      '2': { x: 264, y: -24 },
    };

    const after = updateClassicPosition(before, 2, { x: 115, y: 119 });

    expect(after['1']).toEqual(before['1']);
    expect(after['2']).toEqual({ x: 120, y: 120 });
    expect(before['2']).toEqual({ x: 264, y: -24 });
  });

  it('does not automatically move saved Classic positions when mastery changes', () => {
    const graph = graphOf(2, [[10, 1, 2, 'USES']]);
    const saved = {
      '1': { x: -96, y: -24 },
      '2': { x: 264, y: -24 },
    };
    const changedMastery = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, mastery_score: node.mastery_score + 0.1 })),
    };

    const before = buildGraphLayout(graph, 'classic', { positions: saved });
    const after = buildGraphLayout(changedMastery, 'classic', { positions: saved });

    expect(positionById(before, 1)).toEqual(saved['1']);
    expect(positionById(after, 1)).toEqual(saved['1']);
    expect(positionById(after, 2)).toEqual(saved['2']);
  });

  it('compares Classic position stores by coordinate value', () => {
    expect(
      classicPositionStoresEqual(
        { '1': { x: 0, y: 0 }, '2': { x: 24, y: 48 } },
        { '2': { x: 24, y: 48 }, '1': { x: 0, y: 0 } },
      ),
    ).toBe(true);
    expect(classicPositionStoresEqual({ '1': { x: 0, y: 0 } }, { '1': { x: 24, y: 0 } })).toBe(false);
  });

  it('reorganizes deterministically and avoids obvious node overlap', () => {
    const graph = graphOf(12, [
      [1, 1, 2, 'USES'],
      [2, 1, 3, 'USES'],
      [3, 1, 4, 'USES'],
      [4, 2, 5, 'REQUIRES'],
      [5, 2, 6, 'REQUIRES'],
      [6, 3, 7, 'PART_OF'],
      [7, 3, 8, 'PART_OF'],
      [8, 4, 9, 'CAUSES'],
      [9, 4, 10, 'CAUSES'],
      [10, 7, 11, 'SUPPORTS'],
      [11, 8, 12, 'SUPPORTS'],
    ]);

    const first = reorganizeClassicPositions(graph);
    const second = reorganizeClassicPositions(graph);

    expect(first).toEqual(second);
    expect(noOverlaps(Object.values(first))).toBe(true);
    Object.values(first).forEach((position) => {
      expect(Math.abs(position.x % GRAPH_GRID_SIZE)).toBe(0);
      expect(Math.abs(position.y % GRAPH_GRID_SIZE)).toBe(0);
    });
  });
});

describe('classic relationship routing', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('chooses connection sides from relative node positions', () => {
    expect(chooseConnectionSides({ x: 0, y: 0 }, { x: 280, y: 0 })).toEqual({
      sourceSide: 'right',
      targetSide: 'left',
    });
    expect(chooseConnectionSides({ x: 0, y: 0 }, { x: 0, y: 240 })).toEqual({
      sourceSide: 'bottom',
      targetSide: 'top',
    });
  });

  it('separates multiple same-pair relationships with deterministic curve offsets', () => {
    const routes = routeRelationships(
      [relationship(1, 1, 2, 'USES'), relationship(2, 1, 2, 'REQUIRES'), relationship(3, 1, 2, 'SUPPORTS')],
      new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 280, y: 0 }],
      ]),
    );

    expect(routes.map((route) => route.curveOffset)).toEqual([-42, 0, 42]);
    expect(routes.every((route) => route.parallelCount === 3)).toBe(true);
  });

  it('separates bidirectional relationships and keeps direction sides obvious', () => {
    const routes = routeRelationships(
      [relationship(1, 1, 2, 'USES'), relationship(2, 2, 1, 'REQUIRES')],
      new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 280, y: 0 }],
      ]),
    );

    expect(routes.map((route) => route.curveOffset)).toEqual([-21, 21]);
    expect(routes.every((route) => route.bidirectional)).toBe(true);
    expect(routes[0]).toMatchObject({ sourceSide: 'right', targetSide: 'left' });
    expect(routes[1]).toMatchObject({ sourceSide: 'left', targetSide: 'right' });
  });

  it('keeps relationship labels tied to their own edge path', () => {
    const left = classicRelationshipPath({ x: 0, y: 0 }, { x: 280, y: 0 }, -42);
    const right = classicRelationshipPath({ x: 0, y: 0 }, { x: 280, y: 0 }, 42);

    expect(left.path).not.toEqual(right.path);
    expect(left.labelY).not.toBe(right.labelY);
  });
});

describe('classic graph scale and layout work', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('computes BFS distances for visible graph depth without storing them', () => {
    const distances = distanceMap(1, [
      relationship(1, 1, 2),
      relationship(2, 2, 3),
      relationship(3, 4, 5),
    ]);

    expect(distances.get(1)).toBe(0);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(2);
    expect(distances.has(4)).toBe(false);
  });

  it('handles synthetic 100-node, 300-node, and 500-node Classic graphs without changing counts', () => {
    const oneHundred = generateSyntheticGraph(100, 200);
    const threeHundred = generateSyntheticGraph(300, 600);
    const fiveHundred = generateSyntheticGraph(500, 1000);

    const smallLayout = buildGraphLayout(oneHundred, 'classic');
    const mediumLayout = buildGraphLayout(threeHundred, 'classic');
    const largeLayout = buildGraphLayout(fiveHundred, 'classic');

    expect(smallLayout.nodes).toHaveLength(100);
    expect(smallLayout.relationships).toHaveLength(200);
    expect(mediumLayout.nodes).toHaveLength(300);
    expect(mediumLayout.relationships).toHaveLength(600);
    expect(largeLayout.nodes).toHaveLength(500);
    expect(largeLayout.relationships).toHaveLength(1000);
    expect(largeLayout.communities).toEqual([]);
    largeLayout.nodes.forEach((node) => {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
  });

  it('does not run community work in the active Classic path', () => {
    buildGraphLayout(graphOf(5, [[1, 1, 2, 'USES']]), 'classic');

    expect(getGraphLayoutCacheStats().communityComputations).toBe(0);
    expect(getGraphLayoutCacheStats().communityEntries).toBe(0);
  });
});

function graphOf(nodeCount: number, edges: Array<[number, number, number, string?]>): GraphResponse {
  return {
    center_id: 1,
    depth: 3,
    nodes: Array.from({ length: nodeCount }, (_, index) => concept(index + 1)),
    relationships: edges.map(([id, source, target, type]) => relationship(id, source, target, type)),
  };
}

function concept(id: number): Concept {
  return {
    id,
    name: `Concept ${id}`,
    description: '',
    concept_type: id % 2 === 0 ? 'definition' : 'algorithm',
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function relationship(id: number, sourceId: number, targetId: number, type = 'USES'): Relationship {
  return {
    id,
    source_concept_id: sourceId,
    target_concept_id: targetId,
    relationship_type: type,
    description: '',
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: `Concept ${sourceId}`,
    target_name: `Concept ${targetId}`,
  };
}

function positionById(layout: ReturnType<typeof buildGraphLayout>, conceptId: number) {
  return layout.nodes.find((node) => node.conceptId === conceptId)?.position;
}

function noOverlaps(positions: Point[]) {
  return positions.every((left, leftIndex) =>
    positions.slice(leftIndex + 1).every((right) => {
      const separated =
        Math.abs(left.x - right.x) >= GRAPH_NODE_WIDTH + 48 ||
        Math.abs(left.y - right.y) >= GRAPH_NODE_HEIGHT + 48;
      return separated;
    }),
  );
}
