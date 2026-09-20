import type { ElementDefinition } from 'cytoscape';

export type CytoscapeEntityType = 'root' | 'knowledge-space' | 'topic' | 'concept';
export type CytoscapeEdgeType = 'navigation' | 'semantic' | 'topic-connection';
export type CytoscapeLayoutKind = 'home' | 'space' | 'topic';
export type CytoscapeViewType = 'home' | 'space' | 'topic';
export type GraphViewRegion = 'navigation' | 'current' | 'context';

export type GraphNodeTap = {
  id: string;
  entityType: CytoscapeEntityType;
  entityId: number | null;
  boundary?: boolean;
  topicId?: number | null;
};

export type GraphEdgeTap = {
  id: string;
  edgeType: CytoscapeEdgeType;
  relationshipId?: number | null;
};

export type GraphPoint = {
  x: number;
  y: number;
};

export type CytoscapeGraphNode = {
  id: string;
  entityType: CytoscapeEntityType;
  entityId: number | null;
  label: string;
  region: GraphViewRegion;
  boundary?: boolean;
  borderColor: string;
  borderWidth: number;
  color: string;
  conceptId?: number;
  conceptType?: string;
  parentTopicId?: number | null;
  seedPosition?: GraphPoint;
  shape: string;
  size: number;
  subtitle?: string | null;
  topicId?: number | null;
};

export type CytoscapeGraphEdge = {
  id: string;
  edgeType: CytoscapeEdgeType;
  source: string;
  target: string;
  label: string;
  color: string;
  relationshipId?: number | null;
  curveDistance?: number;
  curveWeight?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  width: number;
};

export type CytoscapeGraphView = {
  type: CytoscapeViewType;
  viewKey: string;
  layoutKind: CytoscapeLayoutKind;
  nodes: CytoscapeGraphNode[];
  edges: CytoscapeGraphEdge[];
  focusNodeId?: string | null;
};

export type CytoscapeGraphElement = ElementDefinition;
