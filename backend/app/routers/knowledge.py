from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[schemas.KnowledgeEntryRead])
def get_knowledge_entries(db: Session = Depends(get_db)):
    return crud.list_knowledge_entries(db)
