import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphResponse } from './types';

vi.mock('./components/GraphCanvas', () => ({
  GraphCanvas: () => <div data-testid="mock-graph-canvas" />,
}));

vi.mock('./components/PersonalGraphPane', () => ({
  PersonalGraphPane: () => <div data-testid="mock-personal-graph-pane" />,
}));

vi.mock('./flowchart/FlowchartCanvas', () => ({
  FlowchartCanvas: ({ detail }: { detail: { flowchart: { id: number; name: string } } }) => (
    <div data-testid="mock-flowchart-canvas" data-flowchart-id={detail.flowchart.id} />
  ),
}));

vi.mock('./api/client', () => ({
  api: {
    knowledge: vi.fn(),
    graph: vi.fn(),
    flowcharts: vi.fn(),
    flowchart: vi.fn(),
    concepts: vi.fn(),
    relationships: vi.fn(),
  },
}));

import { api } from './api/client';
import App from './App';

const entries = [
  { id: 1, parent_id: null, name: 'Algorithms', entry_type: 'folder' as const, concept_id: null, sort_order: 0 },
  { id: 2, parent_id: null, name: 'Cybersecurity', entry_type: 'folder' as const, concept_id: null, sort_order: 1 },
  { id: 3, parent_id: 2, name: 'Cryptography', entry_type: 'folder' as const, concept_id: null, sort_order: 0 },
  {
    id: 4,
    parent_id: 3,
    name: 'Asymmetric Encryption',
    entry_type: 'concept' as const,
    concept_id: 101,
    sort_order: 0,
  },
];

const graphResponse: GraphResponse = {
  center_id: 101,
  depth: 1,
  nodes: [
    {
      id: 101,
      name: 'Asymmetric Encryption',
      description: 'Uses a public/private key pair.',
      concept_type: 'concept',
      mastery_score: 0,
      confidence: 0.3,
      created_at: '2026-09-17T00:00:00Z',
      updated_at: '2026-09-17T00:00:00Z',
      last_reviewed_at: null,
      next_review_at: null,
      review_interval_days: 1,
    },
  ],
  relationships: [],
};

const flowchartSummary = {
  id: 5,
  name: 'Gmail Encryption System',
  description: '',
  folder_id: 3,
  node_count: 1,
  edge_count: 0,
  used_by_count: 0,
  created_at: '',
  updated_at: '',
};

async function openKnowledgeBrowser() {
  await screen.findByTestId('mock-flowchart-canvas');
  fireEvent.click(screen.getByRole('button', { name: 'Knowledge browser' }));
  await screen.findByTestId('knowledge-list');
}

describe('App top-level navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    vi.mocked(api.knowledge).mockResolvedValue(entries);
    vi.mocked(api.graph).mockResolvedValue(graphResponse);
    vi.mocked(api.flowcharts).mockResolvedValue([flowchartSummary]);
    vi.mocked(api.flowchart).mockResolvedValue({ flowchart: flowchartSummary, nodes: [], edges: [] });
    vi.mocked(api.concepts).mockResolvedValue([]);
    vi.mocked(api.relationships).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('opens on the flowchart workspace, not the knowledge browser or a concept graph', async () => {
    render(<App />);

    expect(await screen.findByTestId('mock-flowchart-canvas')).toHaveAttribute('data-flowchart-id', '5');
    expect(screen.getByTestId('flow-breadcrumb')).toHaveTextContent('Gmail Encryption System');
    expect(screen.queryByTestId('knowledge-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-graph-canvas')).not.toBeInTheDocument();
  });

  it('keeps the knowledge browser one click away from the workspace, and the way back', async () => {
    render(<App />);
    await openKnowledgeBrowser();

    const list = screen.getByTestId('knowledge-list');
    expect(list).toHaveTextContent('Algorithms');
    expect(list).toHaveTextContent('Cybersecurity');

    fireEvent.click(screen.getByRole('button', { name: 'Flowcharts' }));
    expect(await screen.findByTestId('mock-flowchart-canvas')).toBeInTheDocument();
  });

  it('opening a concept file from the knowledge browser switches to the concept graph with the combined breadcrumb', async () => {
    render(<App />);
    await openKnowledgeBrowser();

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cryptography' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Asymmetric Encryption' }));

    const breadcrumb = await screen.findByTestId('graph-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Knowledge');
    expect(breadcrumb).toHaveTextContent('Cybersecurity');
    expect(breadcrumb).toHaveTextContent('Cryptography');
    expect(breadcrumb).toHaveTextContent('Asymmetric Encryption');

    // The concept explorer links back to the workspace too.
    fireEvent.click(screen.getByRole('button', { name: 'Flowcharts' }));
    expect(await screen.findByTestId('mock-flowchart-canvas')).toBeInTheDocument();
  });

  it('returns to the correct filesystem folder on browser back (popstate)', async () => {
    render(<App />);
    await openKnowledgeBrowser();

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cryptography' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Asymmetric Encryption' }));
    await screen.findByTestId('graph-breadcrumb');

    window.dispatchEvent(new PopStateEvent('popstate', { state: { mode: 'filesystem', folderId: 3 } }));

    await waitFor(() => expect(screen.getByTestId('knowledge-list')).toHaveTextContent('Asymmetric Encryption'));
    expect(screen.getByTestId('knowledge-breadcrumb')).toHaveTextContent('Cryptography');
  });

  it('returns to the flowchart workspace on browser back (popstate)', async () => {
    render(<App />);
    await openKnowledgeBrowser();

    window.dispatchEvent(new PopStateEvent('popstate', { state: { mode: 'flowchart' } }));
    expect(await screen.findByTestId('mock-flowchart-canvas')).toBeInTheDocument();
  });
});
