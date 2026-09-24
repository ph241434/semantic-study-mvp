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


def test_create_root_folder(client: TestClient, db_session: Session):
    response = client.post("/knowledge", json={"name": "Projects"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Projects"
    assert body["parent_id"] is None
    assert body["entry_type"] == "folder"
    assert db_session.query(models.KnowledgeEntry).filter_by(name="Projects").count() == 1


def test_create_nested_folders_and_assign_a_flowchart_arbitrarily_deep(client: TestClient):
    a = client.post("/knowledge", json={"name": "A"}).json()
    b = client.post("/knowledge", json={"name": "B", "parent_id": a["id"]}).json()
    c = client.post("/knowledge", json={"name": "C", "parent_id": b["id"]}).json()

    assert a["parent_id"] is None
    assert b["parent_id"] == a["id"]
    assert c["parent_id"] == b["id"]

    chart = client.post("/flowcharts", json={"name": "Nested chart", "folder_id": c["id"]})
    assert chart.status_code == 201
    assert chart.json()["folder_id"] == c["id"]

    by_name = {entry["name"]: entry for entry in client.get("/knowledge").json()}
    assert by_name["A"]["parent_id"] is None
    assert by_name["B"]["parent_id"] == a["id"]
    assert by_name["C"]["parent_id"] == b["id"]


def test_create_folder_rejects_a_missing_parent(client: TestClient):
    response = client.post("/knowledge", json={"name": "Orphan", "parent_id": 999})
    assert response.status_code == 400


def test_create_folder_rejects_a_non_folder_parent(client: TestClient, db_session: Session):
    concept = create_concept(db_session, schemas.ConceptCreate(name="Some Concept"))
    folder = models.KnowledgeEntry(parent_id=None, name="Area", entry_type="folder", sort_order=0)
    db_session.add(folder)
    db_session.flush()
    file_entry = models.KnowledgeEntry(
        parent_id=folder.id,
        name="Some Concept",
        entry_type="concept",
        concept_id=concept.id,
        sort_order=0,
    )
    db_session.add(file_entry)
    db_session.commit()

    response = client.post("/knowledge", json={"name": "Bad", "parent_id": file_entry.id})
    assert response.status_code == 400
