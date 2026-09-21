// Development / test only: turns the backend's dev-example JSON into API-shaped FlowchartDetail objects.
// The same JSON is loaded into the database by `python -m app.dev_examples`, so each graph is defined once.
// Not imported by production code.
import type { FlowEdge, FlowEdgeType, FlowNode, FlowNodeType, FlowchartDetail } from '../types';

type ExampleNode = { key: string; label: string; type: FlowNodeType; description?: string; child?: string; concept?: string };
type ExampleEdge = { from: string; to: string; type: FlowEdgeType; label?: string };
type ExampleFlowchart = { key: string; name: string; description: string; nodes: ExampleNode[]; edges: ExampleEdge[] };
type ExampleFile = { folder: string; flowcharts: ExampleFlowchart[] };

const files = import.meta.glob('../../../backend/app/dev_examples/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export function loadExampleFiles(): ExampleFile[] {
  return Object.values(files).map((raw) => JSON.parse(raw) as ExampleFile);
}

/** Every example flowchart keyed by its name. Ids are unique across all examples. */
export function loadExampleDetails(): Record<string, FlowchartDetail> {
  const details: Record<string, FlowchartDetail> = {};
  let flowchartId = 0;
  let nodeId = 0;
  let edgeId = 0;
  for (const file of loadExampleFiles()) {
    const ids = new Map(file.flowcharts.map((chart) => [chart.key, ++flowchartId]));
    for (const chart of file.flowcharts) {
      const id = ids.get(chart.key) as number;
      const nodeIds = new Map(chart.nodes.map((node) => [node.key, ++nodeId]));
      const nodes: FlowNode[] = chart.nodes.map((node) => ({
        id: nodeIds.get(node.key) as number,
        flowchart_id: id,
        concept_id: null,
        concept_name: node.concept ?? null,
        concept_description: null,
        label: node.label,
        description: node.description ?? '',
        node_type: node.type,
        child_flowchart_id: node.child ? (ids.get(node.child) as number) : null,
        child_flowchart_name: node.child ? (file.flowcharts.find((item) => item.key === node.child)?.name ?? null) : null,
        x: null,
        y: null,
      }));
      const edges: FlowEdge[] = chart.edges.map((edge) => ({
        id: ++edgeId,
        flowchart_id: id,
        source_node_id: nodeIds.get(edge.from) as number,
        target_node_id: nodeIds.get(edge.to) as number,
        edge_type: edge.type,
        label: edge.label ?? null,
        description: null,
      }));
      details[chart.name] = {
        flowchart: {
          id,
          name: chart.name,
          description: chart.description,
          folder_id: 1,
          node_count: nodes.length,
          edge_count: edges.length,
          used_by_count: file.flowcharts.some((other) => other.nodes.some((node) => node.child === chart.key)) ? 1 : 0,
          created_at: '',
          updated_at: '',
        },
        nodes,
        edges,
      };
    }
  }
  return details;
}
