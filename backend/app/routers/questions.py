from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("", response_model=list[schemas.QuestionRead])
def get_questions(db: Session = Depends(get_db)):
    return crud.list_questions(db)


@router.post("", response_model=schemas.QuestionRead, status_code=status.HTTP_201_CREATED)
def post_question(question_in: schemas.QuestionCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_question(db, question_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

