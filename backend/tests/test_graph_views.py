from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import create_concept


def make_concept(db_session: Session, name: str):
    return create_concept(db_session, schemas.ConceptCreate(name=name))


def test_create_graph_view_appears_in_list_for_root(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "Asymmetric Encryption")

    response = client.post("/graph-views", json={"root_concept_id": concept.id, "name": "Encryption Flow"})
    assert response.status_code == 201
    view = response.json()
    assert view["root_concept_id"] == concept.id
    assert view["name"] == "Encryption Flow"

    listing = client.get(f"/graph-views?root_concept_id={concept.id}")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()] == [view["id"]]


def test_add_concept_backed_node_returns_node_with_concept_id(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    public_key = make_concept(db_session, "Public Key")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()

    response = client.post(
        f"/graph-views/{view['id']}/nodes",
        json={"concept_id": public_key.id, "label": "Public Key", "x": 100.0, "y": 50.0},
    )

    assert response.status_code == 200
    node = response.json()
    assert node["concept_id"] == public_key.id
    assert node["node_type"] == "concept"
    assert node["x"] == 100.0
    assert node["y"] == 50.0


def test_add_view_only_node_has_null_concept_id_and_note_type(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()

    response = client.post(
        f"/graph-views/{view['id']}/nodes",
        json={"concept_id": None, "label": "Encrypt", "x": 10.0, "y": 20.0},
    )

    assert response.status_code == 200
    node = response.json()
    assert node["concept_id"] is None
    assert node["node_type"] == "note"
    assert node["label"] == "Encrypt"


def test_patch_node_position_is_reflected_on_get_view_detail(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    node = client.post(
        f"/graph-views/{view['id']}/nodes", json={"concept_id": None, "label": "Message", "x": 0.0, "y": 0.0}
    ).json()

    patch_response = client.patch(f"/graph-view-nodes/{node['id']}", json={"x": 250.0, "y": 175.0})
    assert patch_response.status_code == 200
    assert patch_response.json()["x"] == 250.0
    assert patch_response.json()["y"] == 175.0

    detail = client.get(f"/graph-views/{view['id']}").json()
    assert detail["nodes"][0]["x"] == 250.0
    assert detail["nodes"][0]["y"] == 175.0


def test_create_then_delete_edge_removes_it_from_detail(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    node_a = client.post(
        f"/graph-views/{view['id']}/nodes", json={"concept_id": None, "label": "Message", "x": 0, "y": 0}
    ).json()
    node_b = client.post(
        f"/graph-views/{view['id']}/nodes", json={"concept_id": None, "label": "Encrypt", "x": 100, "y": 0}
    ).json()

    edge_response = client.post(
        f"/graph-views/{view['id']}/edges",
        json={"source_view_node_id": node_a["id"], "target_view_node_id": node_b["id"], "label": "flows to"},
    )
    assert edge_response.status_code == 201
    edge = edge_response.json()

    detail = client.get(f"/graph-views/{view['id']}").json()
    assert len(detail["edges"]) == 1

    delete_response = client.delete(f"/graph-view-edges/{edge['id']}")
    assert delete_response.status_code == 204

    detail_after = client.get(f"/graph-views/{view['id']}").json()
    assert detail_after["edges"] == []


def test_delete_node_removes_only_its_own_edges(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    a = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "A", "x": 0, "y": 0}).json()
    b = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "B", "x": 100, "y": 0}).json()
    c = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "C", "x": 200, "y": 0}).json()

    client.post(
        f"/graph-views/{view['id']}/edges",
        json={"source_view_node_id": a["id"], "target_view_node_id": b["id"]},
    )
    surviving_edge = client.post(
        f"/graph-views/{view['id']}/edges",
        json={"source_view_node_id": b["id"], "target_view_node_id": c["id"]},
    ).json()

    delete_response = client.delete(f"/graph-view-nodes/{a['id']}")
    assert delete_response.status_code == 204

    assert db_session.query(models.GraphViewEdge).count() == 1
    remaining = db_session.query(models.GraphViewEdge).one()
    assert remaining.id == surviving_edge["id"]
    assert db_session.query(models.GraphViewNode).count() == 2


def test_delete_view_cascades_nodes_and_edges(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    a = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "A", "x": 0, "y": 0}).json()
    b = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "B", "x": 100, "y": 0}).json()
    client.post(
        f"/graph-views/{view['id']}/edges",
        json={"source_view_node_id": a["id"], "target_view_node_id": b["id"]},
    )

    delete_response = client.delete(f"/graph-views/{view['id']}")
    assert delete_response.status_code == 204

    assert db_session.query(models.GraphView).count() == 0
    assert db_session.query(models.GraphViewNode).count() == 0
    assert db_session.query(models.GraphViewEdge).count() == 0


