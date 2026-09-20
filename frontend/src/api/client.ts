import type {
  Concept,
  ConceptType,
  Dashboard,
  FlowEdge,
  FlowEdgeType,
  FlowNode,
  FlowNodeType,
  FlowchartDetail,
  FlowchartSummary,
  GraphResponse,
  KnowledgeHomeResponse,
  KnowledgeSearchResult,
  KnowledgeSpace,
  KnowledgeSpaceGraphResponse,
  Question,
  Rating,
  ReconstructionResponse,
  Relationship,
  ReviewResponse,
  Topic,
  TopicGraphResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  concepts: () => request<Concept[]>('/concepts'),
  concept: (id: number) => request<Concept>(`/concepts/${id}`),
  createConcept: (payload: { name: string; description: string; concept_type: ConceptType; topic_id?: number | null }) =>
    request<Concept>('/concepts', { method: 'POST', body: JSON.stringify(payload) }),
  updateConcept: (id: number, payload: Partial<{ name: string; description: string; concept_type: ConceptType }>) =>
    request<Concept>(`/concepts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  relationships: () => request<Relationship[]>('/relationships'),
  createRelationship: (payload: {
    source_concept_id: number;
    target_concept_id: number;
    relationship_type: string;
    description: string;
  }) => request<Relationship>('/relationships', { method: 'POST', body: JSON.stringify(payload) }),
  updateRelationship: (
    id: number,
    payload: Partial<{
      source_concept_id: number;
      target_concept_id: number;
      relationship_type: string;
      description: string;
    }>,
  ) => request<Relationship>(`/relationships/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRelationship: (id: number) => request<void>(`/relationships/${id}`, { method: 'DELETE' }),
  graph: (conceptId: number, depth: number) => request<GraphResponse>(`/graph/${conceptId}?depth=${depth}`),
  knowledgeHome: () => request<KnowledgeHomeResponse>('/knowledge/home'),
  knowledgeSpace: (spaceId: number) => request<KnowledgeSpaceGraphResponse>(`/knowledge/spaces/${spaceId}`),
  knowledgeTopic: (topicId: number) => request<TopicGraphResponse>(`/knowledge/topics/${topicId}`),
  knowledgeSearch: (q: string) => request<KnowledgeSearchResult[]>(`/knowledge/search?q=${encodeURIComponent(q)}`),
  createKnowledgeSpace: (payload: { name: string; description: string }) =>
    request<KnowledgeSpace>('/knowledge-spaces', { method: 'POST', body: JSON.stringify(payload) }),
  knowledgeSpaces: () => request<KnowledgeSpace[]>('/knowledge-spaces'),
  topics: (knowledgeSpaceId?: number) =>
    request<Topic[]>(`/topics${knowledgeSpaceId ? `?knowledge_space_id=${knowledgeSpaceId}` : ''}`),
  createTopic: (payload: { knowledge_space_id: number; parent_topic_id?: number | null; name: string; description: string }) =>
    request<Topic>('/topics', { method: 'POST', body: JSON.stringify(payload) }),
  flowcharts: (knowledgeSpaceId?: number) =>
    request<FlowchartSummary[]>(`/flowcharts${knowledgeSpaceId ? `?knowledge_space_id=${knowledgeSpaceId}` : ''}`),
  flowchart: (id: number) => request<FlowchartDetail>(`/flowcharts/${id}`),
  createFlowchart: (payload: { name: string; description?: string; knowledge_space_id?: number | null; is_primary?: boolean }) =>
    request<FlowchartSummary>('/flowcharts', { method: 'POST', body: JSON.stringify(payload) }),
  reorganizeFlowchart: (id: number) => request<void>(`/flowcharts/${id}/reorganize`, { method: 'POST' }),
  createFlowNode: (
    flowchartId: number,
    payload: { label: string; description?: string; node_type?: FlowNodeType; concept_id?: number | null },
  ) => request<FlowNode>(`/flowcharts/${flowchartId}/nodes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFlowNode: (
    id: number,
    payload: Partial<{
      label: string;
      description: string;
      node_type: FlowNodeType;
      concept_id: number | null;
      child_flowchart_id: number | null;
      pos_x: number | null;
      pos_y: number | null;
    }>,
  ) => request<FlowNode>(`/flow-nodes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFlowNode: (id: number) => request<void>(`/flow-nodes/${id}`, { method: 'DELETE' }),
  createChildFlowchart: (nodeId: number) =>
    request<FlowchartSummary>(`/flow-nodes/${nodeId}/child-flowchart`, { method: 'POST' }),
  createFlowEdge: (
    flowchartId: number,
    payload: { source_node_id: number; target_node_id: number; edge_type?: FlowEdgeType; label?: string | null },
  ) => request<FlowEdge>(`/flowcharts/${flowchartId}/edges`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFlowEdge: (id: number, payload: Partial<{ edge_type: FlowEdgeType; label: string | null }>) =>
    request<FlowEdge>(`/flow-edges/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFlowEdge: (id: number) => request<void>(`/flow-edges/${id}`, { method: 'DELETE' }),
  questions: () => request<Question[]>('/questions'),
  createQuestion: (payload: {
    question_text: string;
    answer_text: string;
    question_type: Question['question_type'];
    difficulty: number;
    concept_id?: number | null;
    relationship_id?: number | null;
  }) => request<Question>('/questions', { method: 'POST', body: JSON.stringify(payload) }),
  dueQuestions: () => request<Question[]>('/study/due'),
  review: (payload: { question_id: number; rating: Rating; response_time_ms?: number }) =>
    request<ReviewResponse>('/study/review', { method: 'POST', body: JSON.stringify(payload) }),
  reconstruction: (conceptId: number, depth: number) =>
    request<ReconstructionResponse>(`/study/reconstruction/${conceptId}?depth=${depth}`),
  dashboard: () => request<Dashboard>('/dashboard'),
  search: (q: string) => request<Concept[]>(`/search?q=${encodeURIComponent(q)}`),
};

