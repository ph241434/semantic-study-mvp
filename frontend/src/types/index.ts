export type ConceptType =
  | 'concept'
  | 'definition'
  | 'mechanism'
  | 'property'
  | 'example'
  | 'theorem'
  | 'algorithm'
  | 'application';

export type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export type Concept = {
  id: number;
  name: string;
  description: string;
  concept_type: ConceptType;
  mastery_score: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  review_interval_days: number;
};

export type Relationship = {
  id: number;
  source_concept_id: number;
  target_concept_id: number;
  relationship_type: string;
  description: string;
  mastery_score: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  review_interval_days: number;
  source_name: string | null;
  target_name: string | null;
};

export type Question = {
  id: number;
  question_text: string;
  answer_text: string;
  question_type:
    | 'CONCEPT_RECALL'
    | 'RELATIONSHIP_RECALL'
    | 'EXPLANATION'
    | 'COMPARISON'
    | 'GRAPH_RECONSTRUCTION';
  difficulty: number;
  concept_id: number | null;
  relationship_id: number | null;
  created_at: string;
};

export type ReviewAttempt = {
  id: number;
  question_id: number;
  concept_id: number | null;
  relationship_id: number | null;
  rating: Rating;
  response_time_ms: number | null;
  reviewed_at: string;
};

export type ReviewResponse = {
  attempt: ReviewAttempt;
  concept: Concept | null;
  relationship: Relationship | null;
};

export type GraphResponse = {
  center_id: number;
  depth: number;
  nodes: Concept[];
  relationships: Relationship[];
};

export type DashboardCard = {
  id: number;
  label: string;
  mastery_score: number;
  subtitle: string | null;
};

export type RecentReview = {
  id: number;
  rating: Rating;
  reviewed_at: string;
  question_text: string;
  target_label: string;
};

export type Dashboard = {
  concepts_count: number;
  relationships_count: number;
  questions_count: number;
  reviews_today_count: number;
  average_concept_mastery: number;
  average_relationship_mastery: number;
  due_today_count: number;
  weakest_concepts: DashboardCard[];
  weakest_relationships: DashboardCard[];
  recently_studied: RecentReview[];
};

export type ReconstructionResponse = {
  concept: Concept;
  question: Question;
  graph: GraphResponse;
};

