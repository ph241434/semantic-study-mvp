import { describe, expect, it } from 'vitest';

import { buildFlowchartElements, flowchartSignature, routeEdgeData } from './flowchartAdapter';
import { EDGE_STYLE_MAP, FLOW_NODE_TYPES, NODE_STYLE_MAP, edgeVisual, flowchartStyles, nodeVisual } from './flowStyles';
import type { FlowchartDetail, FlowNode } from '../types';

describe('flowchart node and edge styling', () => {
  it('maps every node type to a distinct meaningful Cytoscape shape', () => {
    expect(nodeVisual('DECISION').shape).toBe('diamond');
    expect(nodeVisual('INPUT_OUTPUT').shape).toBe('rhomboid');
    expect(nodeVisual('START').shape).toBe('round-rectangle');
    expect(nodeVisual('END').shape).toBe('round-rectangle');
    expect(nodeVisual('PROCESS').shape).toBe('rectangle');
    expect(nodeVisual('EXTERNAL_SYSTEM').shape).toBe('hexagon');
    expect(nodeVisual('DATA').shape).toBe('cut-rectangle');
    // Subprocess is a process shape with a secondary (double) border marker.
    expect(nodeVisual('SUBPROCESS').shape).toBe('rectangle');
    expect(nodeVisual('SUBPROCESS').borderStyle).toBe('double');
    expect(FLOW_NODE_TYPES).toHaveLength(8);
    // Colour is never the only signal: apart from terminals sharing a look, shapes/borders differ.
    const signatures = new Set(FLOW_NODE_TYPES.map((type) => `${NODE_STYLE_MAP[type].shape}|${NODE_STYLE_MAP[type].borderStyle}`));
    expect(signatures.size).toBe(FLOW_NODE_TYPES.length - 1);
  });

  it('distinguishes process, yes/no and retry edges', () => {
    expect(edgeVisual('NEXT').lineStyle).toBe('solid');
    expect(edgeVisual('YES').color).toBe(edgeVisual('SUCCESS').color);
    expect(edgeVisual('NO').color).toBe(edgeVisual('FAILURE').color);
    expect(edgeVisual('YES').color).not.toBe(edgeVisual('NO').color);
    expect(edgeVisual('RETRY').lineStyle).toBe('dashed');
    // Semantic overlay edges are visually secondary.
    expect(EDGE_STYLE_MAP.SEMANTIC.lineStyle).toBe('dotted');
    expect(edgeVisual('nonsense').color).toBe(edgeVisual('NEXT').color);
  });

  it('styles routed edges as segments and unrouted edges as vertical taxi', () => {
    const rules = flowchartStyles as unknown as Array<{ selector: string; style: Record<string, unknown> }>;
    const base = rules.find((rule) => rule.selector === 'edge');
    const routed = rules.find((rule) => rule.selector === 'edge[?routed][bendCount > 0]');
    expect(base?.style['curve-style']).toBe('taxi');
    expect(base?.style['taxi-direction']).toBe('vertical');
    expect(base?.style['source-label']).toBe('data(label)');
    expect(routed?.style['curve-style']).toBe('segments');
    // Branch labels never share an anchor: source-anchored when ELK routed, midpoint when taxi-routed.
    expect(rules.find((rule) => rule.selector === 'edge[!routed]')?.style).toMatchObject({ label: 'data(label)', 'source-label': '' });
    expect(rules.find((rule) => rule.selector === 'node[?hasChild]')).toBeDefined();
  });
});

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
    has_child: false,
    pos_x: null,
    pos_y: null,
    ...extra,
  };
}

