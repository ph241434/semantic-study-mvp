import { BarChart3, BookOpenCheck, BrainCircuit, GitFork, Map, Network, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from './api/client';
import { SearchBox } from './components/SearchBox';
import { DashboardPage } from './pages/DashboardPage';
import { GraphPage } from './pages/GraphPage';
import { ReconstructionPage } from './pages/ReconstructionPage';
import { StudyPage } from './pages/StudyPage';
import type { Concept, Question, Relationship } from './types';

type View = 'dashboard' | 'graph' | 'study' | 'reconstruction';

const navItems: { view: View; label: string; icon: ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <BarChart3 /> },
  { view: 'graph', label: 'Graph', icon: <Network /> },
  { view: 'study', label: 'Study', icon: <BookOpenCheck /> },
  { view: 'reconstruction', label: 'Reconstruct', icon: <Map /> },
];

function App() {
  const [view, setView] = useState<View>('graph');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<number | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<number | null>(null);
  const [focusQuestion, setFocusQuestion] = useState<Question | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conceptData, relationshipData, questionData] = await Promise.all([
        api.concepts(),
        api.relationships(),
        api.questions(),
      ]);
      setConcepts(conceptData);
      setRelationships(relationshipData);
      setQuestions(questionData);
      setSelectedConceptId((current) => {
        if (current && conceptData.some((concept) => concept.id === current)) return current;
        return conceptData.find((concept) => concept.name.includes("Dijkstra"))?.id ?? conceptData[0]?.id ?? null;
      });
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the local API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedConcept = useMemo(
    () => concepts.find((concept) => concept.id === selectedConceptId) ?? null,
    [concepts, selectedConceptId],
  );

  function openRelationship(relationship: Relationship) {
    setSelectedConceptId(relationship.source_concept_id);
    setSelectedRelationshipId(relationship.id);
    setView('graph');
  }

  async function handleReviewed() {
    await loadCatalog();
  }

  return (
    <div className="min-h-screen text-ink">
      <header className="border-b border-line bg-panel/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-ink text-white">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-ink">Semantic Study</h1>
              <p className="truncate text-sm text-ink/58">
                {selectedConcept ? `Centered on ${selectedConcept.name}` : 'Local graph study workspace'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="w-full lg:w-80">
              <SearchBox
                onSelect={(concept) => {
                  setSelectedConceptId(concept.id);
                  setSelectedRelationshipId(null);
                  setView('graph');
                }}
              />
            </div>
            <nav className="grid grid-cols-2 gap-2 sm:flex">
              {navItems.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => setView(item.view)}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                    view === item.view
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-ink hover:bg-paper'
                  }`}
                >
                  <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        {error && (
          <div className="mb-4 rounded-md border border-rust/30 bg-red-50 p-4 text-sm text-rust">
            {error}. Start the FastAPI backend, then refresh.
          </div>
        )}
        {loading && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink/60">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Syncing local data
          </div>
        )}

        {view === 'dashboard' && (
          <DashboardPage
            concepts={concepts}
            relationships={relationships}
            onOpenConcept={(conceptId) => {
              setSelectedConceptId(conceptId);
              setSelectedRelationshipId(null);
              setView('graph');
            }}
            onOpenRelationship={openRelationship}
            refreshKey={refreshKey}
          />
        )}

        {view === 'graph' && (
          <GraphPage
            concepts={concepts}
            relationships={relationships}
            questions={questions}
            selectedConceptId={selectedConceptId}
            selectedRelationshipId={selectedRelationshipId}
            onSelectConcept={setSelectedConceptId}
            onSelectRelationship={setSelectedRelationshipId}
            onCatalogChanged={loadCatalog}
            onStudyQuestion={(question) => {
              setFocusQuestion(question);
              setView('study');
            }}
          />
        )}

        {view === 'study' && (
          <StudyPage
            concepts={concepts}
            relationships={relationships}
            focusQuestion={focusQuestion}
            onReviewed={handleReviewed}
          />
        )}

        {view === 'reconstruction' && (
          <ReconstructionPage
            concepts={concepts}
            selectedConceptId={selectedConceptId}
            onSelectConcept={setSelectedConceptId}
            onReviewed={handleReviewed}
          />
        )}
      </main>
    </div>
  );
}

export default App;
