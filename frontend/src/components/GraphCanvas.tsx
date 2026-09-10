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
  ViewportPortal,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react';

import {
  GRAPH_GRID_SIZE,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  buildGraphLayout,
  type GraphLayoutMode,
  type GraphLayoutResult,
  type LayoutCommunity,
  type PortSide,
} from '../graph/layout';
import { masteryCategory, masteryPercent, masteryTheme } from '../styles/mastery';
import type { Concept, GraphResponse } from '../types';

type Props = {
  graph: GraphResponse | null;
  layout?: GraphLayoutResult | null;
  layoutMode?: GraphLayoutMode;
  selectedConceptId: number | null;
  selectedRelationshipId: number | null;
  selectedCommunityId?: number | null;
  focusedCommunityId?: number | null;
  communityLabels?: Record<string, string>;
  onSelectConcept: (conceptId: number) => void;
  onSelectRelationship: (relationshipId: number) => void;
  onSelectCommunity?: (communityId: number) => void;
  onFocusCommunity?: (communityId: number | null) => void;
  onPaneClick?: () => void;
  variant?: 'embedded' | 'workspace';
  showGrid?: boolean;
  viewportRevision?: number;
};

type GraphNodeData = Record<string, unknown> & {
  concept: Concept;
  selected: boolean;
  faded: boolean;
  nodeBackground: string;
  nodeBorder: string;
  nodeShadow: string | null;
};

type GraphEdgeData = Record<string, unknown> & {
  label: string;
  laneOffset: number;
  selected: boolean;
  faded: boolean;
  dense: boolean;
  isCrossCommunity: boolean;
};

type SemanticNode = Node<GraphNodeData, 'semanticConcept'>;
type SemanticEdge = Edge<GraphEdgeData, 'semanticRelationship'>;

const portPositions: Array<{ side: PortSide; position: Position }> = [
  { side: 'top', position: Position.Top },
  { side: 'right', position: Position.Right },
  { side: 'bottom', position: Position.Bottom },
  { side: 'left', position: Position.Left },
];

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
    <div
      className={`graph-concept-node ${data.selected ? 'graph-concept-node-selected' : ''} ${
        data.faded ? 'graph-concept-node-faded' : ''
      }`}
      style={style}
    >
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

function RoutedRelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps<SemanticEdge>) {
  const laneOffset = typeof data?.laneOffset === 'number' ? data.laneOffset : 0;
  const route = routedPath(sourceX, sourceY, targetX, targetY, laneOffset);
  const label = typeof data?.label === 'string' ? data.label : '';
  const faded = Boolean(data?.faded);
  const selected = Boolean(data?.selected);

  return (
    <>
      <BaseEdge
        id={id}
        path={route.path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={data?.dense ? 14 : 22}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`graph-edge-label ${data?.isCrossCommunity ? 'graph-edge-label-cross' : ''} ${
              selected ? 'graph-edge-label-selected' : ''
            } ${faded ? 'graph-edge-label-faded' : ''}`}
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
  semanticRelationship: memo(RoutedRelationshipEdge),
};

export function GraphCanvas({
  graph,
  layout,
  layoutMode = 'layered',
  selectedConceptId,
  selectedRelationshipId,
  selectedCommunityId = null,
  focusedCommunityId = null,
  communityLabels = {},
  onSelectConcept,
  onSelectRelationship,
  onSelectCommunity,
  onFocusCommunity,
  onPaneClick,
  variant = 'embedded',
  showGrid = true,
  viewportRevision = 0,
}: Props) {
  const workspace = variant === 'workspace';
  const resolvedLayout = useMemo(
    () => layout ?? (graph ? buildGraphLayout(graph, layoutMode) : null),
    [graph, layout, layoutMode],
  );

  const nodes = useMemo(
    () => (resolvedLayout ? buildReactNodes(resolvedLayout, selectedConceptId, selectedCommunityId, workspace) : []),
    [resolvedLayout, selectedConceptId, selectedCommunityId, workspace],
  );
  const edges = useMemo(
    () => (resolvedLayout ? buildReactEdges(resolvedLayout, selectedRelationshipId, selectedCommunityId, workspace) : []),
    [resolvedLayout, selectedRelationshipId, selectedCommunityId, workspace],
  );

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
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, duration: 220 }}
        minZoom={0.18}
        maxZoom={1.7}
        snapToGrid
        snapGrid={[GRAPH_GRID_SIZE, GRAPH_GRID_SIZE]}
        nodesDraggable
        nodesConnectable={false}
        edgesReconnectable={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnScrollSpeed={0.34}
        panOnDrag
        nodeDragThreshold={4}
        onlyRenderVisibleElements={resolvedLayout.nodes.length > 120}
        onPaneClick={onPaneClick}
        onNodeClick={(_, node) => onSelectConcept(Number(node.id))}
        onEdgeClick={(_, edge) => onSelectRelationship(Number(edge.id))}
      >
        <ViewportEffects layout={resolvedLayout} focusedCommunityId={focusedCommunityId} viewportRevision={viewportRevision} />
        <AdaptiveGrid showGrid={showGrid} workspace={workspace} />
        <CommunityRegions
          layout={resolvedLayout}
          selectedCommunityId={selectedCommunityId}
          focusedCommunityId={focusedCommunityId}
          communityLabels={communityLabels}
          onSelectCommunity={onSelectCommunity}
          onFocusCommunity={onFocusCommunity}
        />
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
            const concept = graph.nodes.find((item) => String(item.id) === node.id);
            return concept ? masteryTheme[masteryCategory(concept.mastery_score)].nodeBackground : '#ffffff';
          }}
        />
        <AnimatedControls />
      </ReactFlow>
    </div>
  );
}

