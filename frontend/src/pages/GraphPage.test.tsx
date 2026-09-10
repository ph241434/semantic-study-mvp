import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { Concept, GraphResponse, Question, Relationship } from '../types';

vi.mock('../components/GraphCanvas', () => ({
  GraphCanvas: ({
    graph,
    onSelectConcept,
    onSelectRelationship,
    onPaneClick,
    variant,
    showGrid,
    layoutMode,
    selectedCommunityId,
    focusedCommunityId,
    viewportRevision,
  }: {
    graph: GraphResponse | null;
    onSelectConcept: (conceptId: number) => void;
    onSelectRelationship: (relationshipId: number) => void;
    onPaneClick: () => void;
    variant: string;
    showGrid: boolean;
    layoutMode: string;
    selectedCommunityId: number | null;
    focusedCommunityId: number | null;
    viewportRevision: number;
  }) => (
    <div
      data-testid="mock-graph-canvas"
      data-variant={variant}
      data-grid={String(showGrid)}
      data-layout={layoutMode}
      data-selected-community={String(selectedCommunityId)}
      data-focused-community={String(focusedCommunityId)}
      data-viewport-revision={viewportRevision}
      data-node-count={graph?.nodes.length ?? 0}
    >
      <button type="button" onClick={() => onSelectConcept(2)}>
        Select mock node
      </button>
      <button type="button" onClick={() => onSelectRelationship(10)}>
        Select mock edge
      </button>
      <button type="button" onClick={onPaneClick}>
        Click empty canvas
      </button>
    </div>
  ),
}));

vi.mock('../api/client', () => ({
  api: {
    graph: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    updateConcept: vi.fn(),
    updateRelationship: vi.fn(),
    deleteRelationship: vi.fn(),
    createConcept: vi.fn(),
    createRelationship: vi.fn(),
  },
}));

import { api } from '../api/client';
import { clearGraphLayoutCaches, getGraphLayoutCacheStats } from '../graph/layout';
import { GraphPage } from './GraphPage';

const concepts = [concept(1, "Dijkstra's Algorithm", 'algorithm'), concept(2, 'Priority Queue', 'definition')];
const relationships = [relationship(10, 1, 2, 'USES')];
const questions = [question(100, 1, null), question(101, null, 10)];

