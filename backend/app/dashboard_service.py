from datetime import datetime, time, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from .mastery import calculate_decayed_mastery, get_weakest_concepts, get_weakest_relationships
from .scheduler import is_due


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _relationship_label(relationship: models.Relationship) -> str:
    source = relationship.source.name if relationship.source else f"Concept {relationship.source_concept_id}"
    target = relationship.target.name if relationship.target else f"Concept {relationship.target_concept_id}"
    return f"{source} {relationship.relationship_type} {target}"


def get_dashboard(db: Session, now: datetime | None = None) -> schemas.DashboardResponse:
    now = now or utc_now()
    today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)

    concepts = db.query(models.Concept).all()
    relationships = (
        db.query(models.Relationship)
        .options(joinedload(models.Relationship.source), joinedload(models.Relationship.target))
        .all()
    )
    concept_scores = [calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now) for item in concepts]
    relationship_scores = [
        calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now) for item in relationships
    ]

    weakest_concepts = [
        schemas.DashboardCard(
            id=item.id,
            label=item.name,
            mastery_score=calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now),
            subtitle=item.concept_type,
        )
        for item in get_weakest_concepts(db, 5, now)
    ]

    weakest_relationships = [
        schemas.DashboardCard(
            id=item.id,
            label=_relationship_label(item),
            mastery_score=calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now),
            subtitle=item.description,
        )
        for item in get_weakest_relationships(db, 5, now)
    ]

    recent_attempts = (
        db.query(models.ReviewAttempt)
        .options(
            joinedload(models.ReviewAttempt.question),
            joinedload(models.ReviewAttempt.concept),
            joinedload(models.ReviewAttempt.relationship).joinedload(models.Relationship.source),
            joinedload(models.ReviewAttempt.relationship).joinedload(models.Relationship.target),
        )
        .order_by(models.ReviewAttempt.reviewed_at.desc())
        .limit(6)
        .all()
    )

    recently_studied = []
    for attempt in recent_attempts:
        if attempt.relationship is not None:
            label = _relationship_label(attempt.relationship)
        elif attempt.concept is not None:
            label = attempt.concept.name
        else:
            label = "Unlinked question"
        recently_studied.append(
            schemas.RecentReview(
                id=attempt.id,
                rating=attempt.rating,
                reviewed_at=attempt.reviewed_at,
                question_text=attempt.question.question_text,
                target_label=label,
            )
        )

    due_today_count = sum(1 for item in [*concepts, *relationships] if is_due(item, now))

    return schemas.DashboardResponse(
        concepts_count=len(concepts),
        relationships_count=len(relationships),
        questions_count=db.query(func.count(models.Question.id)).scalar() or 0,
        reviews_today_count=(
            db.query(func.count(models.ReviewAttempt.id))
            .filter(models.ReviewAttempt.reviewed_at >= today_start)
            .scalar()
            or 0
        ),
        average_concept_mastery=round(sum(concept_scores) / len(concept_scores), 4) if concept_scores else 0.0,
        average_relationship_mastery=(
            round(sum(relationship_scores) / len(relationship_scores), 4) if relationship_scores else 0.0
        ),
        due_today_count=due_today_count,
        weakest_concepts=weakest_concepts,
        weakest_relationships=weakest_relationships,
        recently_studied=recently_studied,
    )