def test_list_graph_views_scoped_to_root_concept_excludes_other_concepts(client: TestClient, db_session: Session):
    concept_a = make_concept(db_session, "Asymmetric Encryption")
    concept_b = make_concept(db_session, "Symmetric Encryption")
    view_a = client.post("/graph-views", json={"root_concept_id": concept_a.id, "name": "Overview A"}).json()
    client.post("/graph-views", json={"root_concept_id": concept_b.id, "name": "Overview B"})

    listing = client.get(f"/graph-views?root_concept_id={concept_a.id}").json()
    assert [item["id"] for item in listing] == [view_a["id"]]


def test_add_same_concept_twice_is_idempotent_not_error(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    public_key = make_concept(db_session, "Public Key")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()

    first = client.post(
        f"/graph-views/{view['id']}/nodes",
        json={"concept_id": public_key.id, "label": "Public Key", "x": 10, "y": 10},
    ).json()
    second = client.post(
        f"/graph-views/{view['id']}/nodes",
        json={"concept_id": public_key.id, "label": "Public Key", "x": 999, "y": 999},
    ).json()

    assert first["id"] == second["id"]
    assert second["x"] == 10
    assert (
        db_session.query(models.GraphViewNode)
        .filter(models.GraphViewNode.graph_view_id == view["id"], models.GraphViewNode.concept_id == public_key.id)
        .count()
        == 1
    )


def test_multiple_views_can_exist_for_same_root_concept(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view_a = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Encryption Flow"}).json()
    view_b = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Signature Flow"}).json()

    client.post(f"/graph-views/{view_a['id']}/nodes", json={"label": "A-only node", "x": 0, "y": 0})
    client.post(f"/graph-views/{view_b['id']}/nodes", json={"label": "B-only node", "x": 0, "y": 0})

    detail_a = client.get(f"/graph-views/{view_a['id']}").json()
    detail_b = client.get(f"/graph-views/{view_b['id']}").json()

    assert [n["label"] for n in detail_a["nodes"]] == ["A-only node"]
    assert [n["label"] for n in detail_b["nodes"]] == ["B-only node"]


def test_editing_personal_graph_does_not_mutate_concept_or_relationship_tables(
    client: TestClient, db_session: Session
):
    root = make_concept(db_session, "Asymmetric Encryption")
    public_key = make_concept(db_session, "Public Key")
    concepts_before = [(c.id, c.name, c.updated_at) for c in db_session.query(models.Concept).all()]
    relationships_before = db_session.query(models.Relationship).count()

    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    node = client.post(
        f"/graph-views/{view['id']}/nodes",
        json={"concept_id": public_key.id, "label": "Public Key", "x": 0, "y": 0},
    ).json()
    other = client.post(f"/graph-views/{view['id']}/nodes", json={"label": "Note", "x": 10, "y": 10}).json()
    client.post(
        f"/graph-views/{view['id']}/edges",
        json={"source_view_node_id": node["id"], "target_view_node_id": other["id"]},
    )
    client.delete(f"/graph-view-nodes/{other['id']}")

    db_session.expire_all()
    concepts_after = [(c.id, c.name, c.updated_at) for c in db_session.query(models.Concept).all()]
    relationships_after = db_session.query(models.Relationship).count()

    assert concepts_after == concepts_before
    assert relationships_after == relationships_before


def test_404_on_unknown_view_node_and_edge(client: TestClient):
    assert client.get("/graph-views/999").status_code == 404
    assert client.patch("/graph-view-nodes/999", json={"x": 1}).status_code == 404
    assert client.delete("/graph-view-nodes/999").status_code == 404
    assert client.patch("/graph-view-edges/999", json={"label": "x"}).status_code == 404
    assert client.delete("/graph-view-edges/999").status_code == 404


def test_edge_rejects_self_loop_and_cross_view_nodes(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view_a = client.post("/graph-views", json={"root_concept_id": root.id, "name": "A"}).json()
    view_b = client.post("/graph-views", json={"root_concept_id": root.id, "name": "B"}).json()
    node_a = client.post(f"/graph-views/{view_a['id']}/nodes", json={"label": "A1", "x": 0, "y": 0}).json()
    node_b = client.post(f"/graph-views/{view_b['id']}/nodes", json={"label": "B1", "x": 0, "y": 0}).json()

    self_loop = client.post(
        f"/graph-views/{view_a['id']}/edges",
        json={"source_view_node_id": node_a["id"], "target_view_node_id": node_a["id"]},
    )
    assert self_loop.status_code == 400

    cross_view = client.post(
        f"/graph-views/{view_a['id']}/edges",
        json={"source_view_node_id": node_a["id"], "target_view_node_id": node_b["id"]},
    )
    assert cross_view.status_code == 400
