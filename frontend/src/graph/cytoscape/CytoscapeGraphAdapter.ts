import type {
  Concept,
  KnowledgeHomeResponse,
  KnowledgeSearchResult,
  KnowledgeSpaceGraphResponse,
  Relationship,
  Topic,
  TopicGraphResponse,
} from '../../types';
import { navigateToSpace, navigateToTopic, type GraphNavigationState } from './graphNavigation';
import { conceptColor } from './cytoscapeStyles';
import type {
  CytoscapeGraphEdge,
  CytoscapeGraphElement,
  CytoscapeGraphNode,
  CytoscapeGraphView,
  GraphPoint,
} from './graphTypes';

const HOME_ROOT_ID = 'root:knowledge';

export function buildKnowledgeHomeView(home: KnowledgeHomeResponse): CytoscapeGraphView {
  const spaces = sortedByName(home.spaces);
  const nodes: CytoscapeGraphNode[] = [
    navigationNode({
      id: HOME_ROOT_ID,
      color: '#f4f0e7',
      entityId: null,
      entityType: 'root',
      label: 'Knowledge',
      seedPosition: { x: 0, y: 0 },
      size: 104,
    }),
  ];

  spaces.forEach((space, index) => {
    nodes.push(
      navigationNode({
        id: nodeId('space', space.id),
        color: '#236f68',
        entityId: space.id,
        entityType: 'knowledge-space',
        label: space.name,
        seedPosition: ringPoint(index, spaces.length, 260, -Math.PI / 2),
        size: 88,
      }),
    );
  });

  const edges = spaces.map((space) => navigationEdge(HOME_ROOT_ID, nodeId('space', space.id)));

  return {
    type: 'home',
    viewKey: 'home',
    layoutKind: 'home',
    nodes,
    edges,
    focusNodeId: HOME_ROOT_ID,
  };
}

export function buildKnowledgeSpaceView(spaceGraph: KnowledgeSpaceGraphResponse): CytoscapeGraphView {
  const topics = sortedByName(spaceGraph.topics);
  const nodes = topics.map((topic, index) =>
    navigationNode({
      id: nodeId('topic', topic.id),
      color: '#1d3440',
      entityId: topic.id,
      entityType: 'topic',
      label: topic.name,
      parentTopicId: topic.parent_topic_id,
      seedPosition: ringPoint(index, topics.length, 250, -Math.PI / 2),
      size: 78,
      topicId: topic.id,
    }),
  );

  const topicIds = new Set(topics.map((topic) => topic.id));
  const edges = spaceGraph.topic_connections
    .filter((connection) => topicIds.has(connection.source_topic_id) && topicIds.has(connection.target_topic_id))
    .map(topicConnectionEdge);

  return {
    type: 'space',
    viewKey: `space:${spaceGraph.space.id}`,
    layoutKind: 'space',
    nodes,
    edges,
    focusNodeId: null,
  };
}

export function buildTopicView(topicGraph: TopicGraphResponse): CytoscapeGraphView {
  const childTopics = sortedByName(topicGraph.child_topics);
  const currentConcepts = sortedByName(topicGraph.concepts);
  const boundaryConcepts = [...topicGraph.boundary_concepts].sort((left, right) =>
    compareByName(left.concept, right.concept),
  );
  const nodes: CytoscapeGraphNode[] = [
    ...childTopics.map((topic) =>
      navigationNode({
        id: nodeId('topic', topic.id),
        color: '#1d3440',
        entityId: topic.id,
        entityType: 'topic',
        label: topic.name,
        parentTopicId: topic.parent_topic_id,
        size: 68,
        topicId: topic.id,
      }),
    ),
    ...currentConcepts.map((concept) =>
      conceptNode({
        concept,
        label: concept.name,
        region: 'current',
        size: 66,
        topicId: topicGraph.topic.id,
      }),
    ),
    ...boundaryConcepts.map(({ concept, topic }) =>
      conceptNode({
        boundary: true,
        concept,
        label: topic ? `${concept.name}\n${topic.name}` : concept.name,
        region: 'context',
        size: 58,
        topicId: topic?.id ?? null,
      }),
    ),
  ];

  const visibleNodeIds = new Set(nodes.filter((node) => node.entityType === 'concept').map((node) => node.id));
  const edgeCurves = semanticEdgeCurves(topicGraph.relationships);
  const edges = topicGraph.relationships
    .filter((relationship) => {
      return visibleNodeIds.has(nodeId('concept', relationship.source_concept_id))
        && visibleNodeIds.has(nodeId('concept', relationship.target_concept_id));
    })
    .map((relationship) => semanticRelationshipEdge(relationship, edgeCurves.get(relationship.id)));

  return {
    type: 'topic',
    viewKey: `topic:${topicGraph.topic.id}`,
    layoutKind: 'topic',
    nodes,
    edges,
    focusNodeId: null,
  };
}

