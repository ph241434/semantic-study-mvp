# Semantic Study

Semantic Study is a local-first learning application for organizing knowledge into a simple filesystem and opening individual concepts as semantic graphs.

The current prototype separates **organization** from **meaning**:

- the filesystem organizes broad subjects into folders and concept files;
- the semantic graph shows how concepts relate to one another;
- Study mode turns graph structure into lightweight retrieval practice.

The goal is to keep large knowledge domains easy to browse while using graphs only where relationships between concepts are useful for learning.

## Current Scope

The current frontend is centered on two views.

### 1. Knowledge filesystem

Knowledge is organized with folders and concept files.

```text
Knowledge
├── Algorithms/
├── Cybersecurity/
├── Operating Systems/
└── Databases/
```

Folders are organizational only. A concept file points to an existing semantic `Concept` record rather than duplicating it.

For example:

```text
Cybersecurity/
└── Cryptography/
    ├── Asymmetric Encryption
    ├── Symmetric Encryption
    ├── Hashing
    ├── Digital Signatures
    ├── Certificates
    └── PKI
```

Opening a concept file transitions into its semantic graph.

### 2. Semantic concept graph

A concept graph shows the selected concept and its directly relevant semantic neighborhood.

Example:

```text
          Asymmetric Encryption
             USES       USES
              /           \
       Public Key      Private Key
              \           /
            ENCRYPTS   DECRYPTS
                  \     /
                 Ciphertext
```

The graph is intentionally focused rather than recursively expanding the entire knowledge base.

Graph nodes can behave in three ways:

- **Linked concept** — opens another concept graph.
- **Description node** — opens a short explanation without navigating away.
- **Leaf concept** — displays the concept description when there are no relationships to visualize.

Breadcrumbs preserve the navigation path between the filesystem and concept graphs.

## Study Mode

Concept graphs support two modes:

- **Explore** — displays the graph normally.
- **Study** — hides information and asks the learner to retrieve it.

Study prompts currently cover:

- **Node retrieval** — identify the missing concept.
- **Relationship retrieval** — identify the relationship between two concepts.
- **Structural retrieval** — recall another concept involved in the graph.

The interface provides reveal and next-step controls for moving through retrieval prompts.

## Graph Layout

Semantic graphs use a **Fruchterman–Reingold-style force-directed layout implemented with `d3-force`**.

The layout combines:

- repulsion between nodes;
- attraction between connected nodes;
- collision handling to reduce overlap;
- centering forces;
- stronger anchoring for the root concept.

Initial node positions are seeded deterministically from concept IDs, and the simulation runs for a bounded number of ticks. This keeps graph layouts stable across repeated visits while still allowing the force system to organize the graph.

React Flow is used to render the graph UI.

## Data Model

The application keeps filesystem organization separate from semantic graph data.

### `KnowledgeEntry`

Represents an item in the filesystem.

```text
KnowledgeEntry
├── id
├── parent_id
├── name
├── entry_type     # folder | concept
├── concept_id     # null for folders
└── sort_order
```

A concept entry references an existing `Concept` through `concept_id`.

### `Concept`

Represents one semantic concept.

Examples:

```text
Asymmetric Encryption
Public Key
Private Key
Ciphertext
Digital Signature
Certificate
```

### `Relationship`

Connects two concepts with a labeled semantic relationship.

Examples:

```text
Asymmetric Encryption --USES--> Public Key
Public Key --ENCRYPTS--> Ciphertext
Private Key --DECRYPTS--> Ciphertext
```

Because organization and semantics are separate, the same concept can participate in many semantic contexts without being duplicated.

## Architecture

```text
Browser
  |
  v
React frontend
  |
  +-- KnowledgePage.tsx
  |     filesystem browsing
  |
  +-- GraphPage.tsx
  |     concept navigation
  |     Explore / Study modes
  |
  +-- GraphCanvas.tsx
  |     graph rendering
  |
  +-- graph/layout.ts
        d3-force layout
          |
          v
      API client
          |
          v
FastAPI backend
  |
  +-- /knowledge
  +-- /graph/{concept_id}
  +-- concept / relationship APIs
          |
          v
      SQLAlchemy
          |
          v
        SQLite
```

## Project Structure

```text
semantic-study-mvp/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── knowledge.py
│   │   │   ├── graph.py
│   │   │   ├── concepts.py
│   │   │   └── relationships.py
│   │   ├── crud.py
│   │   ├── database.py
│   │   ├── graph_service.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── seed.py
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── components/
│   │   │   └── GraphCanvas.tsx
│   │   ├── graph/
│   │   │   └── layout.ts
│   │   ├── pages/
│   │   │   ├── KnowledgePage.tsx
│   │   │   └── GraphPage.tsx
│   │   ├── App.tsx
│   │   └── types/
│   └── package.json
└── README.md
```

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Flow (`@xyflow/react`)
- `d3-force`
- Vitest
- Testing Library

### Backend

- Python
- FastAPI
- SQLAlchemy
- SQLite
- pytest

## Requirements

- Python 3.12+
- Node.js 20+
- pnpm 9+

The application runs locally and does not require Docker, authentication, cloud services, or an external database.

## Backend Setup

From the project root:

```powershell
cd .\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates the SQLite database automatically and loads seed data when the database is empty.

## Frontend Setup

Open a second terminal:

```powershell
cd .\frontend
pnpm install
pnpm dev
```

Then open:

```text
http://127.0.0.1:5173
```

The frontend connects to:

```text
http://localhost:8000
```

by default.

A different backend URL can be supplied with:

```text
VITE_API_BASE_URL
```

## Main API Endpoints

### Knowledge navigation

```text
GET /knowledge
```

Returns the filesystem entries used by the knowledge browser.

### Semantic graph

```text
GET /graph/{concept_id}?depth=1
```

Returns the selected concept, visible neighboring concepts, and relationships among the visible nodes.

### Concepts

```text
GET    /concepts
POST   /concepts
GET    /concepts/{id}
PATCH  /concepts/{id}
DELETE /concepts/{id}
```

### Relationships

```text
GET    /relationships
POST   /relationships
PATCH  /relationships/{id}
DELETE /relationships/{id}
```

The backend also contains earlier study, question, dashboard, and search APIs. The current frontend prototype is primarily focused on the filesystem, semantic graph, and graph-based retrieval workflow.

## Seed Data

The current seed data is designed to demonstrate the filesystem/semantic-graph split.

It includes broad organizational areas such as:

- Algorithms
- Cybersecurity
- Operating Systems
- Databases

The cybersecurity content includes graph-ready concepts such as asymmetric encryption, public/private keys, ciphertext, digital signatures, certificates, and PKI.

The seed also includes relationships between visible concepts so process-oriented graphs can express connections such as:

```text
Public Key --ENCRYPTS--> Ciphertext
Private Key --DECRYPTS--> Ciphertext
```

To rebuild the local seed database, stop the backend, delete the SQLite database, and restart the API.

From `backend`:

```powershell
Remove-Item .\semantic_study.db
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Testing

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

Production frontend build:

```powershell
cd .\frontend
pnpm build
```

## Current Design Direction

The project is currently a learning and visualization prototype.

The central design principle is:

```text
filesystem = where knowledge is organized
semantic graph = how knowledge is related
study mode = how relationships are retrieved from memory
```

The force-directed layout is intentionally experimental and may be replaced or refined as the graph interaction model develops.
