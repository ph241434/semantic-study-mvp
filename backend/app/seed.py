from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models


def seed_database(db: Session) -> None:
    now = datetime.now(timezone.utc)
    concepts = seed_concepts(db, now)
    seed_hierarchy(db, concepts, now)
    db.commit()

    if db.query(models.Question).count() > 0:
        return

    relationship_rows = [
        ("Dijkstra's Algorithm", "IS_A", "Shortest Path Algorithm", "Dijkstra is a specific shortest-path method.", 0.5),
        ("Dijkstra's Algorithm", "USES", "Priority Queue", "A priority queue selects the next closest frontier vertex.", 0.39),
        ("Priority Queue", "IMPLEMENTED_BY", "Binary Heap", "A binary heap is a common efficient priority queue implementation.", 0.42),
        (
            "Dijkstra's Algorithm",
            "REQUIRES",
            "Nonnegative Edge Weights",
            "The greedy choice is valid only when later edges cannot reduce a settled distance.",
            0.27,
        ),
        (
            "Dijkstra's Algorithm",
            "CONTRASTS_WITH",
            "Bellman-Ford Algorithm",
            "Bellman-Ford tolerates negative edges but is usually slower.",
            0.35,
        ),
        (
            "Bellman-Ford Algorithm",
            "SUPPORTS",
            "Negative Edge Weight",
            "Bellman-Ford can relax edges repeatedly to account for negative weights.",
            0.31,
        ),
        ("Dijkstra's Algorithm", "USES", "Relaxation", "Relaxation updates tentative distances.", 0.45),
        ("Weighted Graph", "PART_OF", "Graph Theory", "Weighted graphs are a major graph model.", 0.57),
        ("Edge Weight", "PART_OF", "Weighted Graph", "Weights are the values assigned to weighted graph edges.", 0.53),
        ("Negative Edge Weight", "IS_A", "Edge Weight", "A negative edge weight is a special case of edge weight.", 0.36),
        ("Nonnegative Edge Weights", "CONTRASTS_WITH", "Negative Edge Weight", "The sign of edge weights changes algorithm choice.", 0.34),
        ("Shortest Path Algorithm", "SOLVES", "Shortest Path", "These algorithms compute shortest paths.", 0.49),
        ("Dijkstra's Algorithm", "DEPENDS_ON", "Big-O Notation", "Runtime comparisons are expressed with asymptotic notation.", 0.4),
    ]

    relationships: dict[tuple[str, str, str], models.Relationship] = {}
    for source, rel_type, target, description, mastery in relationship_rows:
        relationship = ensure_relationship(db, concepts, source, rel_type, target, description, mastery, now)
        relationships[(source, rel_type, target)] = relationship
    db.flush()

    question_rows = [
        (
            "What is Dijkstra's algorithm?",
            "A shortest-path algorithm that repeatedly settles the closest unsettled vertex when edge weights are nonnegative.",
            "CONCEPT_RECALL",
            "Dijkstra's Algorithm",
            None,
        ),
        (
            "Why does Dijkstra require nonnegative edge weights?",
            "A negative edge could later reduce a path to a vertex already treated as final, breaking the greedy guarantee.",
            "RELATIONSHIP_RECALL",
            None,
            ("Dijkstra's Algorithm", "REQUIRES", "Nonnegative Edge Weights"),
        ),
        (
            "What relationship exists between Dijkstra and priority queues?",
            "Dijkstra uses a priority queue to choose the vertex with the smallest tentative distance.",
            "RELATIONSHIP_RECALL",
            None,
            ("Dijkstra's Algorithm", "USES", "Priority Queue"),
        ),
        (
            "Compare Dijkstra and Bellman-Ford.",
            "Dijkstra is faster on nonnegative weights; Bellman-Ford handles negative weights through repeated relaxation.",
            "COMPARISON",
            None,
            ("Dijkstra's Algorithm", "CONTRASTS_WITH", "Bellman-Ford Algorithm"),
        ),
        (
            'Starting from "Dijkstra", reconstruct its important neighboring concepts.',
            "Key neighbors include shortest path algorithms, priority queues, nonnegative weights, Bellman-Ford, relaxation, and Big-O notation.",
            "GRAPH_RECONSTRUCTION",
            "Dijkstra's Algorithm",
            None,
        ),
        (
            "What does relaxation do in shortest-path algorithms?",
            "It checks whether a known path can improve a tentative distance estimate and updates that estimate if so.",
            "EXPLANATION",
            "Relaxation",
            None,
        ),
        (
            "How can a priority queue be implemented?",
            "A binary heap is a common implementation that gives efficient insertions and removals of the minimum or maximum item.",
            "RELATIONSHIP_RECALL",
            None,
            ("Priority Queue", "IMPLEMENTED_BY", "Binary Heap"),
        ),
    ]

    for text, answer, q_type, concept_name, relationship_key in question_rows:
        db.add(
            models.Question(
                question_text=text,
                answer_text=answer,
                question_type=q_type,
                difficulty=3 if q_type in {"COMPARISON", "GRAPH_RECONSTRUCTION"} else 2,
                concept_id=concepts[concept_name].id if concept_name else None,
                relationship_id=relationships[relationship_key].id if relationship_key else None,
            )
        )

    db.commit()


