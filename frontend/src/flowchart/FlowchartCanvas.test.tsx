import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowNode, FlowchartDetail } from '../types';

type Def = { group: string; data: Record<string, unknown>; position?: { x: number; y: number } };

// A minimal in-memory stand-in for the Cytoscape core: enough to observe what the canvas adds and removes.
const fake = vi.hoisted(() => {
  const state = {
    elements: [] as Array<{ group: string; data: Record<string, unknown>; position?: { x: number; y: number } }>,
    pan: { x: 0, y: 0 },
    zoom: 1,
    selected: new Set<string>(),
    addCalls: 0,
    fitCalls: 0,
  };
  const wrap = (items: Array<{ group: string; data: Record<string, unknown>; position?: { x: number; y: number } }>) => {
    const objects = items.map((item) => ({
      id: () => item.data.id as string,
      position: () => item.position ?? { x: 0, y: 0 },
      data: (key: string, value?: unknown) => {
        if (value === undefined) return item.data[key];
        item.data[key] = value;
        return undefined;
      },
    }));
    const collection = {
      length: objects.length,
      forEach: (fn: (item: (typeof objects)[number]) => void) => objects.forEach(fn),
      nonempty: () => objects.length > 0,
      first: () => wrap(items.slice(0, 1)),
      id: () => (objects[0] ? objects[0].id() : ''),
    };
    return collection;
  };
  const core = {
    batch: (fn: () => void) => fn(),
    elements: () => ({
      remove: () => {
        state.elements = [];
      },
      unselect: () => state.selected.clear(),
    }),
    add: (defs: Def[]) => {
      state.addCalls += 1;
      state.elements.push(...defs.map((def) => ({ ...def, position: def.position && { ...def.position } })));
    },
    nodes: (selector?: string) =>
      wrap(state.elements.filter((item) => item.group === 'nodes' && (selector !== ':selected' || state.selected.has(item.data.id as string)))),
    edges: (selector?: string) =>
      wrap(state.elements.filter((item) => item.group === 'edges' && (selector !== ':selected' || state.selected.has(item.data.id as string)))),
    getElementById: (id: string) => ({
      select: () => state.selected.add(id),
      nonempty: () => state.elements.some((item) => item.data.id === id),
      data: (key: string, value?: unknown) => {
        const found = state.elements.find((item) => item.data.id === id);
        if (value === undefined) return found?.data[key];
        if (found) found.data[key] = value;
        return undefined;
      },
    }),
    pan: (value?: { x: number; y: number }) => {
      if (value) state.pan = { ...value };
      return { ...state.pan };
    },
    zoom: (value?: number) => {
      if (value !== undefined) state.zoom = value;
      return state.zoom;
    },
    fit: () => {
      state.fitCalls += 1;
    },
    center: () => undefined,
    resize: () => undefined,
    forceRender: () => undefined,
    on: () => undefined,
    destroy: () => undefined,
  };
  return { state, core };
});

vi.mock('cytoscape', () => ({ default: () => fake.core }));

const layoutCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('./flowLayout', () => ({
  layoutFlowchart: vi.fn(async (nodes: Array<{ id: string }>) => {
    layoutCalls.count += 1;
    return {
      nodes: nodes.map((node, index) => ({ id: node.id, x: index * 200, y: index * 100, width: 100, height: 40 })),
      edges: [],
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      validation: { valid: true, nodeOverlaps: [], edgeNodeIntersections: [], edgeOverlaps: [] },
      attempts: 1,
      spacingScale: 1,
    };
  }),
}));

import { FlowchartCanvas } from './FlowchartCanvas';
import { createViewStateStore } from './viewStateStore';

function node(id: number, flowchartId: number, label: string): FlowNode {
  return {
    id,
    flowchart_id: flowchartId,
    concept_id: null,
    concept_name: null,
    concept_description: null,
    label,
    description: '',
    node_type: 'PROCESS',
    child_flowchart_id: null,
    child_flowchart_name: null,
    has_child: false,
    pos_x: null,
    pos_y: null,
  };
}

function chart(id: number, nodes: FlowNode[], edges: Array<[number, number, number]>): FlowchartDetail {
  return {
    flowchart: { id, name: `Chart ${id}`, description: '', knowledge_space_id: null, is_primary: false, node_count: nodes.length, created_at: '', updated_at: '' },
    nodes,
    edges: edges.map(([edgeId, source, target]) => ({
      id: edgeId,
      flowchart_id: id,
      source_node_id: source,
      target_node_id: target,
      edge_type: 'NEXT' as const,
      label: null,
      description: null,
    })),
  };
}

