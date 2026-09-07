from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def calculate_review_interval_days(
    current_interval_days: int,
    rating: str,
    mastery_score: float,
) -> int:
    normalized = rating.upper()
    current = max(1, current_interval_days or 1)

    if normalized == "AGAIN":
        return 1
    if normalized == "HARD":
        return max(1, round(current * 1.25))
    if normalized == "GOOD":
        multiplier = 1.7 if mastery_score < 0.6 else 2.1
        return max(2, round(current * multiplier))
    if normalized == "EASY":
        multiplier = 2.4 if mastery_score < 0.75 else 3.0
        return max(3, round(current * multiplier))

    raise ValueError(f"Unsupported rating: {rating}")


def schedule_next_review(entity, rating: str, now: datetime | None = None) -> datetime:
    reviewed_at = now or utc_now()
    interval_days = calculate_review_interval_days(
        entity.review_interval_days,
        rating,
        entity.mastery_score,
    )
    entity.review_interval_days = interval_days
    entity.next_review_at = reviewed_at + timedelta(days=interval_days)
    return entity.next_review_at


def is_due(entity, now: datetime | None = None) -> bool:
    now = _as_aware(now or utc_now())
    return entity.next_review_at is None or _as_aware(entity.next_review_at) <= now
