from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from . import models, schemas


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def list_concepts(db: Session) -> list[models.Concept]:
    return db.query(models.Concept).order_by(models.Concept.name.asc()).all()


def get_concept(db: Session, concept_id: int) -> models.Concept | None:
    return db.query(models.Concept).filter(models.Concept.id == concept_id).first()


def create_concept(db: Session, concept_in: schemas.ConceptCreate) -> models.Concept:
    concept = models.Concept(**concept_in.model_dump())
    db.add(concept)
    db.commit()
    db.refresh(concept)
    return concept


def update_concept(db: Session, concept: models.Concept, concept_in: schemas.ConceptUpdate) -> models.Concept:
    for key, value in concept_in.model_dump(exclude_unset=True).items():
        setattr(concept, key, value)
    concept.updated_at = utc_now()
    db.commit()
    db.refresh(concept)
    return concept


def delete_concept(db: Session, concept: models.Concept) -> None:
    db.delete(concept)
    db.commit()


def search_concepts(db: Session, query: str, limit: int = 12) -> list[models.Concept]:
    term = f"%{query.strip()}%"
    return (
        db.query(models.Concept)
        .filter(or_(models.Concept.name.ilike(term), models.Concept.description.ilike(term)))
        .order_by(models.Concept.name.asc())
        .limit(limit)
        .all()
    )


def list_relationships(db: Session) -> list[models.Relationship]:
    return (
        db.query(models.Relationship)
        .options(joinedload(models.Relationship.source), joinedload(models.Relationship.target))
        .order_by(models.Relationship.created_at.desc())
        .all()
    )


def get_relationship(db: Session, relationship_id: int) -> models.Relationship | None:
    return (
        db.query(models.Relationship)
        .options(joinedload(models.Relationship.source), joinedload(models.Relationship.target))
        .filter(models.Relationship.id == relationship_id)
        .first()
    )


def create_relationship(db: Session, relationship_in: schemas.RelationshipCreate) -> models.Relationship:
    source = get_concept(db, relationship_in.source_concept_id)
    target = get_concept(db, relationship_in.target_concept_id)
    if source is None or target is None:
        raise ValueError("source_concept_id and target_concept_id must both exist")
    if source.id == target.id:
        raise ValueError("source and target concepts must be different")

    relationship = models.Relationship(**relationship_in.model_dump())
    db.add(relationship)
    db.commit()
    db.refresh(relationship)
    return get_relationship(db, relationship.id) or relationship


def update_relationship(
    db: Session,
    relationship: models.Relationship,
    relationship_in: schemas.RelationshipUpdate,
) -> models.Relationship:
    data = relationship_in.model_dump(exclude_unset=True)
    source_id = data.get("source_concept_id", relationship.source_concept_id)
    target_id = data.get("target_concept_id", relationship.target_concept_id)
    if source_id == target_id:
        raise ValueError("source and target concepts must be different")
    if get_concept(db, source_id) is None or get_concept(db, target_id) is None:
        raise ValueError("source_concept_id and target_concept_id must both exist")

    for key, value in data.items():
        setattr(relationship, key, value)
    relationship.updated_at = utc_now()
    db.commit()
    db.refresh(relationship)
    return get_relationship(db, relationship.id) or relationship


def delete_relationship(db: Session, relationship: models.Relationship) -> None:
    db.delete(relationship)
    db.commit()


def list_questions(db: Session) -> list[models.Question]:
    return db.query(models.Question).order_by(models.Question.created_at.desc()).all()


def get_question(db: Session, question_id: int) -> models.Question | None:
    return db.query(models.Question).filter(models.Question.id == question_id).first()


def create_question(db: Session, question_in: schemas.QuestionCreate) -> models.Question:
    if question_in.concept_id is not None and get_concept(db, question_in.concept_id) is None:
        raise ValueError("concept_id does not exist")
    if question_in.relationship_id is not None and get_relationship(db, question_in.relationship_id) is None:
        raise ValueError("relationship_id does not exist")

    question = models.Question(**question_in.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return question

