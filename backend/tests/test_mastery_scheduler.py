from datetime import datetime, timedelta, timezone

from app.mastery import apply_rating_to_mastery, calculate_decayed_mastery
from app.scheduler import calculate_review_interval_days, is_due


def test_mastery_update_rating_changes_score():
    update = apply_rating_to_mastery(0.45, 0.3, "GOOD", now=datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert update.mastery_score == 0.55
    assert update.confidence > 0.3


def test_mastery_decay_reduces_old_score():
    old_review = datetime(2026, 1, 1, tzinfo=timezone.utc)
    now = old_review + timedelta(days=100)

    decayed = calculate_decayed_mastery(0.8, old_review, now)

    assert decayed < 0.8
    assert decayed > 0.6


def test_review_scheduling_uses_rating_and_mastery():
    again = calculate_review_interval_days(10, "AGAIN", 0.2)
    good = calculate_review_interval_days(10, "GOOD", 0.75)
    easy = calculate_review_interval_days(10, "EASY", 0.9)

    assert again == 1
    assert good > again
    assert easy > good


def test_due_check_handles_sqlite_naive_datetimes():
    class Entity:
        next_review_at = datetime(2026, 1, 1)

    assert is_due(Entity(), datetime(2026, 1, 2, tzinfo=timezone.utc))
