import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FilesystemBreadcrumbSegment, GraphResponse, Relationship, TrailEntry } from '../types';

vi.mock('../components/GraphCanvas', () => ({
  GraphCanvas: ({
    graph,
    rootId,
    hidden,
    onSelectConcept,
  }: {
    graph: GraphResponse;
    rootId: number;
    hidden: { edgeId: number; hiddenConceptId: number | null; revealed: boolean } | null;
    onSelectConcept: (conceptId: number) => void;
  }) => (
    <div
      data-testid="mock-graph-canvas"
      data-root-id={rootId}
      data-node-count={graph.nodes.length}
      data-hidden-concept={hidden?.hiddenConceptId ?? ''}
      data-hidden-edge={hidden?.edgeId ?? ''}
      data-revealed={String(Boolean(hidden?.revealed))}
    >
      {graph.nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => onSelectConcept(node.id)}>
          {`Select node ${node.id}`}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../api/client', () => ({
  api: {
    graph: vi.fn(),
  },
}));

import { api } from '../api/client';
import { GraphPage } from './GraphPage';

function concept(id: number, name: string, description = `${name} description`) {
  return {
    id,
    name,
    description,
    concept_type: 'concept' as const,
    mastery_score: 0,
    confidence: 0.3,
    created_at: '2026-09-17T00:00:00Z',
    updated_at: '2026-09-17T00:00:00Z',
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
    description: '',
    mastery_score: 0,
    confidence: 0.3,
    created_at: '2026-09-17T00:00:00Z',
    updated_at: '2026-09-17T00:00:00Z',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: null,
    target_name: null,
  };
}

const asymmetricEncryption = concept(1, 'Asymmetric Encryption');
const publicKey = concept(2, 'Public Key');
const ciphertext = concept(3, 'Ciphertext', 'Encrypted output produced from plaintext.');
const certificates = concept(4, 'Certificates');
const firewalls = concept(5, 'Firewalls');

const graphs: Record<number, GraphResponse> = {
  1: {
    center_id: 1,
    depth: 1,
    nodes: [asymmetricEncryption, publicKey, ciphertext],
    relationships: [relationship(10, 1, 2, 'USES'), relationship(11, 1, 3, 'PRODUCES')],
  },
  2: {
    center_id: 2,
    depth: 1,
    nodes: [publicKey, certificates],
    relationships: [relationship(20, 4, 2, 'CONTAINS')],
  },
  5: {
    center_id: 5,
    depth: 1,
    nodes: [firewalls],
    relationships: [],
  },
};

const linkedConceptIds = new Set([1, 2, 5]);

const filesystemBreadcrumb: FilesystemBreadcrumbSegment[] = [
  { id: null, name: 'Knowledge' },
  { id: 10, name: 'Cybersecurity' },
  { id: 11, name: 'Cryptography' },
];

function renderGraphPage(trail: TrailEntry[], overrides: Partial<Parameters<typeof GraphPage>[0]> = {}) {
  const onTrailChange = vi.fn();
  const onExitToFilesystem = vi.fn();
  const utils = render(
    <GraphPage
      trail={trail}
      filesystemBreadcrumb={filesystemBreadcrumb}
      linkedConceptIds={linkedConceptIds}
      onTrailChange={onTrailChange}
      onExitToFilesystem={onExitToFilesystem}
      {...overrides}
    />,
  );
  return { ...utils, onTrailChange, onExitToFilesystem };
}

describe('GraphPage single-depth semantic graph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.graph).mockImplementation(async (conceptId: number) => graphs[conceptId]);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows only the root concept and its immediate neighborhood, with the combined breadcrumb', async () => {
    renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);

    const canvas = await screen.findByTestId('mock-graph-canvas');
    expect(canvas).toHaveAttribute('data-root-id', '1');
    expect(canvas).toHaveAttribute('data-node-count', '3');

    const breadcrumb = screen.getByTestId('graph-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Knowledge');
    expect(breadcrumb).toHaveTextContent('Cryptography');
    expect(breadcrumb).toHaveTextContent('Asymmetric Encryption');
    expect(api.graph).toHaveBeenCalledWith(1, 1);
  });

  it('navigates into a linked concept by calling onTrailChange, not by self-managing state', async () => {
    const { onTrailChange } = renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Select node 2' }));

    expect(onTrailChange).toHaveBeenCalledWith([
      { id: 1, name: 'Asymmetric Encryption' },
      { id: 2, name: 'Public Key' },
    ]);
  });

  it('shows a description popover for a non-linked node instead of navigating', async () => {
    const { onTrailChange } = renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Select node 3' }));

    expect(onTrailChange).not.toHaveBeenCalled();
    const panel = await screen.findByTestId('graph-description-panel');
    expect(panel).toHaveTextContent('Ciphertext');
    expect(panel).toHaveTextContent('Encrypted output produced from plaintext.');
  });

  it('truncates the trail when an earlier trail breadcrumb segment is clicked', async () => {
    const { onTrailChange } = renderGraphPage([
      { id: 1, name: 'Asymmetric Encryption' },
      { id: 2, name: 'Public Key' },
    ]);
    await waitFor(() => expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-root-id', '2'));

    fireEvent.click(screen.getByRole('button', { name: 'Asymmetric Encryption' }));

    expect(onTrailChange).toHaveBeenCalledWith([{ id: 1, name: 'Asymmetric Encryption' }]);
  });

  it('exits to the filesystem when a filesystem breadcrumb segment is clicked', async () => {
    const { onExitToFilesystem } = renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Cryptography' }));

    expect(onExitToFilesystem).toHaveBeenCalledWith(11);
  });

  it('shows a full description panel instead of a graph for a leaf concept', async () => {
    renderGraphPage([{ id: 5, name: 'Firewalls' }]);

    const leaf = await screen.findByTestId('graph-leaf');
    expect(leaf).toHaveTextContent('Firewalls');
    expect(screen.queryByTestId('mock-graph-canvas')).not.toBeInTheDocument();
  });

  it('disables Study mode for a leaf concept and enables it for a hub', async () => {
    renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');
    expect(screen.getByRole('button', { name: 'Study' })).toBeEnabled();

    cleanup();
    renderGraphPage([{ id: 5, name: 'Firewalls' }]);
    await screen.findByTestId('graph-leaf');
    expect(screen.getByRole('button', { name: 'Study' })).toBeDisabled();
  });

  it('hides a node in Study mode, reveals it on demand, and advances with Next', async () => {
    renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Study' }));

    const bar = await screen.findByTestId('graph-study-bar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-hidden-concept', '2');

    fireEvent.click(screen.getByTestId('graph-reveal'));
    expect(screen.getByTestId('graph-study-prompt')).toHaveTextContent('Public Key');

    fireEvent.click(screen.getByTestId('graph-next'));
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-revealed', 'false');
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-hidden-edge', '11');
  });

  it('reveals the hidden node instead of navigating when it is clicked directly', async () => {
    renderGraphPage([{ id: 1, name: 'Asymmetric Encryption' }]);
    await screen.findByTestId('mock-graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Study' }));
    await screen.findByTestId('graph-study-bar');

    fireEvent.click(screen.getByRole('button', { name: 'Select node 2' }));

    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-root-id', '1');
    expect(screen.getByTestId('mock-graph-canvas')).toHaveAttribute('data-revealed', 'true');
  });
});
