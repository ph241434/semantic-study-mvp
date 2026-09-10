import { describe, expect, it, beforeEach } from 'vitest';

import type { Concept, GraphResponse, Relationship } from '../types';
import {
  GRAPH_GRID_SIZE,
  buildGraphLayout,
  clearGraphLayoutCaches,
  detectCommunities,
  generateSyntheticGraph,
  getGraphLayoutCacheStats,
  lineIntersectsRect,
  routeRelationships,
  snapPoint,
} from './layout';

describe('graph community detection', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('detects multiple obvious communities with Louvain', () => {
    const graph = graphOf(8, [
      [1, 1, 2],
      [2, 1, 3],
      [3, 1, 4],
      [4, 2, 3],
      [5, 2, 4],
      [6, 3, 4],
      [7, 5, 6],
      [8, 5, 7],
      [9, 5, 8],
      [10, 6, 7],
      [11, 6, 8],
      [12, 7, 8],
      [13, 4, 5],
    ]);

    const result = detectCommunities(graph, 'computer-science');
    const firstClusterId = result.nodeCommunity.get(1);
    const secondClusterId = result.nodeCommunity.get(5);

    expect(result.communities.length).toBeGreaterThanOrEqual(2);
    expect([2, 3, 4].map((nodeId) => result.nodeCommunity.get(nodeId))).toEqual([
      firstClusterId,
      firstClusterId,
      firstClusterId,
    ]);
    expect([6, 7, 8].map((nodeId) => result.nodeCommunity.get(nodeId))).toEqual([
      secondClusterId,
      secondClusterId,
      secondClusterId,
    ]);
    expect(firstClusterId).not.toBe(secondClusterId);
  });

  it('keeps disconnected components separate', () => {
    const graph = graphOf(4, [
      [1, 1, 2],
      [2, 3, 4],
    ]);

    const result = detectCommunities(graph);

    expect(result.communities).toHaveLength(2);
    expect(result.nodeCommunity.get(1)).toBe(result.nodeCommunity.get(2));
    expect(result.nodeCommunity.get(3)).toBe(result.nodeCommunity.get(4));
    expect(result.nodeCommunity.get(1)).not.toBe(result.nodeCommunity.get(3));
  });

  it('handles a one-node graph', () => {
    const graph = graphOf(1, []);

    const result = detectCommunities(graph);

    expect(result.communities).toHaveLength(1);
    expect(result.communities[0].nodeIds).toEqual([1]);
  });

  it('uses the provided graph scope and historical graph structure only', () => {
    const spaceGraph = graphOf(3, [
      [1, 1, 2],
      [2, 2, 3],
    ]);
    const historicalGraph = graphOf(3, [[1, 1, 2]]);

    const scoped = detectCommunities(spaceGraph, 'space:computer-science');
    const historical = detectCommunities(historicalGraph, 'space:computer-science:as-of-early');

    expect(scoped.signature).toContain('space:computer-science');
    expect(historical.signature).toContain('space:computer-science:as-of-early');
    expect(scoped.signature).not.toEqual(historical.signature);
    expect(scoped.communities.flatMap((community) => community.nodeIds).sort()).toEqual([1, 2, 3]);
    expect(historical.communities.flatMap((community) => community.nodeIds).sort()).toEqual([1, 2, 3]);
  });

  it('caches stable inputs and invalidates when relationships are added or deleted', () => {
    const baseGraph = graphOf(4, [
      [1, 1, 2],
      [2, 3, 4],
    ]);
    const addedRelationship = {
      ...baseGraph,
      relationships: [...baseGraph.relationships, relationship(3, 2, 3)],
    };
    const deletedRelationship = {
      ...baseGraph,
      relationships: [baseGraph.relationships[0]],
    };

    detectCommunities(baseGraph);
    detectCommunities(baseGraph);
    expect(getGraphLayoutCacheStats().communityComputations).toBe(1);

    detectCommunities(addedRelationship);
    expect(getGraphLayoutCacheStats().communityComputations).toBe(2);

    detectCommunities(deletedRelationship);
    expect(getGraphLayoutCacheStats().communityComputations).toBe(3);
  });
});

