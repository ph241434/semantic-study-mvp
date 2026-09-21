from collections import Counter

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import create_concept
from app.dev_examples import load_dev_examples


def has_cycle(flowchart: models.Flowchart) -> bool:
    graph: dict[int, list[int]] = {node.id: [] for node in flowchart.nodes}
    for edge in flowchart.edges:
        graph[edge.source_node_id].append(edge.target_node_id)
    state: dict[int, int] = {}

    def visit(node: int) -> bool:
        state[node] = 1
        for following in graph[node]:
            if state.get(following) == 1 or (following not in state and visit(following)):
                return True
        state[node] = 2
        return False

    return any(node not in state and visit(node) for node in graph)


def test_dev_examples_load_idempotently_and_never_touch_existing_rows(db_session: Session):
    concept = create_concept(db_session, schemas.ConceptCreate(name="Dijkstra's Algorithm"))
    existing_folder = models.KnowledgeEntry(parent_id=None, name="Mine", entry_type="folder", sort_order=0)
    db_session.add(existing_folder)
    db_session.commit()

    first = load_dev_examples(db_session)
    assert len(first) == 4
    assert load_dev_examples(db_session) == []
    assert db_session.query(models.Flowchart).count() == 4
    assert db_session.get(models.KnowledgeEntry, existing_folder.id).name == "Mine"
    assert db_session.query(models.KnowledgeEntry).filter_by(name="Dev Examples", entry_type="folder").count() == 1

    service = db_session.query(models.Flowchart).filter_by(name="Shortest-path service").one()
    run = next(node for node in service.nodes if node.label == "Run shortest-path algorithm")
    assert run.concept_id == concept.id  # linked to the existing global concept, never duplicated
    assert db_session.query(models.Concept).count() == 1


def test_dev_examples_are_real_directed_graphs_not_trees(db_session: Session):
    load_dev_examples(db_session)

    for name in ["Dijkstra's algorithm", "Software feature delivery"]:
        chart = db_session.query(models.Flowchart).filter_by(name=name).one()
        incoming = Counter(edge.target_node_id for edge in chart.edges)
        outgoing = Counter(edge.source_node_id for edge in chart.edges)
        assert max(incoming.values()) >= 2, name  # merge / multiple inputs
        assert max(outgoing.values()) >= 2, name  # branch
        assert any(node.node_type == "decision" for node in chart.nodes), name
        assert has_cycle(chart), name

    dijkstra = db_session.query(models.Flowchart).filter_by(name="Dijkstra's algorithm").one()
    update = next(node for node in dijkstra.nodes if node.label == "Update distance")
    assert update.child_flowchart.name == "Update distance"
    service = db_session.query(models.Flowchart).filter_by(name="Shortest-path service").one()
    assert next(n for n in service.nodes if n.label == "Run shortest-path algorithm").child_flowchart_id == dijkstra.id


def test_used_by_count_distinguishes_top_level_from_detail_flowcharts(client: TestClient, db_session: Session):
    load_dev_examples(db_session)

    listed = {item["name"]: item for item in client.get("/flowcharts").json()}
    assert listed["Shortest-path service"]["used_by_count"] == 0
    assert listed["Software feature delivery"]["used_by_count"] == 0
    assert listed["Dijkstra's algorithm"]["used_by_count"] == 1
    assert listed["Update distance"]["used_by_count"] == 1
    detail = client.get(f"/flowcharts/{listed['Update distance']['id']}").json()
    assert detail["flowchart"]["used_by_count"] == 1
    assert [item["name"] for item in client.get("/flowcharts").json()][0] == "Shortest-path service"  # id order
