import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { api } from '../api/client';
import type { Concept, FlowNode, FlowNodeType, Flowchart, KnowledgeEntry } from '../types';
import { FLOW_NODE_TYPES, nodeVisual } from './flowStyles';

export function FloatingPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="flow-modal-backdrop" role="presentation">
      <section className="flow-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flow-modal-header">
          <h2>{title}</h2>
          <button type="button" className="flow-icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
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

export function AddNodeForm({
  concepts,
  flowchartId,
  onCreated,
}: {
  concepts: Concept[];
  flowchartId: number;
  onCreated: (node: FlowNode) => void;
}) {
  const [label, setLabel] = useState('');
  const [nodeType, setNodeType] = useState<FlowNodeType>('process');
  const [conceptId, setConceptId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createFlowNode(flowchartId, { label, description, node_type: nodeType, concept_id: conceptId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the step');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flow-form" onSubmit={submit}>
      <input className="flow-input" aria-label="Step name" placeholder="Step name" value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
      <NodeTypeSelect value={nodeType} onChange={setNodeType} />
      <ConceptSelect
        concepts={concepts}
        value={conceptId}
        onChange={(id) => {
          setConceptId(id);
          const concept = concepts.find((item) => item.id === id);
          if (concept && !label.trim()) setLabel(concept.name);
        }}
      />
      <textarea
        className="flow-input flow-textarea"
        aria-label="Description"
        placeholder="Description: what happens in this step"
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {error && <p className="flow-error">{error}</p>}
      <button type="submit" className="flow-btn flow-btn-primary" disabled={saving || !label.trim()}>
        <Plus size={15} /> Add step
      </button>
    </form>
  );
}

export function NewFlowchartForm({
  folders,
  defaultFolderId,
  onCreated,
}: {
  folders: KnowledgeEntry[];
  defaultFolderId: number | null;
  onCreated: (flowchart: Flowchart) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId);
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
      <input className="flow-input" aria-label="Flowchart name" placeholder="Flowchart name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <textarea
        className="flow-input flow-textarea"
        aria-label="Flowchart description"
        placeholder="What does this flowchart describe?"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <select
        className="flow-input"
        aria-label="Folder"
        value={folderId ?? ''}
        onChange={(event) => setFolderId(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      {error && <p className="flow-error">{error}</p>}
      <button type="submit" className="flow-btn flow-btn-primary" disabled={saving || !name.trim()}>
        <Plus size={15} /> Create flowchart
      </button>
    </form>
  );
}
