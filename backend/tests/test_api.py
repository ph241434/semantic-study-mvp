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


def test_knowledge_hierarchy_routes_keep_cross_topic_boundary_concepts(client: TestClient):
    space = client.post("/knowledge-spaces", json={"name": "Computer Science"}).json()
    algorithms = client.post(
        "/topics",
        json={"knowledge_space_id": space["id"], "name": "Algorithms"},
    ).json()
    data_structures = client.post(
        "/topics",
        json={"knowledge_space_id": space["id"], "name": "Data Structures"},
    ).json()
    dijkstra = client.post(
        "/concepts",
        json={"name": "Dijkstra", "concept_type": "algorithm", "topic_id": algorithms["id"]},
    ).json()
    heap = client.post(
        "/concepts",
        json={"name": "Binary Heap", "concept_type": "mechanism", "topic_id": data_structures["id"]},
    ).json()
    client.post(
        "/relationships",
        json={
            "source_concept_id": dijkstra["id"],
            "target_concept_id": heap["id"],
            "relationship_type": "USES",
        },
    )

    home = client.get("/knowledge/home").json()
    assert [item["name"] for item in home["spaces"]] == ["Computer Science"]

    space_graph = client.get(f"/knowledge/spaces/{space['id']}").json()
    assert {topic["name"] for topic in space_graph["topics"]} == {"Algorithms", "Data Structures"}
    assert space_graph["topic_connections"] == [
        {
            "source_topic_id": algorithms["id"],
            "target_topic_id": data_structures["id"],
            "relationship_count": 1,
            "relationship_types": ["USES"],
        }
    ]

    topic_graph = client.get(f"/knowledge/topics/{algorithms['id']}").json()
    assert [concept["name"] for concept in topic_graph["concepts"]] == ["Dijkstra"]
    assert [item["concept"]["name"] for item in topic_graph["boundary_concepts"]] == ["Binary Heap"]
    assert topic_graph["boundary_concepts"][0]["topic"]["name"] == "Data Structures"
    assert [relationship["relationship_type"] for relationship in topic_graph["relationships"]] == ["USES"]

    search = client.get("/knowledge/search?q=Dijkstra").json()
    assert search[0]["entity_type"] == "concept"
    assert search[0]["path"] == ["Computer Science", "Algorithms", "Dijkstra"]

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

