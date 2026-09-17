import { describe, expect, it } from 'vitest';

import type { Concept, GraphResponse, Relationship } from '../types';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, computeForceLayout, graphSignature, isLeafGraph, toVisualGraphData } from './layout';

function concept(id: number, name: string): Concept {
  return {
    id,
    name,
    description: `${name} description`,
    concept_type: 'concept',
    mastery_score: 0,
    confidence: 0.3,
    created_at: '2026-09-16T00:00:00Z',
    updated_at: '2026-09-16T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function relationship(id: number, sourceId: number, targetId: number, relationshipType: string): Relationship {
  return {
    id,
    source_concept_id: sourceId,
    target_concept_id: targetId,
    relationship_type: relationshipType,
    description: '',
    mastery_score: 0,
    confidence: 0.3,
    created_at: '2026-09-16T00:00:00Z',
    updated_at: '2026-09-16T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: null,
    target_name: null,
  };
}

function starGraph(neighborCount: number): GraphResponse {
  const nodes = [concept(1, 'Root'), ...Array.from({ length: neighborCount }, (_, index) => concept(index + 2, `Neighbor ${index + 2}`))];
  const relationships = Array.from({ length: neighborCount }, (_, index) => relationship(index + 100, 1, index + 2, 'USES'));
  return { center_id: 1, depth: 1, nodes, relationships };
}

describe('toVisualGraphData', () => {
  it('projects concepts and relationships into visual nodes/edges, dropping out-of-scope edges', () => {
    const graph: GraphResponse = {
      center_id: 1,
      depth: 1,
      nodes: [concept(1, 'Encryption'), concept(2, 'Keys')],
      relationships: [relationship(10, 1, 2, 'USES'), relationship(11, 1, 99, 'REQUIRES')],
    };

    const visual = toVisualGraphData(graph);

    expect(visual.nodes.map((node) => node.conceptId)).toEqual([1, 2]);
    expect(visual.edges.map((edge) => edge.relationshipId)).toEqual([10]);
    expect(visual.edges[0]).toMatchObject({ source: '1', target: '2', relationshipType: 'USES' });
  });
});

describe('isLeafGraph', () => {
  it('treats zero relationships as a leaf', () => {
    expect(isLeafGraph(starGraph(0))).toBe(true);
  });

  it('treats one or more relationships as a drill-down concept', () => {
    expect(isLeafGraph(starGraph(1))).toBe(false);
    expect(isLeafGraph(starGraph(2))).toBe(false);
  });
});

describe('graphSignature', () => {
  it('changes when the node or relationship set changes', () => {
    const a = graphSignature(starGraph(2));
    const b = graphSignature(starGraph(3));
    expect(a).not.toEqual(b);
  });

  it('is stable for the same graph', () => {
    const graph = starGraph(3);
    expect(graphSignature(graph)).toEqual(graphSignature(graph));
  });
});

describe('computeForceLayout', () => {
  it('produces a positioned node for every concept and a routed edge for every relationship', () => {
    const graph = starGraph(4);
    const layout = computeForceLayout(graph, 1);

    expect(layout.nodes).toHaveLength(5);
    expect(layout.edges).toHaveLength(4);
    layout.edges.forEach((edge) => {
      expect(edge.path).toMatch(/^M /);
    });
  });

  it('marks only the center concept as root', () => {
    const layout = computeForceLayout(starGraph(3), 1);
    const rootNodes = layout.nodes.filter((node) => node.isRoot);
    expect(rootNodes).toHaveLength(1);
    expect(rootNodes[0]?.conceptId).toBe(1);
  });

  it('settles into a non-overlapping arrangement', () => {
    const layout = computeForceLayout(starGraph(6), 1);
    const centers = layout.nodes.map((node) => ({
      x: node.position.x + GRAPH_NODE_WIDTH / 2,
      y: node.position.y + GRAPH_NODE_HEIGHT / 2,
    }));

    const minAllowedDistance = Math.hypot(GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT) / 2;

    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        const distance = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
        expect(distance).toBeGreaterThan(minAllowedDistance);
      }
    }
  });

  it('keeps the root approximately central relative to its neighbors', () => {
    const layout = computeForceLayout(starGraph(6), 1);
    const root = layout.nodes.find((node) => node.isRoot)!;
    const rootDistance = Math.hypot(root.position.x, root.position.y);
    const neighborDistances = layout.nodes
      .filter((node) => !node.isRoot)
      .map((node) => Math.hypot(node.position.x, node.position.y));

    expect(rootDistance).toBeLessThanOrEqual(Math.max(...neighborDistances));
  });

  it('is deterministic for the same graph and root', () => {
    const graph = starGraph(5);
    const first = computeForceLayout(graph, 1);
    const second = computeForceLayout(graph, 1);

    expect(first.nodes.map((node) => node.position)).toEqual(second.nodes.map((node) => node.position));
  });
});
