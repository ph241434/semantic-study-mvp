import { describe, expect, it } from 'vitest';

import { loadExampleDetails } from './devExamples';
import { elkLayoutOptions } from './elkLayout';
import { flowchartLayoutInputs } from './flowchartAdapter';
import { validateFlowGeometry } from './flowGeometry';
import { layoutFlowchart } from './flowLayout';

const details = loadExampleDetails();
const DIJKSTRA = "Dijkstra's algorithm";
const DELIVERY = 'Software feature delivery';
const NAMES = [DIJKSTRA, 'Update distance', 'Shortest-path service', DELIVERY];

function degrees(detail: (typeof details)[string]) {
  const incoming = new Map<number, number>();
  const outgoing = new Map<number, number>();
  for (const edge of detail.edges) {
    incoming.set(edge.target_node_id, (incoming.get(edge.target_node_id) ?? 0) + 1);
    outgoing.set(edge.source_node_id, (outgoing.get(edge.source_node_id) ?? 0) + 1);
  }
  return { incoming, outgoing };
}

describe('ELK layered flowchart layout', () => {
  it('is configured as a top-to-bottom layered layout', () => {
    const options = elkLayoutOptions();
    expect(options['elk.algorithm']).toBe('layered');
    expect(options['elk.direction']).toBe('DOWN');
    expect(options['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(elkLayoutOptions(2)['elk.spacing.nodeNode']).toBe('120');
  });

  it('loads every dev example flowchart', () => {
    for (const name of NAMES) expect(details[name], name).toBeDefined();
  });

  it.each(NAMES)('%s: lays out without overlaps or edge-through-node crossings', async (name) => {
    const detail = details[name];
    const { nodes, edges } = flowchartLayoutInputs(detail);
    const layout = await layoutFlowchart(nodes, edges);

    expect(layout.nodes).toHaveLength(detail.nodes.length);
    expect(layout.edges).toHaveLength(detail.edges.length);
    expect(layout.validation.nodeOverlaps).toEqual([]);
    expect(layout.validation.edgeNodeIntersections).toEqual([]);
    expect(layout.validation.edgeOverlaps).toEqual([]);
    // Re-validate independently of the retry loop.
    expect(validateFlowGeometry(layout.nodes, layout.edges).valid).toBe(true);
  });

  it.each(NAMES)('%s: forward progression is top to bottom', async (name) => {
    const { nodes, edges } = flowchartLayoutInputs(details[name]);
    const layout = await layoutFlowchart(nodes, edges);
    const forward = layout.edges.filter((edge) => !edge.backEdge);
    const centerY = new Map(layout.nodes.map((node) => [node.id, node.y + node.height / 2]));
    expect(forward.length).toBeGreaterThan(0);
    for (const edge of forward) {
      expect(centerY.get(edge.target) as number).toBeGreaterThan(centerY.get(edge.source) as number);
    }
  });

  it('Dijkstra: merges, branches and loops are real graph structure, not a tree', async () => {
    const detail = details[DIJKSTRA];
    const { incoming, outgoing } = degrees(detail);
    expect(Math.max(...incoming.values())).toBeGreaterThanOrEqual(2);
    expect(Math.max(...outgoing.values())).toBeGreaterThanOrEqual(2);
    // Every node exists exactly once: merges are not duplicated.
    expect(new Set(detail.nodes.map((node) => node.label)).size).toBe(detail.nodes.length);

    const { nodes, edges } = flowchartLayoutInputs(detail);
    const layout = await layoutFlowchart(nodes, edges);
    const back = layout.edges.filter((edge) => edge.backEdge);
    expect(back.length).toBeGreaterThanOrEqual(2);
    const idOf = new Map(detail.nodes.map((node) => [node.label, `n${node.id}`]));
    const backPairs = back.map((edge) => `${edge.source}>${edge.target}`);
    expect(backPairs).toContain(`${idOf.get('More neighbors?')}>${idOf.get('Visit neighbor')}`);
    expect(backPairs).toContain(`${idOf.get('More neighbors?')}>${idOf.get('Queue empty?')}`);
    // Graph data and Start vertex both feed validation.
    const validateId = detail.nodes.find((node) => node.label === 'Validate input')?.id;
    expect(detail.edges.filter((edge) => edge.target_node_id === validateId)).toHaveLength(2);
  });

  it('Feature delivery: test/review/deploy loops and multi-input merges', async () => {
    const detail = details[DELIVERY];
    const { incoming } = degrees(detail);
    const idOf = new Map(detail.nodes.map((node) => [node.label, node.id]));
    expect(incoming.get(idOf.get('Create plan') as number)).toBe(2);
    expect(incoming.get(idOf.get('Ready to merge') as number)).toBe(2);
    expect(incoming.get(idOf.get('Run tests') as number)).toBe(3);
    expect(incoming.get(idOf.get('Implement') as number)).toBe(2);

    const { nodes, edges } = flowchartLayoutInputs(detail);
    const layout = await layoutFlowchart(nodes, edges);
    expect(layout.edges.filter((edge) => edge.backEdge).length).toBeGreaterThanOrEqual(3);
  });

  it('handles an empty flowchart and a lone node', async () => {
    expect((await layoutFlowchart([], [])).nodes).toEqual([]);
    const single = await layoutFlowchart([{ id: 'n1', width: 100, height: 40 }], []);
    expect(single.nodes).toHaveLength(1);
    expect(single.validation.valid).toBe(true);
  });
});
