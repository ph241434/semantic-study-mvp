import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphResponse } from './types';

vi.mock('./components/GraphCanvas', () => ({
  GraphCanvas: () => <div data-testid="mock-graph-canvas" />,
}));

vi.mock('./api/client', () => ({
  api: {
    knowledge: vi.fn(),
    graph: vi.fn(),
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

describe('App top-level navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.knowledge).mockResolvedValue(entries);
    vi.mocked(api.graph).mockResolvedValue(graphResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults to the filesystem browser at the Knowledge root, not a graph', async () => {
    render(<App />);

    const list = await screen.findByTestId('knowledge-list');
    expect(list).toHaveTextContent('Algorithms');
    expect(list).toHaveTextContent('Cybersecurity');
    expect(screen.queryByTestId('mock-graph-canvas')).not.toBeInTheDocument();
  });

  it('opening a concept file switches to the graph view with the combined breadcrumb', async () => {
    render(<App />);
    await screen.findByTestId('knowledge-list');

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cryptography' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Asymmetric Encryption' }));

    const breadcrumb = await screen.findByTestId('graph-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Knowledge');
    expect(breadcrumb).toHaveTextContent('Cybersecurity');
    expect(breadcrumb).toHaveTextContent('Cryptography');
    expect(breadcrumb).toHaveTextContent('Asymmetric Encryption');
  });

  it('returns to the correct filesystem folder on browser back (popstate)', async () => {
    render(<App />);
    await screen.findByTestId('knowledge-list');

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cryptography' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Asymmetric Encryption' }));
    await screen.findByTestId('graph-breadcrumb');

    window.dispatchEvent(new PopStateEvent('popstate', { state: { mode: 'filesystem', folderId: 3 } }));

    await waitFor(() => expect(screen.getByTestId('knowledge-list')).toHaveTextContent('Asymmetric Encryption'));
    expect(screen.getByTestId('knowledge-breadcrumb')).toHaveTextContent('Cryptography');
  });
});
