from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
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
    db.query(models.GraphViewNode).filter(models.GraphViewNode.concept_id == concept.id).update(
        {"concept_id": None, "node_type": "note"}
    )
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


def list_knowledge_entries(db: Session) -> list[models.KnowledgeEntry]:
    return (
        db.query(models.KnowledgeEntry)
        .order_by(models.KnowledgeEntry.sort_order.asc(), models.KnowledgeEntry.id.asc())
        .all()
    )


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


def list_graph_views(db: Session, root_concept_id: int) -> list[models.GraphView]:
    return (
        db.query(models.GraphView)
        .filter(models.GraphView.root_concept_id == root_concept_id)
        .order_by(models.GraphView.sort_order.asc(), models.GraphView.id.asc())
        .all()
    )


def get_graph_view(db: Session, view_id: int) -> models.GraphView | None:
    return db.query(models.GraphView).filter(models.GraphView.id == view_id).first()


def create_graph_view(db: Session, view_in: schemas.GraphViewCreate) -> models.GraphView:
    if get_concept(db, view_in.root_concept_id) is None:
        raise ValueError("root_concept_id does not exist")

    view = models.GraphView(**view_in.model_dump())
    db.add(view)
    db.commit()
    db.refresh(view)
    return view


def update_graph_view(db: Session, view: models.GraphView, view_in: schemas.GraphViewUpdate) -> models.GraphView:
    for key, value in view_in.model_dump(exclude_unset=True).items():
        setattr(view, key, value)
    view.updated_at = utc_now()
    db.commit()
    db.refresh(view)
    return view


def delete_graph_view(db: Session, view: models.GraphView) -> None:
    db.delete(view)
    db.commit()


def get_graph_view_node(db: Session, node_id: int) -> models.GraphViewNode | None:
    return db.query(models.GraphViewNode).filter(models.GraphViewNode.id == node_id).first()


def _existing_view_node_for_concept(
    db: Session, graph_view_id: int, concept_id: int
) -> models.GraphViewNode | None:
    return (
        db.query(models.GraphViewNode)
        .filter(
            models.GraphViewNode.graph_view_id == graph_view_id,
            models.GraphViewNode.concept_id == concept_id,
        )
        .first()
    )


def add_node_to_view(
    db: Session, view: models.GraphView, node_in: schemas.GraphViewNodeCreate
) -> models.GraphViewNode:
    if node_in.concept_id is not None:
        if get_concept(db, node_in.concept_id) is None:
            raise ValueError("concept_id does not exist")

        existing = _existing_view_node_for_concept(db, view.id, node_in.concept_id)
        if existing is not None:
            return existing

    node_type = "concept" if node_in.concept_id is not None else "note"
    node = models.GraphViewNode(
        graph_view_id=view.id,
        concept_id=node_in.concept_id,
        label=node_in.label,
        node_type=node_type,
        x=node_in.x,
        y=node_in.y,
    )
    db.add(node)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if node_in.concept_id is not None:
            existing = _existing_view_node_for_concept(db, view.id, node_in.concept_id)
            if existing is not None:
                return existing
        raise
    db.refresh(node)
    return node


def update_graph_view_node(
    db: Session, node: models.GraphViewNode, node_in: schemas.GraphViewNodeUpdate
) -> models.GraphViewNode:
    for key, value in node_in.model_dump(exclude_unset=True).items():
        setattr(node, key, value)
    node.updated_at = utc_now()
    db.commit()
    db.refresh(node)
    return node


def delete_graph_view_node(db: Session, node: models.GraphViewNode) -> None:
    db.delete(node)
    db.commit()


def get_graph_view_edge(db: Session, edge_id: int) -> models.GraphViewEdge | None:
    return db.query(models.GraphViewEdge).filter(models.GraphViewEdge.id == edge_id).first()


def create_graph_view_edge(
    db: Session, view: models.GraphView, edge_in: schemas.GraphViewEdgeCreate
) -> models.GraphViewEdge:
    if edge_in.source_view_node_id == edge_in.target_view_node_id:
        raise ValueError("source and target nodes must be different")

    source = get_graph_view_node(db, edge_in.source_view_node_id)
    target = get_graph_view_node(db, edge_in.target_view_node_id)
    if source is None or target is None:
        raise ValueError("source_view_node_id and target_view_node_id must both exist")
    if source.graph_view_id != view.id or target.graph_view_id != view.id:
        raise ValueError("source and target nodes must belong to this view")

    edge = models.GraphViewEdge(
        graph_view_id=view.id,
        source_view_node_id=edge_in.source_view_node_id,
        target_view_node_id=edge_in.target_view_node_id,
        label=edge_in.label,
        relationship_type=edge_in.relationship_type,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


def update_graph_view_edge(
    db: Session, edge: models.GraphViewEdge, edge_in: schemas.GraphViewEdgeUpdate
) -> models.GraphViewEdge:
    for key, value in edge_in.model_dump(exclude_unset=True).items():
        setattr(edge, key, value)
    edge.updated_at = utc_now()
    db.commit()
    db.refresh(edge)
    return edge


def delete_graph_view_edge(db: Session, edge: models.GraphViewEdge) -> None:
    db.delete(edge)
    db.commit()

