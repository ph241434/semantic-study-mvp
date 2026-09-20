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

export type KnowledgeSpace = {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type Topic = {
  id: number;
  knowledge_space_id: number;
  parent_topic_id: number | null;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
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

export type KnowledgeHomeResponse = {
  spaces: KnowledgeSpace[];
};

export type KnowledgeSpaceGraphResponse = {
  space: KnowledgeSpace;
  topics: Topic[];
  topic_connections: TopicConnection[];
};

export type TopicConnection = {
  source_topic_id: number;
  target_topic_id: number;
  relationship_count: number;
  relationship_types: string[];
};

export type BoundaryConcept = {
  concept: Concept;
  topic: Topic | null;
};

export type TopicGraphResponse = {
  space: KnowledgeSpace;
  topic: Topic;
  ancestors: Topic[];
  child_topics: Topic[];
  concepts: Concept[];
  boundary_concepts: BoundaryConcept[];
  relationships: Relationship[];
};

export type KnowledgeSearchResult = {
  entity_type: 'knowledge-space' | 'topic' | 'concept';
  id: number;
  label: string;
  path: string[];
  knowledge_space_id: number | null;
  topic_id: number | null;
  concept_id: number | null;
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


export type FlowNodeType =
  | 'START'
  | 'END'
  | 'PROCESS'
  | 'DECISION'
  | 'INPUT_OUTPUT'
  | 'SUBPROCESS'
  | 'EXTERNAL_SYSTEM'
  | 'DATA';

export type FlowEdgeType = 'NEXT' | 'YES' | 'NO' | 'SUCCESS' | 'FAILURE' | 'RETRY';

export type FlowchartSummary = {
  id: number;
  name: string;
  description: string;
  knowledge_space_id: number | null;
  is_primary: boolean;
  node_count: number;
  created_at: string;
  updated_at: string;
};

export type FlowNode = {
  id: number;
  flowchart_id: number;
  concept_id: number | null;
  concept_name: string | null;
  concept_description: string | null;
  label: string;
  description: string;
  node_type: FlowNodeType;
  child_flowchart_id: number | null;
  child_flowchart_name: string | null;
  has_child: boolean;
  pos_x: number | null;
  pos_y: number | null;
};

export type FlowEdge = {
  id: number;
  flowchart_id: number;
  source_node_id: number;
  target_node_id: number;
  edge_type: FlowEdgeType;
  label: string | null;
  description: string | null;
};

export type FlowchartDetail = {
  flowchart: FlowchartSummary;
  nodes: FlowNode[];
  edges: FlowEdge[];
};
