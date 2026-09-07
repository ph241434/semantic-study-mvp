from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db
from ..serializers import relationship_read


router = APIRouter(prefix="/relationships", tags=["relationships"])


@router.get("", response_model=list[schemas.RelationshipRead])
def get_relationships(db: Session = Depends(get_db)):
    return [relationship_read(item) for item in crud.list_relationships(db)]


@router.post("", response_model=schemas.RelationshipRead, status_code=status.HTTP_201_CREATED)
def post_relationship(relationship_in: schemas.RelationshipCreate, db: Session = Depends(get_db)):
    try:
        return relationship_read(crud.create_relationship(db, relationship_in))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{relationship_id}", response_model=schemas.RelationshipRead)
def patch_relationship(
    relationship_id: int,
    relationship_in: schemas.RelationshipUpdate,
    db: Session = Depends(get_db),
):
    relationship = crud.get_relationship(db, relationship_id)
    if relationship is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    try:
        return relationship_read(crud.update_relationship(db, relationship, relationship_in))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_relationship(relationship_id: int, db: Session = Depends(get_db)):
    relationship = crud.get_relationship(db, relationship_id)
    if relationship is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    crud.delete_relationship(db, relationship)
    return None

