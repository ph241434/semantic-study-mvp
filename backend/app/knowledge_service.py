from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from .serializers import relationship_read


def get_home_graph(db: Session) -> schemas.KnowledgeHomeResponse:
    spaces = db.query(models.KnowledgeSpace).order_by(models.KnowledgeSpace.name.asc()).all()
    return schemas.KnowledgeHomeResponse(
        spaces=[schemas.KnowledgeSpaceRead.model_validate(space) for space in spaces],
    )


def get_space_graph(db: Session, space_id: int) -> schemas.KnowledgeSpaceGraphResponse | None:
    space = db.query(models.KnowledgeSpace).filter(models.KnowledgeSpace.id == space_id).first()
    if space is None:
        return None

    topics = (
        db.query(models.Topic)
        .filter(models.Topic.knowledge_space_id == space_id, models.Topic.parent_topic_id.is_(None))
        .order_by(models.Topic.name.asc())
        .all()
    )
    return schemas.KnowledgeSpaceGraphResponse(
        space=schemas.KnowledgeSpaceRead.model_validate(space),
        topics=[schemas.TopicRead.model_validate(topic) for topic in topics],
        topic_connections=topic_connections_for_space(db, space_id),
    )


def get_topic_graph(db: Session, topic_id: int) -> schemas.TopicGraphResponse | None:
    topic = (
        db.query(models.Topic)
        .options(joinedload(models.Topic.knowledge_space), joinedload(models.Topic.concepts))
        .filter(models.Topic.id == topic_id)
        .first()
    )
    if topic is None:
        return None

    child_topics = (
        db.query(models.Topic)
        .filter(models.Topic.parent_topic_id == topic.id)
        .order_by(models.Topic.name.asc())
        .all()
    )
    direct_concepts = sorted(topic.concepts, key=lambda concept: concept.name)
    direct_ids = {concept.id for concept in direct_concepts}

    adjacent_relationships = (
        db.query(models.Relationship)
        .options(joinedload(models.Relationship.source), joinedload(models.Relationship.target))
        .filter(
            or_(
                models.Relationship.source_concept_id.in_(direct_ids),
                models.Relationship.target_concept_id.in_(direct_ids),
            )
        )
        .order_by(models.Relationship.id.asc())
        .all()
        if direct_ids
        else []
    )

    boundary_ids = {
        related_id
        for relationship in adjacent_relationships
        for related_id in (relationship.source_concept_id, relationship.target_concept_id)
        if related_id not in direct_ids
    }
    boundary_concepts = (
        db.query(models.Concept)
        .options(joinedload(models.Concept.topics).joinedload(models.Topic.knowledge_space))
        .filter(models.Concept.id.in_(boundary_ids))
        .order_by(models.Concept.name.asc())
        .all()
        if boundary_ids
        else []
    )
    visible_ids = direct_ids | boundary_ids
    visible_relationships = [
        relationship
        for relationship in adjacent_relationships
        if relationship.source_concept_id in visible_ids and relationship.target_concept_id in visible_ids
    ]

    return schemas.TopicGraphResponse(
        space=schemas.KnowledgeSpaceRead.model_validate(topic.knowledge_space),
        topic=schemas.TopicRead.model_validate(topic),
        ancestors=[schemas.TopicRead.model_validate(ancestor) for ancestor in topic_ancestors(topic)],
        child_topics=[schemas.TopicRead.model_validate(child) for child in child_topics],
        concepts=[schemas.ConceptRead.model_validate(concept) for concept in direct_concepts],
        boundary_concepts=[
            schemas.BoundaryConceptRead(
                concept=schemas.ConceptRead.model_validate(concept),
                topic=first_external_topic(concept, topic.id),
            )
            for concept in boundary_concepts
        ],
        relationships=[relationship_read(relationship) for relationship in visible_relationships],
    )


