from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db
from ..knowledge_service import get_home_graph, get_space_graph, get_topic_graph, search_knowledge


router = APIRouter(tags=["knowledge"])


@router.get("/knowledge/home", response_model=schemas.KnowledgeHomeResponse)
def knowledge_home(db: Session = Depends(get_db)):
    return get_home_graph(db)


@router.get("/knowledge/spaces/{space_id}", response_model=schemas.KnowledgeSpaceGraphResponse)
def knowledge_space_graph(space_id: int, db: Session = Depends(get_db)):
    graph = get_space_graph(db, space_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="Knowledge space not found")
    return graph


@router.get("/knowledge/topics/{topic_id}", response_model=schemas.TopicGraphResponse)
def knowledge_topic_graph(topic_id: int, db: Session = Depends(get_db)):
    graph = get_topic_graph(db, topic_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    return graph


@router.get("/knowledge/search", response_model=list[schemas.KnowledgeSearchResult])
def knowledge_search(q: str = Query(min_length=1), db: Session = Depends(get_db)):
    return search_knowledge(db, q)


@router.get("/knowledge-spaces", response_model=list[schemas.KnowledgeSpaceRead])
def list_knowledge_spaces(db: Session = Depends(get_db)):
    return crud.list_knowledge_spaces(db)


@router.post("/knowledge-spaces", response_model=schemas.KnowledgeSpaceRead, status_code=status.HTTP_201_CREATED)
def create_knowledge_space(space_in: schemas.KnowledgeSpaceCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_knowledge_space(db, space_in)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A knowledge space with that name already exists") from exc


@router.get("/topics", response_model=list[schemas.TopicRead])
def list_topics(knowledge_space_id: int | None = None, db: Session = Depends(get_db)):
    return crud.list_topics(db, knowledge_space_id)


@router.post("/topics", response_model=schemas.TopicRead, status_code=status.HTTP_201_CREATED)
def create_topic(topic_in: schemas.TopicCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_topic(db, topic_in)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A topic with that name already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