const parent = chart(1, [node(1, 1, 'Encrypt message'), node(2, 1, 'Send')], [[1, 1, 2]]);
const child = chart(2, [node(3, 2, 'Generate nonce'), node(4, 2, 'AES-GCM encrypt'), node(5, 2, 'Package')], [[2, 3, 4], [3, 4, 5]]);

const ids = () => fake.state.elements.map((item) => item.data.id);
const noop = () => undefined;

describe('FlowchartCanvas graph switching', () => {
  beforeEach(() => {
    fake.state.elements = [];
    fake.state.pan = { x: 0, y: 0 };
    fake.state.zoom = 1;
    fake.state.selected.clear();
    fake.state.addCalls = 0;
    fake.state.fitCalls = 0;
    layoutCalls.count = 0;
  });
  afterEach(cleanup);

  it('replaces elements on switch and restores the parent without laying it out again', async () => {
    const viewStates = createViewStateStore();
    const props = { viewStates, layoutRevision: 0, onNodeTap: noop };
    const view = render(<FlowchartCanvas detail={parent} selectedNodeId={2} {...props} />);

    await waitFor(() => expect(ids()).toEqual(['n1', 'n2', 'e1']));
    expect(layoutCalls.count).toBe(1);
    expect(view.getByTestId('flow-canvas')).toHaveAttribute('data-graph-key', '1');

    // The user pans, zooms, drags Send and selects it.
    fake.state.pan = { x: 40, y: -12 };
    fake.state.zoom = 1.6;
    fake.state.elements.find((item) => item.data.id === 'n2')!.position = { x: 777, y: 555 };

    view.rerender(<FlowchartCanvas detail={child} selectedNodeId={null} {...props} />);
    await waitFor(() => expect(ids()).toEqual(['n3', 'n4', 'n5', 'e2', 'e3']));
    // No parent elements linger, and the child is a clean independent graph.
    expect(ids().some((id) => id === 'n1' || id === 'n2' || id === 'e1')).toBe(false);
    expect(layoutCalls.count).toBe(2);
    expect(view.getByTestId('flow-canvas')).toHaveAttribute('data-node-count', '3');

    expect(fake.state.selected.size).toBe(0);

    view.rerender(<FlowchartCanvas detail={parent} selectedNodeId={2} {...props} />);
    await waitFor(() => expect(ids()).toEqual(['n1', 'n2', 'e1']));
    expect(layoutCalls.count).toBe(2); // restored from the snapshot, not re-laid-out
    expect(fake.state.pan).toEqual({ x: 40, y: -12 });
    expect(fake.state.zoom).toBe(1.6);
    expect(fake.state.elements.find((item) => item.data.id === 'n2')?.position).toEqual({ x: 777, y: 555 });
    expect(fake.state.selected.has('n2')).toBe(true);
  });

  it('runs a fresh layout when Reorganize bumps the revision', async () => {
    const viewStates = createViewStateStore();
    const view = render(<FlowchartCanvas detail={parent} viewStates={viewStates} layoutRevision={0} onNodeTap={noop} />);
    await waitFor(() => expect(layoutCalls.count).toBe(1));
    viewStates.clear(1);
    view.rerender(<FlowchartCanvas detail={parent} viewStates={viewStates} layoutRevision={1} onNodeTap={noop} />);
    await waitFor(() => expect(layoutCalls.count).toBe(2));
    expect(ids()).toEqual(['n1', 'n2', 'e1']);
  });

  it('places nodes at their saved manual positions and skips routed edges', async () => {
    const moved = { ...parent, nodes: parent.nodes.map((item) => (item.id === 2 ? { ...item, pos_x: 500, pos_y: 600 } : item)) };
    render(<FlowchartCanvas detail={moved} viewStates={createViewStateStore()} layoutRevision={0} onNodeTap={noop} />);
    await waitFor(() => expect(ids()).toHaveLength(3));
    expect(fake.state.elements.find((item) => item.data.id === 'n2')?.position).toEqual({ x: 500, y: 600 });
    expect(fake.state.elements.find((item) => item.data.id === 'e1')?.data.routed).toBe(false);
  });
});
