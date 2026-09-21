from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import flowchart_service as service
from .. import schemas
from ..database import get_db


router = APIRouter(tags=["flowcharts"])


def _flowchart_or_404(db: Session, flowchart_id: int):
    flowchart = service.get_flowchart(db, flowchart_id)
    if flowchart is None:
        raise HTTPException(status_code=404, detail="Flowchart not found")
    return flowchart


def _node_or_404(db: Session, node_id: int):
    node = service.get_flow_node(db, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Flow node not found")
    return node


def _edge_or_404(db: Session, edge_id: int):
    edge = service.get_flow_edge(db, edge_id)
    if edge is None:
        raise HTTPException(status_code=404, detail="Flow edge not found")
    return edge


@router.get("/flowcharts", response_model=list[schemas.FlowchartRead])
def get_flowcharts(folder_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    return service.list_flowcharts(db, folder_id)


@router.post("/flowcharts", response_model=schemas.FlowchartRead, status_code=status.HTTP_201_CREATED)
def post_flowchart(flowchart_in: schemas.FlowchartCreate, db: Session = Depends(get_db)):
    try:
        flowchart = service.create_flowchart(db, flowchart_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return service.flowchart_read(db, flowchart)


@router.get("/flowcharts/{flowchart_id}", response_model=schemas.FlowchartDetail)
def get_flowchart(flowchart_id: int, db: Session = Depends(get_db)):
    detail = service.get_flowchart_detail(db, flowchart_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Flowchart not found")
    return detail


@router.patch("/flowcharts/{flowchart_id}", response_model=schemas.FlowchartRead)
def patch_flowchart(flowchart_id: int, flowchart_in: schemas.FlowchartUpdate, db: Session = Depends(get_db)):
    flowchart = _flowchart_or_404(db, flowchart_id)
    try:
        flowchart = service.update_flowchart(db, flowchart, flowchart_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return service.flowchart_read(db, flowchart)


@router.delete("/flowcharts/{flowchart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flowchart(flowchart_id: int, db: Session = Depends(get_db)):
    service.delete_flowchart(db, _flowchart_or_404(db, flowchart_id))
    return None


@router.post("/flowcharts/{flowchart_id}/reorganize", status_code=status.HTTP_204_NO_CONTENT)
def reorganize_flowchart(flowchart_id: int, db: Session = Depends(get_db)):
    service.clear_manual_positions(db, _flowchart_or_404(db, flowchart_id))
    return None


@router.post(
    "/flowcharts/{flowchart_id}/nodes",
    response_model=schemas.FlowNodeRead,
    status_code=status.HTTP_201_CREATED,
)
def post_flow_node(flowchart_id: int, node_in: schemas.FlowNodeCreate, db: Session = Depends(get_db)):
    flowchart = _flowchart_or_404(db, flowchart_id)
    try:
        return service.flow_node_read(service.create_flow_node(db, flowchart, node_in))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/flow-nodes/{node_id}", response_model=schemas.FlowNodeRead)
def patch_flow_node(node_id: int, node_in: schemas.FlowNodeUpdate, db: Session = Depends(get_db)):
    node = _node_or_404(db, node_id)
    try:
        return service.flow_node_read(service.update_flow_node(db, node, node_in))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/flow-nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flow_node(node_id: int, db: Session = Depends(get_db)):
    service.delete_flow_node(db, _node_or_404(db, node_id))
    return None


@router.post(
    "/flowcharts/{flowchart_id}/edges",
    response_model=schemas.FlowEdgeRead,
    status_code=status.HTTP_201_CREATED,
)
def post_flow_edge(flowchart_id: int, edge_in: schemas.FlowEdgeCreate, db: Session = Depends(get_db)):
    flowchart = _flowchart_or_404(db, flowchart_id)
    try:
        return service.create_flow_edge(db, flowchart, edge_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/flow-edges/{edge_id}", response_model=schemas.FlowEdgeRead)
def patch_flow_edge(edge_id: int, edge_in: schemas.FlowEdgeUpdate, db: Session = Depends(get_db)):
    return service.update_flow_edge(db, _edge_or_404(db, edge_id), edge_in)


@router.delete("/flow-edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flow_edge(edge_id: int, db: Session = Depends(get_db)):
    service.delete_flow_edge(db, _edge_or_404(db, edge_id))
    return None