describe('graph routing and grid helpers', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('gives parallel relationships separate lanes', () => {
    const routes = routeRelationships(
      [relationship(1, 1, 2, 'USES'), relationship(2, 1, 2, 'REQUIRES')],
      new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 288, y: 0 }],
      ]),
    );

    expect(new Set(routes.map((route) => route.laneOffset)).size).toBe(2);
  });

  it('keeps opposite-direction relationships distinct', () => {
    const routes = routeRelationships(
      [relationship(1, 1, 2, 'USES'), relationship(2, 2, 1, 'USES')],
      new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 288, y: 0 }],
      ]),
    );

    expect(routes[0].laneOffset).not.toBe(routes[1].laneOffset);
    expect(routes[0].sourceSide).toBe('right');
    expect(routes[1].sourceSide).toBe('left');
  });

  it('detects node-body intersections and offsets obstructed routes', () => {
    expect(lineIntersectsRect({ x: 0, y: 40 }, { x: 360, y: 40 }, { x: 150, y: 0, width: 80, height: 80 })).toBe(true);
    expect(lineIntersectsRect({ x: 0, y: 120 }, { x: 360, y: 120 }, { x: 150, y: 0, width: 80, height: 80 })).toBe(false);

    const routes = routeRelationships(
      [relationship(1, 1, 3, 'USES')],
      new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 240, y: 0 }],
        [3, { x: 480, y: 0 }],
      ]),
    );

    expect(routes[0].obstacleCount).toBe(1);
    expect(routes[0].laneOffset).not.toBe(0);
  });

  it('routes deterministically for identical inputs', () => {
    const relationships = [relationship(1, 1, 2, 'USES'), relationship(2, 2, 1, 'REQUIRES')];
    const positions = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 288, y: 0 }],
    ]);

    expect(routeRelationships(relationships, positions)).toEqual(routeRelationships(relationships, positions));
  });

  it('snaps points and automatic layout positions to the graph grid', () => {
    expect(snapPoint({ x: 25, y: 35 }, 24)).toEqual({ x: 24, y: 24 });

    const layout = buildGraphLayout(graphOf(5, [[1, 1, 2], [2, 2, 3], [3, 4, 5]]), 'clustered');

    layout.nodes.forEach((node) => {
      expect(Math.abs(node.position.x % GRAPH_GRID_SIZE)).toBe(0);
      expect(Math.abs(node.position.y % GRAPH_GRID_SIZE)).toBe(0);
    });
  });

  it('keeps clustered nodes from overlapping after snapping', () => {
    const layout = buildGraphLayout(
      graphOf(6, [
        [1, 1, 2],
        [2, 1, 3],
        [3, 2, 3],
        [4, 4, 5],
        [5, 5, 6],
        [6, 4, 6],
      ]),
      'clustered',
    );

    layout.nodes.forEach((left, leftIndex) => {
      layout.nodes.slice(leftIndex + 1).forEach((right) => {
        const separated =
          Math.abs(left.position.x - right.position.x) >= 176 || Math.abs(left.position.y - right.position.y) >= 68;
        expect(separated).toBe(true);
      });
    });
  });
});

describe('graph layout caching and larger graphs', () => {
  beforeEach(() => {
    clearGraphLayoutCaches();
  });

  it('does not recompute layout or communities for stable graph inputs', () => {
    const graph = graphOf(8, [
      [1, 1, 2],
      [2, 2, 3],
      [3, 3, 4],
      [4, 5, 6],
      [5, 6, 7],
      [6, 7, 8],
    ]);

    buildGraphLayout(graph, 'clustered');
    buildGraphLayout(graph, 'clustered');

    expect(getGraphLayoutCacheStats().layoutComputations).toBe(1);
    expect(getGraphLayoutCacheStats().communityComputations).toBe(1);
  });

  it('handles synthetic 100-node, 300-node, and 500-node graphs without changing counts', () => {
    const oneHundred = generateSyntheticGraph(100, 200);
    const threeHundred = generateSyntheticGraph(300, 600);
    const fiveHundred = generateSyntheticGraph(500, 1000);

    const clustered = buildGraphLayout(oneHundred, 'clustered');
    const classic = buildGraphLayout(threeHundred, 'classic');
    const largerClustered = buildGraphLayout(fiveHundred, 'clustered');

    expect(clustered.nodes).toHaveLength(100);
    expect(clustered.relationships).toHaveLength(200);
    expect(classic.nodes).toHaveLength(300);
    expect(classic.relationships).toHaveLength(600);
    expect(largerClustered.nodes).toHaveLength(500);
    expect(largerClustered.relationships).toHaveLength(1000);
    expect(largerClustered.communities.length).toBeGreaterThan(0);
  });
});

function graphOf(nodeCount: number, edges: Array<[number, number, number]>): GraphResponse {
  return {
    center_id: 1,
    depth: 3,
    nodes: Array.from({ length: nodeCount }, (_, index) => concept(index + 1)),
    relationships: edges.map(([id, source, target]) => relationship(id, source, target)),
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
