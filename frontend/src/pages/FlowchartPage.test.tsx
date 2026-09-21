import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Concept, FlowNode, Flowchart, FlowchartDetail, KnowledgeEntry, Relationship } from '../types';

// The real canvas needs browser layout APIs; here it only reports what it was asked to draw and counts its renders.
const canvasRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('../flowchart/FlowchartCanvas', () => ({
  FlowchartCanvas: ({
    detail,
    layoutRevision,
    selectedNodeId,
    onSelectNode,
    onSelectEdge,
    onClearSelection,
    onOpenDetail,
    onNodeMoved,
    onConnect,
  }: any) => {
    canvasRenders.count += 1;
    return (
      <div
        data-testid="mock-canvas"
        data-flowchart-id={detail.flowchart.id}
        data-node-count={detail.nodes.length}
        data-edge-count={detail.edges.length}
        data-selected={selectedNodeId ?? ''}
        data-revision={layoutRevision}
      >
        {detail.nodes.map((node: FlowNode) => (
          <button key={node.id} type="button" onClick={() => onSelectNode(node.id)} onDoubleClick={() => onOpenDetail(node.id)}>
            {node.label}
          </button>
        ))}
        {detail.edges.map((edge: any) => (
          <button key={edge.id} type="button" onClick={() => onSelectEdge(edge.id)}>
            edge {edge.id}
          </button>
        ))}
        <button type="button" onClick={() => onClearSelection()}>
          background
        </button>
        <button type="button" onClick={() => onNodeMoved(detail.nodes[0].id, { x: 12, y: 34 })}>
          drag first
        </button>
        <button type="button" onClick={() => onConnect(detail.nodes[2].id, detail.nodes[3].id)}>
          connect third to fourth
        </button>
        <button type="button" onClick={() => onConnect(detail.nodes[2].id, detail.nodes[0].id)}>
          connect third to first
        </button>
      </div>
    );
  },
}));

vi.mock('../api/client', () => ({
  api: {
    flowcharts: vi.fn(),
    flowchart: vi.fn(),
    concepts: vi.fn(),
    relationships: vi.fn(),
    createFlowchart: vi.fn(),
    createFlowNode: vi.fn(),
    createFlowEdge: vi.fn(),
    updateFlowNode: vi.fn(),
    updateFlowEdge: vi.fn(),
    deleteFlowNode: vi.fn(),
    deleteFlowEdge: vi.fn(),
    reorganizeFlowchart: vi.fn(),
  },
}));

import { api } from '../api/client';
import { buildFolderTree } from '../flowchart/FlowNavigator';
import { createViewStateStore } from '../flowchart/viewStateStore';
import { FlowchartPage, pickInitialFlowchart } from './FlowchartPage';

const aesGcm: Concept = concept(1, 'AES-GCM', 'Authenticated encryption mode.');
const nonce: Concept = concept(2, 'Nonce', '');
const relationship: Relationship = {
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
};

const entries: KnowledgeEntry[] = [
  { id: 1, parent_id: null, name: 'Security', entry_type: 'folder', concept_id: null, sort_order: 0 },
  { id: 2, parent_id: 1, name: 'Gmail E2EE', entry_type: 'folder', concept_id: null, sort_order: 0 },
  { id: 3, parent_id: null, name: 'Empty folder', entry_type: 'folder', concept_id: null, sort_order: 1 },
  { id: 4, parent_id: 2, name: 'AES-GCM', entry_type: 'concept', concept_id: 1, sort_order: 0 },
];

const flowcharts: Flowchart[] = [
  flowchart(1, 'Gmail Encryption System', 2, 0),
  flowchart(2, 'Encryption Process', 2, 1),
  flowchart(3, 'Loose notes', null, 0),
];

const project = detail(flowcharts[0], [
  node(10, 1, 'Write message', 'start'),
  node(11, 1, 'Encrypt message', 'subprocess', {
    description: "Encrypts the user's plaintext locally before Gmail receives the message.",
    concept_id: 1,
    concept_name: 'AES-GCM',
    child_flowchart_id: 2,
    child_flowchart_name: 'Encryption Process',
  }),
  node(12, 1, 'Valid?', 'decision'),
  node(13, 1, 'Send', 'end'),
]);
const encryption = detail(flowcharts[1], [node(20, 2, 'Generate nonce', 'process'), node(21, 2, 'AES-GCM encrypt', 'process')]);

function concept(id: number, name: string, description: string): Concept {
  return { id, name, description, concept_type: 'mechanism', mastery_score: 0, confidence: 0.3, created_at: '', updated_at: '', last_reviewed_at: null, next_review_at: null, review_interval_days: 1 };
}

