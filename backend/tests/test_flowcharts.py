from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import create_concept, create_relationship


def make_concept(db_session: Session, name: str, description: str = ""):
    return create_concept(db_session, schemas.ConceptCreate(name=name, description=description))


def make_flowchart(client: TestClient, name: str = "Chart", **extra) -> dict:
    response = client.post("/flowcharts", json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def make_node(client: TestClient, flowchart_id: int, label: str, **extra) -> dict:
    response = client.post(f"/flowcharts/{flowchart_id}/nodes", json={"label": label, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def make_edge(client: TestClient, flowchart_id: int, source: dict, target: dict, **extra) -> dict:
    response = client.post(
        f"/flowcharts/{flowchart_id}/edges",
        json={"source_node_id": source["id"], "target_node_id": target["id"], **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def detail(client: TestClient, flowchart_id: int) -> dict:
    response = client.get(f"/flowcharts/{flowchart_id}")
    assert response.status_code == 200, response.text
    return response.json()


def graph(body: dict) -> set[tuple[int, int]]:
    return {(edge["source_node_id"], edge["target_node_id"]) for edge in body["edges"]}


def abc(client: TestClient, names: str = "ABCD") -> tuple[dict, list[dict]]:
    flowchart = make_flowchart(client)
    return flowchart, [make_node(client, flowchart["id"], name) for name in names]


# --- graph shapes (A-F) -----------------------------------------------------------------------------------------------


def test_simple_directed_flow(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, b)
    make_edge(client, flowchart["id"], b, c)

    body = detail(client, flowchart["id"])
    assert [node["label"] for node in body["nodes"]] == ["A", "B", "C"]
    assert graph(body) == {(a["id"], b["id"]), (b["id"], c["id"])}


def test_branch_gives_a_node_two_outgoing_edges(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, b, edge_type="yes", label="YES")
    make_edge(client, flowchart["id"], a, c, edge_type="no", label="NO")

    body = detail(client, flowchart["id"])
    outgoing = Counter(edge["source_node_id"] for edge in body["edges"])
    assert outgoing[a["id"]] == 2
    assert {edge["edge_type"] for edge in body["edges"]} == {"yes", "no"}
    assert {edge["label"] for edge in body["edges"]} == {"YES", "NO"}


def test_merge_keeps_one_node_with_two_incoming_edges(client: TestClient):
    flowchart, (a, b, c, d) = abc(client)
    for source, target in [(a, b), (a, c), (b, d), (c, d)]:
        make_edge(client, flowchart["id"], source, target)

    body = detail(client, flowchart["id"])
    assert [node["label"] for node in body["nodes"]].count("D") == 1
    incoming = Counter(edge["target_node_id"] for edge in body["edges"])
    assert incoming[d["id"]] == 2
    assert len(body["nodes"]) == 4


def test_cycle_is_accepted_and_preserved(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, b)
    make_edge(client, flowchart["id"], b, c)
    loop = make_edge(client, flowchart["id"], c, a, edge_type="retry", label="try again")

    body = detail(client, flowchart["id"])
    assert graph(body) == {(a["id"], b["id"]), (b["id"], c["id"]), (c["id"], a["id"])}
    assert next(edge for edge in body["edges"] if edge["id"] == loop["id"])["edge_type"] == "retry"


def test_two_inputs_feed_one_node(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, c)
    make_edge(client, flowchart["id"], b, c)

    body = detail(client, flowchart["id"])
    assert {edge["source_node_id"] for edge in body["edges"] if edge["target_node_id"] == c["id"]} == {a["id"], b["id"]}


def test_multiple_outputs_from_one_node(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, b)
    make_edge(client, flowchart["id"], a, c)

    body = detail(client, flowchart["id"])
    assert {edge["target_node_id"] for edge in body["edges"] if edge["source_node_id"] == a["id"]} == {b["id"], c["id"]}


# --- descriptions, node types, children (G, H) ------------------------------------------------------------------------


def test_node_and_flowchart_descriptions_persist(client: TestClient):
    flowchart = make_flowchart(client, "Gmail Encryption", description="End-to-end encrypted mail.")
    node = make_node(
        client,
        flowchart["id"],
        "Encrypt Message",
        description="Encrypts the plaintext locally before Gmail receives it.",
        node_type="subprocess",
    )

    body = detail(client, flowchart["id"])
    assert body["flowchart"]["description"] == "End-to-end encrypted mail."
    assert body["nodes"][0]["description"] == "Encrypts the plaintext locally before Gmail receives it."
    assert body["nodes"][0]["node_type"] == "subprocess"

    patched = client.patch(f"/flow-nodes/{node['id']}", json={"description": "Updated."})
    assert patched.status_code == 200
    assert patched.json()["description"] == "Updated."
    assert patched.json()["label"] == "Encrypt Message"  # untouched fields survive


def test_all_node_and_edge_types_are_accepted_and_others_rejected(client: TestClient):
    flowchart = make_flowchart(client)
    for node_type in [
        "start",
        "end",
        "process",
        "decision",
        "input_output",
        "subprocess",
        "external_system",
        "data",
    ]:
        assert make_node(client, flowchart["id"], node_type, node_type=node_type)["node_type"] == node_type
    a, b = make_node(client, flowchart["id"], "a"), make_node(client, flowchart["id"], "b")
    for edge_type in ["normal", "yes", "no", "success", "failure", "retry"]:
        assert make_edge(client, flowchart["id"], a, b, edge_type=edge_type)["edge_type"] == edge_type

    assert client.post(f"/flowcharts/{flowchart['id']}/nodes", json={"label": "x", "node_type": "blob"}).status_code == 422
    bad_edge = {"source_node_id": a["id"], "target_node_id": b["id"], "edge_type": "USES"}
    assert client.post(f"/flowcharts/{flowchart['id']}/edges", json=bad_edge).status_code == 422


def test_edge_label_is_free_text_and_defaults_to_normal(client: TestClient):
    flowchart, (a, b) = abc(client, "AB")
    edge = make_edge(client, flowchart["id"], a, b, label="only when balance > 0", description="Guard condition")

    assert edge["edge_type"] == "normal"
    assert edge["label"] == "only when balance > 0"
    assert edge["description"] == "Guard condition"
    updated = client.patch(f"/flow-edges/{edge['id']}", json={"edge_type": "failure", "label": None}).json()
    assert updated["edge_type"] == "failure"
    assert updated["label"] is None


def test_child_flowchart_reference_persists_and_is_reusable(client: TestClient):
    parent_a = make_flowchart(client, "Project A")
    parent_b = make_flowchart(client, "Project B")
    child = make_flowchart(client, "Validate Input")
    node_a = make_node(client, parent_a["id"], "Validate", node_type="subprocess", child_flowchart_id=child["id"])
    node_b = make_node(client, parent_b["id"], "Check input", child_flowchart_id=child["id"])

    assert node_a["child_flowchart_id"] == node_b["child_flowchart_id"] == child["id"]
    body = detail(client, parent_a["id"])
    assert body["nodes"][0]["child_flowchart_id"] == child["id"]
    assert body["nodes"][0]["child_flowchart_name"] == "Validate Input"

    detached = client.patch(f"/flow-nodes/{node_a['id']}", json={"child_flowchart_id": None}).json()
    assert detached["child_flowchart_id"] is None
    assert detail(client, parent_b["id"])["nodes"][0]["child_flowchart_id"] == child["id"]  # other parent unaffected


def test_a_flowchart_cannot_be_its_own_detailed_flowchart(client: TestClient):
    flowchart = make_flowchart(client, "A")
    node = make_node(client, flowchart["id"], "step")

    created = client.post(
        f"/flowcharts/{flowchart['id']}/nodes", json={"label": "self", "child_flowchart_id": flowchart["id"]}
    )
    updated = client.patch(f"/flow-nodes/{node['id']}", json={"child_flowchart_id": flowchart["id"]})
    assert created.status_code == 400
    assert updated.status_code == 400
    assert detail(client, flowchart["id"])["nodes"][0]["child_flowchart_id"] is None


def test_indirect_child_flowchart_cycle_is_rejected_but_process_cycles_are_not(client: TestClient):
    a = make_flowchart(client, "A")
    b = make_flowchart(client, "B")
    c = make_flowchart(client, "C")
    a_step = make_node(client, a["id"], "a step", child_flowchart_id=b["id"])
    b_step = make_node(client, b["id"], "b step", child_flowchart_id=c["id"])
    c_step = make_node(client, c["id"], "c step")

    # C -> A would close the chain A -> B -> C -> A.
    closing = client.patch(f"/flow-nodes/{c_step['id']}", json={"child_flowchart_id": a["id"]})
    assert closing.status_code == 400
    assert "circular" in closing.json()["detail"]
    # B -> A would close A -> B -> A.
    assert client.post(f"/flowcharts/{b['id']}/nodes", json={"label": "x", "child_flowchart_id": a["id"]}).status_code == 400
    # A diamond of references (not a cycle) is fine, and so is any ordinary process loop inside a flowchart.
    d = make_flowchart(client, "D")
    assert client.post(f"/flowcharts/{a['id']}/nodes", json={"label": "y", "child_flowchart_id": c["id"]}).status_code == 201
    assert client.post(f"/flowcharts/{d['id']}/nodes", json={"label": "z", "child_flowchart_id": c["id"]}).status_code == 201
    make_edge(client, a["id"], a_step, make_node(client, a["id"], "back"))
    assert b_step["child_flowchart_id"] == c["id"]


# --- concepts (I, J) --------------------------------------------------------------------------------------------------


def test_flow_node_references_an_existing_concept(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "AES-GCM", "Authenticated encryption mode.")
    flowchart = make_flowchart(client)
    node = make_node(client, flowchart["id"], "Encrypt with AES-GCM", concept_id=concept.id)

    body = detail(client, flowchart["id"])
    assert body["nodes"][0]["id"] == node["id"]
    assert body["nodes"][0]["concept_id"] == concept.id
    assert body["nodes"][0]["concept_name"] == "AES-GCM"
    assert body["nodes"][0]["concept_description"] == "Authenticated encryption mode."
    assert body["nodes"][0]["label"] == "Encrypt with AES-GCM"  # local label, not the concept name

    missing = client.post(f"/flowcharts/{flowchart['id']}/nodes", json={"label": "x", "concept_id": 9999})
    assert missing.status_code == 400


def test_one_concept_can_appear_in_many_flowcharts_and_many_times_in_one(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "AES-GCM")
    gmail = make_flowchart(client, "Gmail Encryption")
    notes = make_flowchart(client, "Encrypted Notes")
    first = make_node(client, gmail["id"], "Encrypt body", concept_id=concept.id)
    second = make_node(client, gmail["id"], "Encrypt attachment", concept_id=concept.id)
    other = make_node(client, notes["id"], "Seal note", concept_id=concept.id)
    make_edge(client, gmail["id"], first, second)

    assert db_session.query(models.Concept).count() == 1
    assert len(detail(client, gmail["id"])["nodes"]) == 2
    assert {first["concept_id"], second["concept_id"], other["concept_id"]} == {concept.id}
    # Process structure is local: the same concept in the other flowchart has no edges.
    assert detail(client, notes["id"])["edges"] == []


def test_deleting_a_flow_node_does_not_delete_its_concept(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "Nonce")
    flowchart = make_flowchart(client)
    node = make_node(client, flowchart["id"], "Generate nonce", concept_id=concept.id)

    assert client.delete(f"/flow-nodes/{node['id']}").status_code == 204
    assert detail(client, flowchart["id"])["nodes"] == []
    assert db_session.get(models.Concept, concept.id) is not None


def test_deleting_a_concept_keeps_flow_nodes_but_detaches_them(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "Nonce")
    flowchart = make_flowchart(client)
    a = make_node(client, flowchart["id"], "Generate nonce", concept_id=concept.id, node_type="data")
    b = make_node(client, flowchart["id"], "Use nonce")
    make_edge(client, flowchart["id"], a, b)

    assert client.delete(f"/concepts/{concept.id}").status_code == 204
    body = detail(client, flowchart["id"])
    assert [node["id"] for node in body["nodes"]] == [a["id"], b["id"]]
    assert body["nodes"][0]["concept_id"] is None
    assert body["nodes"][0]["label"] == "Generate nonce"
    assert body["nodes"][0]["node_type"] == "data"
    assert len(body["edges"]) == 1


# --- flow vs semantic (K) ---------------------------------------------------------------------------------------------


def test_flow_edges_never_create_or_change_semantic_relationships(client: TestClient, db_session: Session):
    aes = make_concept(db_session, "AES-GCM")
    nonce = make_concept(db_session, "Nonce")
    payload = make_concept(db_session, "Payload")
    semantic = create_relationship(
        db_session,
        schemas.RelationshipCreate(source_concept_id=aes.id, target_concept_id=nonce.id, relationship_type="USES"),
    )
    before = [(r.id, r.source_concept_id, r.target_concept_id, r.relationship_type) for r in db_session.query(models.Relationship)]

    flowchart = make_flowchart(client)
    a = make_node(client, flowchart["id"], "AES-GCM", concept_id=aes.id)
    b = make_node(client, flowchart["id"], "Package payload", concept_id=payload.id)
    c = make_node(client, flowchart["id"], "Nonce", concept_id=nonce.id)
    make_edge(client, flowchart["id"], a, b)
    make_edge(client, flowchart["id"], c, a)
    client.patch(f"/flow-edges/{detail(client, flowchart['id'])['edges'][0]['id']}", json={"label": "then"})
    client.delete(f"/flow-nodes/{b['id']}")

    after = [(r.id, r.source_concept_id, r.target_concept_id, r.relationship_type) for r in db_session.query(models.Relationship)]
    assert after == before == [(semantic.id, aes.id, nonce.id, "USES")]
    assert client.get("/relationships").json()[0]["relationship_type"] == "USES"


# --- referential integrity (L and friends) ----------------------------------------------------------------------------


def test_edge_between_nodes_of_different_flowcharts_is_rejected(client: TestClient):
    one = make_flowchart(client, "One")
    two = make_flowchart(client, "Two")
    a = make_node(client, one["id"], "A")
    b = make_node(client, two["id"], "B")

    for flowchart_id in (one["id"], two["id"]):
        response = client.post(
            f"/flowcharts/{flowchart_id}/edges", json={"source_node_id": a["id"], "target_node_id": b["id"]}
        )
        assert response.status_code == 400
        assert "same" in response.json()["detail"] or "belong" in response.json()["detail"]
    assert detail(client, one["id"])["edges"] == []
    assert detail(client, two["id"])["edges"] == []


def test_edge_with_missing_node_or_self_loop_is_rejected(client: TestClient):
    flowchart, (a,) = abc(client, "A")

    missing = client.post(f"/flowcharts/{flowchart['id']}/edges", json={"source_node_id": a["id"], "target_node_id": 9999})
    self_loop = client.post(f"/flowcharts/{flowchart['id']}/edges", json={"source_node_id": a["id"], "target_node_id": a["id"]})
    assert missing.status_code == 400
    assert self_loop.status_code == 400


def test_deleting_a_node_removes_only_its_own_edges(client: TestClient):
    flowchart, (a, b, c) = abc(client, "ABC")
    make_edge(client, flowchart["id"], a, b)
    keep = make_edge(client, flowchart["id"], b, c)
    make_edge(client, flowchart["id"], c, a)

    assert client.delete(f"/flow-nodes/{a['id']}").status_code == 204
    assert [edge["id"] for edge in detail(client, flowchart["id"])["edges"]] == [keep["id"]]


def test_deleting_a_flowchart_removes_its_graph_and_detaches_parents(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "Nonce")
    parent = make_flowchart(client, "Parent")
    child = make_flowchart(client, "Child")
    opener = make_node(client, parent["id"], "Open", child_flowchart_id=child["id"])
    a = make_node(client, child["id"], "A", concept_id=concept.id)
    b = make_node(client, child["id"], "B")
    make_edge(client, child["id"], a, b)

    assert client.delete(f"/flowcharts/{child['id']}").status_code == 204
    assert client.get(f"/flowcharts/{child['id']}").status_code == 404
    assert db_session.query(models.FlowNode).filter_by(flowchart_id=child["id"]).count() == 0
    assert db_session.query(models.FlowEdge).filter_by(flowchart_id=child["id"]).count() == 0
    # The node that opened it survives without a child; the concept is untouched.
    body = detail(client, parent["id"])
    assert body["nodes"][0]["id"] == opener["id"]
    assert body["nodes"][0]["child_flowchart_id"] is None
    assert db_session.get(models.Concept, concept.id) is not None


def test_folder_link_must_be_an_existing_knowledge_folder(client: TestClient, db_session: Session):
    concept = make_concept(db_session, "Nonce")
    folder = models.KnowledgeEntry(parent_id=None, name="Security", entry_type="folder", sort_order=0)
    db_session.add(folder)
    db_session.flush()
    file_entry = models.KnowledgeEntry(
        parent_id=folder.id, name="Nonce", entry_type="concept", concept_id=concept.id, sort_order=0
    )
    db_session.add(file_entry)
    db_session.commit()

    inside = make_flowchart(client, "In folder", folder_id=folder.id)
    make_flowchart(client, "Standalone")
    assert client.post("/flowcharts", json={"name": "x", "folder_id": 9999}).status_code == 400
    assert client.post("/flowcharts", json={"name": "x", "folder_id": file_entry.id}).status_code == 400

    assert [item["id"] for item in client.get(f"/flowcharts?folder_id={folder.id}").json()] == [inside["id"]]
    assert len(client.get("/flowcharts").json()) == 2
    detached = client.patch(f"/flowcharts/{inside['id']}", json={"folder_id": None})
    assert detached.status_code == 200
    assert detached.json()["folder_id"] is None


# --- API shape ----------------------------------------------------------------------------------------------------------


def test_flowchart_crud_and_counts(client: TestClient):
    flowchart = make_flowchart(client, "  Draft  ")
    assert flowchart["name"] == "Draft"
    assert (flowchart["node_count"], flowchart["edge_count"]) == (0, 0)

    a, b = make_node(client, flowchart["id"], "A"), make_node(client, flowchart["id"], "B")
    make_edge(client, flowchart["id"], a, b)
    listed = client.get("/flowcharts").json()
    assert (listed[0]["node_count"], listed[0]["edge_count"]) == (2, 1)

    patched = client.patch(f"/flowcharts/{flowchart['id']}", json={"name": "Final", "description": "Done"})
    assert (patched.json()["name"], patched.json()["description"]) == ("Final", "Done")
    assert (patched.json()["node_count"], patched.json()["edge_count"]) == (2, 1)

    assert client.delete(f"/flowcharts/{flowchart['id']}").status_code == 204
    assert client.get("/flowcharts").json() == []


def test_flowchart_detail_is_one_complete_response_with_manual_positions(client: TestClient):
    flowchart, (a, b) = abc(client, "AB")
    make_edge(client, flowchart["id"], a, b)
    assert client.patch(f"/flow-nodes/{a['id']}", json={"x": 12.5, "y": -3}).json()["x"] == 12.5

    body = detail(client, flowchart["id"])
    assert set(body) == {"flowchart", "nodes", "edges"}
    assert (body["nodes"][0]["x"], body["nodes"][0]["y"]) == (12.5, -3)
    assert (body["nodes"][1]["x"], body["nodes"][1]["y"]) == (None, None)  # None = automatic layout
    assert body["flowchart"]["node_count"] == 2


def test_missing_resources_return_404(client: TestClient):
    assert client.get("/flowcharts/999").status_code == 404
    assert client.patch("/flowcharts/999", json={"name": "x"}).status_code == 404
    assert client.delete("/flowcharts/999").status_code == 404
    assert client.post("/flowcharts/999/nodes", json={"label": "x"}).status_code == 404
    assert client.post("/flowcharts/999/edges", json={"source_node_id": 1, "target_node_id": 2}).status_code == 404
    assert client.patch("/flow-nodes/999", json={"label": "x"}).status_code == 404
    assert client.delete("/flow-nodes/999").status_code == 404
    assert client.patch("/flow-edges/999", json={"label": "x"}).status_code == 404
    assert client.delete("/flow-edges/999").status_code == 404


def test_flowcharts_are_independent_of_graph_views(client: TestClient, db_session: Session):
    root = make_concept(db_session, "Asymmetric Encryption")
    view = client.post("/graph-views", json={"root_concept_id": root.id, "name": "Overview"}).json()
    client.post(f"/graph-views/{view['id']}/nodes", json={"concept_id": root.id, "label": "Asymmetric Encryption"})
    flowchart = make_flowchart(client, "Flow")
    make_node(client, flowchart["id"], "Asymmetric Encryption", concept_id=root.id)

    assert client.get("/flowcharts").json()[0]["node_count"] == 1
    assert len(client.get(f"/graph-views/{view['id']}").json()["nodes"]) == 1
    client.delete(f"/graph-views/{view['id']}")
    assert detail(client, flowchart["id"])["nodes"][0]["concept_id"] == root.id


def test_database_itself_rejects_a_self_loop_edge(db_session: Session):
    flowchart = models.Flowchart(name="Direct")
    db_session.add(flowchart)
    db_session.flush()
    node = models.FlowNode(flowchart_id=flowchart.id, label="A")
    db_session.add(node)
    db_session.flush()
    db_session.add(models.FlowEdge(flowchart_id=flowchart.id, source_node_id=node.id, target_node_id=node.id))

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_reorganize_clears_manual_positions_only_for_that_flowchart(client: TestClient):
    one, (a, b) = abc(client, "AB")
    other = make_flowchart(client, "Other")
    c = make_node(client, other["id"], "C")
    client.patch(f"/flow-nodes/{a['id']}", json={"x": 10, "y": 20})
    client.patch(f"/flow-nodes/{c['id']}", json={"x": 30, "y": 40})

    assert client.post(f"/flowcharts/{one['id']}/reorganize").status_code == 204
    assert all(node["x"] is None and node["y"] is None for node in detail(client, one["id"])["nodes"])
    assert (detail(client, other["id"])["nodes"][0]["x"], detail(client, other["id"])["nodes"][0]["y"]) == (30, 40)
    assert client.post("/flowcharts/999/reorganize").status_code == 404
