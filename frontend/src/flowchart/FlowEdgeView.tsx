import { BaseEdge, EdgeLabelRenderer, Position, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

import type { FlowRfEdge } from './flowAdapter';
import { backEdgeLanePoints, pathFromPoints, pointAlong, polylineMidpoint } from './flowPaths';

/**
 * A process edge. While no node has been moved by hand it follows ELK's orthogonal route exactly (which already avoids
 * unrelated nodes and keeps loops on an outer lane). After a manual move that route is stale, so the edge falls back
 * to a cheap live route computed from the two end points: a smooth step for forward edges, an outer lane for loops.
 */
function FlowEdgeViewImpl({ id, sourceX, sourceY, targetX, targetY, markerEnd, data, selected }: EdgeProps<FlowRfEdge>) {
  if (!data) return null;

  let path: string;
  let labelAt: { x: number; y: number };
  if (data.points && data.points.length >= 2) {
    path = pathFromPoints(data.points);
    // Anchor the label near the start so branch labels stay with their own edge instead of stacking mid-way.
    labelAt = pointAlong(data.points, 22);
    if (data.points.length <= 2) labelAt = polylineMidpoint(data.points);
  } else if (targetY < sourceY - 8) {
    const lane = backEdgeLanePoints({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.sourceWidth, data.targetWidth);
    path = pathFromPoints(lane);
    labelAt = polylineMidpoint(lane);
  } else {
    const [smooth, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Bottom,
      targetX,
      targetY,
      targetPosition: Position.Top,
      borderRadius: 8,
    });
    path = smooth;
    labelAt = { x: labelX, y: labelY };
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={16}
        style={{
          stroke: selected ? '#ffffff' : data.color,
          strokeWidth: selected ? 2.6 : 1.8,
          strokeDasharray: data.dashed ? '6 5' : undefined,
        }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className={`flow-edge-label flow-edge-label-${data.edgeType}${data.backEdge ? ' flow-edge-label-loop' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)`, color: data.color }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdgeView = memo(FlowEdgeViewImpl);
