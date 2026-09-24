import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowNode, FlowchartDetail } from '../types';

// Spy on the two expensive steps. They still run for real (real ELK, real geometry validation), so the counts show
// exactly when the canvas decides to lay out or validate.
const spies = vi.hoisted(() => ({ layout: 0, validate: 0 }));
vi.mock('./elkLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./elkLayout')>();
  return {
    ...actual,
    computeFlowLayout: (...args: Parameters<typeof actual.computeFlowLayout>) => {
      spies.layout += 1;
      return actual.computeFlowLayout(...args);
    },
  };
});
vi.mock('./flowGeometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./flowGeometry')>();
  return {
    ...actual,
    validateFlowGeometry: (...args: Parameters<typeof actual.validateFlowGeometry>) => {
      spies.validate += 1;
      return actual.validateFlowGeometry(...args);
    },
  };
});

// The real <ReactFlow> pane needs ResizeObserver / DOMMatrix, which jsdom lacks. This stand-in renders the nodes and
// edges it is given, keeps the latest props so a test can fire its handlers, and mounts its children inside the real
// provider so the viewport hook subscribes to a real React Flow store.
const rf = vi.hoisted(() => ({ props: null as any, renders: 0, store: null as any }));
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  function StoreProbe() {
    rf.store = actual.useStoreApi();
    return null;
  }
  return {
    ...actual,
    ReactFlow: (props: any) => {
      rf.props = props;
      rf.renders += 1;
      return (
        <div data-testid="rf">
          {props.nodes.map((node: any) => (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              data-selected={String(Boolean(node.selected))}
              data-x={node.position.x}
              data-y={node.position.y}
              data-editing={String(Boolean(node.data.editing))}
            >
              {node.data.label}
              {node.data.hasChild ? ' [child]' : ''}
              {node.data.editing && (
                <>
                  <button type="button" onClick={() => node.data.editing.onSave('Renamed')}>
                    save rename {node.id}
                  </button>
                  <button type="button" onClick={() => node.data.editing.onCancel()}>
                    cancel rename {node.id}
                  </button>
                </>
              )}
            </div>
          ))}
          {props.edges.map((edge: any) => (
            <div key={edge.id} data-testid={`edge-${edge.id}`} data-routed={String(Boolean(edge.data.points))} data-back={String(edge.data.backEdge)} />
          ))}
          <StoreProbe />
          {props.children}
        </div>
      );
    },
  };
});

import { FlowchartCanvas } from './FlowchartCanvas';
import { createViewStateStore } from './viewStateStore';

function node(id: number, flowchartId: number, label: string, extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    flowchart_id: flowchartId,
    concept_id: null,
    concept_name: null,
    concept_description: null,
    label,
    description: '',
    node_type: 'process',
    child_flowchart_id: null,
    child_flowchart_name: null,
    x: null,
    y: null,
    ...extra,
  };
}

function chart(id: number, nodes: FlowNode[], edges: Array<[number, number, number]>): FlowchartDetail {
  return {
    flowchart: { id, name: `Chart ${id}`, description: '', folder_id: null, node_count: nodes.length, edge_count: edges.length, used_by_count: 0, created_at: '', updated_at: '' },
    nodes,
    edges: edges.map(([edgeId, source, target]) => ({
      id: edgeId,
      flowchart_id: id,
      source_node_id: source,
      target_node_id: target,
      edge_type: 'normal' as const,
      label: null,
      description: null,
    })),
  };
}

// Parent: A -> B -> C with a loop C -> B and a merge A -> C.
const parent = chart(1, [node(1, 1, 'Encrypt message'), node(2, 1, 'Send'), node(3, 1, 'Confirm')], [[1, 1, 2], [2, 2, 3], [3, 3, 2], [4, 1, 3]]);
const child = chart(2, [node(4, 2, 'Generate nonce'), node(5, 2, 'AES-GCM encrypt'), node(6, 2, 'Package')], [[5, 4, 5], [6, 5, 6]]);

const noop = () => undefined;
function baseProps(viewStates = createViewStateStore()) {
  return {
    viewStates,
    layoutRevision: 0,
    selectedNodeId: null,
    selectedEdgeId: null,
    editingNodeId: null,
    onSelectNode: noop,
    onSelectEdge: noop,
    onClearSelection: noop,
    onOpenDetail: noop,
    onNodeMoved: noop,
    onConnect: noop,
    onRenameNode: noop,
    onCancelEditNode: noop,
  };
}

