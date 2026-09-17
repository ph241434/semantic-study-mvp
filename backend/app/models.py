from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship as orm_relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("knowledge_entries.id"), nullable=True, index=True)
    name = Column(String(140), nullable=False)
    entry_type = Column(String(20), nullable=False)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    parent = orm_relationship("KnowledgeEntry", remote_side=[id], back_populates="children")
    children = orm_relationship("KnowledgeEntry", back_populates="parent")
    concept = orm_relationship("Concept")


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
