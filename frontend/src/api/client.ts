import type {
  Concept,
  ConceptType,
  Dashboard,
  GraphResponse,
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
};

