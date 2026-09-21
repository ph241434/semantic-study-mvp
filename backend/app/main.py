import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import SessionLocal, init_db
from .routers import (
    concepts,
    dashboard,
    flowcharts,
    graph,
    graph_views,
    knowledge,
    questions,
    relationships,
    search,
    study,
)
from .seed import seed_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("SEMANTIC_STUDY_SKIP_STARTUP") != "1":
        init_db()
        db = SessionLocal()
        try:
            seed_database(db)
        finally:
            db.close()
    yield


app = FastAPI(
    title="Semantic Study",
    description="A local-first semantic knowledge graph with active recall and mastery tracking.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(concepts.router)
app.include_router(relationships.router)
app.include_router(graph.router)
app.include_router(graph_views.router)
app.include_router(flowcharts.router)
app.include_router(knowledge.router)
app.include_router(questions.router)
app.include_router(study.router)
app.include_router(dashboard.router)
app.include_router(search.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
