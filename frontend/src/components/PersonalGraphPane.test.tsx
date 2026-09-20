import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphView, GraphViewDetail } from '../types';

const capturedProps = vi.hoisted(() => ({ current: null as any }));

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: (props: any) => {
      capturedProps.current = props;
      return (
        <div data-testid="mock-react-flow">
          {props.nodes.map((node: any) => (
            <div key={node.id} data-testid={`node-${node.id}`} data-x={node.position.x} data-y={node.position.y}>
              {node.data.label}
            </div>
          ))}
        </div>
      );
    },
  };
});

vi.mock('../api/client', () => ({
  api: {
    listGraphViews: vi.fn(),
    createGraphView: vi.fn(),
    getGraphView: vi.fn(),
    updateGraphViewNode: vi.fn(),
    addGraphViewNode: vi.fn(),
    createGraphViewEdge: vi.fn(),
    deleteGraphViewNode: vi.fn(),
    deleteGraphViewEdge: vi.fn(),
  },
}));

import { api } from '../api/client';
import { PersonalGraphPane, type PersonalGraphPaneHandle } from './PersonalGraphPane';

function view(id: number, name: string, rootConceptId = 1): GraphView {
  return {
    id,
    root_concept_id: rootConceptId,
    name,
    view_type: 'personal',
    sort_order: 0,
    created_at: '2026-09-17T00:00:00Z',
    updated_at: '2026-09-17T00:00:00Z',
  };
}

function detail(v: GraphView, nodes: GraphViewDetail['nodes'] = [], edges: GraphViewDetail['edges'] = []): GraphViewDetail {
  return { ...v, nodes, edges };
}

describe('PersonalGraphPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-creates a default "Overview" view when none exist for the root concept, only once', async () => {
    const created = view(1, 'Overview');
    vi.mocked(api.listGraphViews).mockResolvedValue([]);
    vi.mocked(api.createGraphView).mockResolvedValue(created);
    vi.mocked(api.getGraphView).mockResolvedValue(detail(created));

    render(<PersonalGraphPane rootId={7} />);

    await waitFor(() => expect(api.createGraphView).toHaveBeenCalledTimes(1));
    expect(api.createGraphView).toHaveBeenCalledWith({ root_concept_id: 7, name: 'Overview' });
  });

  it('restores a saved layout — node positions from getGraphView are reflected in rendered node positions', async () => {
    const v = view(1, 'Overview');
    vi.mocked(api.listGraphViews).mockResolvedValue([v]);
    vi.mocked(api.getGraphView).mockResolvedValue(
      detail(v, [
        { id: 100, graph_view_id: 1, concept_id: 2, label: 'Public Key', node_type: 'concept', x: 250, y: 175 },
      ]),
    );

    render(<PersonalGraphPane rootId={1} />);

    const node = await screen.findByTestId('node-100');
    expect(node).toHaveAttribute('data-x', '250');
    expect(node).toHaveAttribute('data-y', '175');
  });

  it('calls updateGraphViewNode exactly once on drag stop', async () => {
    const v = view(1, 'Overview');
    vi.mocked(api.listGraphViews).mockResolvedValue([v]);
    vi.mocked(api.getGraphView).mockResolvedValue(
      detail(v, [{ id: 100, graph_view_id: 1, concept_id: null, label: 'Message', node_type: 'note', x: 0, y: 0 }]),
    );

    render(<PersonalGraphPane rootId={1} />);
    await screen.findByTestId('node-100');

    capturedProps.current.onNodeDragStop({}, { id: '100', position: { x: 42, y: 84 } });

    expect(api.updateGraphViewNode).toHaveBeenCalledTimes(1);
    expect(api.updateGraphViewNode).toHaveBeenCalledWith(100, { x: 42, y: 84 });
  });

  it('creating a new view via the selector adds it to the list and makes it active', async () => {
    const original = view(1, 'Overview');
    const created = view(2, 'Encryption Flow');
    vi.mocked(api.listGraphViews).mockResolvedValue([original]);
    vi.mocked(api.getGraphView).mockImplementation(async (id: number) =>
      id === 1 ? detail(original) : detail(created),
    );
    vi.mocked(api.createGraphView).mockResolvedValue(created);
    vi.spyOn(window, 'prompt').mockReturnValue('Encryption Flow');

    render(<PersonalGraphPane rootId={1} />);
    await screen.findByTestId('mock-react-flow');

    fireEvent.click(screen.getByRole('button', { name: '+ New View' }));

    await waitFor(() =>
      expect(api.createGraphView).toHaveBeenCalledWith({ root_concept_id: 1, name: 'Encryption Flow' }),
    );
    await waitFor(() => expect(api.getGraphView).toHaveBeenCalledWith(2));
  });

  it('switching the active view via the selector fetches and renders that view', async () => {
    const viewA = view(1, 'Overview');
    const viewB = view(2, 'Signature Flow');
    vi.mocked(api.listGraphViews).mockResolvedValue([viewA, viewB]);
    vi.mocked(api.getGraphView).mockImplementation(async (id: number) =>
      id === 1
        ? detail(viewA, [{ id: 100, graph_view_id: 1, concept_id: null, label: 'A-node', node_type: 'note', x: 0, y: 0 }])
        : detail(viewB, [{ id: 200, graph_view_id: 2, concept_id: null, label: 'B-node', node_type: 'note', x: 0, y: 0 }]),
    );

    render(<PersonalGraphPane rootId={1} />);
    await screen.findByTestId('node-100');

    fireEvent.change(screen.getByLabelText('Personal view'), { target: { value: '2' } });

    await screen.findByTestId('node-200');
    expect(screen.queryByTestId('node-100')).not.toBeInTheDocument();
  });

  it('exposes addConceptNode via ref which posts a concept-backed node and refreshes the view', async () => {
    const v = view(1, 'Overview');
    vi.mocked(api.listGraphViews).mockResolvedValue([v]);
    vi.mocked(api.getGraphView).mockResolvedValue(detail(v));
    vi.mocked(api.addGraphViewNode).mockResolvedValue({
      id: 100,
      graph_view_id: 1,
      concept_id: 2,
      label: 'Public Key',
      node_type: 'concept',
      x: 40,
      y: 40,
    });

    const ref = createRef<PersonalGraphPaneHandle>();
    render(<PersonalGraphPane ref={ref} rootId={1} />);
    await screen.findByTestId('mock-react-flow');

    ref.current?.addConceptNode({ id: 2, name: 'Public Key' });

    await waitFor(() =>
      expect(api.addGraphViewNode).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ concept_id: 2, label: 'Public Key', node_type: 'concept' }),
      ),
    );
    await waitFor(() => expect(api.getGraphView).toHaveBeenCalledTimes(2));
  });
});
