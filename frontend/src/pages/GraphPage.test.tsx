import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Concept, FlowNode, FlowchartDetail, FlowchartSummary, KnowledgeSpace, Relationship } from '../types';

// The real canvas needs a browser canvas; here it just reports what it was asked to draw.
vi.mock('../flowchart/FlowchartCanvas', () => ({
  FlowchartCanvas: ({
    detail,
    layoutRevision,
    selectedNodeId,
    onNodeTap,
    onNodeMoved,
  }: {
    detail: FlowchartDetail | null;
    layoutRevision: number;
    selectedNodeId?: number | null;
    onNodeTap: (nodeId: number) => void;
    onNodeMoved?: (nodeId: number, position: { x: number; y: number }) => void;
  }) => (
    <div
      data-testid="mock-canvas"
      data-flowchart-id={detail?.flowchart.id ?? ''}
      data-node-count={detail?.nodes.length ?? 0}
      data-edge-count={detail?.edges.length ?? 0}
      data-selected={selectedNodeId ?? ''}
      data-revision={layoutRevision}
    >
      {(detail?.nodes ?? []).map((node) => (
        <button key={node.id} type="button" data-node-id={node.id} onClick={() => onNodeTap(node.id)}>
          {node.label}
        </button>
      ))}
      <button type="button" onClick={() => onNodeMoved?.(detail?.nodes[0]?.id ?? 0, { x: 12, y: 34 })}>
        drag first node
      </button>
    </div>
  ),
}));

vi.mock('../api/client', () => ({
  api: {
    knowledgeSpaces: vi.fn(),
    flowcharts: vi.fn(),
    flowchart: vi.fn(),
    createChildFlowchart: vi.fn(),
    createFlowEdge: vi.fn(),
    createFlowNode: vi.fn(),
    createFlowchart: vi.fn(),
    createKnowledgeSpace: vi.fn(),
    updateFlowNode: vi.fn(),
    updateFlowEdge: vi.fn(),
    deleteFlowNode: vi.fn(),
    deleteFlowEdge: vi.fn(),
    reorganizeFlowchart: vi.fn(),
    updateConcept: vi.fn(),
    updateRelationship: vi.fn(),
  },
}));

import { api } from '../api/client';
import { GraphPage } from './GraphPage';

const aesGcm = concept(1, 'AES-GCM', 'Authenticated encryption mode.');
const nonce = concept(2, 'Nonce', '');
const semantic: Relationship[] = [
  {
    id: 100,
    source_concept_id: 1,
    target_concept_id: 2,
    relationship_type: 'USES',
    description: '',
    mastery_score: 0,
    confidence: 0.3,
    created_at: '',
    updated_at: '',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
    source_name: 'AES-GCM',
    target_name: 'Nonce',
  },
];

const space: KnowledgeSpace = { id: 1, name: 'Gmail E2EE', description: '', created_at: '', updated_at: '' };
const summaries: FlowchartSummary[] = [
  summary(1, 'Gmail Encryption System', true),
  summary(2, 'Encryption Process', false),
];

const project = detail(
  summary(1, 'Gmail Encryption System', true),
  [
    node(10, 1, 'Write message', 'START'),
    node(11, 1, 'Encrypt message', 'SUBPROCESS', {
      description: "Encrypts the user's plaintext locally before Gmail receives the message.",
      concept_id: 1,
      concept_name: 'AES-GCM',
      child_flowchart_id: 2,
      child_flowchart_name: 'Encryption Process',
      has_child: true,
    }),
    node(12, 1, 'Valid?', 'DECISION'),
    node(13, 1, 'Send', 'END'),
  ],
);
const encryption = detail(summary(2, 'Encryption Process', false), [node(20, 2, 'Generate nonce', 'PROCESS'), node(21, 2, 'AES-GCM encrypt', 'PROCESS')]);

function concept(id: number, name: string, description: string): Concept {
  return {
    id,
    name,
    description,
    concept_type: 'mechanism',
    mastery_score: 0,
    confidence: 0.3,
    created_at: '',
    updated_at: '',
    last_reviewed_at: null,
    next_review_at: null,
    review_interval_days: 1,
  };
}

function summary(id: number, name: string, primary: boolean): FlowchartSummary {
  return { id, name, description: '', knowledge_space_id: 1, is_primary: primary, node_count: 0, created_at: '', updated_at: '' };
}

