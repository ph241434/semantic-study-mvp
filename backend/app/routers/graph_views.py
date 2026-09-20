from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(tags=["graph-views"])


@router.get("/graph-views", response_model=list[schemas.GraphViewRead])
def get_graph_views(root_concept_id: int = Query(...), db: Session = Depends(get_db)):
    return crud.list_graph_views(db, root_concept_id)


@router.post("/graph-views", response_model=schemas.GraphViewRead, status_code=status.HTTP_201_CREATED)
def post_graph_view(view_in: schemas.GraphViewCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_graph_view(db, view_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/graph-views/{view_id}", response_model=schemas.GraphViewDetail)
def get_graph_view(view_id: int, db: Session = Depends(get_db)):
    view = crud.get_graph_view(db, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Graph view not found")
    return view


@router.patch("/graph-views/{view_id}", response_model=schemas.GraphViewRead)
def patch_graph_view(view_id: int, view_in: schemas.GraphViewUpdate, db: Session = Depends(get_db)):
    view = crud.get_graph_view(db, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Graph view not found")
    return crud.update_graph_view(db, view, view_in)


@router.delete("/graph-views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_graph_view(view_id: int, db: Session = Depends(get_db)):
    view = crud.get_graph_view(db, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Graph view not found")
    crud.delete_graph_view(db, view)
    return None


@router.post("/graph-views/{view_id}/nodes", response_model=schemas.GraphViewNodeRead)
def post_graph_view_node(view_id: int, node_in: schemas.GraphViewNodeCreate, db: Session = Depends(get_db)):
    view = crud.get_graph_view(db, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Graph view not found")
    try:
        return crud.add_node_to_view(db, view, node_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/graph-view-nodes/{node_id}", response_model=schemas.GraphViewNodeRead)
def patch_graph_view_node(node_id: int, node_in: schemas.GraphViewNodeUpdate, db: Session = Depends(get_db)):
    node = crud.get_graph_view_node(db, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Graph view node not found")
    return crud.update_graph_view_node(db, node, node_in)


@router.delete("/graph-view-nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_graph_view_node(node_id: int, db: Session = Depends(get_db)):
    node = crud.get_graph_view_node(db, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Graph view node not found")
    crud.delete_graph_view_node(db, node)
    return None


@router.post("/graph-views/{view_id}/edges", response_model=schemas.GraphViewEdgeRead, status_code=status.HTTP_201_CREATED)
def post_graph_view_edge(view_id: int, edge_in: schemas.GraphViewEdgeCreate, db: Session = Depends(get_db)):
    view = crud.get_graph_view(db, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Graph view not found")
    try:
        return crud.create_graph_view_edge(db, view, edge_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/graph-view-edges/{edge_id}", response_model=schemas.GraphViewEdgeRead)
def patch_graph_view_edge(edge_id: int, edge_in: schemas.GraphViewEdgeUpdate, db: Session = Depends(get_db)):
    edge = crud.get_graph_view_edge(db, edge_id)
    if edge is None:
        raise HTTPException(status_code=404, detail="Graph view edge not found")
    return crud.update_graph_view_edge(db, edge, edge_in)


@router.delete("/graph-view-edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_graph_view_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = crud.get_graph_view_edge(db, edge_id)
    if edge is None:
        raise HTTPException(status_code=404, detail="Graph view edge not found")
    crud.delete_graph_view_edge(db, edge)
    return None