function flowchart(id: number, name: string, folderId: number | null, usedBy: number): Flowchart {
  return { id, name, description: '', folder_id: folderId, node_count: 0, edge_count: 0, used_by_count: usedBy, created_at: '', updated_at: '' };
}

function node(id: number, flowchartId: number, label: string, type: FlowNode['node_type'], extra: Partial<FlowNode> = {}): FlowNode {
  return { id, flowchart_id: flowchartId, concept_id: null, concept_name: null, concept_description: null, label, description: '', node_type: type, child_flowchart_id: null, child_flowchart_name: null, x: null, y: null, ...extra };
}

function detail(chart: Flowchart, nodes: FlowNode[]): FlowchartDetail {
  const edges = nodes.slice(1).map((target, index) => ({
    id: chart.id * 100 + index,
    flowchart_id: chart.id,
    source_node_id: nodes[index].id,
    target_node_id: target.id,
    edge_type: 'normal' as const,
    label: null,
    description: null,
  }));
  return { flowchart: { ...chart, node_count: nodes.length, edge_count: edges.length }, nodes, edges };
}

const canvas = () => screen.getByTestId('mock-canvas');
const breadcrumb = () => screen.getByTestId('flow-breadcrumb');
const openPage = async (overrides: Partial<Parameters<typeof FlowchartPage>[0]> = {}) => {
  render(<FlowchartPage entries={entries} onOpenKnowledge={vi.fn()} onOpenConceptExplorer={vi.fn()} {...overrides} />);
  await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
};

