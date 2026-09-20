from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship as orm_relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


concept_topics = Table(
    "concept_topics",
    Base.metadata,
    Column("concept_id", ForeignKey("concepts.id"), primary_key=True),
    Column("topic_id", ForeignKey("topics.id"), primary_key=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)


class KnowledgeSpace(Base):
    __tablename__ = "knowledge_spaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(140), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    topics = orm_relationship(
        "Topic",
        back_populates="knowledge_space",
        cascade="all, delete-orphan",
    )


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    knowledge_space_id = Column(Integer, ForeignKey("knowledge_spaces.id"), nullable=False, index=True)
    parent_topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True, index=True)
    name = Column(String(140), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    knowledge_space = orm_relationship("KnowledgeSpace", back_populates="topics")
    parent = orm_relationship("Topic", remote_side=[id], back_populates="children")
    children = orm_relationship("Topic", back_populates="parent")
    concepts = orm_relationship("Concept", secondary=concept_topics, back_populates="topics")


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(140), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=False, default="")
    concept_type = Column(String(40), nullable=False, default="concept", index=True)
    mastery_score = Column(Float, nullable=False, default=0.0)
    confidence = Column(Float, nullable=False, default=0.3)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True, index=True)
    review_interval_days = Column(Integer, nullable=False, default=1)

    outgoing_relationships = orm_relationship(
        "Relationship",
        back_populates="source",
        cascade="all, delete-orphan",
        foreign_keys="Relationship.source_concept_id",
    )
    incoming_relationships = orm_relationship(
        "Relationship",
        back_populates="target",
        cascade="all, delete-orphan",
        foreign_keys="Relationship.target_concept_id",
    )
    questions = orm_relationship("Question", back_populates="concept")
    review_attempts = orm_relationship("ReviewAttempt", back_populates="concept")
    topics = orm_relationship("Topic", secondary=concept_topics, back_populates="concepts")


class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(Integer, primary_key=True, index=True)
    source_concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=False, index=True)
    target_concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=False, index=True)
    relationship_type = Column(String(60), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    mastery_score = Column(Float, nullable=False, default=0.0)
    confidence = Column(Float, nullable=False, default=0.3)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True, index=True)
    review_interval_days = Column(Integer, nullable=False, default=1)

    source = orm_relationship(
        "Concept",
        back_populates="outgoing_relationships",
        foreign_keys=[source_concept_id],
    )
    target = orm_relationship(
        "Concept",
        back_populates="incoming_relationships",
        foreign_keys=[target_concept_id],
    )
    questions = orm_relationship("Question", back_populates="relationship")
    review_attempts = orm_relationship("ReviewAttempt", back_populates="relationship")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    question_text = Column(Text, nullable=False)
    answer_text = Column(Text, nullable=False)
    question_type = Column(String(60), nullable=False, index=True)
    difficulty = Column(Integer, nullable=False, default=2)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=True, index=True)
    relationship_id = Column(Integer, ForeignKey("relationships.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    concept = orm_relationship("Concept", back_populates="questions")
    relationship = orm_relationship("Relationship", back_populates="questions")
    review_attempts = orm_relationship("ReviewAttempt", back_populates="question")


class ReviewAttempt(Base):
    __tablename__ = "review_attempts"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, index=True)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=True, index=True)
    relationship_id = Column(Integer, ForeignKey("relationships.id"), nullable=True, index=True)
    rating = Column(String(20), nullable=False)
    response_time_ms = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    question = orm_relationship("Question", back_populates="review_attempts")
    concept = orm_relationship("Concept", back_populates="review_attempts")
    relationship = orm_relationship("Relationship", back_populates="review_attempts")


class Flowchart(Base):
    """A directed process graph. Cycles, merges and branches are all legal."""

    __tablename__ = "flowcharts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(140), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    knowledge_space_id = Column(Integer, ForeignKey("knowledge_spaces.id"), nullable=True, index=True)
    is_primary = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    nodes = orm_relationship(
        "FlowNode",
        back_populates="flowchart",
        cascade="all, delete-orphan",
        foreign_keys="FlowNode.flowchart_id",
    )
    edges = orm_relationship(
        "FlowEdge",
        back_populates="flowchart",
        cascade="all, delete-orphan",
    )


class FlowNode(Base):
    """One appearance of a step in a flowchart. May reference a global Concept and a child Flowchart."""

    __tablename__ = "flow_nodes"

    id = Column(Integer, primary_key=True, index=True)
    flowchart_id = Column(Integer, ForeignKey("flowcharts.id"), nullable=False, index=True)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=True, index=True)
    label = Column(String(140), nullable=False)
    description = Column(Text, nullable=False, default="")
    node_type = Column(String(30), nullable=False, default="PROCESS")
    # Not unique: several nodes (in different flowcharts) may open the same reusable flowchart.
    child_flowchart_id = Column(Integer, ForeignKey("flowcharts.id"), nullable=True, index=True)
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    flowchart = orm_relationship("Flowchart", back_populates="nodes", foreign_keys=[flowchart_id])
    child_flowchart = orm_relationship("Flowchart", foreign_keys=[child_flowchart_id])
    concept = orm_relationship("Concept")
    outgoing_edges = orm_relationship(
        "FlowEdge",
        back_populates="source",
        cascade="all, delete-orphan",
        foreign_keys="FlowEdge.source_node_id",
    )
    incoming_edges = orm_relationship(
        "FlowEdge",
        back_populates="target",
        cascade="all, delete-orphan",
        foreign_keys="FlowEdge.target_node_id",
    )


class FlowEdge(Base):
    """Process/control-flow edge. Local to one flowchart; unrelated to semantic `relationships`."""

    __tablename__ = "flow_edges"

    id = Column(Integer, primary_key=True, index=True)
    flowchart_id = Column(Integer, ForeignKey("flowcharts.id"), nullable=False, index=True)
    source_node_id = Column(Integer, ForeignKey("flow_nodes.id"), nullable=False, index=True)
    target_node_id = Column(Integer, ForeignKey("flow_nodes.id"), nullable=False, index=True)
    edge_type = Column(String(20), nullable=False, default="NEXT")
    label = Column(String(140), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    flowchart = orm_relationship("Flowchart", back_populates="edges")
    source = orm_relationship("FlowNode", back_populates="outgoing_edges", foreign_keys=[source_node_id])
    target = orm_relationship("FlowNode", back_populates="incoming_edges", foreign_keys=[target_node_id])
