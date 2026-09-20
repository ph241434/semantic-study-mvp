from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


CONCEPT_TYPES = {
    "concept",
    "definition",
    "mechanism",
    "property",
    "example",
    "theorem",
    "algorithm",
    "application",
}

RELATIONSHIP_TYPES = [
    "IS_A",
    "PART_OF",
    "USES",
    "REQUIRES",
    "CAUSES",
    "IMPLIES",
    "CONTRASTS_WITH",
    "EXAMPLE_OF",
    "SOLVES",
    "DERIVED_FROM",
    "IMPLEMENTED_BY",
    "PRODUCES",
    "DEPENDS_ON",
    "SUPPORTS",
]

QUESTION_TYPES = {
    "CONCEPT_RECALL",
    "RELATIONSHIP_RECALL",
    "EXPLANATION",
    "COMPARISON",
    "GRAPH_RECONSTRUCTION",
}

FLOW_NODE_TYPES = [
    "START",
    "END",
    "PROCESS",
    "DECISION",
    "INPUT_OUTPUT",
    "SUBPROCESS",
    "EXTERNAL_SYSTEM",
    "DATA",
]

FLOW_EDGE_TYPES = ["NEXT", "YES", "NO", "SUCCESS", "FAILURE", "RETRY"]

ReviewRating = Literal["AGAIN", "HARD", "GOOD", "EASY"]


def normalize_relationship_type(value: str) -> str:
    return value.strip().upper().replace(" ", "_").replace("-", "_")


