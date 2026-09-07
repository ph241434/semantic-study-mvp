from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..graph_service import get_local_graph


router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/{concept_id}", response_model=schemas.GraphResponse)
def get_graph(concept_id: int, depth: int = Query(default=1, ge=1, le=3), db: Session = Depends(get_db)):
    graph = get_local_graph(db, concept_id, depth)
    if graph is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return graph

