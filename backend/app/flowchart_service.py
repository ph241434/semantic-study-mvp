"""Flowchart persistence.

Every flowchart is a directed graph. Merges (many edges into one node), fan-out, and
cycles are all valid, so nothing here assumes a tree. Flow edges are local to a flowchart
and stored apart from the global semantic `relationships` table.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import crud, models, schemas


def get_flowchart(db: Session, flowchart_id: int) -> models.Flowchart | None:
    return db.query(models.Flowchart).filter(models.Flowchart.id == flowchart_id).first()


def get_flow_node(db: Session, node_id: int) -> models.FlowNode | None:
    return db.query(models.FlowNode).filter(models.FlowNode.id == node_id).first()


def get_flow_edge(db: Session, edge_id: int) -> models.FlowEdge | None:
    return db.query(models.FlowEdge).filter(models.FlowEdge.id == edge_id).first()


def flowchart_summary(db: Session, flowchart: models.Flowchart) -> schemas.FlowchartSummary:
    node_count = db.query(func.count(models.FlowNode.id)).filter(models.FlowNode.flowchart_id == flowchart.id).scalar()
    summary = schemas.FlowchartSummary.model_validate(flowchart)
    summary.node_count = node_count or 0
    return summary


def list_flowcharts(db: Session, knowledge_space_id: int | None = None) -> list[schemas.FlowchartSummary]:
    query = db.query(models.Flowchart)
    if knowledge_space_id is not None:
        query = query.filter(models.Flowchart.knowledge_space_id == knowledge_space_id)
    flowcharts = query.order_by(models.Flowchart.is_primary.desc(), models.Flowchart.name.asc()).all()
    return [flowchart_summary(db, flowchart) for flowchart in flowcharts]


def _demote_other_primaries(db: Session, flowchart: models.Flowchart) -> None:
    if not flowchart.is_primary or flowchart.knowledge_space_id is None:
        return
    db.query(models.Flowchart).filter(
        models.Flowchart.knowledge_space_id == flowchart.knowledge_space_id,
        models.Flowchart.id != flowchart.id,
        models.Flowchart.is_primary.is_(True),
    ).update({"is_primary": False})


def _require_space(db: Session, space_id: int | None) -> None:
    if space_id is not None and crud.get_knowledge_space(db, space_id) is None:
        raise ValueError("knowledge_space_id does not exist")


def create_flowchart(db: Session, flowchart_in: schemas.FlowchartCreate) -> models.Flowchart:
    _require_space(db, flowchart_in.knowledge_space_id)
    flowchart = models.Flowchart(**flowchart_in.model_dump())
    db.add(flowchart)
    db.flush()
    _demote_other_primaries(db, flowchart)
    db.commit()
    db.refresh(flowchart)
    return flowchart


def update_flowchart(db: Session, flowchart: models.Flowchart, flowchart_in: schemas.FlowchartUpdate) -> models.Flowchart:
    changes = flowchart_in.model_dump(exclude_unset=True)
    if "knowledge_space_id" in changes:
        _require_space(db, changes["knowledge_space_id"])
    for key, value in changes.items():
        if key in {"name", "is_primary"} and value is None:
            continue
        setattr(flowchart, key, value)
    db.flush()
    _demote_other_primaries(db, flowchart)
    db.commit()
    db.refresh(flowchart)
    return flowchart


def delete_flowchart(db: Session, flowchart: models.Flowchart) -> None:
    # Other flowcharts' nodes that opened this one simply lose their detailed view.
    db.query(models.FlowNode).filter(models.FlowNode.child_flowchart_id == flowchart.id).update(
        {"child_flowchart_id": None}
    )
    db.expire_all()
    db.delete(flowchart)
    db.commit()


def clear_manual_positions(db: Session, flowchart: models.Flowchart) -> None:
    db.query(models.FlowNode).filter(models.FlowNode.flowchart_id == flowchart.id).update(
        {"pos_x": None, "pos_y": None}
    )
    db.commit()


def node_read(node: models.FlowNode) -> schemas.FlowNodeRead:
    return schemas.FlowNodeRead(
        id=node.id,
        flowchart_id=node.flowchart_id,
        concept_id=node.concept_id,
        concept_name=node.concept.name if node.concept else None,
        concept_description=node.concept.description if node.concept else None,
        label=node.label,
        description=node.description,
        node_type=node.node_type,
        child_flowchart_id=node.child_flowchart_id,
        child_flowchart_name=node.child_flowchart.name if node.child_flowchart else None,
        has_child=node.child_flowchart_id is not None,
        pos_x=node.pos_x,
        pos_y=node.pos_y,
    )


def get_flowchart_detail(db: Session, flowchart_id: int) -> schemas.FlowchartDetail | None:
    flowchart = get_flowchart(db, flowchart_id)
    if flowchart is None:
        return None
    nodes = (
        db.query(models.FlowNode)
        .filter(models.FlowNode.flowchart_id == flowchart_id)
        .order_by(models.FlowNode.id.asc())
        .all()
    )
    edges = (
        db.query(models.FlowEdge)
        .filter(models.FlowEdge.flowchart_id == flowchart_id)
        .order_by(models.FlowEdge.id.asc())
        .all()
    )
    return schemas.FlowchartDetail(
        flowchart=flowchart_summary(db, flowchart),
        nodes=[node_read(node) for node in nodes],
        edges=[schemas.FlowEdgeRead.model_validate(edge) for edge in edges],
    )


def _validate_node_refs(db: Session, concept_id: int | None, child_flowchart_id: int | None) -> None:
    if concept_id is not None and crud.get_concept(db, concept_id) is None:
        raise ValueError("concept_id does not exist")
    if child_flowchart_id is not None and get_flowchart(db, child_flowchart_id) is None:
        raise ValueError("child_flowchart_id does not exist")


def create_flow_node(db: Session, flowchart: models.Flowchart, node_in: schemas.FlowNodeCreate) -> models.FlowNode:
    _validate_node_refs(db, node_in.concept_id, node_in.child_flowchart_id)
    node = models.FlowNode(flowchart_id=flowchart.id, **node_in.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def update_flow_node(db: Session, node: models.FlowNode, node_in: schemas.FlowNodeUpdate) -> models.FlowNode:
    changes = node_in.model_dump(exclude_unset=True)
    _validate_node_refs(db, changes.get("concept_id"), changes.get("child_flowchart_id"))
    for key, value in changes.items():
        if key in {"label", "description", "node_type"} and value is None:
            continue
        setattr(node, key, value)
    db.commit()
    db.refresh(node)
    return node


def delete_flow_node(db: Session, node: models.FlowNode) -> None:
    db.delete(node)  # incident flow edges cascade
    db.commit()


def create_child_flowchart(db: Session, node: models.FlowNode) -> models.Flowchart:
    """Return the node's detailed flowchart, creating an empty one if none exists."""
    if node.child_flowchart is not None:
        return node.child_flowchart
    parent = get_flowchart(db, node.flowchart_id)
    child = models.Flowchart(
        name=node.label,
        description=node.description,
        knowledge_space_id=parent.knowledge_space_id if parent else None,
        is_primary=False,
    )
    db.add(child)
    db.flush()
    node.child_flowchart_id = child.id
    db.commit()
    db.refresh(child)
    return child


def create_flow_edge(db: Session, flowchart: models.Flowchart, edge_in: schemas.FlowEdgeCreate) -> models.FlowEdge:
    source = get_flow_node(db, edge_in.source_node_id)
    target = get_flow_node(db, edge_in.target_node_id)
    if source is None or target is None:
        raise ValueError("source_node_id and target_node_id must exist")
    if source.flowchart_id != flowchart.id or target.flowchart_id != flowchart.id:
        raise ValueError("Flow edges can only connect nodes within the same flowchart")
    if source.id == target.id:
        raise ValueError("A flow edge cannot connect a node to itself")
    edge = models.FlowEdge(flowchart_id=flowchart.id, **edge_in.model_dump())
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


def update_flow_edge(db: Session, edge: models.FlowEdge, edge_in: schemas.FlowEdgeUpdate) -> models.FlowEdge:
    for key, value in edge_in.model_dump(exclude_unset=True).items():
        if key == "edge_type" and value is None:
            continue
        setattr(edge, key, value)
    db.commit()
    db.refresh(edge)
    return edge


def delete_flow_edge(db: Session, edge: models.FlowEdge) -> None:
    db.delete(edge)
    db.commit()
