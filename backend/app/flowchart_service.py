"""Persistence and validation for directed flowcharts.

Every Flowchart is an arbitrary directed graph: merges (several edges into one node), branches (several edges out of
one node) and cycles are all valid. Nothing here assumes a tree or an acyclic graph.

Flow edges are local process structure and live in ``flow_edges``. They are never mirrored into the global semantic
``relationships`` table, and FlowNodes only *reference* Concepts, so neither is created, changed or deleted here.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import crud, models, schemas
from .crud import utc_now


# ---------------------------------------------------------------------------------------------------------------------
# Flowcharts
# ---------------------------------------------------------------------------------------------------------------------


def get_flowchart(db: Session, flowchart_id: int) -> models.Flowchart | None:
    return db.query(models.Flowchart).filter(models.Flowchart.id == flowchart_id).first()


def _require_folder(db: Session, folder_id: int | None) -> None:
    if folder_id is None:
        return
    entry = db.query(models.KnowledgeEntry).filter(models.KnowledgeEntry.id == folder_id).first()
    if entry is None:
        raise ValueError("folder_id does not exist")
    if entry.entry_type != "folder":
        raise ValueError("folder_id must refer to a folder")


def _counts(db: Session) -> tuple[dict[int, int], dict[int, int], dict[int, int]]:
    """Per-flowchart (nodes, edges, times used as some node's detailed flowchart)."""
    node_counts = dict(
        db.query(models.FlowNode.flowchart_id, func.count(models.FlowNode.id)).group_by(models.FlowNode.flowchart_id).all()
    )
    edge_counts = dict(
        db.query(models.FlowEdge.flowchart_id, func.count(models.FlowEdge.id)).group_by(models.FlowEdge.flowchart_id).all()
    )
    used_by_counts = dict(
        db.query(models.FlowNode.child_flowchart_id, func.count(models.FlowNode.id))
        .filter(models.FlowNode.child_flowchart_id.is_not(None))
        .group_by(models.FlowNode.child_flowchart_id)
        .all()
    )
    return node_counts, edge_counts, used_by_counts


def _read(flowchart: models.Flowchart, counts) -> schemas.FlowchartRead:
    node_counts, edge_counts, used_by_counts = counts
    return schemas.FlowchartRead.model_validate(flowchart).model_copy(
        update={
            "node_count": node_counts.get(flowchart.id, 0),
            "edge_count": edge_counts.get(flowchart.id, 0),
            "used_by_count": used_by_counts.get(flowchart.id, 0),
        }
    )


def flowchart_read(db: Session, flowchart: models.Flowchart) -> schemas.FlowchartRead:
    return _read(flowchart, _counts(db))


def list_flowcharts(db: Session, folder_id: int | None = None) -> list[schemas.FlowchartRead]:
    query = db.query(models.Flowchart)
    if folder_id is not None:
        query = query.filter(models.Flowchart.folder_id == folder_id)
    flowcharts = query.order_by(models.Flowchart.id.asc()).all()
    counts = _counts(db)
    return [_read(flowchart, counts) for flowchart in flowcharts]


def create_flowchart(db: Session, flowchart_in: schemas.FlowchartCreate) -> models.Flowchart:
    _require_folder(db, flowchart_in.folder_id)
    flowchart = models.Flowchart(**flowchart_in.model_dump())
    db.add(flowchart)
    db.commit()
    db.refresh(flowchart)
    return flowchart


def update_flowchart(
    db: Session, flowchart: models.Flowchart, flowchart_in: schemas.FlowchartUpdate
) -> models.Flowchart:
    changes = flowchart_in.model_dump(exclude_unset=True)
    if "folder_id" in changes:
        _require_folder(db, changes["folder_id"])
    for key, value in changes.items():
        if key in {"name", "description"} and value is None:
            continue
        setattr(flowchart, key, value)
    flowchart.updated_at = utc_now()
    db.commit()
    db.refresh(flowchart)
    return flowchart


def delete_flowchart(db: Session, flowchart: models.Flowchart) -> None:
    """Delete the flowchart with its own nodes and edges.

    Nodes elsewhere that opened this flowchart keep existing and simply lose their detailed view. Concepts, their
    semantic relationships and all other flowcharts are untouched.
    """
    db.query(models.FlowNode).filter(models.FlowNode.child_flowchart_id == flowchart.id).update(
        {"child_flowchart_id": None}, synchronize_session=False
    )
    db.expire_all()
    db.delete(flowchart)
    db.commit()


def clear_manual_positions(db: Session, flowchart: models.Flowchart) -> None:
    """Forget every hand-placed node position so the next display uses the automatic layout ("Reorganize")."""
    db.query(models.FlowNode).filter(models.FlowNode.flowchart_id == flowchart.id).update(
        {"x": None, "y": None}, synchronize_session=False
    )
    db.commit()


def get_flowchart_detail(db: Session, flowchart_id: int) -> schemas.FlowchartDetail | None:
    """The whole flowchart (flowchart + nodes + edges) in one response, without a per-node query."""
    flowchart = get_flowchart(db, flowchart_id)
    if flowchart is None:
        return None
    nodes = (
        db.query(models.FlowNode)
        .options(joinedload(models.FlowNode.concept), joinedload(models.FlowNode.child_flowchart))
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
        flowchart=flowchart_read(db, flowchart),
        nodes=[flow_node_read(node) for node in nodes],
        edges=[schemas.FlowEdgeRead.model_validate(edge) for edge in edges],
    )


# ---------------------------------------------------------------------------------------------------------------------
# Flow nodes
# ---------------------------------------------------------------------------------------------------------------------


def get_flow_node(db: Session, node_id: int) -> models.FlowNode | None:
    return db.query(models.FlowNode).filter(models.FlowNode.id == node_id).first()


def flow_node_read(node: models.FlowNode) -> schemas.FlowNodeRead:
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
        x=node.x,
        y=node.y,
    )


