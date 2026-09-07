# Semantic Study

Semantic Study is a local-first study application for building a semantic knowledge graph, generating active-recall practice, and tracking mastery separately for both concepts and relationships.

The MVP combines:

- Concept and relationship CRUD
- SQLite persistence
- Local graph traversal by depth
- Relationship-labeled graph visualization with React Flow
- Active recall review with Again / Hard / Good / Easy ratings
- Transparent mastery updates and spaced scheduling
- Weakest concept and weakest relationship dashboard sections
- Basic graph reconstruction review
- Seed data for a small Computer Science graph

## Architecture

```text
semantic-study/
├── backend/
│   ├── app/
│   │   ├── crud.py
│   │   ├── dashboard_service.py
│   │   ├── database.py
│   │   ├── graph_service.py
│   │   ├── main.py
│   │   ├── mastery.py
│   │   ├── models.py
│   │   ├── scheduler.py
│   │   ├── schemas.py
│   │   ├── seed.py
│   │   └── routers/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── styles/
│   │   └── types/
│   └── package.json
└── README.md
```

Backend responsibilities are separated into storage, graph traversal, mastery calculation, scheduling, dashboard composition, and API routers. Frontend components call the REST API and keep graph styling centralized in `src/styles/mastery.ts`.

## Requirements

- Python 3.12+
- Node.js 20+
- pnpm 9+

The app does not require Docker, authentication, cloud services, or an external database.

## Backend Setup

From PowerShell:

```powershell
cd .\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates `backend\semantic_study.db` automatically on startup and loads seed data if the database is empty.

## Frontend Setup

From a second PowerShell window:

```powershell
cd .\frontend
pnpm install
pnpm dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173
```

If your pnpm security policy blocks `esbuild`, approve it for this project:

```powershell
pnpm approve-builds esbuild
```

## Seed Data

Seed data is loaded automatically when the backend starts with an empty database. It includes concepts such as Graph Theory, Dijkstra's Algorithm, Bellman-Ford Algorithm, Priority Queue, Binary Heap, Weighted Graph, Edge Weight, Negative Edge Weight, Nonnegative Edge Weights, Shortest Path, Relaxation, and Big-O Notation.

To reset the local data:

```powershell
cd .\backend
Remove-Item .\semantic_study.db
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## API

Core endpoints:

```text
GET    /concepts
POST   /concepts
GET    /concepts/{id}
PATCH  /concepts/{id}
DELETE /concepts/{id}

GET    /relationships
POST   /relationships
PATCH  /relationships/{id}
DELETE /relationships/{id}

GET    /graph/{concept_id}?depth=1

GET    /questions
POST   /questions

GET    /study/due
POST   /study/review
GET    /study/reconstruction/{concept_id}?depth=1

GET    /dashboard
GET    /search?q=hash
```

## Tests

Backend:

```powershell
cd .\backend
.\.venv\Scripts\python.exe -m pytest
```

Frontend:

```powershell
cd .\frontend
pnpm test
```

Build frontend:

```powershell
cd .\frontend
pnpm build
```

## Notes

The mastery model is intentionally simple and transparent. Ratings update mastery by fixed deltas after applying light time decay, and scheduling uses a small rating-based interval multiplier. Both are isolated in `mastery.py` and `scheduler.py` so FSRS or another model can replace them later.

