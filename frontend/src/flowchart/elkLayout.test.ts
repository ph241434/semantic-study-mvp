import { describe, expect, it } from 'vitest';

import { loadExampleDetails } from './devExamples';
import { elkLayoutOptions } from './elkLayout';
import { layoutInputs } from './flowAdapter';
import { validateFlowGeometry } from './flowGeometry';
import { layoutFlowchart } from './flowLayout';

const details = loadExampleDetails();
const DIJKSTRA = "Dijkstra's algorithm";
const DELIVERY = 'Software feature delivery';
const SERVICE = 'Shortest-path service';
const UPDATE = 'Update distance';
const NAMES = [SERVICE, DIJKSTRA, UPDATE, DELIVERY];

function degrees(name: string) {
  const incoming = new Map<number, number>();
  const outgoing = new Map<number, number>();
  for (const edge of details[name].edges) {
    incoming.set(edge.target_node_id, (incoming.get(edge.target_node_id) ?? 0) + 1);
    outgoing.set(edge.source_node_id, (outgoing.get(edge.source_node_id) ?? 0) + 1);
  }
  return { incoming, outgoing };
}

async function laidOut(name: string) {
  const { nodes, edges } = layoutInputs(details[name]);
  return layoutFlowchart(nodes, edges);
}

describe('ELK layered layout configuration', () => {
  it('is a top-to-bottom layered layout with orthogonal routing and cycle support', () => {
    const options = elkLayoutOptions();
    expect(options['elk.algorithm']).toBe('layered');
    expect(options['elk.direction']).toBe('DOWN');
    expect(options['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(options['elk.layered.cycleBreaking.strategy']).toBe('MODEL_ORDER');
    expect(options['elk.separateConnectedComponents']).toBe('true');
    // Not a force-directed or radial layout.
    expect(JSON.stringify(options)).not.toMatch(/force|stress|radial|mrtree/i);
  });

  it('widens every gap when spacing is scaled for a validation retry', () => {
    expect(Number(elkLayoutOptions(2)['elk.spacing.nodeNode'])).toBe(2 * Number(elkLayoutOptions(1)['elk.spacing.nodeNode']));
  });
});

describe('dev examples are laid out as real directed graphs', () => {
  it('loads every example flowchart from the shared JSON', () => {
    for (const name of NAMES) expect(details[name], name).toBeDefined();
    expect(details[DIJKSTRA].nodes.some((node) => node.child_flowchart_id === details[UPDATE].flowchart.id)).toBe(true);
    expect(details[SERVICE].nodes.some((node) => node.child_flowchart_id === details[DIJKSTRA].flowchart.id)).toBe(true);
  });

  it.each(NAMES)('%s: no overlapping nodes, no edge through an unrelated node, no shared edge paths', async (name) => {
    const layout = await laidOut(name);
    expect(layout.nodes).toHaveLength(details[name].nodes.length);
    expect(layout.edges).toHaveLength(details[name].edges.length);
    expect(layout.validation).toMatchObject({ valid: true, nodeOverlaps: [], edgeNodeIntersections: [], edgeOverlaps: [] });
    expect(validateFlowGeometry(layout.nodes, layout.edges).valid).toBe(true); // independent re-check
    expect(layout.attempts).toBeLessThanOrEqual(4); // bounded retries
  });

  it.each(NAMES)('%s: forward progression is top to bottom', async (name) => {
    const layout = await laidOut(name);
    const centerY = new Map(layout.nodes.map((node) => [node.id, node.y + node.height / 2]));
    const forward = layout.edges.filter((edge) => !edge.backEdge);
    expect(forward.length).toBeGreaterThan(0);
    for (const edge of forward) expect(centerY.get(edge.target) as number).toBeGreaterThan(centerY.get(edge.source) as number);
  });

  it("Dijkstra: merges, branches and loops are real graph structure, and it is not a tree", async () => {
    const { incoming, outgoing } = degrees(DIJKSTRA);
    expect(Math.max(...incoming.values())).toBeGreaterThanOrEqual(2);
    expect(Math.max(...outgoing.values())).toBeGreaterThanOrEqual(2);
    expect(new Set(details[DIJKSTRA].nodes.map((node) => node.label)).size).toBe(details[DIJKSTRA].nodes.length); // no duplicated nodes

    const layout = await laidOut(DIJKSTRA);
    const idOf = new Map(details[DIJKSTRA].nodes.map((node) => [node.label, `n${node.id}`]));
    const back = layout.edges.filter((edge) => edge.backEdge).map((edge) => `${edge.source}>${edge.target}`);
    expect(back).toContain(`${idOf.get('More neighbors?')}>${idOf.get('Visit neighbor')}`); // loop 2
    expect(back).toContain(`${idOf.get('More neighbors?')}>${idOf.get('Queue empty?')}`); // loop 1
    // "Graph data" and "Start vertex" both feed validation (two inputs into one node).
    const validateId = details[DIJKSTRA].nodes.find((node) => node.label === 'Validate input')?.id;
    expect(details[DIJKSTRA].edges.filter((edge) => edge.target_node_id === validateId)).toHaveLength(2);
    // "New path shorter?" both ways converge on "More neighbors?": a merge.
    const moreId = details[DIJKSTRA].nodes.find((node) => node.label === 'More neighbors?')?.id as number;
    expect(incoming.get(moreId)).toBe(2);
  });

  it('Feature delivery: parallel branches, merges and test / review / production loops', async () => {
    const { incoming } = degrees(DELIVERY);
    const idOf = new Map(details[DELIVERY].nodes.map((node) => [node.label, node.id]));
    expect(incoming.get(idOf.get('Create plan') as number)).toBe(2); // research + constraints
    expect(incoming.get(idOf.get('Ready to merge') as number)).toBe(2); // approval + test results
    expect(incoming.get(idOf.get('Run tests') as number)).toBe(3); // implement, fix, revise
    expect(incoming.get(idOf.get('Implement') as number)).toBe(2); // plan + production diagnosis

    const layout = await laidOut(DELIVERY);
    expect(layout.edges.filter((edge) => edge.backEdge).length).toBeGreaterThanOrEqual(3);
    // Research and constraints are siblings: same layer, side by side.
    const box = (label: string) => layout.nodes.find((node) => node.id === `n${idOf.get(label)}`)!;
    const research = box('Technical research');
    const constraints = box('Constraints');
    expect(Math.abs(research.y - constraints.y)).toBeLessThan(1);
    expect(Math.abs(research.x - constraints.x)).toBeGreaterThan(research.width / 2);
  });

  it('uses horizontal space: parallel work is spread sideways and no chart is an extreme sliver', async () => {
    for (const name of NAMES) {
      const layout = await laidOut(name);
      // A single vertical column would be about one node wide; every example is meaningfully wider than that.
      const widest = Math.max(...layout.nodes.map((node) => node.width));
      expect(layout.bounds.width, name).toBeGreaterThan(widest * 2);
      expect(layout.aspectRatio, name).toBeLessThan(name === DIJKSTRA ? 3.4 : 2.7);
    }
    // Charts with real parallel structure are noticeably more balanced than a serial chain.
    expect((await laidOut(SERVICE)).aspectRatio).toBeLessThan(1.5);
    expect((await laidOut(UPDATE)).aspectRatio).toBeLessThan(1.5);
  });

  it('handles an empty flowchart and a lone node', async () => {
    expect((await layoutFlowchart([], [])).nodes).toEqual([]);
    const single = await layoutFlowchart([{ id: 'n1', width: 100, height: 40 }], []);
    expect(single.nodes).toHaveLength(1);
    expect(single.validation.valid).toBe(true);
  });
});
