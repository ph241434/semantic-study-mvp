import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from './api/client';
import { createViewStateStore } from './flowchart/viewStateStore';
import { FlowchartPage } from './pages/FlowchartPage';
import { GraphPage } from './pages/GraphPage';
import { KnowledgePage } from './pages/KnowledgePage';
import type { FilesystemBreadcrumbSegment, KnowledgeEntry, TrailEntry } from './types';

type Screen =
  | { mode: 'flowchart' }
  | { mode: 'filesystem'; folderId: number | null }
  | { mode: 'graph'; originFolderId: number | null; trail: TrailEntry[] };

// The flowchart workspace is the primary screen; the knowledge browser and concept explorer stay one click away.
const INITIAL_SCREEN: Screen = { mode: 'flowchart' };

function App() {
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);
  // Kept here so each flowchart's positions / pan / zoom survive leaving and returning to the workspace.
  const viewStates = useRef(createViewStateStore()).current;

  useEffect(() => {
    let active = true;
    api
      .knowledge()
      .then((response) => {
        if (active) setEntries(response);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not reach the local API');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.history.replaceState(INITIAL_SCREEN, '');
  }, []);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state = event.state as Screen | null;
      if (state) setScreen(state);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const entriesById = useMemo(() => new Map((entries ?? []).map((entry) => [entry.id, entry])), [entries]);

  const linkedConceptIds = useMemo(() => {
    const ids = new Set<number>();
    (entries ?? []).forEach((entry) => {
      if (entry.entry_type === 'concept' && entry.concept_id !== null) ids.add(entry.concept_id);
    });
    return ids;
  }, [entries]);

  function ancestorPath(folderId: number | null): FilesystemBreadcrumbSegment[] {
    const path: FilesystemBreadcrumbSegment[] = [];
    let currentId = folderId;

    while (currentId !== null) {
      const entry = entriesById.get(currentId);
      if (!entry) break;
      path.unshift({ id: entry.id, name: entry.name });
      currentId = entry.parent_id;
    }

    path.unshift({ id: null, name: 'Knowledge' });
    return path;
  }

  function navigate(next: Screen) {
    setScreen(next);
    window.history.pushState(next, '');
  }

  /** A folder created from the flowchart sidebar is merged straight into the shared entries list — no refetch. */
  function handleEntryCreated(entry: KnowledgeEntry) {
    setEntries((current) => (current ? [...current, entry] : [entry]));
  }

  if (error) {
    return <p className="proto-status proto-status-error">{error}</p>;
  }

  if (!entries) {
    return <p className="proto-status">Loading…</p>;
  }

  if (screen.mode === 'flowchart') {
    return (
      <FlowchartPage
        entries={entries}
        viewStates={viewStates}
        onOpenKnowledge={() => navigate({ mode: 'filesystem', folderId: null })}
        onOpenConceptExplorer={(conceptId, name) =>
          navigate({ mode: 'graph', originFolderId: null, trail: [{ id: conceptId, name }] })
        }
        onEntryCreated={handleEntryCreated}
      />
    );
  }

  if (screen.mode === 'filesystem') {
    return (
      <KnowledgePage
        folderId={screen.folderId}
        entries={entries}
        onOpenFlowcharts={() => navigate({ mode: 'flowchart' })}
        onNavigateFolder={(folderId) => navigate({ mode: 'filesystem', folderId })}
        onOpenConcept={(conceptId, name, fromFolderId) =>
          navigate({ mode: 'graph', originFolderId: fromFolderId, trail: [{ id: conceptId, name }] })
        }
      />
    );
  }

  return (
    <GraphPage
      trail={screen.trail}
      filesystemBreadcrumb={ancestorPath(screen.originFolderId)}
      linkedConceptIds={linkedConceptIds}
      onTrailChange={(trail) => navigate({ mode: 'graph', originFolderId: screen.originFolderId, trail })}
      onExitToFilesystem={(folderId) => navigate({ mode: 'filesystem', folderId })}
      onOpenFlowcharts={() => navigate({ mode: 'flowchart' })}
    />
  );
}

export default App;
