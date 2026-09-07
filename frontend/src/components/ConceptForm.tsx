import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { api } from '../api/client';
import type { Concept, ConceptType } from '../types';

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
  onCreated: (concept: Concept) => void;
};

export function ConceptForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conceptType, setConceptType] = useState<ConceptType>('concept');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const concept = await api.createConcept({
        name,
        description,
        concept_type: conceptType,
      });
      setName('');
      setDescription('');
      setConceptType('concept');
      onCreated(concept);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create concept');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-line bg-panel p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_150px]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Concept name"
          className="h-10 rounded-md border border-line px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
        />
        <select
          value={conceptType}
          onChange={(event) => setConceptType(event.target.value as ConceptType)}
          className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-teal"
        >
          {conceptTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        rows={2}
        className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add concept
      </button>
    </form>
  );
}

