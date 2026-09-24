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
    pass


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


class KnowledgeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    entry_type: Literal["folder", "concept"]
    concept_id: int | None
    sort_order: int


class KnowledgeEntryCreate(BaseModel):
    """POST body. Only folders are created through this endpoint; concept entries are seeded separately."""

    name: str = Field(min_length=1, max_length=140)
    parent_id: int | None = None
    entry_type: Literal["folder"] = "folder"

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class GraphResponse(BaseModel):
    center_id: int
    depth: int
    nodes: list[ConceptRead]
    relationships: list[RelationshipRead]


GraphViewNodeType = Literal["concept", "note"]


class GraphViewBase(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    view_type: str = "personal"


class GraphViewCreate(GraphViewBase):
    root_concept_id: int
    sort_order: int = 0


class GraphViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    sort_order: int | None = None


class GraphViewRead(GraphViewBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    root_concept_id: int
    sort_order: int
    created_at: datetime
    updated_at: datetime


class GraphViewNodeCreate(BaseModel):
    concept_id: int | None = None
    label: str = Field(min_length=1, max_length=140)
    node_type: GraphViewNodeType = "note"
    x: float = 0.0
    y: float = 0.0


class GraphViewNodeUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=140)
    x: float | None = None
    y: float | None = None


class GraphViewNodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    graph_view_id: int
    concept_id: int | None
    label: str
    node_type: GraphViewNodeType
    x: float
    y: float


class GraphViewEdgeCreate(BaseModel):
    source_view_node_id: int
    target_view_node_id: int
    label: str | None = None
    relationship_type: str | None = None


class GraphViewEdgeUpdate(BaseModel):
    label: str | None = None
    relationship_type: str | None = None


class GraphViewEdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    graph_view_id: int
    source_view_node_id: int
    target_view_node_id: int
    label: str | None
    relationship_type: str | None


class GraphViewDetail(GraphViewRead):
    nodes: list[GraphViewNodeRead]
    edges: list[GraphViewEdgeRead]


FlowNodeType = Literal[
    "start",
    "end",
    "process",
    "decision",
    "input_output",
    "subprocess",
    "external_system",
    "data",
]

# Process-flow vocabulary, deliberately separate from RELATIONSHIP_TYPES (USES, REQUIRES, ...). The free-text
# label (e.g. "PASS", "retry after 3s") is unrestricted; edge_type only says what kind of flow it is.
FlowEdgeType = Literal["normal", "yes", "no", "success", "failure", "retry"]


class FlowchartBase(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    description: str = ""

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class FlowchartCreate(FlowchartBase):
    folder_id: int | None = None


class FlowchartUpdate(BaseModel):
    """PATCH body. Fields that are present are applied, so folder_id null detaches from a folder."""

    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    folder_id: int | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class FlowchartRead(FlowchartBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int | None
    node_count: int = 0
    edge_count: int = 0
    # How many nodes open this flowchart as their detailed flowchart. 0 means it is a top-level flowchart.
    used_by_count: int = 0
    created_at: datetime
    updated_at: datetime


class FlowNodeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=140)
    description: str = ""
    node_type: FlowNodeType = "process"
    concept_id: int | None = None
    child_flowchart_id: int | None = None
    x: float | None = None
    y: float | None = None

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        return value.strip()


class FlowNodeUpdate(BaseModel):
    """PATCH body. Fields that are present are applied, so child_flowchart_id null detaches the child."""

    label: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    node_type: FlowNodeType | None = None
    concept_id: int | None = None
    child_flowchart_id: int | None = None
    x: float | None = None
    y: float | None = None

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class FlowNodeRead(BaseModel):
    id: int
    flowchart_id: int
    concept_id: int | None
    # Copied from the linked Concept so a client can render a whole flowchart from one response.
    concept_name: str | None = None
    concept_description: str | None = None
    label: str
    description: str
    node_type: FlowNodeType
    child_flowchart_id: int | None
    child_flowchart_name: str | None = None
    x: float | None
    y: float | None


class FlowEdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    edge_type: FlowEdgeType = "normal"
    label: str | None = Field(default=None, max_length=140)
    description: str | None = None


class FlowEdgeUpdate(BaseModel):
    edge_type: FlowEdgeType | None = None
    label: str | None = Field(default=None, max_length=140)
    description: str | None = None


class FlowEdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flowchart_id: int
    source_node_id: int
    target_node_id: int
    edge_type: FlowEdgeType
    label: str | None
    description: str | None


class FlowchartDetail(BaseModel):
    flowchart: FlowchartRead
    nodes: list[FlowNodeRead]
    edges: list[FlowEdgeRead]


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

