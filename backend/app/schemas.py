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


class GraphResponse(BaseModel):
    center_id: int
    depth: int
    nodes: list[ConceptRead]
    relationships: list[RelationshipRead]


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

