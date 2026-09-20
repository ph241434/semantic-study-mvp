// Development / test only: turns the backend's dev-example JSON into FlowchartDetail objects.
// Not imported by production code.
import type { FlowEdge, FlowEdgeType, FlowNode, FlowNodeType, FlowchartDetail } from '../types';

type ExampleNode = { key: string; label: string; type: FlowNodeType; description?: string; child?: string };
type ExampleEdge = { from: string; to: string; type: FlowEdgeType; label?: string };
type ExampleFlowchart = {
  key: string;
  name: string;
  description: string;
  primary?: boolean;
  nodes: ExampleNode[];
  edges: ExampleEdge[];
};
type ExampleFile = { space: string; flowcharts: ExampleFlowchart[] };

const files = import.meta.glob('../../../backend/app/dev_examples/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export function loadExampleFiles(): ExampleFile[] {
  return Object.values(files).map((raw) => JSON.parse(raw) as ExampleFile);
}

/** Every example flowchart as an API-shaped FlowchartDetail, keyed by flowchart name. */
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
        concept_name: null,
        concept_description: null,
        label: node.label,
        description: node.description ?? '',
        node_type: node.type,
        child_flowchart_id: node.child ? (ids.get(node.child) as number) : null,
        child_flowchart_name: node.child ? (file.flowcharts.find((item) => item.key === node.child)?.name ?? null) : null,
        has_child: Boolean(node.child),
        pos_x: null,
        pos_y: null,
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
          knowledge_space_id: 1,
          is_primary: Boolean(chart.primary),
          node_count: nodes.length,
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
