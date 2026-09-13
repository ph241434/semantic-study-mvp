import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClassicPositionStore, GraphLayoutMode, GraphLayoutResult, Point } from '../graph/layout';
import type { Concept, GraphResponse, Question, Relationship } from '../types';

vi.mock('../components/GraphCanvas', () => ({
  GraphCanvas: ({
    graph,
    layout,
    onSelectConcept,
    onSelectRelationship,
    onNodePositionChange,
    onPaneClick,
    variant,
    showGrid,
    layoutMode,
    viewportRevision,
  }: {
    graph: GraphResponse | null;
    layout: GraphLayoutResult | null;
    classicPositions: ClassicPositionStore;
    onSelectConcept: (conceptId: number) => void;
    onSelectRelationship: (relationshipId: number) => void;
    onNodePositionChange?: (conceptId: number, position: Point) => void;
    onPaneClick: () => void;
    variant: string;
    showGrid: boolean;
    layoutMode: GraphLayoutMode;
    viewportRevision: number;
  }) => {
    const nodeTwo = layout?.nodes.find((node) => node.conceptId === 2);

    return (
      <div
        data-testid="mock-graph-canvas"
        data-variant={variant}
        data-grid={String(showGrid)}
        data-layout={layoutMode}
        data-viewport-revision={viewportRevision}
        data-node-count={graph?.nodes.length ?? 0}
        data-node-two-x={nodeTwo?.position.x ?? ''}
        data-node-two-y={nodeTwo?.position.y ?? ''}
      >
        <button type="button" onClick={() => onSelectConcept(2)}>
          Select mock node
        </button>
        <button type="button" onClick={() => onSelectRelationship(10)}>
          Select mock edge
        </button>
        <button type="button" onClick={() => onNodePositionChange?.(2, { x: 120, y: 144 })}>
          Drag mock node
        </button>
        <button type="button" onClick={onPaneClick}>
          Click empty canvas
        </button>
      </div>
    );
  },
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
import { CLASSIC_LAYOUT_STORAGE_KEY, clearGraphLayoutCaches, getGraphLayoutCacheStats } from '../graph/layout';
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

describe('GraphPage classic graph workspace', () => {
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
    expect(canvas).toHaveAttribute('data-layout', 'classic');
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

  it('keeps Classic controls available from the sidebar', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');

    expect(screen.getByPlaceholderText('Search concepts')).toBeInTheDocument();
    expect(screen.getByLabelText('Graph layout')).toHaveValue('classic');
    expect(screen.getByRole('button', { name: 'Reorganize' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fit Graph' }));
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-viewport-revision', '1');
  });

  it('falls back to Classic when an obsolete layout preference is stored', async () => {
    window.localStorage.setItem('semantic-study.graphLayoutMode', 'clustered');

    render(<Harness />);
    const canvas = await screen.findByTestId('mock-graph-canvas');

    expect(screen.getByLabelText('Graph layout')).toHaveValue('classic');
    expect(canvas).toHaveAttribute('data-layout', 'classic');
    await waitFor(() => expect(window.localStorage.getItem('semantic-study.graphLayoutMode')).toBe('classic'));
  });

  it('persists manual Classic node positions from drag callbacks', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Drag mock node' }));

    await waitFor(() => {
      const stored = readStoredClassicPositions();
      expect(stored['2']).toEqual({ x: 120, y: 144 });
    });
  });

  it('does not recompute layout when grid or sidebar-only state changes', async () => {
    render(<Harness />);
    await waitFor(() => expect(readStoredClassicPositions()['1']).toBeDefined());
    const before = getGraphLayoutCacheStats();

    fireEvent.click(screen.getByLabelText('Grid'));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Sidebar' }));

    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-grid', 'false');
    expect(getGraphLayoutCacheStats().layoutComputations).toBe(before.layoutComputations);
  });

  it('reorganizes Classic positions only when explicitly requested', async () => {
    render(<Harness />);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Drag mock node' }));
    await waitFor(() => expect(readStoredClassicPositions()['2']).toEqual({ x: 120, y: 144 }));

    fireEvent.click(screen.getByRole('button', { name: 'Reorganize' }));

    await waitFor(() => {
      const stored = readStoredClassicPositions();
      expect(stored['2']).not.toEqual({ x: 120, y: 144 });
    });
    expect(getGraphLayoutCacheStats().reorganizeComputations).toBe(1);
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-viewport-revision', '1');
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

function readStoredClassicPositions(): ClassicPositionStore {
  return JSON.parse(window.localStorage.getItem(CLASSIC_LAYOUT_STORAGE_KEY) ?? '{}') as ClassicPositionStore;
}