def detailed_flowchart_ids(db: Session, flowchart_id: int) -> set[int]:
    """Every flowchart reachable from ``flowchart_id`` by following node -> child flowchart links (excluding itself
    unless a cycle already exists)."""
    children: dict[int, set[int]] = {}
    for parent_id, child_id in (
        db.query(models.FlowNode.flowchart_id, models.FlowNode.child_flowchart_id)
        .filter(models.FlowNode.child_flowchart_id.is_not(None))
        .all()
    ):
        children.setdefault(parent_id, set()).add(child_id)

    seen: set[int] = set()
    stack = list(children.get(flowchart_id, ()))
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(children.get(current, ()))
    return seen


def _validate_node_references(
    db: Session, flowchart_id: int, concept_id: int | None, child_flowchart_id: int | None
) -> None:
    if concept_id is not None and crud.get_concept(db, concept_id) is None:
        raise ValueError("concept_id does not exist")
    if child_flowchart_id is None:
        return
    if get_flowchart(db, child_flowchart_id) is None:
        raise ValueError("child_flowchart_id does not exist")
    # The process graph inside a flowchart may loop freely, but a chain of "detailed flowchart" links must not
    # loop back on itself: A -> node -> A, or A -> B -> A, would never bottom out.
    if child_flowchart_id == flowchart_id:
        raise ValueError("a flowchart cannot be the detailed flowchart of one of its own nodes")
    if flowchart_id in detailed_flowchart_ids(db, child_flowchart_id):
        raise ValueError("child_flowchart_id would create a circular chain of detailed flowcharts")


def create_flow_node(db: Session, flowchart: models.Flowchart, node_in: schemas.FlowNodeCreate) -> models.FlowNode:
    _validate_node_references(db, flowchart.id, node_in.concept_id, node_in.child_flowchart_id)
    node = models.FlowNode(flowchart_id=flowchart.id, **node_in.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def update_flow_node(db: Session, node: models.FlowNode, node_in: schemas.FlowNodeUpdate) -> models.FlowNode:
    changes = node_in.model_dump(exclude_unset=True)
    _validate_node_references(
        db,
        node.flowchart_id,
        changes.get("concept_id"),
        changes.get("child_flowchart_id"),
    )
    for key, value in changes.items():
        if key in {"label", "description", "node_type"} and value is None:
            continue  # required columns cannot be cleared
        setattr(node, key, value)
    node.updated_at = utc_now()
    db.commit()
    db.refresh(node)
    return node


def delete_flow_node(db: Session, node: models.FlowNode) -> None:
    """Delete the node and its incident flow edges. The referenced Concept and child flowchart are left alone."""
    db.delete(node)
    db.commit()


# ---------------------------------------------------------------------------------------------------------------------
# Flow edges
# ---------------------------------------------------------------------------------------------------------------------


def get_flow_edge(db: Session, edge_id: int) -> models.FlowEdge | None:
    return db.query(models.FlowEdge).filter(models.FlowEdge.id == edge_id).first()


def create_flow_edge(db: Session, flowchart: models.Flowchart, edge_in: schemas.FlowEdgeCreate) -> models.FlowEdge:
    source = get_flow_node(db, edge_in.source_node_id)
    target = get_flow_node(db, edge_in.target_node_id)
    if source is None or target is None:
        raise ValueError("source_node_id and target_node_id must both exist")
    if source.flowchart_id != flowchart.id or target.flowchart_id != flowchart.id:
        raise ValueError("source and target nodes must belong to this flowchart")
    if source.id == target.id:
        raise ValueError("source and target nodes must be different")

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
    edge.updated_at = utc_now()
    db.commit()
    db.refresh(edge)
    return edge


def delete_flow_edge(db: Session, edge: models.FlowEdge) -> None:
    db.delete(edge)
    db.commit()