function detail(): FlowchartDetail {
  return {
    flowchart: { id: 1, name: 'Loop', description: '', knowledge_space_id: null, is_primary: true, node_count: 4, created_at: '', updated_at: '' },
    nodes: [
      node(1, 'A', 'PROCESS'),
      node(2, 'B', 'PROCESS'),
      node(3, 'Done?', 'DECISION', { has_child: true }),
      node(4, 'D', 'END'),
    ],
    edges: [
      { id: 1, flowchart_id: 1, source_node_id: 1, target_node_id: 2, edge_type: 'NEXT', label: null, description: null },
      { id: 2, flowchart_id: 1, source_node_id: 1, target_node_id: 3, edge_type: 'NEXT', label: null, description: null },
      { id: 3, flowchart_id: 1, source_node_id: 2, target_node_id: 4, edge_type: 'NEXT', label: null, description: null },
      { id: 4, flowchart_id: 1, source_node_id: 3, target_node_id: 4, edge_type: 'YES', label: 'YES', description: null },
      { id: 5, flowchart_id: 1, source_node_id: 3, target_node_id: 2, edge_type: 'RETRY', label: 'NO', description: null },
    ],
  };
}

describe('flowchart adapter', () => {
  it('keeps merges and loops as single nodes with real edges', () => {
    const elements = buildFlowchartElements(detail());
    const nodes = elements.filter((element) => element.group === 'nodes');
    const edges = elements.filter((element) => element.group === 'edges');
    expect(nodes.map((element) => element.data.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(edges).toHaveLength(5);
    // D is one node with two incoming edges; B has two (from A and the retry loop).
    expect(edges.filter((edge) => edge.data.target === 'n4')).toHaveLength(2);
    expect(edges.filter((edge) => edge.data.target === 'n2')).toHaveLength(2);
    expect(edges.find((edge) => edge.data.id === 'e5')?.data).toMatchObject({ source: 'n3', target: 'n2', edgeType: 'RETRY', label: 'NO' });
  });

  it('applies type-based shapes and marks nodes that open a detailed flowchart', () => {
    const nodes = buildFlowchartElements(detail()).filter((element) => element.group === 'nodes');
    const byId = Object.fromEntries(nodes.map((element) => [element.data.id, element.data]));
    expect(byId.n3).toMatchObject({ shape: 'diamond', hasChild: true });
    expect(byId.n1).toMatchObject({ shape: 'rectangle', hasChild: false });
    expect(byId.n4.shape).toBe('round-rectangle');
  });

  it('routes edges from ELK bend points, or falls back to taxi once nodes are moved', () => {
    const routes = routeEdgeData(
      [{ x: 100, y: 40 }, { x: 100, y: 80 }, { x: 160, y: 80 }, { x: 160, y: 120 }],
      { x: 100, y: 20 },
      { x: 160, y: 140 },
    );
    expect(routes.bendCount).toBe(2);
    expect(routes.segWeights).toHaveLength(2);
    expect(routes.sourceEndpoint).toBe('0px 20px');
    expect(routes.targetEndpoint).toBe('0px -20px');

    const layout = {
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 100, height: 40 },
        { id: 'n2', x: 0, y: 100, width: 100, height: 40 },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', points: [{ x: 50, y: 40 }, { x: 50, y: 100 }], backEdge: false }],
      bounds: { x: 0, y: 0, width: 100, height: 140 },
      validation: { valid: true, nodeOverlaps: [], edgeNodeIntersections: [], edgeOverlaps: [] },
      attempts: 1,
      spacingScale: 1,
    };
    const small = { ...detail(), nodes: detail().nodes.slice(0, 2), edges: detail().edges.slice(0, 1) };
    const routed = buildFlowchartElements(small, { layout, routed: true }).find((element) => element.group === 'edges');
    const manual = buildFlowchartElements(small, { layout, routed: false }).find((element) => element.group === 'edges');
    expect(routed?.data.routed).toBe(true);
    expect(routed?.data.bendCount).toBe(0);
    expect(manual?.data.routed).toBe(false);
  });

  it('signature ignores positions and child links but tracks structure', () => {
    const base = detail();
    const moved = { ...base, nodes: base.nodes.map((item) => ({ ...item, pos_x: 5, pos_y: 5, has_child: !item.has_child })) };
    const renamed = { ...base, nodes: base.nodes.map((item) => (item.id === 1 ? { ...item, label: 'Renamed' } : item)) };
    expect(flowchartSignature(moved)).toBe(flowchartSignature(base));
    expect(flowchartSignature(renamed)).not.toBe(flowchartSignature(base));
  });
});
