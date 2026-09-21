import { Layers, Save, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { Concept, FlowEdge, FlowEdgeType, FlowNode, FlowNodeType, Relationship } from '../types';
import { ConceptSelect, NodeTypeSelect } from './FlowForms';
import { FLOW_EDGE_TYPES, nodeVisual } from './flowStyles';

export type NodePatch = Partial<{ label: string; description: string; node_type: FlowNodeType; concept_id: number | null }>;
export type EdgePatch = Partial<{ edge_type: FlowEdgeType; label: string | null }>;

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="flow-icon-btn flow-inspector-close" onClick={onClose} title="Close" aria-label="Close inspector">
      <X size={16} />
    </button>
  );
}

type NodeProps = {
  node: FlowNode;
  concepts: Concept[];
  relationships: Relationship[];
  onSave: (nodeId: number, patch: NodePatch) => Promise<void>;
  onDelete: (nodeId: number) => Promise<void>;
  onOpenDetail: (node: FlowNode) => void;
  onClose: () => void;
};

/**
 * Temporary, contextual editor for the selected step. The description lives here rather than on the canvas so the
 * flowchart stays readable; the linked Concept's global semantic relationships are shown as read-only context.
 */
export function NodeInspector({ node, concepts, relationships, onSave, onDelete, onOpenDetail, onClose }: NodeProps) {
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
  const nameOf = (id: number) => concepts.find((item) => item.id === id)?.name ?? `#${id}`;

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
    <aside className="flow-inspector" data-testid="flow-inspector" aria-label="Step inspector">
      <CloseButton onClose={onClose} />
      <p className="flow-inspector-kicker">{nodeVisual(node.node_type).label}</p>
      <h2 className="flow-inspector-title">{node.label}</h2>

      <form className="flow-form" onSubmit={submit}>
        <input className="flow-input" aria-label="Step name" value={label} onChange={(event) => setLabel(event.target.value)} />
        <NodeTypeSelect value={nodeType} onChange={setNodeType} />
        <textarea
          className="flow-input flow-textarea"
          aria-label="Step description"
          placeholder={concept?.description || 'Describe what happens in this step'}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <ConceptSelect concepts={concepts} value={conceptId} onChange={setConceptId} />
        {error && <p className="flow-error">{error}</p>}
        <button type="submit" className="flow-btn" disabled={saving || !label.trim()}>
          <Save size={15} /> Save
        </button>
      </form>

      <button type="button" className="flow-btn flow-btn-primary flow-btn-wide" onClick={() => onOpenDetail(node)}>
        <Layers size={15} /> {node.child_flowchart_id !== null ? 'Open detailed flowchart' : 'Create detailed flowchart'}
      </button>
      {node.child_flowchart_name && <p className="flow-inspector-note">Opens: {node.child_flowchart_name}</p>}

      {semantic.length > 0 && (
        <details className="flow-inspector-semantic">
          <summary>Semantic relationships ({semantic.length})</summary>
          <p className="flow-inspector-note">Saved for {concept?.name}; not drawn on the flowchart.</p>
          <ul>
            {semantic.map((item) => (
              <li key={item.id}>
                {nameOf(item.source_concept_id)} <span>{item.relationship_type.replace(/_/g, ' ')}</span> {nameOf(item.target_concept_id)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="button"
        className="flow-btn flow-btn-danger"
        onClick={() => {
          if (window.confirm(`Delete "${node.label}" and its connections?`)) void onDelete(node.id);
        }}
      >
        <Trash2 size={15} /> Delete step
      </button>
    </aside>
  );
}

type EdgeProps = {
  edge: FlowEdge;
  sourceLabel: string;
  targetLabel: string;
  onSave: (edgeId: number, patch: EdgePatch) => Promise<void>;
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
    <aside className="flow-inspector" data-testid="flow-inspector" aria-label="Connection inspector">
      <CloseButton onClose={onClose} />
      <p className="flow-inspector-kicker">Flow connection</p>
      <h2 className="flow-inspector-title">
        {sourceLabel} → {targetLabel}
      </h2>
      <form className="flow-form" onSubmit={submit}>
        <select aria-label="Edge type" className="flow-input" value={edgeType} onChange={(event) => setEdgeType(event.target.value as FlowEdgeType)}>
          {FLOW_EDGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input className="flow-input" aria-label="Edge label" placeholder="Label, e.g. YES" value={label} onChange={(event) => setLabel(event.target.value)} />
        {error && <p className="flow-error">{error}</p>}
        <div className="flow-row">
          <button type="submit" className="flow-btn" disabled={saving}>
            <Save size={15} /> Save
          </button>
          <button type="button" className="flow-btn flow-btn-danger" onClick={() => void onDelete(edge.id)}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </form>
    </aside>
  );
}

type ConceptCardProps = {
  concept: Concept;
  relationships: Relationship[];
  concepts: Concept[];
  onOpenExplorer: (concept: Concept) => void;
  onClose: () => void;
};

/** A registry concept picked in the navigator: description first, its global semantic relationships as context. */
export function ConceptCard({ concept, relationships, concepts, onOpenExplorer, onClose }: ConceptCardProps) {
  const related = relationships.filter((item) => item.source_concept_id === concept.id || item.target_concept_id === concept.id);
  const nameOf = (id: number) => concepts.find((item) => item.id === id)?.name ?? `#${id}`;
  return (
    <aside className="flow-inspector" data-testid="flow-concept-card" aria-label="Concept">
      <CloseButton onClose={onClose} />
      <p className="flow-inspector-kicker">Concept · {concept.concept_type}</p>
      <h2 className="flow-inspector-title">{concept.name}</h2>
      <p className="flow-inspector-description">{concept.description || 'No description yet.'}</p>
      {related.length > 0 && (
        <ul className="flow-inspector-semantic-list">
          {related.map((item) => (
            <li key={item.id}>
              {nameOf(item.source_concept_id)} <span>{item.relationship_type.replace(/_/g, ' ')}</span> {nameOf(item.target_concept_id)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="flow-btn flow-btn-wide" onClick={() => onOpenExplorer(concept)}>
        Open in concept explorer
      </button>
    </aside>
  );
}
