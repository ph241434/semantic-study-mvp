import { describe, expect, it } from 'vitest';

import type {
  Concept,
  KnowledgeHomeResponse,
  KnowledgeSpaceGraphResponse,
  Relationship,
  Topic,
  TopicGraphResponse,
} from '../../types';
import { navigateToSpace, navigateToTopic } from './graphNavigation';
import {
  buildKnowledgeHomeView,
  buildKnowledgeSpaceView,
  buildTopicView,
  focusFromSearchResult,
  graphViewSignature,
  graphViewToElements,
} from './CytoscapeGraphAdapter';

describe('Cytoscape route-driven graph builders', () => {
  it('builds the home graph from knowledge spaces', () => {
    const view = buildKnowledgeHomeView(homeGraph());

    expect(view.type).toBe('home');
    expect(view.viewKey).toBe('home');
    expect(view.layoutKind).toBe('home');
    expect(view.nodes.find((node) => node.id === 'root:knowledge')).toMatchObject({
      entityType: 'root',
      label: 'Knowledge',
      region: 'navigation',
    });
    expect(view.nodes.find((node) => node.id === 'space:1')?.label).toBe('Computer Science');
    expect(view.edges).toContainEqual(
      expect.objectContaining({
        edgeType: 'navigation',
        source: 'root:knowledge',
        target: 'space:1',
      }),
    );
  });

  it('builds a space graph from top-level topics and aggregate topic connections', () => {
    const view = buildKnowledgeSpaceView(spaceGraph());

    expect(view.type).toBe('space');
    expect(view.viewKey).toBe('space:1');
    expect(view.nodes.map((node) => node.id)).toEqual(['topic:10', 'topic:11']);
    expect(view.edges).toContainEqual(
      expect.objectContaining({
        edgeType: 'topic-connection',
        label: '2 links: USES, REQUIRES',
        source: 'topic:10',
        target: 'topic:11',
      }),
    );
    expect(view.edges.some((edge) => edge.id.startsWith('contains:'))).toBe(false);
  });

  it('builds a topic graph from child topics, current concepts, boundary concepts, and semantic edges', () => {
    const view = buildTopicView(topicGraph());

    expect(view.type).toBe('topic');
    expect(view.viewKey).toBe('topic:12');
    expect(view.nodes.find((node) => node.id === 'topic:14')).toMatchObject({
      entityType: 'topic',
      label: 'Shortest Paths',
      region: 'navigation',
    });
    expect(view.nodes.find((node) => node.id === 'concept:1')).toMatchObject({
      entityType: 'concept',
      label: "Dijkstra's Algorithm",
      region: 'current',
      topicId: 12,
    });
    expect(view.nodes.find((node) => node.id === 'concept:2')).toMatchObject({
      boundary: true,
      label: 'Priority Queue\nData Structures',
      region: 'context',
      topicId: 11,
    });
    expect(view.edges).toContainEqual(
      expect.objectContaining({
        edgeType: 'semantic',
        label: 'USES',
        source: 'concept:1',
        target: 'concept:2',
      }),
    );
    expect(view.edges.some((edge) => edge.edgeType === 'navigation')).toBe(false);
  });

  it('does not seed topic graph coordinates from rings or topic membership', () => {
    const view = buildTopicView(topicGraph());
    const semanticConcepts = view.nodes.filter((node) => node.entityType === 'concept');

    expect(semanticConcepts).toHaveLength(3);
    expect(view.nodes.every((node) => node.seedPosition === undefined)).toBe(true);
    expect(
      graphViewToElements(view)
        .filter((element) => element.group === 'nodes')
        .every((element) => element.position === undefined),
    ).toBe(true);
  });

  it('keeps globally stable unique IDs and route-specific signatures', () => {
    const view = buildTopicView(topicGraph());
    const ids = [...view.nodes.map((node) => node.id), ...view.edges.map((edge) => edge.id)];

    expect(ids).toEqual(Array.from(new Set(ids)));
    expect(graphViewSignature(view)).toContain('topic:topic:12');
  });

  it('separates multiple and bidirectional semantic relationships between the same two concepts', () => {
    const graph = {
      ...topicGraph(),
      relationships: [
        relationship(100, 1, 2, 'USES'),
        relationship(101, 2, 1, 'SUPPORTS'),
      ],
    };

    const view = buildTopicView(graph);
    const curveDistances = view.edges.map((edge) => edge.curveDistance);

    expect(curveDistances[0]).not.toBe(curveDistances[1]);
    expect(new Set(view.edges.map((edge) => `${edge.curveDistance}:${edge.curveWeight}`)).size).toBe(2);
  });

  it('exposes Cytoscape elements through one conversion path', () => {
    const view = buildTopicView(topicGraph());
    const elements = graphViewToElements(view);

    expect(elements.filter((element) => element.group === 'nodes')).toHaveLength(4);
    expect(elements).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ id: 'relationship:100', source: 'concept:1', target: 'concept:2' }) }),
    );
  });

  it('maps search results to the restored space and topic routes', () => {
    expect(
      focusFromSearchResult({
        concept_id: 1,
        entity_type: 'concept',
        id: 1,
        knowledge_space_id: 1,
        label: "Dijkstra's Algorithm",
        path: ['Computer Science', 'Algorithms', 'Dijkstra'],
        topic_id: 12,
      }),
    ).toEqual(navigateToTopic(1, 12, 1));
    expect(
      focusFromSearchResult({
        concept_id: null,
        entity_type: 'knowledge-space',
        id: 1,
        knowledge_space_id: 1,
        label: 'Computer Science',
        path: ['Computer Science'],
        topic_id: null,
      }),
    ).toEqual(navigateToSpace(1));
  });
});

