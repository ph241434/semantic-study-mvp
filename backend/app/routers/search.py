from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[schemas.ConceptRead])
def search(q: str = Query(min_length=1), db: Session = Depends(get_db)):
    return crud.search_concepts(db, q)