class ConceptBase(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    description: str = ""
    concept_type: str = "concept"

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("concept_type")
    @classmethod
    def validate_concept_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in CONCEPT_TYPES:
            raise ValueError(f"concept_type must be one of: {', '.join(sorted(CONCEPT_TYPES))}")
        return normalized


class ConceptCreate(ConceptBase):
    topic_id: int | None = None


class ConceptUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    concept_type: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("concept_type")
    @classmethod
    def validate_concept_type(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in CONCEPT_TYPES:
            raise ValueError(f"concept_type must be one of: {', '.join(sorted(CONCEPT_TYPES))}")
        return normalized


class ConceptRead(ConceptBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mastery_score: float
    confidence: float
    created_at: datetime
    updated_at: datetime
    last_reviewed_at: datetime | None
    next_review_at: datetime | None
    review_interval_days: int


class KnowledgeSpaceBase(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    description: str = ""

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class KnowledgeSpaceCreate(KnowledgeSpaceBase):
    pass


class KnowledgeSpaceRead(KnowledgeSpaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class TopicBase(BaseModel):
    knowledge_space_id: int
    parent_topic_id: int | None = None
    name: str = Field(min_length=1, max_length=140)
    description: str = ""

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class TopicCreate(TopicBase):
    pass


class TopicRead(TopicBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class RelationshipBase(BaseModel):
    source_concept_id: int
    target_concept_id: int
    relationship_type: str = Field(min_length=1, max_length=60)
    description: str = ""

    @field_validator("relationship_type")
    @classmethod
    def clean_relationship_type(cls, value: str) -> str:
        normalized = normalize_relationship_type(value)
        if not normalized:
            raise ValueError("relationship_type cannot be blank")
        return normalized


class RelationshipCreate(RelationshipBase):
    pass


class RelationshipUpdate(BaseModel):
    source_concept_id: int | None = None
    target_concept_id: int | None = None
    relationship_type: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = None

    @field_validator("relationship_type")
    @classmethod
    def clean_relationship_type(cls, value: str | None) -> str | None:
        return normalize_relationship_type(value) if value is not None else value


class RelationshipRead(RelationshipBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mastery_score: float
    confidence: float
    created_at: datetime
    updated_at: datetime
    last_reviewed_at: datetime | None
    next_review_at: datetime | None
    review_interval_days: int
    source_name: str | None = None
    target_name: str | None = None


class QuestionBase(BaseModel):
    question_text: str = Field(min_length=1)
    answer_text: str = Field(min_length=1)
    question_type: str = "CONCEPT_RECALL"
    difficulty: int = Field(default=2, ge=1, le=5)
    concept_id: int | None = None
    relationship_id: int | None = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in QUESTION_TYPES:
            raise ValueError(f"question_type must be one of: {', '.join(sorted(QUESTION_TYPES))}")
        return normalized


class QuestionCreate(QuestionBase):
    pass


class QuestionRead(QuestionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ReviewAttemptCreate(BaseModel):
    question_id: int
    rating: ReviewRating
    response_time_ms: int | None = Field(default=None, ge=0)


class ReviewAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    concept_id: int | None
    relationship_id: int | None
    rating: str
    response_time_ms: int | None
    reviewed_at: datetime


class ReviewResponse(BaseModel):
    attempt: ReviewAttemptRead
    concept: ConceptRead | None = None
    relationship: RelationshipRead | None = None


class GraphResponse(BaseModel):
    center_id: int
    depth: int
    nodes: list[ConceptRead]
    relationships: list[RelationshipRead]


class KnowledgeHomeResponse(BaseModel):
    spaces: list[KnowledgeSpaceRead]


class TopicConnectionRead(BaseModel):
    source_topic_id: int
    target_topic_id: int
    relationship_count: int
    relationship_types: list[str]


class KnowledgeSpaceGraphResponse(BaseModel):
    space: KnowledgeSpaceRead
    topics: list[TopicRead]
    topic_connections: list[TopicConnectionRead] = []


class BoundaryConceptRead(BaseModel):
    concept: ConceptRead
    topic: TopicRead | None = None


class TopicGraphResponse(BaseModel):
    space: KnowledgeSpaceRead
    topic: TopicRead
    ancestors: list[TopicRead]
    child_topics: list[TopicRead]
    concepts: list[ConceptRead]
    boundary_concepts: list[BoundaryConceptRead]
    relationships: list[RelationshipRead]


KnowledgeSearchEntity = Literal["knowledge-space", "topic", "concept"]


class KnowledgeSearchResult(BaseModel):
    entity_type: KnowledgeSearchEntity
    id: int
    label: str
    path: list[str]
    knowledge_space_id: int | None = None
    topic_id: int | None = None
    concept_id: int | None = None


class ReconstructionResponse(BaseModel):
    concept: ConceptRead
    question: QuestionRead
    graph: GraphResponse


class DashboardCard(BaseModel):
    id: int
    label: str
    mastery_score: float
    subtitle: str | None = None


class RecentReview(BaseModel):
    id: int
    rating: str
    reviewed_at: datetime
    question_text: str
    target_label: str


class DashboardResponse(BaseModel):
    concepts_count: int
    relationships_count: int
    questions_count: int
    reviews_today_count: int
    average_concept_mastery: float
    average_relationship_mastery: float
    due_today_count: int
    weakest_concepts: list[DashboardCard]
    weakest_relationships: list[DashboardCard]
    recently_studied: list[RecentReview]



def _normalize_choice(value: str, allowed: list[str], field: str) -> str:
    normalized = value.strip().upper().replace(" ", "_").replace("-", "_")
    if normalized not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(allowed)}")
    return normalized


class FlowchartCreate(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    description: str = ""
    knowledge_space_id: int | None = None
    is_primary: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class FlowchartUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    knowledge_space_id: int | None = None
    is_primary: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class FlowchartSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    knowledge_space_id: int | None
    is_primary: bool
    node_count: int = 0
    created_at: datetime
    updated_at: datetime


class FlowNodeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=140)
    description: str = ""
    node_type: str = "PROCESS"
    concept_id: int | None = None
    child_flowchart_id: int | None = None
    pos_x: float | None = None
    pos_y: float | None = None

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        return value.strip()

    @field_validator("node_type")
    @classmethod
    def validate_node_type(cls, value: str) -> str:
        return _normalize_choice(value, FLOW_NODE_TYPES, "node_type")


class FlowNodeUpdate(BaseModel):
    """PATCH body. Fields that are present (even as null) are applied."""

    label: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    node_type: str | None = None
    concept_id: int | None = None
    child_flowchart_id: int | None = None
    pos_x: float | None = None
    pos_y: float | None = None

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("node_type")
    @classmethod
    def validate_node_type(cls, value: str | None) -> str | None:
        return _normalize_choice(value, FLOW_NODE_TYPES, "node_type") if value is not None else value


class FlowNodeRead(BaseModel):
    id: int
    flowchart_id: int
    concept_id: int | None
    concept_name: str | None = None
    concept_description: str | None = None
    label: str
    description: str
    node_type: str
    child_flowchart_id: int | None
    child_flowchart_name: str | None = None
    has_child: bool = False
    pos_x: float | None
    pos_y: float | None


class FlowEdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    edge_type: str = "NEXT"
    label: str | None = None
    description: str | None = None

    @field_validator("edge_type")
    @classmethod
    def validate_edge_type(cls, value: str) -> str:
        return _normalize_choice(value, FLOW_EDGE_TYPES, "edge_type")


class FlowEdgeUpdate(BaseModel):
    edge_type: str | None = None
    label: str | None = None
    description: str | None = None

    @field_validator("edge_type")
    @classmethod
    def validate_edge_type(cls, value: str | None) -> str | None:
        return _normalize_choice(value, FLOW_EDGE_TYPES, "edge_type") if value is not None else value


class FlowEdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flowchart_id: int
    source_node_id: int
    target_node_id: int
    edge_type: str
    label: str | None
    description: str | None


class FlowchartDetail(BaseModel):
    flowchart: FlowchartSummary
    nodes: list[FlowNodeRead]
    edges: list[FlowEdgeRead]
