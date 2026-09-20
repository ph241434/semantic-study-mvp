import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { api } from '../api/client';
import type { Concept, FlowNode, FlowNodeType, FlowchartSummary, KnowledgeSpace } from '../types';
import { FLOW_NODE_TYPES } from './flowStyles';

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  START: 'Start',
  END: 'End',
  PROCESS: 'Process',
  DECISION: 'Decision',
  INPUT_OUTPUT: 'Input / output',
  SUBPROCESS: 'Subprocess',
  EXTERNAL_SYSTEM: 'External system',
  DATA: 'Data / artifact',
};

export const inputClass =
  'h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15';
export const areaClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15';
export const buttonClass =
  'inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50';

export function FloatingPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="graph-floating-backdrop" role="presentation">
      <section className="graph-floating-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="graph-icon-button" title="Close">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function NodeTypeSelect({ value, onChange }: { value: FlowNodeType; onChange: (type: FlowNodeType) => void }) {
  return (
    <select aria-label="Node type" value={value} onChange={(event) => onChange(event.target.value as FlowNodeType)} className={inputClass}>
      {FLOW_NODE_TYPES.map((type) => (
        <option key={type} value={type}>
          {NODE_TYPE_LABELS[type]}
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
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      className={inputClass}
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
  const [nodeType, setNodeType] = useState<FlowNodeType>('PROCESS');
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
      setError(err instanceof Error ? err.message : 'Could not add node');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-line bg-panel p-3">
      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Step name" aria-label="Step name" className={inputClass} />
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
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (what happens in this step)"
        rows={3}
        className={areaClass}
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <button type="submit" disabled={saving || !label.trim()} className={buttonClass}>
        <Plus className="h-4 w-4" />
        Add step
      </button>
    </form>
  );
}

export function NewFlowchartForm({
  spaces,
  defaultSpaceId,
  onCreated,
}: {
  spaces: KnowledgeSpace[];
  defaultSpaceId: number | null;
  onCreated: (flowchart: FlowchartSummary) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [spaceId, setSpaceId] = useState<number | null>(defaultSpaceId);
  const [newProject, setNewProject] = useState('');
  const [primary, setPrimary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let projectId = spaceId;
      if (newProject.trim()) projectId = (await api.createKnowledgeSpace({ name: newProject, description: '' })).id;
      onCreated(
        await api.createFlowchart({
          name,
          description,
          knowledge_space_id: projectId,
          is_primary: primary && projectId !== null,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create flowchart');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-line bg-panel p-3">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Flowchart name" aria-label="Flowchart name" className={inputClass} />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" rows={2} className={areaClass} />
      <select
        aria-label="Project"
        value={spaceId ?? ''}
        onChange={(event) => setSpaceId(event.target.value ? Number(event.target.value) : null)}
        className={inputClass}
      >
        <option value="">No project</option>
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name}
          </option>
        ))}
      </select>
      <input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Or create a new project" aria-label="New project" className={inputClass} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={primary} onChange={(event) => setPrimary(event.target.checked)} />
        Opens first for its project
      </label>
      {error && <p className="text-sm text-rust">{error}</p>}
      <button type="submit" disabled={saving || !name.trim()} className={buttonClass}>
        <Plus className="h-4 w-4" />
        Create flowchart
      </button>
    </form>
  );
}
