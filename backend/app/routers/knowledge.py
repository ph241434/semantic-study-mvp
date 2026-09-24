from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[schemas.KnowledgeEntryRead])
def get_knowledge_entries(db: Session = Depends(get_db)):
    return crud.list_knowledge_entries(db)


@router.post("", response_model=schemas.KnowledgeEntryRead, status_code=status.HTTP_201_CREATED)
def post_knowledge_entry(entry_in: schemas.KnowledgeEntryCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_knowledge_entry(db, entry_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
