import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  GRAPH_GRID_SIZE,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  buildGraphLayout,
  classicRelationshipPath,
  snapPoint,
  type ClassicPositionStore,
  type GraphLayoutMode,
  type GraphLayoutResult,
  type Point,
  type PortSide,
} from '../graph/layout';
import { masteryCategory, masteryPercent, masteryTheme } from '../styles/mastery';
import type { Concept, GraphResponse } from '../types';

type Props = {
  graph: GraphResponse | null;
  layout?: GraphLayoutResult | null;
  layoutMode?: GraphLayoutMode;
  classicPositions?: ClassicPositionStore;
  selectedConceptId: number | null;
  selectedRelationshipId: number | null;
  onSelectConcept: (conceptId: number) => void;
  onSelectRelationship: (relationshipId: number) => void;
  onNodePositionChange?: (conceptId: number, position: Point) => void;
  onPaneClick?: () => void;
  variant?: 'embedded' | 'workspace';
  showGrid?: boolean;
  viewportRevision?: number;
};

type GraphNodeData = Record<string, unknown> & {
  concept: Concept;
  selected: boolean;
  nodeBackground: string;
  nodeBorder: string;
  nodeShadow: string | null;
};

type GraphEdgeData = Record<string, unknown> & {
  label: string;
  curveOffset: number;
  selected: boolean;
  dense: boolean;
};

type SemanticNode = Node<GraphNodeData, 'semanticConcept'>;
type SemanticEdge = Edge<GraphEdgeData, 'semanticRelationship'>;

const portPositions: Array<{ side: PortSide; position: Position }> = [
  { side: 'top', position: Position.Top },
  { side: 'right', position: Position.Right },
  { side: 'bottom', position: Position.Bottom },
  { side: 'left', position: Position.Left },
];

const workspaceGridStyle = { opacity: 0.36 } satisfies CSSProperties;

function workspaceEdgeColor(score: number) {
  const category = masteryCategory(score);
  if (category === 'weak') return '#ff795f';
  if (category === 'developing') return '#f5c542';
  if (category === 'strong') return '#8fd98f';
  return '#38d8cc';
}

function GraphConceptNode({ data }: NodeProps<SemanticNode>) {
  const style = {
    background: data.nodeBackground,
    borderColor: data.nodeBorder,
    boxShadow: data.nodeShadow ?? undefined,
  } satisfies CSSProperties;

  return (
    <div className={`graph-concept-node ${data.selected ? 'graph-concept-node-selected' : ''}`} style={style}>
      {portPositions.map(({ side, position }) => (
        <Handle
          key={`source-${side}`}
          type="source"
          id={handleId('source', side)}
          position={position}
          isConnectable={false}
          className="graph-node-handle"
        />
      ))}
      {portPositions.map(({ side, position }) => (
        <Handle
          key={`target-${side}`}
          type="target"
          id={handleId('target', side)}
          position={position}
          isConnectable={false}
          className="graph-node-handle"
        />
      ))}
      <div className="truncate text-sm font-bold text-ink" title={data.concept.name}>
        {data.concept.name}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink/60">
        <span className="truncate">{data.concept.concept_type}</span>
        <span>{masteryPercent(data.concept.mastery_score)}</span>
      </div>
    </div>
  );
}

function ClassicRelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps<SemanticEdge>) {
  const curveOffset = typeof data?.curveOffset === 'number' ? data.curveOffset : 0;
  const route = classicRelationshipPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, curveOffset);
  const label = typeof data?.label === 'string' ? data.label : '';
  const selected = Boolean(data?.selected);

  return (
    <>
      <BaseEdge id={id} path={route.path} markerEnd={markerEnd} style={style} interactionWidth={data?.dense ? 14 : 22} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`graph-edge-label ${selected ? 'graph-edge-label-selected' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = {
  semanticConcept: memo(GraphConceptNode),
};

const edgeTypes = {
  semanticRelationship: memo(ClassicRelationshipEdge),
};

export function GraphCanvas({
  graph,
  layout,
  layoutMode = 'classic',
  classicPositions = {},
  selectedConceptId,
  selectedRelationshipId,
  onSelectConcept,
  onSelectRelationship,
  onNodePositionChange,
  onPaneClick,
  variant = 'embedded',
  showGrid = true,
  viewportRevision = 0,
}: Props) {
  const workspace = variant === 'workspace';
  const resolvedLayout = useMemo(
    () => layout ?? (graph ? buildGraphLayout(graph, layoutMode, { positions: classicPositions }) : null),
    [classicPositions, graph, layout, layoutMode],
  );
  const layoutNodes = useMemo(
    () => (resolvedLayout ? buildReactNodes(resolvedLayout, selectedConceptId, workspace) : []),
    [resolvedLayout, selectedConceptId, workspace],
  );
  const [flowNodes, setFlowNodes] = useState<SemanticNode[]>(layoutNodes);
  const edges = useMemo(
    () => (resolvedLayout ? buildReactEdges(resolvedLayout, selectedRelationshipId, workspace) : []),
    [resolvedLayout, selectedRelationshipId, workspace],
  );
  const conceptByNodeId = useMemo(
    () => new Map((graph?.nodes ?? []).map((concept) => [String(concept.id), concept])),
    [graph],
  );
  const onNodesChange = useCallback((changes: NodeChange<SemanticNode>[]) => {
    setFlowNodes((current) => applyNodeChanges(changes, current));
  }, []);

  useEffect(() => {
    setFlowNodes(layoutNodes);
  }, [layoutNodes]);

  if (!graph || !resolvedLayout) {
    return (
      <div
        className={
          workspace
            ? 'flex h-full min-h-0 items-center justify-center bg-transparent text-sm text-white/[0.62]'
            : 'flex h-full min-h-[520px] items-center justify-center rounded-md border border-dashed border-line bg-panel text-sm text-ink/60'
        }
      >
        Select a concept to load its local graph.
      </div>
    );
  }

  return (
    <div
      className={
        workspace
          ? 'graph-shell graph-shell-workspace h-full min-h-0 overflow-hidden bg-transparent'
          : 'graph-shell h-full min-h-[560px] overflow-hidden rounded-md border border-line bg-panel'
      }
      data-testid={workspace ? 'graph-workspace-canvas' : 'graph-canvas'}
      data-layout={resolvedLayout.mode}
    >
      <ReactFlow<SemanticNode, SemanticEdge>
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, duration: 220 }}
        minZoom={0.18}
        maxZoom={1.7}
        snapToGrid
        snapGrid={[GRAPH_GRID_SIZE, GRAPH_GRID_SIZE]}
        nodesDraggable={Boolean(onNodePositionChange)}
        nodesConnectable={false}
        edgesReconnectable={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag
        nodeDragThreshold={4}
        onlyRenderVisibleElements={resolvedLayout.nodes.length > 120}
        onNodesChange={onNodesChange}
        onPaneClick={onPaneClick}
        onNodeClick={(_, node) => onSelectConcept(Number(node.id))}
        onEdgeClick={(_, edge) => onSelectRelationship(Number(edge.id))}
        onNodeDragStop={(_, node) => onNodePositionChange?.(Number(node.id), snapPoint(node.position))}
      >
        <ViewportEffects layoutSignature={resolvedLayout.signature} viewportRevision={viewportRevision} />
        <AdaptiveGrid showGrid={showGrid} workspace={workspace} />
        <MiniMap
          nodeStrokeWidth={2}
          pannable
          zoomable
          maskColor={workspace ? 'rgba(9,11,15,0.68)' : undefined}
          style={
            workspace
              ? {
                  background: 'rgba(17,22,26,0.78)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                }
              : undefined
          }
          nodeColor={(node) => {
            const concept = conceptByNodeId.get(node.id);
            return concept ? masteryTheme[masteryCategory(concept.mastery_score)].nodeBackground : '#ffffff';
          }}
        />
        <AnimatedControls />
      </ReactFlow>
    </div>
  );
}

function buildReactNodes(layout: GraphLayoutResult, selectedConceptId: number | null, workspace: boolean): SemanticNode[] {
  return layout.nodes.map((layoutNode) => {
    const concept = layoutNode.concept;
    const category = masteryCategory(concept.mastery_score);
    const theme = masteryTheme[category];
    const selected = selectedConceptId === concept.id;

    return {
      id: String(concept.id),
      type: 'semanticConcept',
      position: layoutNode.position,
      data: {
        concept,
        selected,
        nodeBackground: theme.nodeBackground,
        nodeBorder: selected ? (workspace ? '#f8f7f2' : '#22221f') : theme.nodeBorder,
        nodeShadow: selected
          ? workspace
            ? '0 0 0 1px rgba(255,255,255,0.38), 0 18px 42px rgba(39, 116, 109, 0.28)'
            : '0 12px 30px rgba(34, 34, 31, 0.22)'
          : null,
      },
      style: {
        width: GRAPH_NODE_WIDTH,
        height: GRAPH_NODE_HEIGHT,
      },
      zIndex: selected ? 30 : 20,
    };
  });
}

function buildReactEdges(
  layout: GraphLayoutResult,
  selectedRelationshipId: number | null,
  workspace: boolean,
): SemanticEdge[] {
  const dense = layout.relationships.length > 180;
  return layout.relationships.map((route) => {
    const relationship = route.relationship;
    const selected = selectedRelationshipId === relationship.id;
    const edgeColor = workspace ? workspaceEdgeColor(relationship.mastery_score) : masteryTheme[masteryCategory(relationship.mastery_score)].edge;

    return {
      id: String(relationship.id),
      source: String(relationship.source_concept_id),
      target: String(relationship.target_concept_id),
      sourceHandle: handleId('source', route.sourceSide),
      targetHandle: handleId('target', route.targetSide),
      type: 'semanticRelationship',
      markerEnd: { type: MarkerType.ArrowClosed, color: selected ? (workspace ? '#ffffff' : '#22221f') : edgeColor },
      style: {
        stroke: selected ? (workspace ? '#ffffff' : '#22221f') : edgeColor,
        strokeWidth: selected ? 3.2 : 2.2,
        opacity: selected ? 1 : 0.9,
      },
      data: {
        label: dense && !selected ? '' : relationship.relationship_type,
        curveOffset: route.curveOffset,
        selected,
        dense,
      },
      zIndex: selected ? 30 : 12,
    };
  });
}

function AdaptiveGrid({ showGrid, workspace }: { showGrid: boolean; workspace: boolean }) {
  if (!showGrid) return null;

  return (
    <Background
      id="graph-grid"
      variant={BackgroundVariant.Lines}
      gap={workspace ? GRAPH_GRID_SIZE : 26}
      color={workspace ? '#2b373d' : '#d9d4c8'}
      lineWidth={1}
      bgColor={workspace ? '#090b0f' : undefined}
      style={workspace ? workspaceGridStyle : undefined}
    />
  );
}

function ViewportEffects({
  layoutSignature,
  viewportRevision,
}: {
  layoutSignature: string;
  viewportRevision: number;
}) {
  const { fitView } = useReactFlow();
  const previousSignature = useRef<string | null>(null);
  const previousViewportRevision = useRef(viewportRevision);

  useEffect(() => {
    const layoutChanged = previousSignature.current !== layoutSignature;
    const viewportRevisionChanged = previousViewportRevision.current !== viewportRevision;
    previousSignature.current = layoutSignature;
    previousViewportRevision.current = viewportRevision;

    if (!layoutChanged && !viewportRevisionChanged) return;

    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 220 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fitView, layoutSignature, viewportRevision]);

  return null;
}

function AnimatedControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <Controls
      fitViewOptions={{ padding: 0.2, duration: 220 }}
      onZoomIn={() => {
        void zoomIn({ duration: 180 });
      }}
      onZoomOut={() => {
        void zoomOut({ duration: 180 });
      }}
      onFitView={() => {
        void fitView({ padding: 0.2, duration: 220 });
      }}
    />
  );
}

function handleId(kind: 'source' | 'target', side: PortSide) {
  return `${kind}-${side}`;
}
