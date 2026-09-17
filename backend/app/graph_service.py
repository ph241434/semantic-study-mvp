from collections import deque

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from .serializers import relationship_read


def get_local_graph(db: Session, concept_id: int, depth: int = 1) -> schemas.GraphResponse | None:
    center = db.query(models.Concept).filter(models.Concept.id == concept_id).first()
    if center is None:
        return None

    depth = max(1, min(3, depth))
    visited: dict[int, int] = {center.id: 0}
    queue: deque[tuple[int, int]] = deque([(center.id, 0)])

    while queue:
        current_id, current_depth = queue.popleft()
        if current_depth >= depth:
            continue

        adjacent_relationships = (
            db.query(models.Relationship)
            .filter(
                or_(
                    models.Relationship.source_concept_id == current_id,
                    models.Relationship.target_concept_id == current_id,
                )
            )
            .all()
        )

        for relationship in adjacent_relationships:
            neighbor_id = (
                relationship.target_concept_id
                if relationship.source_concept_id == current_id
                else relationship.source_concept_id
            )
            if neighbor_id not in visited:
                visited[neighbor_id] = current_depth + 1
                queue.append((neighbor_id, current_depth + 1))

    included_ids = set(visited.keys())

    concepts = (
        db.query(models.Concept)
        .filter(models.Concept.id.in_(included_ids))
        .order_by(models.Concept.name.asc())
        .all()
    )

    # Include every relationship among the visited nodes, not just ones touching the
    # center directly, so a single-depth graph explains how its visible concepts relate
    # to *each other* rather than only how they relate to the root.
    relationships = (
        db.query(models.Relationship)
        .options(joinedload(models.Relationship.source), joinedload(models.Relationship.target))
        .filter(
            models.Relationship.source_concept_id.in_(included_ids),
            models.Relationship.target_concept_id.in_(included_ids),
        )
        .all()
    )

    return schemas.GraphResponse(
        center_id=concept_id,
        depth=depth,
        nodes=[schemas.ConceptRead.model_validate(concept) for concept in concepts],
        relationships=[relationship_read(relationship) for relationship in relationships],
    )