describe('FlowchartPage: hierarchical flowchart workspace', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    vi.clearAllMocks();
    canvasRenders.count = 0;
    vi.mocked(api.flowcharts).mockResolvedValue(flowcharts);
    vi.mocked(api.concepts).mockResolvedValue([aesGcm, nonce]);
    vi.mocked(api.relationships).mockResolvedValue([relationship]);
    vi.mocked(api.flowchart).mockImplementation(async (id: number) => (id === 1 ? project : encryption));
    vi.mocked(api.updateFlowNode).mockImplementation(async (id: number, patch) => ({ ...project.nodes[0], id, ...patch }) as FlowNode);
  });
  afterEach(cleanup);

  describe('opening a project', () => {
    it('opens the first top-level flowchart, not a detail flowchart', async () => {
      await openPage();
      expect(canvas()).toHaveAttribute('data-node-count', '4');
      expect(breadcrumb()).toHaveTextContent('Gmail Encryption System');
      expect(pickInitialFlowchart(flowcharts, null)?.id).toBe(1);
      expect(pickInitialFlowchart([flowcharts[1], flowcharts[2]], null)?.id).toBe(3); // skips detail flowcharts
      expect(pickInitialFlowchart(flowcharts, 2)?.id).toBe(2); // an explicit request wins
      expect(pickInitialFlowchart([], null)).toBeNull();
    });

    it('offers to create the first flowchart when there are none', async () => {
      vi.mocked(api.flowcharts).mockResolvedValue([]);
      render(<FlowchartPage entries={entries} onOpenKnowledge={vi.fn()} onOpenConceptExplorer={vi.fn()} />);
      expect(await screen.findByRole('button', { name: /Create your first flowchart/ })).toBeInTheDocument();
      expect(screen.queryByTestId('mock-canvas')).not.toBeInTheDocument();
    });
  });

  describe('progressive disclosure', () => {
    it('is quiet by default: no inspector, no per-edge or layout controls, just two toolbar actions', async () => {
      await openPage();
      expect(screen.queryByTestId('flow-inspector')).not.toBeInTheDocument();
      expect(screen.queryByTestId('flow-concept-card')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Step description')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back to parent flowchart' })).not.toBeInTheDocument(); // top level: nothing to go back to
      const toolbar = within(breadcrumb().parentElement!.querySelector('.flow-toolbar') as HTMLElement).getAllByRole('button');
      expect(toolbar.map((button) => button.textContent?.trim())).toEqual(['Add step', 'Reorganize']);
    });

    it('shows step controls only for the selected step, and edge controls only for a selected edge', async () => {
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      const inspector = await screen.findByTestId('flow-inspector');
      expect(within(inspector).getByLabelText('Step description')).toHaveValue("Encrypts the user's plaintext locally before Gmail receives the message.");
      expect(within(inspector).getByLabelText('Node type')).toBeInTheDocument();

      fireEvent.click(within(canvas()).getByRole('button', { name: 'edge 100' }));
      await waitFor(() => expect(screen.getByRole('complementary', { name: 'Connection inspector' })).toBeInTheDocument());
      expect(screen.queryByLabelText('Step description')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Edge type')).toBeInTheDocument();
      expect(screen.getByLabelText('Edge label')).toBeInTheDocument();

      fireEvent.click(within(canvas()).getByRole('button', { name: 'background' }));
      await waitFor(() => expect(screen.queryByTestId('flow-inspector')).not.toBeInTheDocument());
    });

    it("keeps a concept's global semantic relationships inside the inspector, collapsed and off the canvas", async () => {
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      const inspector = await screen.findByTestId('flow-inspector');
      const details = within(inspector).getByText(/Semantic relationships \(1\)/).closest('details') as HTMLDetailsElement;
      expect(details.open).toBe(false); // collapsed until asked for
      expect(details).toHaveTextContent('AES-GCM USES Nonce');
      expect(details).toHaveTextContent('not drawn on the flowchart');
      expect(canvas()).toHaveAttribute('data-edge-count', '3'); // only the flow edges reach the canvas
    });
  });

  describe('navigation is filesystem-style and never a graph', () => {
    it('lists folders that hold flowcharts, marks detail flowcharts, and lists the concept registry', async () => {
      await openPage();
      const navigator = screen.getByTestId('flow-navigator');
      expect(within(navigator).getByText('Security')).toBeInTheDocument();
      expect(within(navigator).getByText('Gmail E2EE')).toBeInTheDocument();
      expect(within(navigator).queryByText('Empty folder')).not.toBeInTheDocument(); // no flowcharts inside
      expect(within(navigator).getByRole('button', { name: /Encryption Process/ })).toHaveTextContent('detail');
      expect(within(navigator).getByText('Unfiled')).toBeInTheDocument();
      expect(within(navigator).queryByText('Nonce')).not.toBeInTheDocument(); // concepts are collapsed by default
      fireEvent.click(within(navigator).getByRole('button', { name: /Concepts/ }));
      expect(await within(navigator).findByRole('button', { name: 'Nonce' })).toBeInTheDocument();
    });

    it('builds the folder tree from the knowledge entries', () => {
      const tree = buildFolderTree(entries, flowcharts);
      expect(tree.folders.map((item) => item.entry.name)).toEqual(['Security']);
      expect(tree.folders[0].children[0].entry.name).toBe('Gmail E2EE');
      expect(tree.folders[0].children[0].flowcharts.map((item) => item.name)).toEqual(['Gmail Encryption System', 'Encryption Process']);
      expect(tree.unfiled.map((item) => item.name)).toEqual(['Loose notes']);
    });

    it('expanding and collapsing folders never re-renders the graph or reloads it', async () => {
      await openPage();
      const rendersBefore = canvasRenders.count;
      const loadsBefore = vi.mocked(api.flowchart).mock.calls.length;

      const navigator = screen.getByTestId('flow-navigator');
      fireEvent.click(within(navigator).getByRole('button', { name: /Gmail E2EE/ }));
      fireEvent.click(within(navigator).getByRole('button', { name: /Security/ }));
      fireEvent.click(within(navigator).getByRole('button', { name: /Concepts/ }));
      fireEvent.change(within(navigator).getByLabelText('Search concepts'), { target: { value: 'non' } });
      fireEvent.click(within(navigator).getByRole('button', { name: 'Hide navigator' }));

      expect(canvasRenders.count).toBe(rendersBefore);
      expect(vi.mocked(api.flowchart).mock.calls.length).toBe(loadsBefore);
    });

    it("opens a concept card from the registry without changing the flowchart, with a link to the concept explorer", async () => {
      const onOpenConceptExplorer = vi.fn();
      await openPage({ onOpenConceptExplorer });
      const navigator = screen.getByTestId('flow-navigator');
      fireEvent.click(within(navigator).getByRole('button', { name: /Concepts/ }));
      fireEvent.click(await within(navigator).findByRole('button', { name: 'AES-GCM' }));

      const card = await screen.findByTestId('flow-concept-card');
      expect(card).toHaveTextContent('Authenticated encryption mode.');
      expect(card).toHaveTextContent('AES-GCM USES Nonce');
      expect(canvas()).toHaveAttribute('data-flowchart-id', '1');
      fireEvent.click(within(card).getByRole('button', { name: 'Open in concept explorer' }));
      expect(onOpenConceptExplorer).toHaveBeenCalledWith(1, 'AES-GCM');
    });

    it('links out to the knowledge browser', async () => {
      const onOpenKnowledge = vi.fn();
      await openPage({ onOpenKnowledge });
      fireEvent.click(screen.getByRole('button', { name: 'Knowledge browser' }));
      expect(onOpenKnowledge).toHaveBeenCalled();
    });
  });

  describe('child flowcharts', () => {
    it('opens an existing detailed flowchart with a breadcrumb, then returns to the parent and its selection', async () => {
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Open detailed flowchart' }));

      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '2'));
      expect(api.createFlowchart).not.toHaveBeenCalled();
      expect(canvas()).toHaveAttribute('data-node-count', '2'); // a clean independent graph
      expect(within(canvas()).queryByRole('button', { name: 'Write message' })).not.toBeInTheDocument();
      expect(breadcrumb()).toHaveTextContent('Gmail Encryption System›Encryption Process');
      expect(canvas()).toHaveAttribute('data-selected', '');

      fireEvent.click(screen.getByRole('button', { name: 'Back to parent flowchart' }));
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
      expect(canvas()).toHaveAttribute('data-node-count', '4');
      expect(canvas()).toHaveAttribute('data-selected', '11'); // selection restored
      expect(breadcrumb()).not.toHaveTextContent('Encryption Process');
    });

    it('opens a detailed flowchart by double-clicking the node that has one', async () => {
      await openPage();
      fireEvent.doubleClick(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '2'));
      // A node without a detail flowchart does nothing on double-click.
      fireEvent.click(screen.getByRole('button', { name: 'Back to parent flowchart' }));
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
      fireEvent.doubleClick(within(canvas()).getByRole('button', { name: 'Valid?' }));
      expect(canvas()).toHaveAttribute('data-flowchart-id', '1');
    });

    it('creates an empty detailed flowchart for a step that has none, then opens it', async () => {
      const created = flowchart(7, 'Valid?', 2, 0);
      vi.mocked(api.createFlowchart).mockResolvedValue(created);
      vi.mocked(api.updateFlowNode).mockResolvedValue({ ...project.nodes[2], child_flowchart_id: 7, child_flowchart_name: 'Valid?' });
      vi.mocked(api.flowchart).mockImplementation(async (id: number) => (id === 1 ? project : id === 7 ? detail(created, []) : encryption));
      await openPage();

      fireEvent.click(within(canvas()).getByRole('button', { name: 'Valid?' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Create detailed flowchart' }));

      await waitFor(() => expect(api.createFlowchart).toHaveBeenCalledWith({ name: 'Valid?', description: '', folder_id: 2 }));
      expect(api.updateFlowNode).toHaveBeenCalledWith(12, { child_flowchart_id: 7 });
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '7'));
      expect(canvas()).toHaveAttribute('data-node-count', '0');
      expect(breadcrumb()).toHaveTextContent('Gmail Encryption System›Valid?');
      expect(await screen.findByRole('button', { name: 'Add the first step' })).toBeInTheDocument();
    });

    it('navigates back through breadcrumb crumbs', async () => {
      await openPage();
      fireEvent.doubleClick(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '2'));
      fireEvent.click(within(breadcrumb()).getByRole('button', { name: 'Gmail Encryption System' }));
      await waitFor(() => expect(canvas()).toHaveAttribute('data-flowchart-id', '1'));
    });

    it('keeps view state in a store the app can share, and forgets a flowchart on Reorganize', async () => {
      const viewStates = createViewStateStore();
      const clear = vi.spyOn(viewStates, 'clear');
      vi.mocked(api.reorganizeFlowchart).mockResolvedValue(undefined);
      await openPage({ viewStates });

      fireEvent.click(screen.getByRole('button', { name: /Reorganize/ }));
      await waitFor(() => expect(api.reorganizeFlowchart).toHaveBeenCalledWith(1));
      expect(clear).toHaveBeenCalledWith(1);
      await waitFor(() => expect(canvas()).toHaveAttribute('data-revision', '1'));
    });
  });

  describe('manual editing', () => {
    it('saves a dragged node position without re-laying out the graph', async () => {
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'drag first' }));
      expect(api.updateFlowNode).toHaveBeenCalledWith(10, { x: 12, y: 34 });
      expect(canvas()).toHaveAttribute('data-revision', '0');
    });

    it('connects steps, defaulting decision branches to YES then NO', async () => {
      let edgeId = 900;
      vi.mocked(api.createFlowEdge).mockImplementation(async (_id, payload) => ({
        id: ++edgeId,
        flowchart_id: 1,
        source_node_id: payload.source_node_id,
        target_node_id: payload.target_node_id,
        edge_type: payload.edge_type ?? 'normal',
        label: payload.label ?? null,
        description: null,
      }));
      await openPage();

      fireEvent.click(within(canvas()).getByRole('button', { name: 'connect third to fourth' })); // Valid? -> Send
      await waitFor(() =>
        expect(api.createFlowEdge).toHaveBeenCalledWith(1, { source_node_id: 12, target_node_id: 13, edge_type: 'yes', label: 'YES' }),
      );
      await waitFor(() => expect(canvas()).toHaveAttribute('data-edge-count', '4'));
      fireEvent.click(within(canvas()).getByRole('button', { name: 'connect third to first' })); // Valid? -> Write message
      await waitFor(() =>
        expect(api.createFlowEdge).toHaveBeenLastCalledWith(1, { source_node_id: 12, target_node_id: 10, edge_type: 'no', label: 'NO' }),
      );
    });

    it('adds a step from the toolbar with its type and description', async () => {
      const created = node(30, 1, 'Log result', 'data', { description: 'Write the audit record.' });
      vi.mocked(api.createFlowNode).mockResolvedValue(created);
      await openPage();

      fireEvent.click(screen.getByRole('button', { name: /Add step/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Add step' });
      fireEvent.change(within(dialog).getByLabelText('Step name'), { target: { value: 'Log result' } });
      fireEvent.change(within(dialog).getByLabelText('Node type'), { target: { value: 'data' } });
      fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Write the audit record.' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Add step/ }));

      await waitFor(() =>
        expect(api.createFlowNode).toHaveBeenCalledWith(1, { label: 'Log result', description: 'Write the audit record.', node_type: 'data', concept_id: null }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('edits a description without changing the graph shape, but re-reads the flowchart when the label changes', async () => {
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'Encrypt message' }));
      const inspector = await screen.findByTestId('flow-inspector');
      const loads = vi.mocked(api.flowchart).mock.calls.length;

      fireEvent.change(within(inspector).getByLabelText('Step description'), { target: { value: 'New text' } });
      fireEvent.click(within(inspector).getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(api.updateFlowNode).toHaveBeenCalledWith(11, expect.objectContaining({ description: 'New text' })));
      expect(vi.mocked(api.flowchart).mock.calls.length).toBe(loads); // description only: no reload, no relayout

      fireEvent.change(within(inspector).getByLabelText('Step name'), { target: { value: 'Encrypt the message' } });
      fireEvent.click(within(inspector).getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(vi.mocked(api.flowchart).mock.calls.length).toBeGreaterThan(loads));
    });

    it('changes a step type and edits an edge label / type', async () => {
      vi.mocked(api.updateFlowEdge).mockImplementation(async (id, patch) => ({ id, flowchart_id: 1, source_node_id: 10, target_node_id: 11, edge_type: 'normal', label: null, description: null, ...patch }) as any);
      await openPage();
      fireEvent.click(within(canvas()).getByRole('button', { name: 'Valid?' }));
      const inspector = await screen.findByTestId('flow-inspector');
      fireEvent.change(within(inspector).getByLabelText('Node type'), { target: { value: 'process' } });
      fireEvent.click(within(inspector).getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(api.updateFlowNode).toHaveBeenCalledWith(12, expect.objectContaining({ node_type: 'process' })));

      fireEvent.click(within(canvas()).getByRole('button', { name: 'edge 100' }));
      const edgePanel = await screen.findByRole('complementary', { name: 'Connection inspector' });
      fireEvent.change(within(edgePanel).getByLabelText('Edge type'), { target: { value: 'failure' } });
      fireEvent.change(within(edgePanel).getByLabelText('Edge label'), { target: { value: 'FAIL' } });
      fireEvent.click(within(edgePanel).getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(api.updateFlowEdge).toHaveBeenCalledWith(100, { edge_type: 'failure', label: 'FAIL' }));
    });

    it('deletes a step and an edge after confirmation-free edge delete', async () => {
      vi.mocked(api.deleteFlowNode).mockResolvedValue(undefined);
      vi.mocked(api.deleteFlowEdge).mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await openPage();

      fireEvent.click(within(canvas()).getByRole('button', { name: 'edge 100' }));
      fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
      await waitFor(() => expect(api.deleteFlowEdge).toHaveBeenCalledWith(100));

      fireEvent.click(within(canvas()).getByRole('button', { name: 'Send' }));
      fireEvent.click(await screen.findByRole('button', { name: /Delete step/ }));
      await waitFor(() => expect(api.deleteFlowNode).toHaveBeenCalledWith(13));
    });
  });
});
