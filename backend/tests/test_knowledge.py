from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import create_concept


def test_knowledge_endpoint_returns_flat_entry_list(client: TestClient, db_session: Session):
    concept = create_concept(db_session, schemas.ConceptCreate(name="Test Concept"))
    folder = models.KnowledgeEntry(parent_id=None, name="Area", entry_type="folder", sort_order=0)
    db_session.add(folder)
    db_session.flush()
    file_entry = models.KnowledgeEntry(
        parent_id=folder.id,
        name="Test Concept",
        entry_type="concept",
        concept_id=concept.id,
        sort_order=0,
    )
    db_session.add(file_entry)
    db_session.commit()

    response = client.get("/knowledge")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2

    folder_json = next(entry for entry in body if entry["entry_type"] == "folder")
    assert folder_json["parent_id"] is None
    assert folder_json["concept_id"] is None
    assert folder_json["name"] == "Area"

    file_json = next(entry for entry in body if entry["entry_type"] == "concept")
    assert file_json["parent_id"] == folder.id
    assert file_json["concept_id"] == concept.id
    assert file_json["name"] == "Test Concept"