export function graphViewToElements(view: CytoscapeGraphView): CytoscapeGraphElement[] {
  return [
    ...view.nodes.map((node) => ({
      group: 'nodes' as const,
      data: node,
      position: node.seedPosition,
    })),
    ...view.edges.map((edge) => ({
      group: 'edges' as const,
      data: edge,
    })),
  ];
}

export function graphViewSignature(view: CytoscapeGraphView) {
  const nodes = view.nodes
    .map((node) => {
      return [
        node.id,
        node.entityType,
        node.region,
        node.boundary ? 'boundary' : '',
        node.label,
      ].join(':');
    })
    .sort((left, right) => left.localeCompare(right));
  const edges = view.edges
    .map((edge) =>
      [
        edge.id,
        `${edge.source}>${edge.target}`,
        edge.edgeType,
        edge.label,
        edge.curveDistance ?? '',
        edge.curveWeight ?? '',
      ].join(':'),
    )
    .sort((left, right) => left.localeCompare(right));
  return `${view.type}:${view.viewKey}|nodes:${nodes.join(',')}|edges:${edges.join(',')}`;
}

export function focusFromSearchResult(result: KnowledgeSearchResult): GraphNavigationState | null {
  if (result.entity_type === 'knowledge-space' && result.knowledge_space_id) {
    return navigateToSpace(result.knowledge_space_id);
  }
  if (result.entity_type === 'topic' && result.knowledge_space_id && result.topic_id) {
    return navigateToTopic(result.knowledge_space_id, result.topic_id);
  }
  if (result.entity_type === 'concept' && result.knowledge_space_id && result.topic_id && result.concept_id) {
    return navigateToTopic(result.knowledge_space_id, result.topic_id, result.concept_id);
  }
  return null;
}

function navigationNode({
  id,
  color,
  entityId,
  entityType,
  label,
  parentTopicId = null,
  seedPosition,
  size,
  topicId = null,
}: {
  id: string;
  color: string;
  entityId: number | null;
  entityType: 'root' | 'knowledge-space' | 'topic';
  label: string;
  parentTopicId?: number | null;
  seedPosition?: GraphPoint;
  size: number;
  topicId?: number | null;
}): CytoscapeGraphNode {
  return {
    id,
    borderColor: entityType === 'root' ? '#38d8cc' : '#65ddd4',
    borderWidth: entityType === 'root' ? 4 : 3,
    color,
    entityId,
    entityType,
    label,
    parentTopicId,
    region: 'navigation',
    seedPosition,
    shape: 'round-rectangle',
    size,
    topicId,
  };
}

function conceptNode({
  boundary = false,
  concept,
  label,
  region,
  seedPosition,
  size,
  topicId,
}: {
  boundary?: boolean;
  concept: Concept;
  label: string;
  region: 'current' | 'context';
  seedPosition?: GraphPoint;
  size: number;
  topicId: number | null;
}): CytoscapeGraphNode {
  return {
    id: nodeId('concept', concept.id),
    boundary,
    borderColor: boundary ? '#f8d477' : '#eef6f4',
    borderWidth: boundary ? 2 : 3,
    color: conceptColor(concept.concept_type),
    conceptId: concept.id,
    conceptType: concept.concept_type,
    entityId: concept.id,
    entityType: 'concept',
    label,
    region,
    seedPosition,
    shape: 'ellipse',
    size,
    topicId,
  };
}

