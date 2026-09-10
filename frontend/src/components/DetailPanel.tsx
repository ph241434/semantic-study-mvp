import { ArrowRight, Maximize2, PenLine, Save, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import { MasteryBadge } from './MasteryBadge';
import type { Concept, ConceptType, Question, Relationship } from '../types';

const conceptTypes: ConceptType[] = [
  'concept',
  'definition',
  'mechanism',
  'property',
  'example',
  'theorem',
  'algorithm',
  'application',
];

type Props = {
  concept: Concept | null;
  relationship: Relationship | null;
  relationships: Relationship[];
  questions: Question[];
  concepts: Concept[];
  onConceptSaved: (concept: Concept) => void;
  onRelationshipSaved: (relationship: Relationship) => void;
  onRelationshipDeleted?: (relationshipId: number) => void;
  onStudyQuestion: (question: Question) => void;
  onExpandConcept: (conceptId: number) => void;
};

function formatDate(value: string | null) {
  if (!value) return 'Not reviewed';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function DetailPanel({
  concept,
  relationship,
  relationships,
  questions,
  concepts,
  onConceptSaved,
  onRelationshipSaved,
  onRelationshipDeleted,
  onStudyQuestion,
  onExpandConcept,
}: Props) {
  const [editingConcept, setEditingConcept] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState(false);
  const [conceptDraft, setConceptDraft] = useState({
    name: concept?.name ?? '',
    description: concept?.description ?? '',
    concept_type: (concept?.concept_type ?? 'concept') as ConceptType,
  });
  const [relationshipDraft, setRelationshipDraft] = useState({
    relationship_type: relationship?.relationship_type ?? 'USES',
    description: relationship?.description ?? '',
  });
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setEditingConcept(false);
    setConceptDraft({
      name: concept?.name ?? '',
      description: concept?.description ?? '',
      concept_type: (concept?.concept_type ?? 'concept') as ConceptType,
    });
  }, [concept?.id]);

  useEffect(() => {
    setEditingRelationship(false);
    setActionError(null);
    setRelationshipDraft({
      relationship_type: relationship?.relationship_type ?? 'USES',
      description: relationship?.description ?? '',
    });
  }, [relationship?.id]);

  const conceptRelationships = useMemo(() => {
    if (!concept) return { incoming: [], outgoing: [] };
    return {
      incoming: relationships.filter((item) => item.target_concept_id === concept.id),
      outgoing: relationships.filter((item) => item.source_concept_id === concept.id),
    };
  }, [concept, relationships]);

  const relevantQuestions = useMemo(() => {
    if (relationship) return questions.filter((question) => question.relationship_id === relationship.id);
    if (concept) return questions.filter((question) => question.concept_id === concept.id);
    return [];
  }, [concept, relationship, questions]);

  async function saveConcept(event: FormEvent) {
    event.preventDefault();
    if (!concept) return;
    const saved = await api.updateConcept(concept.id, conceptDraft);
    onConceptSaved(saved);
    setEditingConcept(false);
  }

  async function saveRelationship(event: FormEvent) {
    event.preventDefault();
    if (!relationship) return;
    const saved = await api.updateRelationship(relationship.id, relationshipDraft);
    onRelationshipSaved(saved);
    setEditingRelationship(false);
  }

  async function deleteRelationship() {
    if (!relationship || !onRelationshipDeleted) return;
    if (!window.confirm('Delete this relationship?')) return;
    try {
      setActionError(null);
      await api.deleteRelationship(relationship.id);
      onRelationshipDeleted(relationship.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete relationship');
    }
  }

  if (!concept && !relationship) {
    return (
      <aside className="rounded-md border border-line bg-panel p-4 text-sm text-ink/65">
        Pick a node or relationship to inspect mastery, schedule, links, and questions.
      </aside>
    );
  }

  if (relationship) {
    return (
      <aside className="space-y-4 rounded-md border border-line bg-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-plum">Relationship</p>
            <h2 className="mt-1 text-lg font-bold leading-tight text-ink">
              {relationship.source_name}
              <ArrowRight className="mx-2 inline h-4 w-4 text-ink/45" />
              {relationship.target_name}
            </h2>
          </div>
          <MasteryBadge score={relationship.mastery_score} compact />
        </div>

        {editingRelationship ? (
          <form onSubmit={saveRelationship} className="space-y-3">
            <input
              value={relationshipDraft.relationship_type}
              onChange={(event) =>
                setRelationshipDraft((draft) => ({ ...draft, relationship_type: event.target.value }))
              }
              className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-teal"
            />
            <textarea
              value={relationshipDraft.description}
              onChange={(event) => setRelationshipDraft((draft) => ({ ...draft, description: event.target.value }))}
              rows={4}
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-teal"
            />
            <div className="flex gap-2">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white">
                <Save className="h-4 w-4" />
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingRelationship(false)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-paper px-3 py-2">
                <span className="font-semibold">{relationship.relationship_type}</span>
                <span className="text-ink/60">confidence {Math.round(relationship.confidence * 100)}%</span>
              </div>
              <p className="leading-6 text-ink/75">{relationship.description || 'No description yet.'}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink/65">
                <span>Last: {formatDate(relationship.last_reviewed_at)}</span>
                <span>Next: {formatDate(relationship.next_review_at)}</span>
              </div>
            </div>
            {actionError && <p className="text-sm text-rust">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditingRelationship(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
              >
                <PenLine className="h-4 w-4" />
                Edit
              </button>
              {onRelationshipDeleted && (
                <button
                  type="button"
                  onClick={deleteRelationship}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-rust/40 px-3 text-sm font-semibold text-rust hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
          </>
        )}

        <QuestionList questions={relevantQuestions} onStudyQuestion={onStudyQuestion} />
      </aside>
    );
  }

  if (!concept) return null;

  return (
    <aside className="space-y-4 rounded-md border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal">Concept</p>
          <h2 className="mt-1 text-xl font-bold leading-tight text-ink">{concept.name}</h2>
        </div>
        <MasteryBadge score={concept.mastery_score} compact />
      </div>

      {editingConcept ? (
        <form onSubmit={saveConcept} className="space-y-3">
          <input
            value={conceptDraft.name}
            onChange={(event) => setConceptDraft((draft) => ({ ...draft, name: event.target.value }))}
            className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-teal"
          />
          <select
            value={conceptDraft.concept_type}
            onChange={(event) =>
              setConceptDraft((draft) => ({ ...draft, concept_type: event.target.value as ConceptType }))
            }
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
          >
            {conceptTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <textarea
            value={conceptDraft.description}
            onChange={(event) => setConceptDraft((draft) => ({ ...draft, description: event.target.value }))}
            rows={4}
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <div className="flex gap-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white">
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingConcept(false)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="space-y-3 text-sm">
            <p className="leading-6 text-ink/75">{concept.description || 'No description yet.'}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink/65">
              <span>Type: {concept.concept_type}</span>
              <span>Confidence: {Math.round(concept.confidence * 100)}%</span>
              <span>Last: {formatDate(concept.last_reviewed_at)}</span>
              <span>Next: {formatDate(concept.next_review_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditingConcept(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
            >
              <PenLine className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onExpandConcept(concept.id)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
            >
              <Maximize2 className="h-4 w-4" />
              Expand
            </button>
          </div>
        </>
      )}

      <RelationshipList title="Outgoing" relationships={conceptRelationships.outgoing} concepts={concepts} />
      <RelationshipList title="Incoming" relationships={conceptRelationships.incoming} concepts={concepts} />
      <QuestionList questions={relevantQuestions} onStudyQuestion={onStudyQuestion} />
    </aside>
  );
}

function RelationshipList({
  title,
  relationships,
  concepts,
}: {
  title: string;
  relationships: Relationship[];
  concepts: Concept[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {relationships.length === 0 ? (
        <p className="text-sm text-ink/55">None yet.</p>
      ) : (
        <div className="space-y-2">
          {relationships.map((relationship) => {
            const source = concepts.find((concept) => concept.id === relationship.source_concept_id)?.name;
            const target = concepts.find((concept) => concept.id === relationship.target_concept_id)?.name;
            return (
              <div key={relationship.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{relationship.relationship_type}</span>
                  <MasteryBadge score={relationship.mastery_score} compact />
                </div>
                <p className="mt-1 truncate text-xs text-ink/60">
                  {source} {'->'} {target}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuestionList({
  questions,
  onStudyQuestion,
}: {
  questions: Question[];
  onStudyQuestion: (question: Question) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-ink">Questions</h3>
      {questions.length === 0 ? (
        <p className="text-sm text-ink/55">No linked questions yet.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((question) => (
            <div key={question.id} className="rounded-md border border-line px-3 py-2 text-sm">
              <p className="font-semibold leading-5">{question.question_text}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-ink/55">{question.question_type}</span>
                <button
                  type="button"
                  onClick={() => onStudyQuestion(question)}
                  className="rounded-md bg-paper px-2 py-1 text-xs font-semibold hover:bg-line/40"
                >
                  Study
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
