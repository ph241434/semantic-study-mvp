from fastapi.testclient import TestClient


def test_review_updates_relationship_mastery(client: TestClient):
    source = client.post("/concepts", json={"name": "Dijkstra", "concept_type": "algorithm"}).json()
    target = client.post("/concepts", json={"name": "Nonnegative Weights", "concept_type": "property"}).json()
    relationship = client.post(
        "/relationships",
        json={
            "source_concept_id": source["id"],
            "target_concept_id": target["id"],
            "relationship_type": "REQUIRES",
        },
    ).json()
    question = client.post(
        "/questions",
        json={
            "question_text": "Why does Dijkstra require nonnegative weights?",
            "answer_text": "Negative edges can invalidate a settled greedy distance.",
            "question_type": "RELATIONSHIP_RECALL",
            "relationship_id": relationship["id"],
        },
    ).json()

    review = client.post("/study/review", json={"question_id": question["id"], "rating": "GOOD"})

    assert review.status_code == 200
    body = review.json()
    assert body["relationship"]["mastery_score"] > relationship["mastery_score"]
    assert body["relationship"]["next_review_at"] is not None


def test_due_questions_prioritize_relationships(client: TestClient):
    source = client.post("/concepts", json={"name": "A", "concept_type": "concept"}).json()
    target = client.post("/concepts", json={"name": "B", "concept_type": "concept"}).json()
    relationship = client.post(
        "/relationships",
        json={"source_concept_id": source["id"], "target_concept_id": target["id"], "relationship_type": "CAUSES"},
    ).json()
    client.post(
        "/questions",
        json={
            "question_text": "What is A?",
            "answer_text": "A concept.",
            "question_type": "CONCEPT_RECALL",
            "concept_id": source["id"],
        },
    )
    rel_question = client.post(
        "/questions",
        json={
            "question_text": "How does A cause B?",
            "answer_text": "Through a causal relationship.",
            "question_type": "RELATIONSHIP_RECALL",
            "relationship_id": relationship["id"],
        },
    ).json()

    due = client.get("/study/due").json()

    assert due[0]["id"] == rel_question["id"]