function navigationEdge(source: string, target: string): CytoscapeGraphEdge {
  return {
    id: `contains:${source.replace(':', '_')}:${target.replace(':', '_')}`,
    color: '#5a747d',
    edgeType: 'navigation',
    label: '',
    lineStyle: 'dashed',
    source,
    target,
    width: 1.5,
  };
}

function topicConnectionEdge(connection: KnowledgeSpaceGraphResponse['topic_connections'][number]): CytoscapeGraphEdge {
  const label = connection.relationship_types.length
    ? `${connection.relationship_count} ${connection.relationship_count === 1 ? 'link' : 'links'}: ${connection.relationship_types.slice(0, 2).join(', ')}`
    : `${connection.relationship_count} ${connection.relationship_count === 1 ? 'link' : 'links'}`;
  return {
    id: `topic-connection:${connection.source_topic_id}:${connection.target_topic_id}`,
    color: '#7fb7c2',
    edgeType: 'topic-connection',
    label,
    lineStyle: 'dotted',
    source: nodeId('topic', connection.source_topic_id),
    target: nodeId('topic', connection.target_topic_id),
    width: Math.min(3.4, 1.2 + connection.relationship_count * 0.34),
  };
}

function semanticRelationshipEdge(
  relationship: Relationship,
  curve: { curveDistance: number; curveWeight: number } | undefined,
): CytoscapeGraphEdge {
  return {
    id: `relationship:${relationship.id}`,
    color: relationshipColor(relationship.mastery_score),
    edgeType: 'semantic',
    label: relationship.relationship_type,
    relationshipId: relationship.id,
    source: nodeId('concept', relationship.source_concept_id),
    target: nodeId('concept', relationship.target_concept_id),
    curveDistance: curve?.curveDistance ?? 34,
    curveWeight: curve?.curveWeight ?? 0.5,
    lineStyle: 'solid',
    width: 2.35,
  };
}

function semanticEdgeCurves(relationships: Relationship[]) {
  const groups = new Map<string, Relationship[]>();
  relationships.forEach((relationship) => {
    const pair = [relationship.source_concept_id, relationship.target_concept_id].sort((left, right) => left - right).join(':');
    groups.set(pair, [...(groups.get(pair) ?? []), relationship]);
  });

  const curves = new Map<number, { curveDistance: number; curveWeight: number }>();
  groups.forEach((items) => {
    const sorted = [...items].sort((left, right) => left.id - right.id);
    sorted.forEach((relationship, index) => {
      const centerOffset = index - (sorted.length - 1) / 2;
      const sign = relationship.source_concept_id < relationship.target_concept_id ? 1 : -1;
      const distance = sorted.length === 1
        ? 46 * sign
        : Math.max(34, (Math.abs(centerOffset) + 0.5) * 62) * Math.sign(centerOffset || sign);
      curves.set(relationship.id, {
        curveDistance: distance,
        curveWeight: relationship.source_concept_id < relationship.target_concept_id ? 0.42 : 0.58,
      });
    });
  });
  return curves;
}

function relationshipColor(masteryScore: number) {
  if (masteryScore < 0.35) return '#f59f7d';
  if (masteryScore < 0.7) return '#f8d477';
  return '#38d8cc';
}

function ringPoint(index: number, total: number, radius: number, offset = 0): GraphPoint {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = offset + (index / total) * Math.PI * 2;
  return {
    x: Number((Math.cos(angle) * radius).toFixed(2)),
    y: Number((Math.sin(angle) * radius).toFixed(2)),
  };
}

function nodeId(type: 'space' | 'topic' | 'concept', id: number) {
  return `${type}:${id}`;
}

function sortedByName<T extends { id: number; name: string }>(items: T[]) {
  return [...items].sort(compareByName);
}

function compareByName<T extends { id: number; name: string }>(left: T, right: T) {
  const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  return nameComparison || left.id - right.id;
}
