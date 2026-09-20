import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { memo, useEffect, useMemo, useRef } from 'react';

import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, computeForceLayout, graphSignature } from '../graph/layout';
import type { GraphResponse } from '../types';

export type StudyHidden = {
  edgeId: number;
  hiddenConceptId: number | null;
  hideNode: boolean;
  hideEdge: boolean;
  revealed: boolean;
};

type Props = {
  graph: GraphResponse;
  rootId: number;
  hidden: StudyHidden | null;
  linkedConceptIds: Set<number>;
  onSelectConcept: (conceptId: number) => void;
  onAddToPersonalView?: (conceptId: number) => void;
};

type GraphNodeData = Record<string, unknown> & {
  label: string;
  isRoot: boolean;
  isLinked: boolean;
  isHidden: boolean;
  isAnswer: boolean;
  onAdd?: () => void;
};

type GraphEdgeData = Record<string, unknown> & {
  label: string;
  path: string;
  labelX: number;
  labelY: number;
  isHidden: boolean;
  isAnswer: boolean;
};

type SemanticNode = Node<GraphNodeData, 'semanticNode'>;
type SemanticEdge = Edge<GraphEdgeData, 'semanticEdge'>;

function prettifyRelationshipType(value: string) {
  return value.replace(/_/g, ' ');
}

function GraphConceptNode({ data }: NodeProps<SemanticNode>) {
  const classes = ['proto-node'];
  classes.push(data.isLinked ? 'proto-node-linked' : 'proto-node-description');
  if (data.isRoot) classes.push('proto-node-root');
  if (data.isHidden) classes.push('proto-node-hidden');
  if (data.isAnswer) classes.push('proto-node-answer');

  return (
    <div className={classes.join(' ')}>
      <Handle type="source" id="c" position={Position.Top} isConnectable={false} className="proto-node-handle" />
      <Handle type="target" id="c" position={Position.Top} isConnectable={false} className="proto-node-handle" />
      <span className="proto-node-label">{data.isHidden ? '???' : data.label}</span>
      {data.onAdd && (
        <button
          type="button"
          className="proto-node-add"
          aria-label={`Add ${data.label} to My Model`}
          onClick={(event) => {
            event.stopPropagation();
            data.onAdd?.();
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

function SemanticRelationshipEdge({ id, markerEnd, style, data }: EdgeProps<SemanticEdge>) {
  const path = typeof data?.path === 'string' ? data.path : '';
  const label = typeof data?.label === 'string' ? data.label : '';
  const isHidden = Boolean(data?.isHidden);
  const isAnswer = Boolean(data?.isAnswer);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
      <EdgeLabelRenderer>
        <div
          className={`proto-edge-label ${isHidden ? 'proto-edge-label-hidden' : ''} ${isAnswer ? 'proto-edge-label-answer' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${data?.labelX ?? 0}px, ${data?.labelY ?? 0}px)`,
          }}
        >
          {isHidden ? '???' : prettifyRelationshipType(label)}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { semanticNode: memo(GraphConceptNode) };
const edgeTypes = { semanticEdge: memo(SemanticRelationshipEdge) };

export function GraphCanvas({ graph, rootId, hidden, linkedConceptIds, onSelectConcept, onAddToPersonalView }: Props) {
  const layout = useMemo(() => computeForceLayout(graph, rootId), [graph, rootId]);
  const signature = useMemo(() => graphSignature(graph), [graph]);

  const nodes: SemanticNode[] = useMemo(
    () =>
      layout.nodes.map((node) => {
        const isHiddenNode = Boolean(hidden && !hidden.revealed && hidden.hideNode && node.conceptId === hidden.hiddenConceptId);
        const isAnswerNode = Boolean(hidden && hidden.revealed && hidden.hideNode && node.conceptId === hidden.hiddenConceptId);

        return {
          id: node.id,
          type: 'semanticNode',
          position: node.position,
          draggable: false,
          data: {
            label: node.label,
            isRoot: node.isRoot,
            isLinked: linkedConceptIds.has(node.conceptId),
            isHidden: isHiddenNode,
            isAnswer: isAnswerNode,
            onAdd: onAddToPersonalView ? () => onAddToPersonalView(node.conceptId) : undefined,
          },
          style: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
          zIndex: node.isRoot ? 20 : 10,
        };
      }),
    [layout.nodes, hidden, linkedConceptIds, onAddToPersonalView],
  );

  const edges: SemanticEdge[] = useMemo(
    () =>
      layout.edges.map((edge) => {
        const isHiddenEdge = Boolean(hidden && !hidden.revealed && hidden.hideEdge && edge.relationshipId === hidden.edgeId);
        const isAnswerEdge = Boolean(hidden && hidden.revealed && hidden.hideEdge && edge.relationshipId === hidden.edgeId);

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: 'c',
          targetHandle: 'c',
          type: 'semanticEdge',
          markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(248,247,242,0.45)', width: 14, height: 14 },
          style: { stroke: 'rgba(248,247,242,0.3)', strokeWidth: 1.4 },
          data: {
            label: edge.relationshipType,
            path: edge.path,
            labelX: edge.labelX,
            labelY: edge.labelY,
            isHidden: isHiddenEdge,
            isAnswer: isAnswerEdge,
          },
        };
      }),
    [layout.edges, hidden],
  );

  return (
    <div className="proto-canvas" data-testid="graph-canvas">
      <ReactFlow<SemanticNode, SemanticEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.28, duration: 200 }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        panOnScroll={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectConcept(Number(node.id))}
      >
        <FitViewOnChange signature={`${signature}|${hidden ? `${hidden.edgeId}:${hidden.revealed}` : 'none'}`} />
      </ReactFlow>
    </div>
  );
}

function FitViewOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;

    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.28, duration: 200 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, signature]);

  return null;
}