function concept(id: number, name: string, conceptType: Concept['concept_type']): Concept {
  return {
    id,
    name,
    description: `${name} description`,
    concept_type: conceptType,
    mastery_score: 0.5,
    confidence: 0.4,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function relationship(id: number, sourceId: number, targetId: number, relationshipType: string): Relationship {
  return {
    id,
    source_concept_id: sourceId,
    target_concept_id: targetId,
    relationship_type: relationshipType,
    description: `${relationshipType} description`,
    mastery_score: 0.6,
    confidence: 0.5,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: "Dijkstra's Algorithm",
    target_name: 'Priority Queue',
  };
}

function question(id: number, conceptId: number | null, relationshipId: number | null): Question {
  return {
    id,
    question_text: `Question ${id}`,
    answer_text: 'Answer',
    question_type: 'CONCEPT_RECALL',
    difficulty: 2,
    concept_id: conceptId,
    relationship_id: relationshipId,
    created_at: '2026-09-09T00:00:00Z',
  };
}

function Harness({ onChangeView = vi.fn() }: { onChangeView?: (view: 'dashboard' | 'graph' | 'study' | 'reconstruction') => void }) {
  const [selectedConceptId, setSelectedConceptId] = useState<number | null>(1);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<number | null>(null);

  return (
    <GraphPage
      concepts={concepts}
      relationships={relationships}
      questions={questions}
      selectedConceptId={selectedConceptId}
      selectedRelationshipId={selectedRelationshipId}
      currentView="graph"
      onChangeView={onChangeView}
      onSelectConcept={setSelectedConceptId}
      onSelectRelationship={setSelectedRelationshipId}
      onCatalogChanged={async () => undefined}
      onStudyQuestion={vi.fn()}
    />
  );
}

describe('GraphPage workspace redesign', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearGraphLayoutCaches();
    vi.clearAllMocks();
    vi.mocked(api.graph).mockImplementation(async (conceptId: number, depth: number) => ({
      center_id: conceptId,
      depth,
      nodes: concepts,
      relationships,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the graph as the full workspace surface with an overlaid sidebar', async () => {
    render(<Harness />);

    expect(screen.getByTestId('graph-workspace')).toHaveClass('graph-workspace');
    const canvas = await screen.findByTestId('mock-graph-canvas');
    expect(canvas).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByTestId('graph-tool-rail')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByRole('button', { name: 'Add Concept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Relationship' })).toBeInTheDocument();
  });

  it('collapses and expands the sidebar without remounting the graph content', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-node-count', '2'));
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-viewport-revision', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Sidebar' }));

    const collapsedRail = screen.getByTestId('graph-tool-rail');
    expect(collapsedRail).toHaveAttribute('data-collapsed', 'true');
    expect(within(collapsedRail).getByRole('button', { name: 'Add Concept' })).toBeInTheDocument();
    expect(within(collapsedRail).getByRole('button', { name: 'Add Relationship' })).toBeInTheDocument();
    expect(within(collapsedRail).getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(within(collapsedRail).getByRole('button', { name: 'Open Sidebar' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-viewport-revision', '1');

    fireEvent.click(within(collapsedRail).getByRole('button', { name: 'Open Sidebar' }));
    expect(screen.getByTestId('graph-tool-rail')).toHaveAttribute('data-collapsed', 'false');
  });

  it('keeps quick add concept and relationship forms in compact floating dialogs', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Add Concept' }));
    expect(screen.getByRole('dialog', { name: 'Add Concept' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add Concept' })).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Relationship' }));
    expect(screen.getByRole('dialog', { name: 'Add Relationship' })).toBeInTheDocument();
  });

  it('keeps search and fit controls accessible from the sidebar', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');

    expect(screen.getByPlaceholderText('Search concepts')).toBeInTheDocument();
    expect(screen.getByLabelText('Graph layout')).toHaveValue('layered');
    fireEvent.click(screen.getByRole('button', { name: 'Fit Graph' }));
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-viewport-revision', '1');
  });

  it('switches to clustered layout while preserving the selected concept', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.change(screen.getByLabelText('Graph layout'), { target: { value: 'clustered' } });

    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-layout', 'clustered');
    expect(screen.getByTestId('graph-inspector')).toHaveTextContent("Dijkstra's Algorithm");
    expect(screen.getByLabelText('Community 1 display name')).toBeInTheDocument();
  });

  it('stores community display labels without changing derived membership', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.change(screen.getByLabelText('Graph layout'), { target: { value: 'clustered' } });

    fireEvent.change(screen.getByLabelText('Community 1 display name'), { target: { value: 'Graph Algorithms' } });

    expect(window.localStorage.getItem('semantic-study.communityLabels')).toContain('Graph Algorithms');
    expect(screen.getAllByRole('button', { name: /Graph Algorithms/ }).length).toBeGreaterThan(0);
  });

  it('does not recompute layout when the sidebar is collapsed', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    const before = getGraphLayoutCacheStats();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Sidebar' }));

    expect(getGraphLayoutCacheStats().layoutComputations).toBe(before.layoutComputations);
  });

  it('opens the inspector from node selection and closes it from the canvas', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Close Inspector' }));

    expect(screen.queryByTestId('graph-inspector')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select mock node' }));

    expect(screen.getByTestId('graph-inspector')).toHaveTextContent('Priority Queue');
    fireEvent.click(screen.getByRole('button', { name: 'Click empty canvas' }));
    expect(screen.queryByTestId('graph-inspector')).not.toBeInTheDocument();
  });

  it('opens a relationship inspector with edit and delete controls', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Select mock edge' }));

    const inspector = screen.getByTestId('graph-inspector');
    expect(inspector).toHaveTextContent("Dijkstra's Algorithm");
    expect(inspector).toHaveTextContent('Priority Queue');
    expect(within(inspector).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(inspector).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('persists the sidebar and grid preferences locally', async () => {
    const first = render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.click(screen.getByLabelText('Grid'));
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-grid', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Sidebar' }));

    first.unmount();
    render(<Harness />);

    expect(screen.getByTestId('graph-tool-rail')).toHaveAttribute('data-collapsed', 'true');
    await waitFor(() => expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-grid', 'false'));
  });
});