function node(id: number, flowchartId: number, label: string, type: FlowNode['node_type'], extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    flowchart_id: flowchartId,
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

function detail(flowchart: FlowchartSummary, nodes: FlowNode[]): FlowchartDetail {
  const edges = nodes.slice(1).map((target, index) => ({
    id: flowchart.id * 100 + index,
    flowchart_id: flowchart.id,
    source_node_id: nodes[index].id,
    target_node_id: target.id,
    edge_type: 'NEXT' as const,
    label: null,
    description: null,
  }));
  return { flowchart: { ...flowchart, node_count: nodes.length }, nodes, edges };
}

function Harness() {
  const [, setSelectedConceptId] = useState<number | null>(null);
  return (
    <GraphPage
      concepts={[aesGcm, nonce]}
      relationships={semantic}
      questions={[]}
      selectedConceptId={null}
      selectedRelationshipId={null}
      currentView="graph"
      onCatalogChanged={async () => undefined}
      onChangeView={vi.fn()}
      onSelectConcept={setSelectedConceptId}
      onSelectRelationship={vi.fn()}
      onStudyQuestion={vi.fn()}
    />
  );
}

const canvas = () => screen.getByTestId('mock-canvas');
const breadcrumb = () => screen.getByLabelText('Flowchart breadcrumb');

describe('GraphPage hierarchical flowcharts', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    vi.clearAllMocks();
    vi.mocked(api.knowledgeSpaces).mockResolvedValue([space]);
    vi.mocked(api.flowcharts).mockResolvedValue(summaries);
    vi.mocked(api.flowchart).mockImplementation(async (id: number) => (id === 1 ? project : encryption));
    vi.mocked(api.updateFlowNode).mockImplementation(async (id: number, patch) => ({ ...project.nodes[0], id, ...patch }) as FlowNode);
  });

  afterEach(cleanup);

  it("opens the project's primary flowchart and lists projects, flowcharts and concepts for navigation", async () => {
    render(<Harness />);

    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
    expect(canvas()).toHaveAttribute('data-node-count', '4');
    expect(within(breadcrumb()).getByRole('button', { name: 'Gmail Encryption System' })).toBeInTheDocument();
    const navigator = screen.getByTestId('flow-navigator');
    expect(within(navigator).getByText('Gmail E2EE')).toBeInTheDocument();
    expect(within(navigator).getByRole('button', { name: /Encryption Process/ })).toBeInTheDocument();
    expect(within(navigator).getByRole('button', { name: 'AES-GCM' })).toBeInTheDocument();
  });

  it('shows the node description in the inspector and keeps semantic relationships out of the canvas', async () => {
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));

    fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
    const inspector = await screen.findByTestId('flow-inspector');
    expect(within(inspector).getByLabelText('Step description')).toHaveValue(
      "Encrypts the user's plaintext locally before Gmail receives the message.",
    );
    // The concept's global relationship is shown as supporting metadata only.
    expect(within(inspector).getByLabelText('Semantic relationships')).toHaveTextContent('AES-GCM USES Nonce');
    expect(canvas()).toHaveAttribute('data-edge-count', '3'); // flow edges only
  });

  it('opens an existing detailed flowchart, then returns to the parent and its selection', async () => {
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));

    fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open detailed flowchart' }));

    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '2'));
    expect(api.createChildFlowchart).not.toHaveBeenCalled();
    // Only the child's nodes are drawn: nothing from the parent is layered in.
    expect(canvas()).toHaveAttribute('data-node-count', '2');
    expect(within(canvas()).queryByRole('button', { name: 'Write message' })).not.toBeInTheDocument();
    expect(breadcrumb()).toHaveTextContent('Gmail Encryption System/Encryption Process');
    expect(canvas()).toHaveAttribute('data-selected', '');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
    expect(canvas()).toHaveAttribute('data-node-count', '4');
    expect(canvas()).toHaveAttribute('data-selected', '11');
    expect(breadcrumb()).not.toHaveTextContent('Encryption Process');
  });

  it('creates a detailed flowchart for a node that has none', async () => {
    const created = summary(3, 'Valid?', false);
    vi.mocked(api.createChildFlowchart).mockResolvedValue(created);
    vi.mocked(api.flowchart).mockImplementation(async (id: number) => (id === 1 ? project : id === 3 ? detail(created, []) : encryption));
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));

    fireEvent.click(within(canvas()).getByRole('button', { name: 'Valid?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create detailed flowchart' }));

    await waitFor(() => expect(api.createChildFlowchart).toHaveBeenCalledWith(12));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '3'));
    expect(canvas()).toHaveAttribute('data-node-count', '0');
    expect(breadcrumb()).toHaveTextContent('Gmail Encryption System/Valid?');
  });

  it('navigates back through the breadcrumb', async () => {
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open detailed flowchart' }));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '2'));

    fireEvent.click(within(breadcrumb()).getByRole('button', { name: 'Gmail Encryption System' }));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
  });

  it('saves a dragged node position and reorganizes on request', async () => {
    vi.mocked(api.reorganizeFlowchart).mockResolvedValue(undefined);
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));

    fireEvent.click(screen.getByRole('button', { name: 'drag first node' }));
    expect(api.updateFlowNode).toHaveBeenCalledWith(10, { pos_x: 12, pos_y: 34 });

    fireEvent.click(screen.getByRole('button', { name: 'Reorganize' }));
    await waitFor(() => expect(api.reorganizeFlowchart).toHaveBeenCalledWith(1));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-revision', '1'));
  });

  it('connects two steps and defaults decision branches to YES then NO', async () => {
    let edgeId = 900;
    vi.mocked(api.createFlowEdge).mockImplementation(async (_flowchartId, payload) => ({
      id: ++edgeId,
      flowchart_id: 1,
      source_node_id: payload.source_node_id,
      target_node_id: payload.target_node_id,
      edge_type: payload.edge_type ?? 'NEXT',
      label: payload.label ?? null,
      description: null,
    }));
    render(<Harness />);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));

    fireEvent.click(screen.getByRole('button', { name: 'Connect steps' }));
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Valid?' }));
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(api.createFlowEdge).toHaveBeenCalledWith(1, { source_node_id: 12, target_node_id: 13, edge_type: 'YES', label: 'YES' }),
    );
    await waitFor(() => expect(canvas()).toHaveAttribute('data-edge-count', '4'));

    // A second branch out of the same decision becomes NO.
    fireEvent.click(screen.getByRole('button', { name: 'Connect steps' }));
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Valid?' }));
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Write message' }));
    await waitFor(() =>
      expect(api.createFlowEdge).toHaveBeenLastCalledWith(1, { source_node_id: 12, target_node_id: 10, edge_type: 'NO', label: 'NO' }),
    );
  });
});
