import { Link2, Plus } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import type { Concept, Relationship } from '../types';

const relationshipTypes = [
  'IS_A',
  'PART_OF',
  'USES',
  'REQUIRES',
  'CAUSES',
  'IMPLIES',
  'CONTRASTS_WITH',
  'EXAMPLE_OF',
  'SOLVES',
  'DERIVED_FROM',
  'IMPLEMENTED_BY',
  'PRODUCES',
  'DEPENDS_ON',
  'SUPPORTS',
];

type Props = {
  concepts: Concept[];
  selectedConceptId: number | null;
  onCreated: (relationship: Relationship) => void;
};

export function RelationshipForm({ concepts, selectedConceptId, onCreated }: Props) {
  const [sourceId, setSourceId] = useState<number | ''>(selectedConceptId ?? '');
  const [targetId, setTargetId] = useState<number | ''>('');
  const [relationshipType, setRelationshipType] = useState('USES');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedConceptId) {
      setSourceId(selectedConceptId);
    }
  }, [selectedConceptId]);

  const canSubmit = useMemo(
    () => Number(sourceId) > 0 && Number(targetId) > 0 && Number(sourceId) !== Number(targetId),
    [sourceId, targetId],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const relationship = await api.createRelationship({
        source_concept_id: Number(sourceId),
        target_concept_id: Number(targetId),
        relationship_type: relationshipType,
        description,
      });
      setTargetId('');
      setDescription('');
      onCreated(relationship);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create relationship');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-line bg-panel p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_170px_1fr]">
        <select
          value={sourceId}
          onChange={(event) => setSourceId(Number(event.target.value))}
          className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          <option value="">Source</option>
          {concepts.map((concept) => (
            <option key={concept.id} value={concept.id}>
              {concept.name}
            </option>
          ))}
        </select>
        <select
          value={relationshipType}
          onChange={(event) => setRelationshipType(event.target.value)}
          className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          {relationshipTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          value={targetId}
          onChange={(event) => setTargetId(Number(event.target.value))}
          className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          <option value="">Target</option>
          {concepts.map((concept) => (
            <option key={concept.id} value={concept.id}>
              {concept.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Relationship description"
        rows={2}
        className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <button
        type="submit"
        disabled={saving || !canSubmit}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {canSubmit ? <Plus className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        Add relationship
      </button>
    </form>
  );
}
