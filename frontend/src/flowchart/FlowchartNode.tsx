import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import { memo, type CSSProperties } from 'react';

import type { FlowRfNode } from './flowAdapter';
import { nodeVisual, type NodeShape } from './flowStyles';
import { NodeLabelEditor } from './NodeLabelEditor';

// Outline points in a 0-100 box. The SVG is stretched to the node, so non-rectangular shapes need no custom sizing.
const SHAPE_POINTS: Partial<Record<NodeShape, string>> = {
  diamond: '50,0 100,50 50,100 0,50',
  parallelogram: '10,0 100,0 90,100 0,100',
  hexagon: '9,0 91,0 100,50 91,100 9,100 0,50',
  document: '0,0 84,0 100,22 100,100 0,100',
};

function FlowchartNodeView({ data, selected }: NodeProps<FlowRfNode>) {
  const visual = nodeVisual(data.nodeType);
  const points = SHAPE_POINTS[visual.shape];
  const style = { '--node-fill': visual.fill, '--node-stroke': visual.stroke } as CSSProperties;

  return (
    <div
      className={`flow-node flow-node-${visual.shape}${selected ? ' flow-node-selected' : ''}`}
      style={style}
      data-node-type={data.nodeType}
    >
      <Handle id="in" type="target" position={Position.Top} className="flow-handle" />
      {points && (
        <svg className="flow-node-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={points} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <NodeLabelEditor label={data.label} editing={data.editing} className="flow-node-label" />
      {data.hasChild && (
        <span className="flow-node-child" title="Has a detailed flowchart (double-click to open)" data-testid="flow-node-child">
          <Layers className="flow-node-child-icon" aria-label="Has a detailed flowchart" />
        </span>
      )}
      {/* Only visible when zoomed in: secondary metadata that would clutter the normal view. */}
      <span className="flow-node-meta">
        {visual.label}
        {data.conceptName ? ` · ${data.conceptName}` : ''}
      </span>
      <Handle id="out" type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}

export const FlowchartNode = memo(FlowchartNodeView);
