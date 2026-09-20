"""Development-only example flowcharts (never loaded automatically).

Load them into the local database with:  python -m app.dev_examples
The JSON files are also read by the frontend layout tests, so the graphs are defined once.
"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from .. import models

EXAMPLES_DIR = Path(__file__).parent
EXAMPLE_FILES = ["dijkstra.json", "delivery.json"]


def load_example_definitions() -> list[dict]:
    return [json.loads((EXAMPLES_DIR / name).read_text(encoding="utf-8")) for name in EXAMPLE_FILES]


def load_dev_examples(db: Session) -> list[models.Flowchart]:
    """Idempotently create the example spaces and flowcharts. Existing data is never modified."""
    created: list[models.Flowchart] = []
    for definition in load_example_definitions():
        space = db.query(models.KnowledgeSpace).filter_by(name=definition["space"]).first()
        if space is None:
            space = models.KnowledgeSpace(name=definition["space"], description=definition.get("space_description", ""))
            db.add(space)
            db.flush()

        charts: dict[str, models.Flowchart] = {}
        fresh: set[str] = set()
        for spec in definition["flowcharts"]:
            chart = db.query(models.Flowchart).filter_by(name=spec["name"], knowledge_space_id=space.id).first()
            if chart is None:
                chart = models.Flowchart(
                    name=spec["name"],
                    description=spec.get("description", ""),
                    knowledge_space_id=space.id,
                    is_primary=bool(spec.get("primary")),
                )
                db.add(chart)
                db.flush()
                fresh.add(spec["key"])
                created.append(chart)
            charts[spec["key"]] = chart

        for spec in definition["flowcharts"]:
            if spec["key"] not in fresh:
                continue
            chart = charts[spec["key"]]
            nodes: dict[str, models.FlowNode] = {}
            for node_spec in spec["nodes"]:
                concept = None
                if node_spec.get("concept"):
                    concept = db.query(models.Concept).filter_by(name=node_spec["concept"]).first()
                node = models.FlowNode(
                    flowchart_id=chart.id,
                    label=node_spec["label"],
                    description=node_spec.get("description", ""),
                    node_type=node_spec["type"],
                    concept_id=concept.id if concept else None,
                    child_flowchart_id=charts[node_spec["child"]].id if node_spec.get("child") else None,
                )
                db.add(node)
                nodes[node_spec["key"]] = node
            db.flush()
            for edge_spec in spec["edges"]:
                db.add(
                    models.FlowEdge(
                        flowchart_id=chart.id,
                        source_node_id=nodes[edge_spec["from"]].id,
                        target_node_id=nodes[edge_spec["to"]].id,
                        edge_type=edge_spec["type"],
                        label=edge_spec.get("label"),
                    )
                )
    db.commit()
    return created