function buildReactNodes(
  layout: GraphLayoutResult,
  selectedConceptId: number | null,
  selectedCommunityId: number | null,
  workspace: boolean,
): SemanticNode[] {
  return layout.nodes.map((layoutNode) => {
    const concept = layoutNode.concept;
    const category = masteryCategory(concept.mastery_score);
    const theme = masteryTheme[category];
    const selected = selectedConceptId === concept.id;
    const faded = Boolean(selectedCommunityId && layoutNode.communityId !== selectedCommunityId);

    return {
      id: String(concept.id),
      type: 'semanticConcept',
      position: layoutNode.position,
      data: {
        concept,
        selected,
        faded,
        nodeBackground: theme.nodeBackground,
        nodeBorder: selected ? (workspace ? '#f8f7f2' : '#22221f') : theme.nodeBorder,
        nodeShadow: selected
          ? workspace
            ? '0 0 0 1px rgba(255,255,255,0.38), 0 20px 54px rgba(39, 116, 109, 0.35)'
            : '0 12px 30px rgba(34, 34, 31, 0.22)'
          : workspace
            ? '0 12px 34px rgba(4,6,8,0.42)'
            : null,
      },
      style: {
        width: GRAPH_NODE_WIDTH,
        height: GRAPH_NODE_HEIGHT,
        opacity: faded ? 0.28 : 1,
        transition: 'opacity 140ms ease, filter 140ms ease',
      },
      zIndex: selected ? 30 : faded ? 5 : 20,
    };
  });
}

function buildReactEdges(
  layout: GraphLayoutResult,
  selectedRelationshipId: number | null,
  selectedCommunityId: number | null,
  workspace: boolean,
): SemanticEdge[] {
  const dense = layout.relationships.length > 180;
  return layout.relationships.map((route) => {
    const relationship = route.relationship;
    const selected = selectedRelationshipId === relationship.id;
    const touchesSelectedCommunity =
      selectedCommunityId === null ||
      route.sourceCommunityId === selectedCommunityId ||
      route.targetCommunityId === selectedCommunityId;
    const fullyInsideSelectedCommunity =
      selectedCommunityId === null ||
      (route.sourceCommunityId === selectedCommunityId && route.targetCommunityId === selectedCommunityId);
    const faded = !touchesSelectedCommunity;
    const clusterOpacity =
      selectedCommunityId === null ? (route.isCrossCommunity && layout.mode === 'clustered' ? 0.64 : 0.9) : fullyInsideSelectedCommunity ? 1 : 0.32;
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
        strokeWidth: selected ? 3.2 : route.isCrossCommunity ? 1.8 : 2.2,
        opacity: selected ? 1 : faded ? 0.14 : clusterOpacity,
      },
      data: {
        label: relationship.relationship_type,
        laneOffset: route.laneOffset,
        selected,
        faded,
        dense,
        isCrossCommunity: route.isCrossCommunity,
      },
      zIndex: selected ? 30 : route.isCrossCommunity ? 8 : 12,
    };
  });
}

function AdaptiveGrid({ showGrid, workspace }: { showGrid: boolean; workspace: boolean }) {
  const zoom = useStore((state) => state.transform[2]);

  if (!showGrid) return null;

  const fineOpacity = workspace ? (zoom > 0.72 ? 0.62 : zoom > 0.42 ? 0.28 : 0) : 1;
  const coarseOpacity = workspace ? (zoom > 0.72 ? 0.22 : 0.48) : 0;

  return (
    <>
      <Background
        id="graph-grid-fine"
        variant={BackgroundVariant.Lines}
        gap={workspace ? GRAPH_GRID_SIZE : 26}
        color={workspace ? '#2b373d' : '#d9d4c8'}
        lineWidth={1}
        bgColor={workspace ? '#090b0f' : undefined}
        style={{ opacity: fineOpacity }}
      />
      {workspace && (
        <Background
          id="graph-grid-coarse"
          variant={BackgroundVariant.Lines}
          gap={GRAPH_GRID_SIZE * 5}
          color="#40515a"
          lineWidth={1}
          style={{ opacity: coarseOpacity }}
        />
      )}
    </>
  );
}

