from dataclasses import dataclass
from datetime import datetime, timezone
from math import sqrt

from sqlalchemy.orm import Session


RATING_DELTAS = {
    "AGAIN": -0.18,
    "HARD": 0.04,
    "GOOD": 0.1,
    "EASY": 0.16,
}

CONFIDENCE_DELTAS = {
    "AGAIN": 0.04,
    "HARD": 0.03,
    "GOOD": 0.05,
    "EASY": 0.06,
}


@dataclass(frozen=True)
class MasteryUpdate:
    mastery_score: float
    confidence: float
    reviewed_at: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def clamp_score(value: float) -> float:
    return max(0.0, min(1.0, round(value, 4)))


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def calculate_decayed_mastery(
    mastery_score: float,
    last_reviewed_at: datetime | None,
    now: datetime | None = None,
    daily_decay: float = 0.008,
) -> float:
    """Apply a transparent time decay without claiming scientific precision."""
    if last_reviewed_at is None:
        return clamp_score(mastery_score)

    now = _as_aware(now or utc_now())
    last_reviewed_at = _as_aware(last_reviewed_at)
    elapsed_days = max(0.0, (now - last_reviewed_at).total_seconds() / 86_400)
    if elapsed_days == 0:
        return clamp_score(mastery_score)

    decay_fraction = min(0.5, daily_decay * sqrt(elapsed_days))
    return clamp_score(mastery_score * (1 - decay_fraction))


def apply_rating_to_mastery(
    mastery_score: float,
    confidence: float,
    rating: str,
    last_reviewed_at: datetime | None = None,
    now: datetime | None = None,
) -> MasteryUpdate:
    normalized = rating.upper()
    if normalized not in RATING_DELTAS:
        raise ValueError(f"Unsupported rating: {rating}")

    reviewed_at = now or utc_now()
    decayed = calculate_decayed_mastery(mastery_score, last_reviewed_at, reviewed_at)
    return MasteryUpdate(
        mastery_score=clamp_score(decayed + RATING_DELTAS[normalized]),
        confidence=clamp_score(confidence + CONFIDENCE_DELTAS[normalized]),
        reviewed_at=reviewed_at,
    )


def update_concept_mastery(concept, rating: str, now: datetime | None = None) -> MasteryUpdate:
    update = apply_rating_to_mastery(
        concept.mastery_score,
        concept.confidence,
        rating,
        concept.last_reviewed_at,
        now,
    )
    concept.mastery_score = update.mastery_score
    concept.confidence = update.confidence
    concept.last_reviewed_at = update.reviewed_at
    return update


def update_relationship_mastery(relationship, rating: str, now: datetime | None = None) -> MasteryUpdate:
    update = apply_rating_to_mastery(
        relationship.mastery_score,
        relationship.confidence,
        rating,
        relationship.last_reviewed_at,
        now,
    )
    relationship.mastery_score = update.mastery_score
    relationship.confidence = update.confidence
    relationship.last_reviewed_at = update.reviewed_at
    return update


def get_weakest_concepts(db: Session, limit: int = 5, now: datetime | None = None):
    from .models import Concept

    concepts = db.query(Concept).all()
    return sorted(
        concepts,
        key=lambda item: calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now),
    )[:limit]


def get_weakest_relationships(db: Session, limit: int = 5, now: datetime | None = None):
    from .models import Relationship

    relationships = db.query(Relationship).all()
    return sorted(
        relationships,
        key=lambda item: calculate_decayed_mastery(item.mastery_score, item.last_reviewed_at, now),
    )[:limit]