def search_knowledge(db: Session, query: str, limit: int = 18) -> list[schemas.KnowledgeSearchResult]:
    term = f"%{query.strip()}%"
    spaces = (
        db.query(models.KnowledgeSpace)
        .filter(or_(models.KnowledgeSpace.name.ilike(term), models.KnowledgeSpace.description.ilike(term)))
        .order_by(models.KnowledgeSpace.name.asc())
        .limit(limit)
        .all()
    )
    topics = (
        db.query(models.Topic)
        .options(joinedload(models.Topic.knowledge_space))
        .filter(or_(models.Topic.name.ilike(term), models.Topic.description.ilike(term)))
        .order_by(models.Topic.name.asc())
        .limit(limit)
        .all()
    )
    concepts = (
        db.query(models.Concept)
        .options(joinedload(models.Concept.topics).joinedload(models.Topic.knowledge_space))
        .filter(or_(models.Concept.name.ilike(term), models.Concept.description.ilike(term)))
        .order_by(models.Concept.name.asc())
        .limit(limit)
        .all()
    )

    results: list[schemas.KnowledgeSearchResult] = []
    results.extend(
        schemas.KnowledgeSearchResult(
            entity_type="knowledge-space",
            id=space.id,
            label=space.name,
            path=[space.name],
            knowledge_space_id=space.id,
        )
        for space in spaces
    )
    results.extend(
        schemas.KnowledgeSearchResult(
            entity_type="topic",
            id=topic.id,
            label=topic.name,
            path=[topic.knowledge_space.name, *[ancestor.name for ancestor in topic_ancestors(topic)], topic.name],
            knowledge_space_id=topic.knowledge_space_id,
            topic_id=topic.id,
        )
        for topic in topics
    )
    results.extend(search_result_for_concept(concept) for concept in concepts)
    return results[:limit]


def topic_ancestors(topic: models.Topic) -> list[models.Topic]:
    ancestors: list[models.Topic] = []
    current = topic.parent
    while current is not None:
        ancestors.append(current)
        current = current.parent
    return list(reversed(ancestors))


def topic_connections_for_space(db: Session, space_id: int) -> list[schemas.TopicConnectionRead]:
    topics = (
        db.query(models.Topic)
        .options(joinedload(models.Topic.concepts))
        .filter(models.Topic.knowledge_space_id == space_id)
        .order_by(models.Topic.id.asc())
        .all()
    )
    topic_by_id = {topic.id: topic for topic in topics}
    top_level_by_topic_id = {
        topic.id: top_level_topic(topic, topic_by_id)
        for topic in topics
    }
    top_level_for_concept: dict[int, models.Topic] = {}
    for topic in topics:
        top_level = top_level_by_topic_id[topic.id]
        for concept in topic.concepts:
            top_level_for_concept.setdefault(concept.id, top_level)

    concept_ids = list(top_level_for_concept)
    relationships = (
        db.query(models.Relationship)
        .filter(
            models.Relationship.source_concept_id.in_(concept_ids),
            models.Relationship.target_concept_id.in_(concept_ids),
        )
        .order_by(models.Relationship.id.asc())
        .all()
        if concept_ids
        else []
    )
    grouped: dict[tuple[int, int], list[models.Relationship]] = {}
    for relationship in relationships:
        source_topic = top_level_for_concept.get(relationship.source_concept_id)
        target_topic = top_level_for_concept.get(relationship.target_concept_id)
        if source_topic is None or target_topic is None or source_topic.id == target_topic.id:
            continue
        key = (source_topic.id, target_topic.id)
        grouped.setdefault(key, []).append(relationship)

    return [
        schemas.TopicConnectionRead(
            source_topic_id=source_topic_id,
            target_topic_id=target_topic_id,
            relationship_count=len(items),
            relationship_types=sorted({item.relationship_type for item in items}),
        )
        for (source_topic_id, target_topic_id), items in sorted(grouped.items())
    ]


def top_level_topic(topic: models.Topic, topic_by_id: dict[int, models.Topic]) -> models.Topic:
    current = topic
    seen: set[int] = set()
    while current.parent_topic_id is not None and current.parent_topic_id not in seen:
        seen.add(current.id)
        parent = topic_by_id.get(current.parent_topic_id)
        if parent is None:
            return current
        current = parent
    return current


def first_external_topic(concept: models.Concept, current_topic_id: int) -> schemas.TopicRead | None:
    topic = next((candidate for candidate in concept.topics if candidate.id != current_topic_id), None)
    return schemas.TopicRead.model_validate(topic) if topic else None


def search_result_for_concept(concept: models.Concept) -> schemas.KnowledgeSearchResult:
    topic = concept.topics[0] if concept.topics else None
    if topic is None:
        return schemas.KnowledgeSearchResult(
            entity_type="concept",
            id=concept.id,
            label=concept.name,
            path=[concept.name],
            concept_id=concept.id,
        )

    return schemas.KnowledgeSearchResult(
        entity_type="concept",
        id=concept.id,
        label=concept.name,
        path=[topic.knowledge_space.name, *[ancestor.name for ancestor in topic_ancestors(topic)], topic.name, concept.name],
        knowledge_space_id=topic.knowledge_space_id,
        topic_id=topic.id,
        concept_id=concept.id,
    )
