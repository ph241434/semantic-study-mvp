import { Layers, Link2, Save, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { Concept, FlowEdge, FlowEdgeType, FlowNode, FlowNodeType, Relationship } from '../types';
import { NODE_TYPE_LABELS, NodeTypeSelect, ConceptSelect, areaClass, buttonClass, inputClass } from './FlowForms';
import { FLOW_EDGE_TYPES } from './flowStyles';

export type NodePatch = Partial<{
  label: string;
  description: string;
  node_type: FlowNodeType;
  concept_id: number | null;
}>;

type NodeProps = {
  node: FlowNode;
  concepts: Concept[];
  relationships: Relationship[];
  onSave: (nodeId: number, patch: NodePatch) => Promise<void>;
  onDelete: (nodeId: number) => Promise<void>;
  onOpenChild: (node: FlowNode) => void;
  onConnect: (nodeId: number) => void;
  onClose: () => void;
};

/** Description-first editor for one flow node, with its concept's global semantic relationships as read-only context. */
export function NodeInspector({ node, concepts, relationships, onSave, onDelete, onOpenChild, onConnect, onClose }: NodeProps) {
  const [label, setLabel] = useState(node.label);
  const [description, setDescription] = useState(node.description);
  const [nodeType, setNodeType] = useState<FlowNodeType>(node.node_type);
  const [conceptId, setConceptId] = useState<number | null>(node.concept_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const concept = concepts.find((item) => item.id === conceptId) ?? null;
  const semantic = conceptId
    ? relationships.filter((item) => item.source_concept_id === conceptId || item.target_concept_id === conceptId)
    : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(node.id, { label, description, node_type: nodeType, concept_id: conceptId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="graph-inspector-panel graph-floating-inspector" data-testid="flow-inspector">
      <button type="button" onClick={onClose} className="graph-inspector-close" title="Close Inspector">
        <X className="h-4 w-4" />
        <span className="sr-only">Close Inspector</span>
      </button>
      <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-white/[0.45]">{NODE_TYPE_LABELS[node.node_type]}</p>
      <h2 className="mb-3 pr-8 text-lg font-bold text-white">{node.label}</h2>

      <form onSubmit={submit} className="space-y-3">
        <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Step name" className={inputClass} />
        <NodeTypeSelect value={nodeType} onChange={setNodeType} />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-label="Step description"
          placeholder={concept?.description || 'Describe what happens in this step'}
          rows={4}
          className={areaClass}
        />
        <ConceptSelect concepts={concepts} value={conceptId} onChange={setConceptId} />
        {concept?.description && !description && <p className="text-[13px] text-white/60">{concept.description}</p>}
        {error && <p className="text-sm text-rust">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || !label.trim()} className={buttonClass}>
            <Save className="h-4 w-4" />
            Save
          </button>
          <button type="button" onClick={() => onConnect(node.id)} className={buttonClass}>
            <Link2 className="h-4 w-4" />
            Connect from here
          </button>
        </div>
      </form>

      <button type="button" onClick={() => onOpenChild(node)} className={`${buttonClass} mt-3 w-full justify-center`}>
        <Layers className="h-4 w-4" />
        {node.has_child ? 'Open detailed flowchart' : 'Create detailed flowchart'}
      </button>
      {node.has_child && node.child_flowchart_name && (
        <p className="mt-1 text-[12px] text-white/50">Opens: {node.child_flowchart_name}</p>
      )}

      {semantic.length > 0 && (
        <section className="mt-4" aria-label="Semantic relationships">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-white/[0.45]">
            Semantic relationships <span className="font-normal normal-case">(not drawn on the flowchart)</span>
          </h3>
          <ul className="space-y-1 text-[13px] text-white/75">
            {semantic.map((item) => (
              <li key={item.id}>
                {item.source_name ?? item.source_concept_id} <span className="text-white/45">{item.relationship_type}</span>{' '}
                {item.target_name ?? item.target_concept_id}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Delete "${node.label}" and its connections?`)) void onDelete(node.id);
        }}
        className="mt-4 inline-flex items-center gap-2 text-[13px] font-semibold text-rust"
      >
        <Trash2 className="h-4 w-4" />
        Delete step
      </button>
    </div>
  );
}

type EdgeProps = {
  edge: FlowEdge;
  sourceLabel: string;
  targetLabel: string;
  onSave: (edgeId: number, patch: Partial<{ edge_type: FlowEdgeType; label: string | null }>) => Promise<void>;
  onDelete: (edgeId: number) => Promise<void>;
  onClose: () => void;
};

export function EdgeInspector({ edge, sourceLabel, targetLabel, onSave, onDelete, onClose }: EdgeProps) {
  const [edgeType, setEdgeType] = useState<FlowEdgeType>(edge.edge_type);
  const [label, setLabel] = useState(edge.label ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(edge.id, { edge_type: edgeType, label: label.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="graph-inspector-panel graph-floating-inspector" data-testid="flow-inspector">
      <button type="button" onClick={onClose} className="graph-inspector-close" title="Close Inspector">
        <X className="h-4 w-4" />
        <span className="sr-only">Close Inspector</span>
      </button>
      <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-white/[0.45]">Flow edge</p>
      <h2 className="mb-3 pr-8 text-base font-bold text-white">
        {sourceLabel} → {targetLabel}
      </h2>
      <form onSubmit={submit} className="space-y-3">
        <select
          aria-label="Edge type"
          value={edgeType}
          onChange={(event) => setEdgeType(event.target.value as FlowEdgeType)}
          className={inputClass}
        >
          {FLOW_EDGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label (e.g. YES)" aria-label="Edge label" className={inputClass} />
        {error && <p className="text-sm text-rust">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={buttonClass}>
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void onDelete(edge.id)}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-rust"
          >
            <Trash2 className="h-4 w-4" />
            Delete edge
          </button>
        </div>
      </form>
    </div>
  );
}
