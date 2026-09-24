import type {
  Concept,
  ConceptType,
  Dashboard,
  FlowEdge,
  FlowEdgeType,
  FlowNode,
  FlowNodeType,
  Flowchart,
  FlowchartDetail,
  GraphResponse,
  GraphView,
  GraphViewDetail,
  GraphViewEdge,
  GraphViewNode,
  GraphViewNodeType,
  KnowledgeEntry,
  Question,
  Rating,
  ReconstructionResponse,
  Relationship,
  ReviewResponse,
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
  createConcept: (payload: { name: string; description: string; concept_type: ConceptType }) =>
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
  knowledge: () => request<KnowledgeEntry[]>('/knowledge'),
  createKnowledgeEntry: (payload: { name: string; parent_id: number | null }) =>
    request<KnowledgeEntry>('/knowledge', { method: 'POST', body: JSON.stringify(payload) }),
  flowcharts: () => request<Flowchart[]>('/flowcharts'),
  flowchart: (id: number) => request<FlowchartDetail>(`/flowcharts/${id}`),
  createFlowchart: (payload: { name: string; description?: string; folder_id?: number | null }) =>
    request<Flowchart>('/flowcharts', { method: 'POST', body: JSON.stringify(payload) }),
  updateFlowchart: (id: number, payload: Partial<{ name: string; description: string; folder_id: number | null }>) =>
    request<Flowchart>(`/flowcharts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFlowchart: (id: number) => request<void>(`/flowcharts/${id}`, { method: 'DELETE' }),
  reorganizeFlowchart: (id: number) => request<void>(`/flowcharts/${id}/reorganize`, { method: 'POST' }),
  createFlowNode: (
    flowchartId: number,
    payload: {
      label: string;
      description?: string;
      node_type?: FlowNodeType;
      concept_id?: number | null;
      child_flowchart_id?: number | null;
      x?: number | null;
      y?: number | null;
    },
  ) => request<FlowNode>(`/flowcharts/${flowchartId}/nodes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFlowNode: (
    id: number,
    payload: Partial<{
      label: string;
      description: string;
      node_type: FlowNodeType;
      concept_id: number | null;
      child_flowchart_id: number | null;
      x: number | null;
      y: number | null;
    }>,
  ) => request<FlowNode>(`/flow-nodes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFlowNode: (id: number) => request<void>(`/flow-nodes/${id}`, { method: 'DELETE' }),
  createFlowEdge: (
    flowchartId: number,
    payload: {
      source_node_id: number;
      target_node_id: number;
      edge_type?: FlowEdgeType;
      label?: string | null;
      description?: string | null;
    },
  ) => request<FlowEdge>(`/flowcharts/${flowchartId}/edges`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFlowEdge: (id: number, payload: Partial<{ edge_type: FlowEdgeType; label: string | null; description: string | null }>) =>
    request<FlowEdge>(`/flow-edges/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFlowEdge: (id: number) => request<void>(`/flow-edges/${id}`, { method: 'DELETE' }),
  listGraphViews: (rootConceptId: number) =>
    request<GraphView[]>(`/graph-views?root_concept_id=${rootConceptId}`),
  createGraphView: (payload: { root_concept_id: number; name: string; view_type?: string; sort_order?: number }) =>
    request<GraphView>('/graph-views', { method: 'POST', body: JSON.stringify(payload) }),
  getGraphView: (id: number) => request<GraphViewDetail>(`/graph-views/${id}`),
  updateGraphView: (id: number, payload: Partial<{ name: string; sort_order: number }>) =>
    request<GraphView>(`/graph-views/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGraphView: (id: number) => request<void>(`/graph-views/${id}`, { method: 'DELETE' }),
  addGraphViewNode: (
    viewId: number,
    payload: { concept_id: number | null; label: string; node_type: GraphViewNodeType; x: number; y: number },
  ) => request<GraphViewNode>(`/graph-views/${viewId}/nodes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGraphViewNode: (id: number, payload: Partial<{ label: string; x: number; y: number }>) =>
    request<GraphViewNode>(`/graph-view-nodes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGraphViewNode: (id: number) => request<void>(`/graph-view-nodes/${id}`, { method: 'DELETE' }),
  createGraphViewEdge: (
    viewId: number,
    payload: { source_view_node_id: number; target_view_node_id: number; label?: string | null; relationship_type?: string | null },
  ) => request<GraphViewEdge>(`/graph-views/${viewId}/edges`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGraphViewEdge: (id: number, payload: Partial<{ label: string | null; relationship_type: string | null }>) =>
    request<GraphViewEdge>(`/graph-view-edges/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGraphViewEdge: (id: number) => request<void>(`/graph-view-edges/${id}`, { method: 'DELETE' }),
};

