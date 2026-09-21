import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import { type StudyHidden } from '../components/GraphCanvas';
import { PersonalGraphPane, type PersonalGraphPaneHandle } from '../components/PersonalGraphPane';
import { SourceGraphPane } from '../components/SourceGraphPane';
import { isLeafGraph } from '../graph/layout';
import type { FilesystemBreadcrumbSegment, GraphResponse, Relationship, TrailEntry } from '../types';

type Mode = 'explore' | 'study';
type PromptType = 'node' | 'relationship' | 'structural';

type StudyPrompt = {
  edge: Relationship;
  type: PromptType;
  hiddenConceptId: number;
  prompt: string;
};

type DescriptionPopover = { id: number; name: string; description: string };

type Props = {
  trail: TrailEntry[];
  filesystemBreadcrumb: FilesystemBreadcrumbSegment[];
  linkedConceptIds: Set<number>;
  onTrailChange: (trail: TrailEntry[]) => void;
  onExitToFilesystem: (folderId: number | null) => void;
  onOpenFlowcharts?: () => void;
};

function prettifyType(value: string) {
  return value.replace(/_/g, ' ');
}

function buildPrompts(graph: GraphResponse, rootId: number, nameById: Map<number, string>): StudyPrompt[] {
  const rootLabel = nameById.get(rootId) ?? 'this concept';
  const types: PromptType[] = ['node', 'relationship', 'structural'];

  return graph.relationships.map((edge, index) => {
    const type = types[index % types.length];
    const rootIsSource = edge.source_concept_id === rootId;
    const hiddenConceptId = rootIsSource ? edge.target_concept_id : edge.source_concept_id;
    const relationshipLabel = prettifyType(edge.relationship_type);

    let prompt: string;
    if (type === 'relationship') {
      const sourceLabel = nameById.get(edge.source_concept_id) ?? 'concept';
      const targetLabel = nameById.get(edge.target_concept_id) ?? 'concept';
      prompt = `${sourceLabel} → ? → ${targetLabel}`;
    } else if (type === 'structural') {
      prompt = `${rootLabel} connects to another concept here.`;
    } else {
      prompt = rootIsSource
        ? `${rootLabel} → ${relationshipLabel} → ?`
        : `? → ${relationshipLabel} → ${rootLabel}`;
    }

    return { edge, type, hiddenConceptId, prompt };
  });
}

function questionFor(type: PromptType): string {
  if (type === 'relationship') return 'What is the relationship between these concepts?';
  if (type === 'structural') return 'What other concept is directly involved?';
  return 'Which concept completes this relationship?';
}

function answerFor(prompt: StudyPrompt, nameById: Map<number, string>): string {
  if (prompt.type === 'relationship') return prettifyType(prompt.edge.relationship_type);
  const name = nameById.get(prompt.hiddenConceptId) ?? 'Unknown concept';
  return prompt.type === 'structural' ? `${name} — ${prettifyType(prompt.edge.relationship_type)}` : name;
}

