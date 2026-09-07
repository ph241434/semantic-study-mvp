from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import schemas
from app.crud import create_concept, create_relationship
from app.graph_service import get_local_graph
from app.mastery import get_weakest_relationships
from app.models import Relationship


def test_concept_creation(client: TestClient):
    response = client.post(
        "/concepts",
        json={
            "name": "Hash Table",
            "description": "Associative array implemented with hashing.",
            "concept_type": "definition",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Hash Table"
    assert body["mastery_score"] == 0.0


def test_relationship_creation(client: TestClient):
    source = client.post("/concepts", json={"name": "Hash Table", "concept_type": "definition"}).json()
    target = client.post("/concepts", json={"name": "Hash Function", "concept_type": "mechanism"}).json()

    response = client.post(
        "/relationships",
        json={
            "source_concept_id": source["id"],
            "target_concept_id": target["id"],
            "relationship_type": "USES",
            "description": "A hash table uses a hash function to map keys.",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["source_name"] == "Hash Table"
    assert body["target_name"] == "Hash Function"
    assert body["relationship_type"] == "USES"


def test_graph_traversal_returns_local_neighborhood(db_session: Session):
    graph_theory = create_concept(db_session, schemas.ConceptCreate(name="Graph Theory"))
    dijkstra = create_concept(db_session, schemas.ConceptCreate(name="Dijkstra's Algorithm", concept_type="algorithm"))
    weights = create_concept(db_session, schemas.ConceptCreate(name="Nonnegative Edge Weights", concept_type="property"))
    heap = create_concept(db_session, schemas.ConceptCreate(name="Binary Heap", concept_type="mechanism"))
    create_relationship(
        db_session,
        schemas.RelationshipCreate(
            source_concept_id=dijkstra.id,
            target_concept_id=weights.id,
            relationship_type="REQUIRES",
        ),
    )
    create_relationship(
        db_session,
        schemas.RelationshipCreate(
            source_concept_id=dijkstra.id,
            target_concept_id=graph_theory.id,
            relationship_type="PART_OF",
        ),
    )

    graph = get_local_graph(db_session, dijkstra.id, depth=1)

    assert graph is not None
    assert {node.name for node in graph.nodes} == {
        "Dijkstra's Algorithm",
        "Graph Theory",
        "Nonnegative Edge Weights",
    }
    assert len(graph.relationships) == 2
    assert heap.id not in {node.id for node in graph.nodes}


def test_weak_relationship_detection(db_session: Session):
    dijkstra = create_concept(db_session, schemas.ConceptCreate(name="Dijkstra's Algorithm", concept_type="algorithm"))
    weights = create_concept(db_session, schemas.ConceptCreate(name="Nonnegative Edge Weights", concept_type="property"))
    relationship = Relationship(
        source_concept_id=dijkstra.id,
        target_concept_id=weights.id,
        relationship_type="REQUIRES",
        mastery_score=0.12,
    )
    db_session.add(relationship)
    db_session.commit()

    weakest = get_weakest_relationships(db_session, limit=1)

    assert weakest[0].relationship_type == "REQUIRES"
    assert weakest[0].mastery_score == 0.12