function homeGraph(): KnowledgeHomeResponse {
  return {
    spaces: [space(1, 'Computer Science'), space(2, 'Japanese')],
  };
}

function spaceGraph(): KnowledgeSpaceGraphResponse {
  return {
    space: space(1, 'Computer Science'),
    topics: [topic(10, 'Algorithms', 1), topic(11, 'Data Structures', 1)],
    topic_connections: [
      {
        source_topic_id: 10,
        target_topic_id: 11,
        relationship_count: 2,
        relationship_types: ['USES', 'REQUIRES'],
      },
    ],
  };
}

function topicGraph(): TopicGraphResponse {
  return {
    space: space(1, 'Computer Science'),
    topic: topic(12, 'Graph Algorithms', 1, 10),
    ancestors: [topic(10, 'Algorithms', 1)],
    child_topics: [topic(14, 'Shortest Paths', 1, 12)],
    concepts: [concept(1, "Dijkstra's Algorithm", 'algorithm'), concept(3, 'Shortest Path', 'concept')],
    boundary_concepts: [
      {
        concept: concept(2, 'Priority Queue', 'definition'),
        topic: topic(11, 'Data Structures', 1),
      },
    ],
    relationships: [
      relationship(100, 1, 2, 'USES'),
      relationship(101, 1, 3, 'SOLVES'),
    ],
  };
}

function space(id: number, name: string) {
  return {
    id,
    name,
    description: '',
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:00:00Z',
  };
}

function topic(id: number, name: string, knowledgeSpaceId: number, parentTopicId: number | null = null): Topic {
  return {
    id,
    knowledge_space_id: knowledgeSpaceId,
    parent_topic_id: parentTopicId,
    name,
    description: '',
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:00:00Z',
  };
}

function concept(id: number, name: string, conceptType: Concept['concept_type']): Concept {
  return {
    id,
    name,
    description: '',
    concept_type: conceptType,
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function relationship(id: number, sourceId: number, targetId: number, type: string): Relationship {
  return {
    id,
    source_concept_id: sourceId,
    target_concept_id: targetId,
    relationship_type: type,
    description: '',
    mastery_score: 0.5,
    confidence: 0.5,
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: null,
    target_name: null,
  };
}
