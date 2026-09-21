import { describe, expect, it } from 'vitest';

import type { FlowNode, FlowchartDetail } from '../types';
import {
  buildFlowEdges,
  buildFlowNodes,
  edgeElementId,
  flowchartSignature,
  layoutInputs,
  manualPositions,
  nodeElementId,
  parseEdgeElementId,
  parseNodeElementId,
} from './flowAdapter';
import { layoutFlowchart } from './flowLayout';
import { edgeVisual } from './flowStyles';

function node(id: number, label: string, type: FlowNode['node_type'], extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    flowchart_id: 1,
    concept_id: null,
    concept_name: null,
    concept_description: null,
    label,
    description: '',
    node_type: type,
    child_flowchart_id: null,
    child_flowchart_name: null,
    x: null,
    y: null,
    ...extra,
  };
}

function edge(id: number, source: number, target: number, type: FlowchartDetail['edges'][number]['edge_type'] = 'normal', label: string | null = null) {
  return { id, flowchart_id: 1, source_node_id: source, target_node_id: target, edge_type: type, label, description: null };
}

/** A -> B -> Decision -> (Done | Retry -> B), plus a merge into D from two inputs. */
function detail(): FlowchartDetail {
  return {
    flowchart: { id: 1, name: 'Loop', description: '', folder_id: null, node_count: 5, edge_count: 6, used_by_count: 0, created_at: '', updated_at: '' },
    nodes: [
      node(1, 'A', 'process'),
      node(2, 'B', 'process'),
      node(3, 'Done?', 'decision', { child_flowchart_id: 9, concept_name: 'Termination' }),
      node(4, 'D', 'end'),
      node(5, 'Extra input', 'input_output'),
    ],
    edges: [
      edge(1, 1, 2),
      edge(2, 2, 3),
      edge(3, 3, 4, 'yes', 'YES'),
      edge(4, 3, 2, 'retry', 'NO'),
      edge(5, 5, 4),
      edge(6, 1, 4),
    ],
  };
}

describe('flowchart -> React Flow adapter', () => {
  it('keeps merges and loops as single nodes with real edges', () => {
    const nodes = buildFlowNodes(detail(), {});
    const edges = buildFlowEdges(detail(), null, false);
    expect(nodes.map((item) => item.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(edges).toHaveLength(6);
    expect(edges.filter((item) => item.target === 'n4')).toHaveLength(3); // merge: three edges into one node
    expect(edges.filter((item) => item.target === 'n2')).toHaveLength(2); // A -> B and the retry loop back to B
    expect(edges.filter((item) => item.source === 'n3')).toHaveLength(2); // one decision, two outgoing edges
    expect(edges.find((item) => item.id === 'e4')?.data).toMatchObject({ edgeType: 'retry', label: 'NO' });
  });

  it('maps node types to shapes and marks nodes that open a detailed flowchart', () => {
    const byId = Object.fromEntries(buildFlowNodes(detail(), {}).map((item) => [item.id, item.data]));
    expect(byId.n3).toMatchObject({ nodeType: 'decision', hasChild: true, conceptName: 'Termination' });
    expect(byId.n1).toMatchObject({ nodeType: 'process', hasChild: false });
    expect(byId.n5.nodeType).toBe('input_output');
  });

  it('gives each edge its own type colour and keeps flow edges distinct from semantic relationships', () => {
    const edges = buildFlowEdges(detail(), null, false);
    const color = (id: string) => edges.find((item) => item.id === id)?.data?.color;
    expect(color('e3')).toBe(edgeVisual('yes').color);
    expect(color('e4')).toBe(edgeVisual('retry').color);
    expect(color('e1')).toBe(edgeVisual('normal').color);
    expect(edges.every((item) => item.data?.edgeType !== 'semantic')).toBe(true); // semantic edges are never built by default
  });

  it('uses ELK routes and marks loop edges only while positions match the layout', async () => {
    const chart = detail();
    const inputs = layoutInputs(chart);
    const layout = await layoutFlowchart(inputs.nodes, inputs.edges);
    const routed = buildFlowEdges(chart, layout, true);
    const unrouted = buildFlowEdges(chart, layout, false);

    expect(routed.every((item) => (item.data?.points?.length ?? 0) >= 2)).toBe(true);
    expect(unrouted.every((item) => item.data?.points === null)).toBe(true);
    const retry = routed.find((item) => item.id === 'e4');
    expect(retry?.data?.backEdge).toBe(true);
    expect(retry?.data?.dashed).toBe(true);
    expect(routed.find((item) => item.id === 'e1')?.data?.backEdge).toBe(false);
  });

  it('positions nodes from the layout / manual positions and ignores nothing else', () => {
    const chart = detail();
    chart.nodes[1] = { ...chart.nodes[1], x: 500, y: 600 };
    expect(manualPositions(chart)).toEqual({ n2: { x: 500, y: 600 } });
    const built = buildFlowNodes(chart, { n1: { x: 1, y: 2 } });
    expect(built[0].position).toEqual({ x: 1, y: 2 });
    expect(built[1].position).toEqual({ x: 0, y: 0 }); // not in `positions`: the caller decides
  });

  it('signature ignores positions, descriptions and child links but tracks structure', () => {
    const base = detail();
    const cosmetic: FlowchartDetail = {
      ...base,
      nodes: base.nodes.map((item) => ({ ...item, x: 5, y: 5, description: 'changed', child_flowchart_id: 77, concept_name: 'other' })),
    };
    const renamed: FlowchartDetail = { ...base, nodes: base.nodes.map((item) => (item.id === 1 ? { ...item, label: 'Renamed' } : item)) };
    const rewired: FlowchartDetail = { ...base, edges: base.edges.slice(1) };
    expect(flowchartSignature(cosmetic)).toBe(flowchartSignature(base));
    expect(flowchartSignature(renamed)).not.toBe(flowchartSignature(base));
    expect(flowchartSignature(rewired)).not.toBe(flowchartSignature(base));
  });

  it('round-trips element ids', () => {
    expect(parseNodeElementId(nodeElementId(42))).toBe(42);
    expect(parseEdgeElementId(edgeElementId(7))).toBe(7);
    expect(parseNodeElementId('e7')).toBeNull();
    expect(parseEdgeElementId('n7')).toBeNull();
  });
});
