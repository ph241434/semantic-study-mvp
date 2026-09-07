import { Layers, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import { ConceptForm } from '../components/ConceptForm';
import { DetailPanel } from '../components/DetailPanel';
import { GraphCanvas } from '../components/GraphCanvas';
import { RelationshipForm } from '../components/RelationshipForm';
import { SearchBox } from '../components/SearchBox';
import type { Concept, GraphResponse, Question, Relationship } from '../types';

type Props = {
  concepts: Concept[];
  relationships: Relationship[];
  questions: Question[];
  selectedConceptId: number | null;
  selectedRelationshipId: number | null;
  onSelectConcept: (conceptId: number) => void;
  onSelectRelationship: (relationshipId: number | null) => void;
  onCatalogChanged: () => Promise<void>;
  onStudyQuestion: (question: Question) => void;
};

export function GraphPage({
  concepts,
  relationships,
  questions,
  selectedConceptId,
  selectedRelationshipId,
  onSelectConcept,
  onSelectRelationship,
  onCatalogChanged,
  onStudyQuestion,
}: Props) {
  const [depth, setDepth] = useState(1);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId) ?? null;
  const selectedRelationship = relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;

  useEffect(() => {
    if (!selectedConceptId) {
      setGraph(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([api.graph(selectedConceptId, depth), ...Array.from(expandedIds).map((id) => api.graph(id, 1))])
      .then((graphs) => {
        if (!active) return;
        const merged = mergeGraphs(graphs, selectedConceptId, depth);
        setGraph(merged);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load graph');
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [selectedConceptId, depth, expandedIds]);

  const detailConcept = selectedRelationship ? null : selectedConcept;

  const graphLabel = useMemo(() => {
    if (!selectedConcept) return 'No concept selected';
    return `${selectedConcept.name} + depth ${depth}`;
  }, [depth, selectedConcept]);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <ConceptForm
          onCreated={async (concept) => {
            await onCatalogChanged();
            onSelectConcept(concept.id);
          }}
        />
        <RelationshipForm
          concepts={concepts}
          selectedConceptId={selectedConceptId}
          onCreated={async (relationship) => {
            await onCatalogChanged();
            onSelectRelationship(relationship.id);
            onSelectConcept(relationship.source_concept_id);
          }}
        />
      </section>

      <section className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-md border border-line bg-panel p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Layers className="h-5 w-5 shrink-0 text-teal" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{graphLabel}</p>
                <p className="text-xs text-ink/55">{graph?.nodes.length ?? 0} nodes in view</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchBox
                onSelect={(concept) => {
                  onSelectRelationship(null);
                  onSelectConcept(concept.id);
                }}
              />
              <select
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
                className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
              >
                <option value={1}>Depth 1</option>
                <option value={2}>Depth 2</option>
                <option value={3}>Depth 3</option>
              </select>
              <button
                type="button"
                onClick={() => selectedConceptId && setExpandedIds(new Set())}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
                title="Reset expanded nodes"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && <div className="rounded-md border border-rust/30 bg-red-50 p-3 text-sm text-rust">{error}</div>}
          {loading && <div className="rounded-md border border-line bg-panel p-3 text-sm text-ink/55">Loading graph...</div>}
          <GraphCanvas
            graph={graph}
            selectedConceptId={selectedConceptId}
            selectedRelationshipId={selectedRelationshipId}
            onSelectConcept={(conceptId) => {
              onSelectRelationship(null);
              onSelectConcept(conceptId);
            }}
            onSelectRelationship={onSelectRelationship}
          />
        </div>

        <DetailPanel
          concept={detailConcept}
          relationship={selectedRelationship}
          relationships={relationships}
          questions={questions}
          concepts={concepts}
          onConceptSaved={async (concept) => {
            await onCatalogChanged();
            onSelectConcept(concept.id);
          }}
          onRelationshipSaved={async (relationship) => {
            await onCatalogChanged();
            onSelectRelationship(relationship.id);
          }}
          onStudyQuestion={onStudyQuestion}
          onExpandConcept={(conceptId) => {
            setExpandedIds((current) => new Set(current).add(conceptId));
          }}
        />
      </section>
    </div>
  );
}

function mergeGraphs(graphs: GraphResponse[], centerId: number, depth: number): GraphResponse {
  const nodeMap = new Map<number, Concept>();
  const relationshipMap = new Map<number, Relationship>();
  graphs.forEach((graph) => {
    graph.nodes.forEach((node) => nodeMap.set(node.id, node));
    graph.relationships.forEach((relationship) => relationshipMap.set(relationship.id, relationship));
  });
  return {
    center_id: centerId,
    depth,
    nodes: Array.from(nodeMap.values()),
    relationships: Array.from(relationshipMap.values()),
  };
}

