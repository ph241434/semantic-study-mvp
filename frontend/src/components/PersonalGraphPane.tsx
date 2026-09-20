import {
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
} from '@xyflow/react';
import type { CSSProperties } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import type { GraphView, GraphViewDetail, GraphViewNodeType } from '../types';

export type PersonalGraphPaneHandle = {
  addConceptNode: (concept: { id: number; name: string }) => void;
};

type Props = {
  rootId: number;
};

type PersonalNodeData = Record<string, unknown> & {
  label: string;
  nodeType: GraphViewNodeType;
};

type PersonalNode = Node<PersonalNodeData>;

const NODE_WIDTH = 160;

function nodeStyle(nodeType: GraphViewNodeType): CSSProperties {
  const accent = nodeType === 'concept' ? 'rgba(56, 216, 204, 0.6)' : 'rgba(245, 197, 66, 0.55)';
  const fill = nodeType === 'concept' ? 'rgba(56, 216, 204, 0.08)' : 'rgba(245, 197, 66, 0.08)';
  return {
    width: NODE_WIDTH,
    borderRadius: 8,
    border: `1.5px solid ${accent}`,
    background: fill,
    color: '#f8f7f2',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '8px 10px',
    textAlign: 'center',
  };
}

function toFlowNode(node: GraphViewDetail['nodes'][number]): PersonalNode {
  return {
    id: String(node.id),
    position: { x: node.x, y: node.y },
    data: { label: node.label, nodeType: node.node_type },
    style: nodeStyle(node.node_type),
  };
}

function toFlowEdge(edge: GraphViewDetail['edges'][number]): Edge {
  return {
    id: String(edge.id),
    source: String(edge.source_view_node_id),
    target: String(edge.target_view_node_id),
    label: edge.label ?? edge.relationship_type ?? undefined,
    style: { stroke: 'rgba(248,247,242,0.35)' },
    labelStyle: { fill: '#f8f7f2', fontSize: 11, fontWeight: 700 },
    labelBgStyle: { fill: '#0d0f13' },
  };
}

export const PersonalGraphPane = forwardRef<PersonalGraphPaneHandle, Props>(function PersonalGraphPane(
  { rootId },
  ref,
) {
  const [views, setViews] = useState<GraphView[]>([]);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [nodes, setNodes] = useState<PersonalNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const ensuredRootRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setActiveViewId(null);
    setViews([]);
    setNodes([]);
    setEdges([]);

    async function ensureViews() {
      const existing = await api.listGraphViews(rootId);
      if (!active) return;
      if (existing.length > 0) {
        setViews(existing);
        setActiveViewId(existing[0].id);
        return;
      }
      if (ensuredRootRef.current === rootId) return;
      ensuredRootRef.current = rootId;
      const created = await api.createGraphView({ root_concept_id: rootId, name: 'Overview' });
      if (!active) return;
      setViews([created]);
      setActiveViewId(created.id);
    }

    void ensureViews();
    return () => {
      active = false;
    };
  }, [rootId]);

  const refreshDetail = useCallback((viewId: number) => {
    setLoading(true);
    return api
      .getGraphView(viewId)
      .then((detail) => {
        setNodes(detail.nodes.map(toFlowNode));
        setEdges(detail.edges.map(toFlowEdge));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeViewId === null) return;
    void refreshDetail(activeViewId);
  }, [activeViewId, refreshDetail]);

  const onNodesChange = useCallback((changes: NodeChange<PersonalNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeDragStop: OnNodeDrag<PersonalNode> = useCallback((_, node) => {
    void api.updateGraphViewNode(Number(node.id), { x: node.position.x, y: node.position.y });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (activeViewId === null || !connection.source || !connection.target) return;
      const label = window.prompt('Edge label (optional)');
      void api
        .createGraphViewEdge(activeViewId, {
          source_view_node_id: Number(connection.source),
          target_view_node_id: Number(connection.target),
          label: label && label.trim() ? label.trim() : null,
        })
        .then(() => refreshDetail(activeViewId));
    },
    [activeViewId, refreshDetail],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => {
      if (activeViewId === null) return;
      void Promise.all(deleted.map((node) => api.deleteGraphViewNode(Number(node.id)))).then(() =>
        refreshDetail(activeViewId),
      );
    },
    [activeViewId, refreshDetail],
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deleted) => {
      if (activeViewId === null) return;
      void Promise.all(deleted.map((edge) => api.deleteGraphViewEdge(Number(edge.id)))).then(() =>
        refreshDetail(activeViewId),
      );
    },
    [activeViewId, refreshDetail],
  );

  const handleNewView = useCallback(() => {
    const name = window.prompt('New view name');
    if (!name || !name.trim()) return;
    void api.createGraphView({ root_concept_id: rootId, name: name.trim() }).then((created) => {
      setViews((prev) => [...prev, created]);
      setActiveViewId(created.id);
    });
  }, [rootId]);

  const handleAddNode = useCallback(() => {
    if (activeViewId === null) return;
    const label = window.prompt('Node label');
    if (!label || !label.trim()) return;
    const offset = nodes.length * 24;
    void api
      .addGraphViewNode(activeViewId, {
        concept_id: null,
        label: label.trim(),
        node_type: 'note',
        x: 40 + offset,
        y: 40 + offset,
      })
      .then(() => refreshDetail(activeViewId));
  }, [activeViewId, nodes.length, refreshDetail]);

  useImperativeHandle(
    ref,
    () => ({
      addConceptNode: ({ id, name }) => {
        if (activeViewId === null) return;
        const offset = nodes.length * 24;
        void api
          .addGraphViewNode(activeViewId, {
            concept_id: id,
            label: name,
            node_type: 'concept',
            x: 40 + offset,
            y: 40 + offset,
          })
          .then(() => refreshDetail(activeViewId));
      },
    }),
    [activeViewId, nodes.length, refreshDetail],
  );

  const activeView = useMemo(() => views.find((view) => view.id === activeViewId) ?? null, [views, activeViewId]);

  return (
    <section className="proto-pane proto-pane-personal" data-testid="personal-graph-pane">
      <div className="proto-personal-toolbar">
        <select
          className="proto-personal-select"
          value={activeViewId ?? ''}
          onChange={(event) => setActiveViewId(Number(event.target.value))}
          aria-label="Personal view"
        >
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
        <button type="button" className="proto-btn" onClick={handleNewView}>
          + New View
        </button>
        <button type="button" className="proto-btn" onClick={handleAddNode} disabled={activeViewId === null}>
          + Add Node
        </button>
      </div>
      <div className="proto-personal-canvas" data-testid="personal-graph-canvas">
        {loading && !activeView && (
          <p className="proto-status" data-testid="personal-graph-loading">
            Loading…
          </p>
        )}
        <ReactFlow<PersonalNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          nodesDraggable
          nodesConnectable
          fitView
          proOptions={{ hideAttribution: true }}
        />
      </div>
    </section>
  );
});
