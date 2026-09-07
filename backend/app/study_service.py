from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, joinedload

from . import crud, models, schemas
from .graph_service import get_local_graph
from .mastery import calculate_decayed_mastery, update_concept_mastery, update_relationship_mastery
from .scheduler import is_due, schedule_next_review
from .serializers import relationship_read


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _recent_error_boost(db: Session, question_id: int, now: datetime) -> float:
    since = now - timedelta(days=7)
    attempts = (
        db.query(models.ReviewAttempt)
        .filter(
            models.ReviewAttempt.question_id == question_id,
            models.ReviewAttempt.reviewed_at >= since,
        )
        .all()
    )
    return sum(0.15 for attempt in attempts if attempt.rating in {"AGAIN", "HARD"})


def _question_priority(db: Session, question: models.Question, now: datetime) -> float:
    target = question.relationship or question.concept
    if target is None:
        return 0.0

    decayed = calculate_decayed_mastery(target.mastery_score, target.last_reviewed_at, now)
    due_boost = 0.6 if is_due(target, now) else 0.0
    relationship_boost = 0.25 if question.relationship_id is not None else 0.0
    difficulty_boost = question.difficulty * 0.04
    return (1 - decayed) + due_boost + relationship_boost + difficulty_boost + _recent_error_boost(db, question.id, now)


def get_due_questions(db: Session, limit: int = 12, now: datetime | None = None) -> list[models.Question]:
    now = now or utc_now()
    questions = (
        db.query(models.Question)
        .options(joinedload(models.Question.concept), joinedload(models.Question.relationship))
        .all()
    )
    scored = [
        (question, _question_priority(db, question, now))
        for question in questions
        if question.concept is not None or question.relationship is not None
    ]
    scored.sort(key=lambda item: item[1], reverse=True)
    return [question for question, _priority in scored[:limit]]


def record_review(
    db: Session,
    review_in: schemas.ReviewAttemptCreate,
    now: datetime | None = None,
) -> schemas.ReviewResponse:
    now = now or utc_now()
    question = crud.get_question(db, review_in.question_id)
    if question is None:
        raise ValueError("question_id does not exist")

    concept = question.concept
    relationship = question.relationship

    if relationship is not None:
        update_relationship_mastery(relationship, review_in.rating, now)
        schedule_next_review(relationship, review_in.rating, now)
    elif concept is not None:
        update_concept_mastery(concept, review_in.rating, now)
        schedule_next_review(concept, review_in.rating, now)

    attempt = models.ReviewAttempt(
        question_id=question.id,
        concept_id=concept.id if concept is not None else None,
        relationship_id=relationship.id if relationship is not None else None,
        rating=review_in.rating,
        response_time_ms=review_in.response_time_ms,
        reviewed_at=now,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    if concept is not None:
        db.refresh(concept)
    if relationship is not None:
        db.refresh(relationship)

    return schemas.ReviewResponse(
        attempt=schemas.ReviewAttemptRead.model_validate(attempt),
        concept=schemas.ConceptRead.model_validate(concept) if concept is not None else None,
        relationship=relationship_read(relationship) if relationship is not None else None,
    )


def get_or_create_reconstruction(
    db: Session,
    concept_id: int,
    depth: int = 1,
) -> schemas.ReconstructionResponse | None:
    concept = crud.get_concept(db, concept_id)
    if concept is None:
        return None

    question = (
        db.query(models.Question)
        .filter(
            models.Question.concept_id == concept_id,
            models.Question.question_type == "GRAPH_RECONSTRUCTION",
        )
        .first()
    )
    if question is None:
        question = models.Question(
            concept_id=concept_id,
            question_type="GRAPH_RECONSTRUCTION",
            difficulty=3,
            question_text=f'Try to recall the important concepts connected to "{concept.name}".',
            answer_text="Reveal the local graph and compare the neighboring concepts and relationship labels.",
        )
        db.add(question)
        db.commit()
        db.refresh(question)

    graph = get_local_graph(db, concept_id, depth)
    if graph is None:
        return None

    return schemas.ReconstructionResponse(
        concept=schemas.ConceptRead.model_validate(concept),
        question=schemas.QuestionRead.model_validate(question),
        graph=graph,
    )

