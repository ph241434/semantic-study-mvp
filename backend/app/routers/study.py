from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..study_service import get_due_questions, get_or_create_reconstruction, record_review


router = APIRouter(prefix="/study", tags=["study"])


@router.get("/due", response_model=list[schemas.QuestionRead])
def get_study_due(limit: int = Query(default=12, ge=1, le=50), db: Session = Depends(get_db)):
    return get_due_questions(db, limit)


@router.post("/review", response_model=schemas.ReviewResponse)
def post_review(review_in: schemas.ReviewAttemptCreate, db: Session = Depends(get_db)):
    try:
        return record_review(db, review_in)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/reconstruction/{concept_id}", response_model=schemas.ReconstructionResponse)
def get_reconstruction(
    concept_id: int,
    depth: int = Query(default=1, ge=1, le=3),
    db: Session = Depends(get_db),
):
    reconstruction = get_or_create_reconstruction(db, concept_id, depth)
    if reconstruction is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return reconstruction

