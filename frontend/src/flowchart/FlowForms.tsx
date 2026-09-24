import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { api } from '../api/client';
import type { Concept, FlowNodeType, Flowchart, KnowledgeEntry } from '../types';
import { FLOW_NODE_TYPES, nodeVisual } from './flowStyles';

/** Compact, non-modal wrapper for a creation form rendered inline next to the sidebar row it belongs to. */
export function InlineCreatePanel({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <section className="flow-inline-panel" role="group" aria-label={title}>
      <header className="flow-inline-panel-header">
        <h3>{title}</h3>
        <button type="button" className="flow-icon-btn" onClick={onCancel} title="Cancel" aria-label="Cancel">
          <X size={14} />
        </button>
      </header>
      {children}
    </section>
  );
}

export function NodeTypeSelect({ value, onChange }: { value: FlowNodeType; onChange: (type: FlowNodeType) => void }) {
  return (
    <select aria-label="Node type" className="flow-input" value={value} onChange={(event) => onChange(event.target.value as FlowNodeType)}>
      {FLOW_NODE_TYPES.map((type) => (
        <option key={type} value={type}>
          {nodeVisual(type).label}
        </option>
      ))}
    </select>
  );
}

export function ConceptSelect({
  concepts,
  value,
  onChange,
}: {
  concepts: Concept[];
  value: number | null;
  onChange: (conceptId: number | null) => void;
}) {
  return (
    <select
      aria-label="Linked concept"
      className="flow-input"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
    >
      <option value="">No linked concept</option>
      {concepts.map((concept) => (
        <option key={concept.id} value={concept.id}>
          {concept.name}
        </option>
      ))}
    </select>
  );
}

export function NewFlowchartForm({
  folderId,
  folderName,
  onCreated,
}: {
  folderId: number | null;
  folderName: string | null;
  onCreated: (flowchart: Flowchart) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createFlowchart({ name, description, folder_id: folderId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the flowchart');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flow-form" onSubmit={submit}>
      <p className="flow-form-context">{folderName ? `In ${folderName}` : 'At the top level'}</p>
      <input className="flow-input" aria-label="Flowchart name" placeholder="Flowchart name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <textarea
        className="flow-input flow-textarea"
        aria-label="Flowchart description"
        placeholder="What does this flowchart describe?"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {error && <p className="flow-error">{error}</p>}
      <button type="submit" className="flow-btn flow-btn-primary" disabled={saving || !name.trim()}>
        <Plus size={15} /> Create flowchart
      </button>
    </form>
  );
}

export function NewFolderForm({
  parentId,
  parentName,
  onCreated,
}: {
  parentId: number | null;
  parentName: string | null;
  onCreated: (entry: KnowledgeEntry) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createKnowledgeEntry({ name, parent_id: parentId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flow-form" onSubmit={submit}>
      <p className="flow-form-context">{parentName ? `In ${parentName}` : 'At the top level'}</p>
      <input className="flow-input" aria-label="Folder name" placeholder="Folder name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      {error && <p className="flow-error">{error}</p>}
      <button type="submit" className="flow-btn flow-btn-primary" disabled={saving || !name.trim()}>
        <Plus size={15} /> Create folder
      </button>
    </form>
  );
}