const nodeIds = () => screen.queryAllByTestId(/^node-/).map((element) => element.getAttribute('data-testid')!.replace('node-', ''));
const canvas = () => screen.getByTestId('flow-canvas');
const ready = () => waitFor(() => expect(screen.getByTestId('rf')).toBeInTheDocument());
const setTransform = (transform: [number, number, number]) => act(() => rf.store.setState({ transform }));

describe('FlowchartCanvas', () => {
  beforeEach(() => {
    spies.layout = 0;
    spies.validate = 0;
    rf.renders = 0;
    rf.props = null;
  });
  afterEach(cleanup);

  it('lays out once, validates the result, and flows top to bottom', async () => {
    render(<FlowchartCanvas detail={parent} {...baseProps()} />);
    await ready();

    expect(nodeIds()).toEqual(['n1', 'n2', 'n3']);
    expect(spies.layout).toBe(1);
    expect(spies.validate).toBe(1);
    expect(canvas()).toHaveAttribute('data-layout-valid', 'true');
    const y = (id: string) => Number(screen.getByTestId(`node-${id}`).getAttribute('data-y'));
    expect(y('n2')).toBeGreaterThan(y('n1'));
    expect(y('n3')).toBeGreaterThan(y('n2'));
    // Straight from ELK: every edge carries its route, and the C -> B loop is recognised as a back-edge.
    expect(screen.getAllByTestId(/^edge-/).every((edge) => edge.getAttribute('data-routed') === 'true')).toBe(true);
    expect(screen.getByTestId('edge-e3')).toHaveAttribute('data-back', 'true');
    expect(screen.getByTestId('edge-e1')).toHaveAttribute('data-back', 'false');
  });

  describe('pan and zoom are viewport operations only', () => {
    it('does not run layout, geometry validation or re-render the graph while panning and zooming', async () => {
      render(<FlowchartCanvas detail={parent} {...baseProps()} />);
      await ready();
      const layoutCalls = spies.layout;
      const validateCalls = spies.validate;
      const renders = rf.renders;

      // A long gesture: many viewport updates straight into the store, then the end-of-gesture callback.
      for (let step = 1; step <= 60; step += 1) setTransform([step * 3, step * -2, 1 + step * 0.01]);
      act(() => rf.props.onMoveEnd(null, { x: 180, y: -120, zoom: 1.6 }));

      expect(spies.layout).toBe(layoutCalls);
      expect(spies.validate).toBe(validateCalls);
      expect(rf.renders).toBe(renders); // the canvas component did not re-render for a single viewport frame
      expect(nodeIds()).toEqual(['n1', 'n2', 'n3']);
    });

    it('keeps the grid tied to the viewport with direct DOM writes', async () => {
      render(<FlowchartCanvas detail={parent} {...baseProps()} />);
      await ready();

      setTransform([120, -45, 0.5]);
      expect(canvas().style.getPropertyValue('--grid-size')).toBe('14px'); // 28px * zoom
      expect(canvas().style.getPropertyValue('--grid-x')).toBe('120px');
      expect(canvas().style.getPropertyValue('--grid-y')).toBe('-45px');
      setTransform([0, 0, 2]);
      expect(canvas().style.getPropertyValue('--grid-size')).toBe('56px');
    });

    it('switches level of detail by attribute at the zoom thresholds', async () => {
      render(<FlowchartCanvas detail={parent} {...baseProps()} />);
      await ready();
      expect(canvas()).toHaveAttribute('data-lod', 'normal');

      setTransform([0, 0, 0.3]);
      expect(canvas()).toHaveAttribute('data-lod', 'low');
      setTransform([0, 0, 2]);
      expect(canvas()).toHaveAttribute('data-lod', 'high');
      setTransform([0, 0, 1]);
      expect(canvas()).toHaveAttribute('data-lod', 'normal');
      expect(spies.layout).toBe(1);
      expect(spies.validate).toBe(1);
    });

    it('does not lay out again for selection, hover-like re-renders or unrelated parent updates', async () => {
      const props = baseProps();
      const view = render(<FlowchartCanvas detail={parent} {...props} />);
      await ready();

      view.rerender(<FlowchartCanvas detail={parent} {...props} selectedNodeId={2} />);
      view.rerender(<FlowchartCanvas detail={{ ...parent }} {...props} selectedNodeId={null} selectedEdgeId={1} />);
      expect(screen.getByTestId('edge-e1')).toBeInTheDocument();
      expect(spies.layout).toBe(1);
      expect(spies.validate).toBe(1);
    });
  });

  it('replaces the graph on switch (nothing accumulates) and restores the parent without laying it out again', async () => {
    const viewStates = createViewStateStore();
    const props = baseProps(viewStates);
    const view = render(<FlowchartCanvas detail={parent} {...props} />);
    await ready();

    // The user drags "Send", then pans and zooms.
    act(() => rf.props.onNodesChange([{ type: 'position', id: 'n2', position: { x: 777, y: 555 }, dragging: false }]));
    act(() => rf.props.onNodeDragStop(null, { id: 'n2', position: { x: 777, y: 555 } }));
    act(() => rf.props.onMoveEnd(null, { x: 40, y: -12, zoom: 1.6 }));
    const layoutAfterParent = spies.layout;

    view.rerender(<FlowchartCanvas detail={child} {...props} />);
    await waitFor(() => expect(nodeIds()).toEqual(['n4', 'n5', 'n6']));
    expect(screen.queryByTestId('node-n1')).not.toBeInTheDocument(); // no parent elements linger
    expect(screen.queryByTestId('edge-e1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^edge-/)).toHaveLength(2);
    expect(canvas()).toHaveAttribute('data-flowchart-id', '2');
    expect(spies.layout).toBeGreaterThan(layoutAfterParent); // the child needed a layout

    const layoutBeforeReturn = spies.layout;
    const validateBeforeReturn = spies.validate;
    view.rerender(<FlowchartCanvas detail={parent} {...props} />);
    await waitFor(() => expect(nodeIds()).toEqual(['n1', 'n2', 'n3']));
    expect(spies.layout).toBe(layoutBeforeReturn); // restored, not re-laid-out
    expect(spies.validate).toBe(validateBeforeReturn);
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-x', '777');
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-y', '555');
    expect(rf.props.defaultViewport).toEqual({ x: 40, y: -12, zoom: 1.6 });
    expect(rf.props.fitView).toBe(false); // restored viewport, not a fresh fit
  });

  it('falls back to live edge routes once a node is moved by hand', async () => {
    render(<FlowchartCanvas detail={parent} {...baseProps()} />);
    await ready();
    expect(screen.getAllByTestId(/^edge-/).every((edge) => edge.getAttribute('data-routed') === 'true')).toBe(true);

    act(() => rf.props.onNodeDragStart());
    expect(screen.getAllByTestId(/^edge-/).every((edge) => edge.getAttribute('data-routed') === 'false')).toBe(true);
    expect(spies.layout).toBe(1); // moving a node never re-runs the layout
  });

  it('reports drags and connections to the page with numeric ids', async () => {
    const onNodeMoved = vi.fn();
    const onConnect = vi.fn();
    const onSelectNode = vi.fn();
    const onOpenDetail = vi.fn();
    render(<FlowchartCanvas detail={parent} {...baseProps()} onNodeMoved={onNodeMoved} onConnect={onConnect} onSelectNode={onSelectNode} onOpenDetail={onOpenDetail} />);
    await ready();

    act(() => rf.props.onNodeDragStop(null, { id: 'n3', position: { x: 5, y: 6 } }));
    act(() => rf.props.onConnect({ source: 'n1', target: 'n3' }));
    act(() => rf.props.onConnect({ source: 'n1', target: 'n1' })); // self-connection is ignored
    act(() => rf.props.onNodeClick(null, { id: 'n2' }));
    act(() => rf.props.onNodeDoubleClick(null, { id: 'n2' }));
    expect(onNodeMoved).toHaveBeenCalledWith(3, { x: 5, y: 6 });
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith(1, 3);
    expect(onSelectNode).toHaveBeenCalledWith(2);
    expect(onOpenDetail).toHaveBeenCalledWith(2);
  });

  it('owns no selection state: it shows the selection it is given and ignores React Flow select changes', async () => {
    const props = baseProps();
    const view = render(<FlowchartCanvas detail={parent} {...props} selectedNodeId={2} />);
    await ready();
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('node-n1')).toHaveAttribute('data-selected', 'false');

    act(() => rf.props.onNodesChange([{ type: 'select', id: 'n1', selected: true }]));
    expect(screen.getByTestId('node-n1')).toHaveAttribute('data-selected', 'false');
    view.rerender(<FlowchartCanvas detail={parent} {...props} selectedNodeId={null} />);
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-selected', 'false');
  });

  it('marks only the editing node with `data.editing`, and routes save/cancel to the right callbacks with a numeric id', async () => {
    const onRenameNode = vi.fn();
    const onCancelEditNode = vi.fn();
    render(<FlowchartCanvas detail={parent} {...baseProps()} editingNodeId={2} onRenameNode={onRenameNode} onCancelEditNode={onCancelEditNode} />);
    await ready();

    expect(screen.getByTestId('node-n1')).toHaveAttribute('data-editing', 'false');
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-editing', 'true');
    expect(screen.getByTestId('node-n3')).toHaveAttribute('data-editing', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'save rename n2' }));
    expect(onRenameNode).toHaveBeenCalledWith(2, 'Renamed');

    fireEvent.click(screen.getByRole('button', { name: 'cancel rename n2' }));
    expect(onCancelEditNode).toHaveBeenCalledTimes(1);
  });

  it('lays out again only for structural edits, keeping hand-placed nodes and the viewport', async () => {
    const props = baseProps();
    const view = render(<FlowchartCanvas detail={parent} {...props} />);
    await ready();
    act(() => rf.props.onNodesChange([{ type: 'position', id: 'n2', position: { x: 300, y: 300 }, dragging: false }]));
    act(() => rf.props.onNodeDragStop(null, { id: 'n2', position: { x: 300, y: 300 } }));
    expect(spies.layout).toBe(1);

    // Editing a description / child link / concept name is not structural: no layout, node data refreshes in place.
    const cosmetic: FlowchartDetail = { ...parent, nodes: parent.nodes.map((item) => (item.id === 1 ? { ...item, description: 'x', child_flowchart_id: 2, concept_name: 'AES-GCM' } : item)) };
    view.rerender(<FlowchartCanvas detail={cosmetic} {...props} />);
    await waitFor(() => expect(screen.getByTestId('node-n1')).toHaveTextContent('[child]'));
    expect(spies.layout).toBe(1);

    // Adding a step is structural: lay out again, but the hand-placed node stays where the user put it.
    const grown = chart(1, [...parent.nodes, node(7, 1, 'Log result')], [...parent.edges.map((edge) => [edge.id, edge.source_node_id, edge.target_node_id] as [number, number, number]), [9, 3, 7]]);
    view.rerender(<FlowchartCanvas detail={grown} {...props} />);
    await waitFor(() => expect(nodeIds()).toContain('n7'));
    expect(spies.layout).toBe(2);
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-x', '300');
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-y', '300');
    // With something placed by hand, ELK's old routes no longer match, so edges use the live fallback routes.
    expect(screen.getAllByTestId(/^edge-/).every((edge) => edge.getAttribute('data-routed') === 'false')).toBe(true);
  });

  it('places nodes at their saved manual positions on first display', async () => {
    const moved: FlowchartDetail = { ...parent, nodes: parent.nodes.map((item) => (item.id === 2 ? { ...item, x: 500, y: 600 } : item)) };
    render(<FlowchartCanvas detail={moved} {...baseProps()} />);
    await ready();
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-x', '500');
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-y', '600');
    expect(screen.getByTestId('node-n1')).not.toHaveAttribute('data-x', '500');
  });

  it('Reorganize (a new layout revision) discards manual positions and lays out again', async () => {
    const props = baseProps();
    const view = render(<FlowchartCanvas detail={parent} {...props} />);
    await ready();
    act(() => rf.props.onNodesChange([{ type: 'position', id: 'n2', position: { x: 777, y: 555 }, dragging: false }]));
    act(() => rf.props.onNodeDragStop(null, { id: 'n2', position: { x: 777, y: 555 } }));
    expect(screen.getByTestId('node-n2')).toHaveAttribute('data-x', '777');

    view.rerender(<FlowchartCanvas detail={parent} {...props} layoutRevision={1} />);
    await waitFor(() => expect(screen.getByTestId('node-n2')).not.toHaveAttribute('data-x', '777'));
    expect(spies.layout).toBe(2);
    expect(screen.getAllByTestId(/^edge-/).every((edge) => edge.getAttribute('data-routed') === 'true')).toBe(true);
  });
});
