import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphResponse, Relationship } from '../types';

// The real <ReactFlow> pane relies on ResizeObserver + DOMMatrix measurement passes that jsdom
// does not implement, so it is stubbed here with a trivial renderer that mounts the real node
// components (via the nodeTypes it receives) inside a real <ReactFlowProvider>, which the custom
// node's <Handle> children need for context but which does not itself require measurement APIs.
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ nodes, nodeTypes, onNodeClick }: any) => {
      const NodeComponent = nodeTypes.semanticNode;
      return (
        <actual.ReactFlowProvider>
          <div data-testid="mock-react-flow">
            {nodes.map((node: any) => (
              <div key={node.id} data-testid={`node-${node.id}`} onClick={() => onNodeClick?.({}, node)}>
                <NodeComponent {...node} selected={false} dragging={false} isConnectable />
              </div>
            ))}
          </div>
        </actual.ReactFlowProvider>
      );
    },
  };
});

import { GraphCanvas } from './GraphCanvas';

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

const root = concept(1, 'Asymmetric Encryption');
const publicKey = concept(2, 'Public Key');

const graph: GraphResponse = {
  center_id: 1,
  depth: 1,
  nodes: [root, publicKey],
  relationships: [relationship(10, 1, 2, 'USES')],
};

const linkedConceptIds = new Set([1, 2]);

describe('GraphCanvas add-to-personal-view affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('omits the + button when onAddToPersonalView is not provided', () => {
    render(
      <GraphCanvas graph={graph} rootId={1} hidden={null} linkedConceptIds={linkedConceptIds} onSelectConcept={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /Add .* to My Model/ })).not.toBeInTheDocument();
  });

  it('renders a + button on each node when onAddToPersonalView is provided', () => {
    render(
      <GraphCanvas
        graph={graph}
        rootId={1}
        hidden={null}
        linkedConceptIds={linkedConceptIds}
        onSelectConcept={vi.fn()}
        onAddToPersonalView={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add Public Key to My Model' })).toBeInTheDocument();
  });

  it('calls onAddToPersonalView without triggering node-click navigation', () => {
    const onSelectConcept = vi.fn();
    const onAddToPersonalView = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        rootId={1}
        hidden={null}
        linkedConceptIds={linkedConceptIds}
        onSelectConcept={onSelectConcept}
        onAddToPersonalView={onAddToPersonalView}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Public Key to My Model' }));

    expect(onAddToPersonalView).toHaveBeenCalledWith(2);
    expect(onSelectConcept).not.toHaveBeenCalled();
  });

  it('still navigates when the node body (not the + button) is clicked', () => {
    const onSelectConcept = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        rootId={1}
        hidden={null}
        linkedConceptIds={linkedConceptIds}
        onSelectConcept={onSelectConcept}
        onAddToPersonalView={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('node-2'));

    expect(onSelectConcept).toHaveBeenCalledWith(2);
  });
});