def seed_concepts(db: Session, now: datetime) -> dict[str, models.Concept]:
    concept_rows = [
        ("Graph Theory", "The study of vertices, edges, and relationships between objects.", "concept", 0.62),
        ("Dijkstra's Algorithm", "A shortest-path algorithm for graphs with nonnegative edge weights.", "algorithm", 0.48),
        ("Bellman-Ford Algorithm", "A shortest-path algorithm that can handle negative edge weights.", "algorithm", 0.44),
        ("Breadth-First Search", "A graph traversal algorithm that explores neighbors level by level.", "algorithm", 0.47),
        ("Depth-First Search", "A graph traversal algorithm that explores paths as deeply as possible before backtracking.", "algorithm", 0.45),
        ("Merge Sort", "A divide-and-conquer sorting algorithm with predictable n log n runtime.", "algorithm", 0.51),
        ("Dynamic Programming", "A technique for solving problems by reusing overlapping subproblem results.", "mechanism", 0.42),
        ("Priority Queue", "An abstract data type that returns the highest-priority item efficiently.", "definition", 0.54),
        ("Binary Heap", "A tree-shaped structure commonly used to implement priority queues.", "mechanism", 0.43),
        ("Weighted Graph", "A graph whose edges carry numeric weights or costs.", "concept", 0.58),
        ("Edge Weight", "A numeric value attached to an edge, often representing cost or distance.", "property", 0.52),
        ("Negative Edge Weight", "An edge weight below zero, which breaks assumptions in some algorithms.", "property", 0.32),
        ("Nonnegative Edge Weights", "Edge weights that are zero or positive.", "property", 0.37),
        ("Shortest Path", "A path with minimum total cost between vertices.", "concept", 0.5),
        ("Shortest Path Algorithm", "An algorithm that finds minimum-cost paths in a graph.", "algorithm", 0.46),
        ("Relaxation", "The operation of improving a tentative shortest-path estimate.", "mechanism", 0.41),
        ("Big-O Notation", "A notation for describing asymptotic growth and algorithmic cost.", "definition", 0.55),
        ("Process Scheduling", "The operating-system activity of choosing which runnable process executes next.", "mechanism", 0.35),
        ("Encryption", "A security technique for transforming readable data into protected ciphertext.", "concept", 0.38),
        ("Relational Database", "A database organized into relations represented as tables.", "definition", 0.4),
    ]

    return {
        name: ensure_concept(db, name, description, concept_type, mastery, now)
        for name, description, concept_type, mastery in concept_rows
    }