function ViewportEffects({
  layout,
  focusedCommunityId,
  viewportRevision,
}: {
  layout: GraphLayoutResult;
  focusedCommunityId: number | null;
  viewportRevision: number;
}) {
  const { fitBounds, fitView } = useReactFlow();
  const previousSignature = useRef<string | null>(null);

  useEffect(() => {
    const layoutChanged = previousSignature.current !== layout.signature;
    previousSignature.current = layout.signature;

    const frame = window.requestAnimationFrame(() => {
      const focusedCommunity = layout.communities.find((community) => community.id === focusedCommunityId);
      if (focusedCommunity) {
        void fitBounds(focusedCommunity.bounds, { padding: 0.5, duration: 240 });
        return;
      }
      if (layoutChanged || viewportRevision > 0) {
        void fitView({ padding: 0.18, duration: 220 });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fitBounds, fitView, focusedCommunityId, layout, viewportRevision]);

  return null;
}

function AnimatedControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <Controls
      fitViewOptions={{ padding: 0.18, duration: 220 }}
      onZoomIn={() => {
        void zoomIn({ duration: 180 });
      }}
      onZoomOut={() => {
        void zoomOut({ duration: 180 });
      }}
      onFitView={() => {
        void fitView({ padding: 0.18, duration: 220 });
      }}
    />
  );
}

function CommunityRegions({
  layout,
  selectedCommunityId,
  focusedCommunityId,
  communityLabels,
  onSelectCommunity,
  onFocusCommunity,
}: {
  layout: GraphLayoutResult;
  selectedCommunityId: number | null;
  focusedCommunityId: number | null;
  communityLabels: Record<string, string>;
  onSelectCommunity?: (communityId: number) => void;
  onFocusCommunity?: (communityId: number | null) => void;
}) {
  if (layout.mode !== 'clustered' || layout.communities.length === 0) return null;

  return (
    <ViewportPortal>
      {layout.communities.map((community) => (
        <CommunityRegion
          key={community.stableKey}
          community={community}
          selected={selectedCommunityId === community.id}
          focused={focusedCommunityId === community.id}
          label={communityLabels[community.stableKey] || community.label}
          onSelectCommunity={onSelectCommunity}
          onFocusCommunity={onFocusCommunity}
        />
      ))}
    </ViewportPortal>
  );
}

function CommunityRegion({
  community,
  label,
  selected,
  focused,
  onSelectCommunity,
  onFocusCommunity,
}: {
  community: LayoutCommunity;
  label: string;
  selected: boolean;
  focused: boolean;
  onSelectCommunity?: (communityId: number) => void;
  onFocusCommunity?: (communityId: number | null) => void;
}) {
  return (
    <div
      className={`graph-community-region ${selected ? 'graph-community-region-selected' : ''} ${
        focused ? 'graph-community-region-focused' : ''
      }`}
      style={{
        left: community.bounds.x,
        top: community.bounds.y,
        width: community.bounds.width,
        height: community.bounds.height,
      }}
    >
      <button
        type="button"
        className="graph-community-label"
        onClick={(event) => {
          event.stopPropagation();
          onSelectCommunity?.(community.id);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onFocusCommunity?.(community.id);
        }}
      >
        <span>{label}</span>
        <span>{community.nodeIds.length} concepts</span>
      </button>
    </div>
  );
}

function routedPath(sourceX: number, sourceY: number, targetX: number, targetY: number, laneOffset: number) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const controlDistance = Math.min(280, Math.max(90, distance * 0.36));
  const controlOffsetX = normalX * laneOffset;
  const controlOffsetY = normalY * laneOffset;
  const control1X = sourceX + (dx / distance) * controlDistance + controlOffsetX;
  const control1Y = sourceY + (dy / distance) * controlDistance + controlOffsetY;
  const control2X = targetX - (dx / distance) * controlDistance + controlOffsetX;
  const control2Y = targetY - (dy / distance) * controlDistance + controlOffsetY;
  const labelX = (sourceX + targetX) / 2 + controlOffsetX;
  const labelY = (sourceY + targetY) / 2 + controlOffsetY;

  return {
    path: `M ${sourceX},${sourceY} C ${control1X},${control1Y} ${control2X},${control2Y} ${targetX},${targetY}`,
    labelX,
    labelY,
  };
}

function handleId(kind: 'source' | 'target', side: PortSide) {
  return `${kind}-${side}`;
}
