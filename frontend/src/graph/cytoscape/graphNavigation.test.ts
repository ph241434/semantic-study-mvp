import { describe, expect, it } from 'vitest';

import type { KnowledgeHomeResponse, KnowledgeSpaceGraphResponse, Topic, TopicGraphResponse } from '../../types';
import {
  breadcrumbItems,
  graphViewKeyFor,
  homeState,
  navigateToSpace,
  navigateToTopic,
  parentGraphState,
  parseGraphNavigation,
  serializeGraphNavigation,
} from './graphNavigation';

describe('route-driven graph navigation', () => {
  it('serializes and restores home, space, topic, and selected concept routes', () => {
    expect(serializeGraphNavigation(homeState())).toBe('');
    expect(serializeGraphNavigation(navigateToSpace(3))).toBe('?space=3');
    expect(serializeGraphNavigation(navigateToTopic(3, 8))).toBe('?space=3&topic=8');
    expect(serializeGraphNavigation(navigateToTopic(3, 8, 2))).toBe('?space=3&topic=8&concept=2');
    expect(parseGraphNavigation('?space=3&topic=8&concept=2')).toEqual(navigateToTopic(3, 8, 2));
  });

  it('ignores removed tree and concept-map routes by falling back to home', () => {
    expect(parseGraphNavigation('?view=tree&focus=concept%3A9')).toEqual(homeState());
    expect(parseGraphNavigation('?view=concept-map&concept=44&depth=2')).toEqual(homeState());
  });

  it('keeps route-specific position/cache identities separate', () => {
    expect(graphViewKeyFor(homeState())).toBe('home');
    expect(graphViewKeyFor(navigateToSpace(9))).toBe('space:9');
    expect(graphViewKeyFor(navigateToTopic(9, 10))).toBe('topic:10');
    expect(graphViewKeyFor(navigateToTopic(9, 10, 4))).toBe('topic:10');
  });

  it('backs out one route level at a time', () => {
    expect(parentGraphState(navigateToTopic(3, 8))).toEqual(navigateToSpace(3));
    expect(parentGraphState(navigateToSpace(3))).toEqual(homeState());
    expect(parentGraphState(homeState())).toEqual(homeState());
  });

  it('creates breadcrumb paths from loaded home, space, and topic graph data', () => {
    const items = breadcrumbItems(navigateToTopic(3, 10), homeGraph(), spaceGraph(), topicGraph());

    expect(items.map((item) => item.label)).toEqual([
      'Knowledge',
      'Computer Science',
      'Algorithms',
      'Graph Algorithms',
      'Shortest Paths',
    ]);
    expect(items[0].state).toEqual(homeState());
    expect(items[1].state).toEqual(navigateToSpace(3));
    expect(items[2].state).toEqual(navigateToTopic(3, 7));
    expect(items[4].state).toEqual(navigateToTopic(3, 10));
  });
});

function homeGraph(): KnowledgeHomeResponse {
  return {
    spaces: [
      {
        id: 3,
        name: 'Computer Science',
        description: '',
        created_at: '2026-09-13T00:00:00Z',
        updated_at: '2026-09-13T00:00:00Z',
      },
    ],
  };
}

function spaceGraph(): KnowledgeSpaceGraphResponse {
  return {
    space: homeGraph().spaces[0],
    topics: [topic(7, 'Algorithms', 3)],
    topic_connections: [],
  };
}

function topicGraph(): TopicGraphResponse {
  return {
    space: homeGraph().spaces[0],
    topic: topic(10, 'Shortest Paths', 3, 8),
    ancestors: [topic(7, 'Algorithms', 3), topic(8, 'Graph Algorithms', 3, 7)],
    child_topics: [],
    concepts: [],
    boundary_concepts: [],
    relationships: [],
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