def seed_hierarchy(db: Session, concepts: dict[str, models.Concept], now: datetime) -> None:
    computer_science = ensure_space(db, "Computer Science", "Algorithms, systems, data, and security.", now)
    japanese = ensure_space(db, "Japanese", "Language study and vocabulary.", now)
    finance = ensure_space(db, "Finance", "Markets, accounting, and personal finance.", now)

    algorithms = ensure_topic(db, computer_science, None, "Algorithms", "Algorithmic ideas and techniques.", now)
    data_structures = ensure_topic(db, computer_science, None, "Data Structures", "Structures for organizing data.", now)
    operating_systems = ensure_topic(db, computer_science, None, "Operating Systems", "How software manages hardware resources.", now)
    security = ensure_topic(db, computer_science, None, "Security", "Defensive and cryptographic computing ideas.", now)
    databases = ensure_topic(db, computer_science, None, "Databases", "Storage, query, and modeling systems.", now)
    graph_algorithms = ensure_topic(db, computer_science, algorithms, "Graph Algorithms", "Algorithms over vertices and edges.", now)
    ensure_topic(db, japanese, None, "Vocabulary", "Words and usage.", now)
    ensure_topic(db, japanese, None, "Grammar", "Sentence structure and particles.", now)
    ensure_topic(db, finance, None, "Markets", "Market behavior and instruments.", now)
    ensure_topic(db, finance, None, "Accounting", "Statements and financial records.", now)

    for name in [
        "Graph Theory",
        "Dijkstra's Algorithm",
        "Bellman-Ford Algorithm",
        "Breadth-First Search",
        "Depth-First Search",
        "Merge Sort",
        "Dynamic Programming",
        "Weighted Graph",
        "Edge Weight",
        "Negative Edge Weight",
        "Nonnegative Edge Weights",
        "Shortest Path",
        "Shortest Path Algorithm",
        "Relaxation",
        "Big-O Notation",
    ]:
        ensure_membership(concepts[name], graph_algorithms if name in {"Dijkstra's Algorithm", "Bellman-Ford Algorithm"} else algorithms)

    for name in ["Priority Queue", "Binary Heap"]:
        ensure_membership(concepts[name], data_structures)

    ensure_membership(concepts["Process Scheduling"], operating_systems)
    ensure_membership(concepts["Encryption"], security)
    ensure_membership(concepts["Relational Database"], databases)

    ensure_relationship(
        db,
        concepts,
        "Dijkstra's Algorithm",
        "REQUIRES",
        "Priority Queue",
        "The frontier must support efficient priority updates.",
        0.37,
        now,
    )
    ensure_relationship(
        db,
        concepts,
        "Breadth-First Search",
        "CONTRASTS_WITH",
        "Depth-First Search",
        "BFS explores by distance, while DFS follows one branch before backtracking.",
        0.44,
        now,
    )
    ensure_relationship(
        db,
        concepts,
        "Depth-First Search",
        "CONTRASTS_WITH",
        "Breadth-First Search",
        "DFS prioritizes depth, while BFS prioritizes breadth.",
        0.43,
        now,
    )


def ensure_concept(
    db: Session,
    name: str,
    description: str,
    concept_type: str,
    mastery: float,
    now: datetime,
) -> models.Concept:
    concept = db.query(models.Concept).filter(models.Concept.name == name).first()
    if concept is not None:
        return concept

    concept = models.Concept(
        name=name,
        description=description,
        concept_type=concept_type,
        mastery_score=mastery,
        confidence=0.45,
        next_review_at=now,
    )
    db.add(concept)
    db.flush()
    return concept


def ensure_relationship(
    db: Session,
    concepts: dict[str, models.Concept],
    source: str,
    rel_type: str,
    target: str,
    description: str,
    mastery: float,
    now: datetime,
) -> models.Relationship:
    relationship = (
        db.query(models.Relationship)
        .filter(
            models.Relationship.source_concept_id == concepts[source].id,
            models.Relationship.target_concept_id == concepts[target].id,
            models.Relationship.relationship_type == rel_type,
        )
        .first()
    )
    if relationship is not None:
        return relationship

    relationship = models.Relationship(
        source_concept_id=concepts[source].id,
        target_concept_id=concepts[target].id,
        relationship_type=rel_type,
        description=description,
        mastery_score=mastery,
        confidence=0.42,
        next_review_at=now,
    )
    db.add(relationship)
    db.flush()
    return relationship


def ensure_space(db: Session, name: str, description: str, now: datetime) -> models.KnowledgeSpace:
    space = db.query(models.KnowledgeSpace).filter(models.KnowledgeSpace.name == name).first()
    if space is not None:
        return space

    space = models.KnowledgeSpace(name=name, description=description, created_at=now, updated_at=now)
    db.add(space)
    db.flush()
    return space


def ensure_topic(
    db: Session,
    space: models.KnowledgeSpace,
    parent: models.Topic | None,
    name: str,
    description: str,
    now: datetime,
) -> models.Topic:
    topic = (
        db.query(models.Topic)
        .filter(
            models.Topic.knowledge_space_id == space.id,
            models.Topic.parent_topic_id == (parent.id if parent else None),
            models.Topic.name == name,
        )
        .first()
    )
    if topic is not None:
        return topic

    topic = models.Topic(
        knowledge_space_id=space.id,
        parent_topic_id=parent.id if parent else None,
        name=name,
        description=description,
        created_at=now,
        updated_at=now,
    )
    db.add(topic)
    db.flush()
    return topic


def ensure_membership(concept: models.Concept, topic: models.Topic) -> None:
    if all(existing.id != topic.id for existing in concept.topics):
        concept.topics.append(topic)

