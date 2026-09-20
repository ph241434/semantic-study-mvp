import type { KnowledgeHomeResponse, KnowledgeSpaceGraphResponse, TopicGraphResponse } from '../../types';

export type GraphNavigationState =
  | { type: 'home' }
  | { type: 'space'; spaceId: number }
  | { type: 'topic'; spaceId: number; topicId: number; selectedConceptId?: number | null };

export type BreadcrumbItem = {
  label: string;
  state: GraphNavigationState;
};

export function homeState(): GraphNavigationState {
  return { type: 'home' };
}

export function navigateToSpace(spaceId: number): GraphNavigationState {
  return { type: 'space', spaceId };
}

export function navigateToTopic(
  spaceId: number,
  topicId: number,
  selectedConceptId: number | null = null,
): GraphNavigationState {
  return { type: 'topic', spaceId, topicId, selectedConceptId };
}

export function serializeGraphNavigation(state: GraphNavigationState): string {
  const params = new URLSearchParams();
  if (state.type === 'space') {
    params.set('space', String(state.spaceId));
  }
  if (state.type === 'topic') {
    params.set('space', String(state.spaceId));
    params.set('topic', String(state.topicId));
    if (state.selectedConceptId) params.set('concept', String(state.selectedConceptId));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function parseGraphNavigation(search: string | URLSearchParams): GraphNavigationState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const spaceId = parsePositiveInteger(params.get('space'));
  const topicId = parsePositiveInteger(params.get('topic'));
  const selectedConceptId = parsePositiveInteger(params.get('concept'));

  if (spaceId && topicId) return navigateToTopic(spaceId, topicId, selectedConceptId);
  if (spaceId) return navigateToSpace(spaceId);
  return homeState();
}

export function parentGraphState(state: GraphNavigationState): GraphNavigationState {
  if (state.type === 'topic') return navigateToSpace(state.spaceId);
  if (state.type === 'space') return homeState();
  return homeState();
}

export function breadcrumbItems(
  state: GraphNavigationState,
  homeGraph: KnowledgeHomeResponse | null,
  spaceGraph: KnowledgeSpaceGraphResponse | null,
  topicGraph: TopicGraphResponse | null,
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: 'Knowledge', state: homeState() }];

  if (state.type === 'home') return items;

  const space = spaceGraph?.space ?? homeGraph?.spaces.find((candidate) => candidate.id === state.spaceId) ?? null;
  items.push({ label: space?.name ?? `Space ${state.spaceId}`, state: navigateToSpace(state.spaceId) });

  if (state.type !== 'topic') return items;

  if (topicGraph?.topic.id === state.topicId) {
    topicGraph.ancestors.forEach((ancestor) => {
      items.push({ label: ancestor.name, state: navigateToTopic(state.spaceId, ancestor.id) });
    });
    items.push({ label: topicGraph.topic.name, state: navigateToTopic(state.spaceId, topicGraph.topic.id) });
  } else {
    items.push({ label: `Topic ${state.topicId}`, state });
  }

  return items;
}

export function graphNavigationEquals(left: GraphNavigationState, right: GraphNavigationState) {
  return serializeGraphNavigation(left) === serializeGraphNavigation(right);
}

export function graphViewKeyFor(state: GraphNavigationState) {
  if (state.type === 'home') return 'home';
  if (state.type === 'space') return `space:${state.spaceId}`;
  return `topic:${state.topicId}`;
}

function parsePositiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
