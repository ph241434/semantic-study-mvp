from collections import Counter

from app import models
from app.dev_examples import load_dev_examples


def make_chart(client, name="Chart", **extra):
    response = client.post("/flowcharts", json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def make_node(client, chart_id, label, **extra):
    response = client.post(f"/flowcharts/{chart_id}/nodes", json={"label": label, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def make_edge(client, chart_id, source, target, **extra):
    response = client.post(
        f"/flowcharts/{chart_id}/edges",
        json={"source_node_id": source, "target_node_id": target, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def detail(client, chart_id):
    response = client.get(f"/flowcharts/{chart_id}")
    assert response.status_code == 200
    return response.json()


def test_merge_node_keeps_two_incoming_edges_without_duplication(client):
    chart = make_chart(client)
    a = make_node(client, chart["id"], "A")
    b = make_node(client, chart["id"], "B")
    c = make_node(client, chart["id"], "C")
    d = make_node(client, chart["id"], "D")
    for source, target in [(a, b), (a, c), (b, d), (c, d)]:
        make_edge(client, chart["id"], source["id"], target["id"])

    body = detail(client, chart["id"])
    assert [n["label"] for n in body["nodes"]].count("D") == 1
    incoming = Counter(e["target_node_id"] for e in body["edges"])
    outgoing = Counter(e["source_node_id"] for e in body["edges"])
    assert incoming[d["id"]] == 2
    assert outgoing[a["id"]] == 2


def test_cycle_and_loop_edge_are_accepted_and_preserved(client):
    chart = make_chart(client)
    test = make_node(client, chart["id"], "Test")
    fix = make_node(client, chart["id"], "Fix")
    make_edge(client, chart["id"], test["id"], fix["id"], edge_type="FAILURE", label="NO")
    loop = make_edge(client, chart["id"], fix["id"], test["id"], edge_type="RETRY")

    body = detail(client, chart["id"])
    assert len(body["nodes"]) == 2
    assert {(e["source_node_id"], e["target_node_id"]) for e in body["edges"]} == {
        (test["id"], fix["id"]),
        (fix["id"], test["id"]),
    }
    assert next(e for e in body["edges"] if e["id"] == loop["id"])["edge_type"] == "RETRY"


def test_two_sources_can_feed_one_target(client):
    chart = make_chart(client)
    graph = make_node(client, chart["id"], "Graph data", node_type="input_output")
    start = make_node(client, chart["id"], "Start vertex", node_type="INPUT_OUTPUT")
    init = make_node(client, chart["id"], "Initialize")
    make_edge(client, chart["id"], graph["id"], init["id"])
    make_edge(client, chart["id"], start["id"], init["id"])

    sources = {e["source_node_id"] for e in detail(client, chart["id"])["edges"] if e["target_node_id"] == init["id"]}
    assert sources == {graph["id"], start["id"]}
    assert graph["node_type"] == "INPUT_OUTPUT"


def test_self_loop_and_cross_flowchart_edges_are_rejected(client):
    one = make_chart(client, "One")
    two = make_chart(client, "Two")
    a = make_node(client, one["id"], "A")
    b = make_node(client, two["id"], "B")

    self_loop = client.post(
        f"/flowcharts/{one['id']}/edges", json={"source_node_id": a["id"], "target_node_id": a["id"]}
    )
    cross = client.post(
        f"/flowcharts/{one['id']}/edges", json={"source_node_id": a["id"], "target_node_id": b["id"]}
    )
    assert self_loop.status_code == 400
    assert cross.status_code == 400


def test_invalid_types_are_rejected(client):
    chart = make_chart(client)
    assert client.post(f"/flowcharts/{chart['id']}/nodes", json={"label": "x", "node_type": "BLOB"}).status_code == 422


def test_child_flowchart_association_and_reuse(client):
    parent_a = make_chart(client, "Parent A")
    parent_b = make_chart(client, "Parent B")
    node_a = make_node(client, parent_a["id"], "Validate", node_type="SUBPROCESS")
    child = client.post(f"/flow-nodes/{node_a['id']}/child-flowchart").json()

    # Asking again returns the same flowchart rather than creating another one.
    assert client.post(f"/flow-nodes/{node_a['id']}/child-flowchart").json()["id"] == child["id"]
    assert child["node_count"] == 0

    node_b = make_node(client, parent_b["id"], "Validate input", child_flowchart_id=child["id"])
    assert node_b["has_child"] is True
    nodes = detail(client, parent_a["id"])["nodes"]
    assert nodes[0]["child_flowchart_id"] == child["id"]
    assert nodes[0]["child_flowchart_name"] == "Validate"

    # Deleting the reusable child only detaches the parents.
    assert client.delete(f"/flowcharts/{child['id']}").status_code == 204
    assert detail(client, parent_a["id"])["nodes"][0]["has_child"] is False
    assert detail(client, parent_b["id"])["nodes"][0]["child_flowchart_id"] is None


def test_flow_node_references_concept_description_and_semantics_stay_global(client):
    aes = client.post("/concepts", json={"name": "AES-GCM", "description": "Authenticated encryption."}).json()
    nonce = client.post("/concepts", json={"name": "Nonce"}).json()
    relationship = client.post(
        "/relationships",
        json={"source_concept_id": aes["id"], "target_concept_id": nonce["id"], "relationship_type": "USES"},
    ).json()

    one = make_chart(client, "Gmail encryption")
    two = make_chart(client, "Encrypted notes")
    node_one = make_node(client, one["id"], "Encrypt body", concept_id=aes["id"])
    node_two = make_node(client, two["id"], "Seal note", concept_id=aes["id"])
    package = make_node(client, one["id"], "Package payload")
    make_edge(client, one["id"], node_one["id"], package["id"])

    body_one = detail(client, one["id"])
    body_two = detail(client, two["id"])
    # Same Concept, different local label; description comes through from the Concept.
    assert body_one["nodes"][0]["concept_name"] == "AES-GCM"
    assert body_one["nodes"][0]["concept_description"] == "Authenticated encryption."
    assert body_two["nodes"][0]["concept_id"] == aes["id"]
    assert body_two["nodes"][0]["label"] == "Seal note"
    assert node_one["concept_id"] == node_two["concept_id"]
    # Flow edge is local: the other appearance of the concept has none.
    assert len(body_one["edges"]) == 1
    assert body_two["edges"] == []
    # The semantic relationship is untouched and still global.
    relationships = client.get("/relationships").json()
    assert [r["id"] for r in relationships] == [relationship["id"]]
    assert relationships[0]["relationship_type"] == "USES"


def test_deleting_concept_keeps_node_and_semantic_data_intact(client):
    concept = client.post("/concepts", json={"name": "Nonce"}).json()
    chart = make_chart(client)
    node = make_node(client, chart["id"], "Generate nonce", concept_id=concept["id"])

    assert client.delete(f"/concepts/{concept['id']}").status_code == 204
    remaining = detail(client, chart["id"])["nodes"]
    assert remaining[0]["id"] == node["id"]
    assert remaining[0]["concept_id"] is None


def test_deleting_node_removes_its_edges_only(client):
    chart = make_chart(client)
    a = make_node(client, chart["id"], "A")
    b = make_node(client, chart["id"], "B")
    c = make_node(client, chart["id"], "C")
    make_edge(client, chart["id"], a["id"], b["id"])
    keep = make_edge(client, chart["id"], b["id"], c["id"])
    make_edge(client, chart["id"], c["id"], a["id"])

    assert client.delete(f"/flow-nodes/{a['id']}").status_code == 204
    body = detail(client, chart["id"])
    assert [e["id"] for e in body["edges"]] == [keep["id"]]


def test_edit_edge_and_manual_positions_and_reorganize(client):
    chart = make_chart(client)
    a = make_node(client, chart["id"], "A")
    b = make_node(client, chart["id"], "B")
    edge = make_edge(client, chart["id"], a["id"], b["id"])

    patched = client.patch(f"/flow-edges/{edge['id']}", json={"edge_type": "yes", "label": "YES"}).json()
    assert (patched["edge_type"], patched["label"]) == ("YES", "YES")

    moved = client.patch(f"/flow-nodes/{a['id']}", json={"pos_x": 12.5, "pos_y": 40}).json()
    assert (moved["pos_x"], moved["pos_y"]) == (12.5, 40)
    described = client.patch(f"/flow-nodes/{a['id']}", json={"description": "First step", "node_type": "start"}).json()
    assert described["description"] == "First step"
    assert described["node_type"] == "START"
    assert described["pos_x"] == 12.5  # untouched fields survive

    assert client.post(f"/flowcharts/{chart['id']}/reorganize").status_code == 204
    nodes = detail(client, chart["id"])["nodes"]
    assert all(n["pos_x"] is None and n["pos_y"] is None for n in nodes)

    assert client.delete(f"/flow-edges/{edge['id']}").status_code == 204
    assert detail(client, chart["id"])["edges"] == []


def test_primary_flowchart_is_unique_per_space(client):
    space = client.post("/knowledge-spaces", json={"name": "Project"}).json()
    first = make_chart(client, "First", knowledge_space_id=space["id"], is_primary=True)
    second = make_chart(client, "Second", knowledge_space_id=space["id"], is_primary=True)

    listing = {c["id"]: c for c in client.get(f"/flowcharts?knowledge_space_id={space['id']}").json()}
    assert listing[first["id"]]["is_primary"] is False
    assert listing[second["id"]]["is_primary"] is True
    assert client.post("/flowcharts", json={"name": "Bad", "knowledge_space_id": 999}).status_code == 400


def test_dev_examples_load_idempotently_and_are_not_trees(db_session):
    first = load_dev_examples(db_session)
    assert len(first) == 4
    assert load_dev_examples(db_session) == []
    assert db_session.query(models.Flowchart).count() == 4

    for chart in db_session.query(models.Flowchart).all():
        incoming = Counter(e.target_node_id for e in chart.edges)
        outgoing = Counter(e.source_node_id for e in chart.edges)
        assert chart.nodes, chart.name
        if chart.name in {"Dijkstra's algorithm", "Software feature delivery"}:
            assert max(incoming.values()) >= 2  # merge / multiple inputs
            assert max(outgoing.values()) >= 2  # branch
            assert any(n.node_type == "DECISION" for n in chart.nodes)
            assert has_cycle(chart), chart.name

    dijkstra = db_session.query(models.Flowchart).filter_by(name="Dijkstra's algorithm").one()
    update = next(n for n in dijkstra.nodes if n.label == "Update distance")
    assert update.child_flowchart.name == "Update distance"
    service = db_session.query(models.Flowchart).filter_by(name="Shortest-path service").one()
    assert next(n for n in service.nodes if n.label == "Run shortest-path algorithm").child_flowchart_id == dijkstra.id


def has_cycle(chart) -> bool:
    graph: dict[int, list[int]] = {n.id: [] for n in chart.nodes}
    for edge in chart.edges:
        graph[edge.source_node_id].append(edge.target_node_id)
    state: dict[int, int] = {}

    def visit(node: int) -> bool:
        state[node] = 1
        for nxt in graph[node]:
            if state.get(nxt) == 1 or (nxt not in state and visit(nxt)):
                return True
        state[node] = 2
        return False

    return any(node not in state and visit(node) for node in graph)
