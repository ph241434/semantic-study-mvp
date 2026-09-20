from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db


router = APIRouter(prefix="/concepts", tags=["concepts"])


@router.get("", response_model=list[schemas.ConceptRead])
def get_concepts(db: Session = Depends(get_db)):
    return crud.list_concepts(db)


@router.post("", response_model=schemas.ConceptRead, status_code=status.HTTP_201_CREATED)
def post_concept(concept_in: schemas.ConceptCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_concept(db, concept_in)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A concept with that name already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{concept_id}", response_model=schemas.ConceptRead)
def get_concept(concept_id: int, db: Session = Depends(get_db)):
    concept = crud.get_concept(db, concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return concept


@router.patch("/{concept_id}", response_model=schemas.ConceptRead)
def patch_concept(concept_id: int, concept_in: schemas.ConceptUpdate, db: Session = Depends(get_db)):
    concept = crud.get_concept(db, concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    try:
        return crud.update_concept(db, concept, concept_in)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A concept with that name already exists") from exc


@router.delete("/{concept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concept(concept_id: int, db: Session = Depends(get_db)):
    concept = crud.get_concept(db, concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    crud.delete_concept(db, concept)
    return None