export function GraphPage({
  trail,
  filesystemBreadcrumb,
  linkedConceptIds,
  onTrailChange,
  onExitToFilesystem,
  onOpenFlowcharts,
}: Props) {
  const rootId = trail[trail.length - 1].id;

  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [mode, setMode] = useState<Mode>('explore');
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [descriptionPopover, setDescriptionPopover] = useState<DescriptionPopover | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const personalPaneRef = useRef<PersonalGraphPaneHandle>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .graph(rootId, 1)
      .then((response) => {
        if (!active) return;
        setGraph(response);
        setStudyIndex(0);
        setRevealed(false);
        setDescriptionPopover(null);
        if (isLeafGraph(response)) setMode('explore');
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load this concept');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rootId]);

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    graph?.nodes.forEach((node) => map.set(node.id, node.name));
    return map;
  }, [graph]);

  const isLeaf = graph ? isLeafGraph(graph) : false;
  const rootConcept = graph?.nodes.find((node) => node.id === rootId) ?? null;

  const prompts = useMemo(
    () => (graph && !isLeaf ? buildPrompts(graph, rootId, nameById) : []),
    [graph, rootId, isLeaf, nameById],
  );
  const activePrompt = mode === 'study' ? (prompts[studyIndex] ?? null) : null;

  const hidden: StudyHidden | null = activePrompt
    ? {
        edgeId: activePrompt.edge.id,
        hiddenConceptId: activePrompt.type === 'relationship' ? null : activePrompt.hiddenConceptId,
        hideNode: activePrompt.type !== 'relationship',
        hideEdge: activePrompt.type !== 'node',
        revealed,
      }
    : null;

  function navigateToTrailIndex(index: number) {
    if (index === trail.length - 1) return;
    onTrailChange(trail.slice(0, index + 1));
  }

  function handleSelectConcept(conceptId: number) {
    if (!graph) return;
    if (hidden && !hidden.revealed && hidden.hideNode && hidden.hiddenConceptId === conceptId) {
      setRevealed(true);
      return;
    }
    if (conceptId === rootId) return;
    const concept = graph.nodes.find((node) => node.id === conceptId);
    if (!concept) return;

    if (linkedConceptIds.has(conceptId)) {
      onTrailChange([...trail, { id: concept.id, name: concept.name }]);
    } else {
      setDescriptionPopover({ id: concept.id, name: concept.name, description: concept.description });
    }
  }

  function handleAddToPersonalView(conceptId: number) {
    if (!graph) return;
    const concept = graph.nodes.find((node) => node.id === conceptId);
    if (!concept) return;
    personalPaneRef.current?.addConceptNode({ id: concept.id, name: concept.name });
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setStudyIndex(0);
    setRevealed(false);
  }

  function handleNext() {
    if (prompts.length === 0) return;
    setStudyIndex((index) => (index + 1) % prompts.length);
    setRevealed(false);
  }

  return (
    <div className="proto-app">
      <header className="proto-topbar">
        <nav className="proto-breadcrumb" aria-label="Breadcrumb" data-testid="graph-breadcrumb">
          {filesystemBreadcrumb.map((segment, index) => (
            <span key={`fs-${segment.id ?? 'root'}-${index}`} className="proto-breadcrumb-segment">
              {index > 0 && <span className="proto-breadcrumb-separator">{'›'}</span>}
              <button type="button" className="proto-breadcrumb-item" onClick={() => onExitToFilesystem(segment.id)}>
                {segment.name}
              </button>
            </span>
          ))}
          {trail.map((entry, index) => (
            <span key={`trail-${entry.id}-${index}`} className="proto-breadcrumb-segment">
              <span className="proto-breadcrumb-separator">{'›'}</span>
              <button
                type="button"
                className={`proto-breadcrumb-item${index === trail.length - 1 ? ' proto-breadcrumb-item-current' : ''}`}
                onClick={() => navigateToTrailIndex(index)}
                disabled={index === trail.length - 1}
              >
                {entry.name}
              </button>
            </span>
          ))}
        </nav>

        {onOpenFlowcharts && (
          <button type="button" className="proto-btn" onClick={onOpenFlowcharts}>
            Flowcharts
          </button>
        )}

        <div className="proto-mode-toggle" role="group" aria-label="Mode">
          <button
            type="button"
            className={`proto-mode-button${mode === 'explore' ? ' proto-mode-button-active' : ''}`}
            onClick={() => changeMode('explore')}
          >
            Explore
          </button>
          <button
            type="button"
            className={`proto-mode-button${mode === 'study' ? ' proto-mode-button-active' : ''}`}
            onClick={() => changeMode('study')}
            disabled={isLeaf || prompts.length === 0}
            title={isLeaf || prompts.length === 0 ? 'Nothing to retrieve for this concept' : undefined}
          >
            Study
          </button>
        </div>
      </header>

      <div className="proto-main proto-split">
        <SourceGraphPane
          loading={loading}
          error={error}
          graph={graph}
          isLeaf={isLeaf}
          rootId={rootId}
          rootConcept={rootConcept}
          hidden={hidden}
          linkedConceptIds={linkedConceptIds}
          onSelectConcept={handleSelectConcept}
          onAddToPersonalView={handleAddToPersonalView}
          descriptionPopover={descriptionPopover}
          onCloseDescriptionPopover={() => setDescriptionPopover(null)}
        />
        <PersonalGraphPane ref={personalPaneRef} rootId={rootId} />
      </div>

      {mode === 'study' && activePrompt && (
        <div className="proto-study-bar" data-testid="graph-study-bar">
          <div className="proto-study-text">
            <p className="proto-study-question">{questionFor(activePrompt.type)}</p>
            <p className="proto-study-prompt" data-testid="graph-study-prompt">
              {revealed ? answerFor(activePrompt, nameById) : activePrompt.prompt}
            </p>
          </div>
          <div className="proto-study-actions">
            <button type="button" className="proto-btn" onClick={() => setRevealed(true)} disabled={revealed} data-testid="graph-reveal">
              Reveal
            </button>
            <button type="button" className="proto-btn" onClick={handleNext} data-testid="graph-next">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
