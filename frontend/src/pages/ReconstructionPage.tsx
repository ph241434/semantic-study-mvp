import { Eye, Map, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '../api/client';
import { GraphCanvas } from '../components/GraphCanvas';
import { RatingButtons } from '../components/RatingButtons';
import type { Concept, GraphResponse, Rating, ReconstructionResponse } from '../types';

type Props = {
  concepts: Concept[];
  selectedConceptId: number | null;
  onSelectConcept: (conceptId: number) => void;
  onReviewed: () => Promise<void>;
};

export function ReconstructionPage({ concepts, selectedConceptId, onSelectConcept, onReviewed }: Props) {
  const [depth, setDepth] = useState(1);
  const [reconstruction, setReconstruction] = useState<ReconstructionResponse | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState<string | null>(null);

  async function load() {
    if (!selectedConceptId) return;
    setLoading(true);
    setError(null);
    setRated(null);
    setRevealed(false);
    try {
      setReconstruction(await api.reconstruction(selectedConceptId, depth));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reconstruction activity');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [selectedConceptId, depth]);

  async function rate(rating: Rating) {
    if (!reconstruction) return;
    setLoading(true);
    try {
      await api.review({ question_id: reconstruction.question.id, rating });
      setRated(rating);
      await onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save rating');
    } finally {
      setLoading(false);
    }
  }

  const hiddenGraph: GraphResponse | null =
    reconstruction && revealed
      ? reconstruction.graph
      : reconstruction
        ? { ...reconstruction.graph, nodes: [reconstruction.concept], relationships: [] }
        : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-md border border-line bg-panel p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-plum">Reconstruction</p>
          <h1 className="mt-1 text-xl font-bold text-ink">Recall the neighborhood</h1>
        </div>
        <select
          value={selectedConceptId ?? ''}
          onChange={(event) => onSelectConcept(Number(event.target.value))}
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          <option value="">Choose concept</option>
          {concepts.map((concept) => (
            <option key={concept.id} value={concept.id}>
              {concept.name}
            </option>
          ))}
        </select>
        <select
          value={depth}
          onChange={(event) => setDepth(Number(event.target.value))}
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          <option value={1}>Depth 1</option>
          <option value={2}>Depth 2</option>
          <option value={3}>Depth 3</option>
        </select>

        {reconstruction && (
          <div className="rounded-md bg-paper p-4">
            <Map className="h-5 w-5 text-plum" />
            <p className="mt-3 text-base font-bold leading-6 text-ink">{reconstruction.question.question_text}</p>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Think through the neighboring concepts and the labels between them before revealing the graph.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            disabled={!reconstruction}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            Reveal graph
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {revealed && <RatingButtons onRate={rate} disabled={loading} />}
        {rated && <p className="rounded-md bg-paper p-3 text-sm font-semibold text-ink">Saved rating: {rated}</p>}
        {error && <p className="rounded-md border border-rust/30 bg-red-50 p-3 text-sm text-rust">{error}</p>}
      </aside>

      <section className="min-h-[620px]">
        {loading && <p className="mb-3 rounded-md border border-line bg-panel p-3 text-sm text-ink/55">Working...</p>}
        <GraphCanvas
          graph={hiddenGraph}
          selectedConceptId={selectedConceptId}
          selectedRelationshipId={null}
          onSelectConcept={onSelectConcept}
          onSelectRelationship={() => undefined}
        />
      </section>
    </div>
  );
}

