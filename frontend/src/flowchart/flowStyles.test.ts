import { describe, expect, it } from 'vitest';

import { EDGE_VISUALS, FLOW_NODE_TYPES, LOD_HIGH_ABOVE, LOD_LOW_BELOW, NODE_VISUALS, edgeVisual, estimateNodeSize, lodForZoom, nodeVisual } from './flowStyles';

describe('node type visual grammar', () => {
  it('maps every node type to a meaningful shape', () => {
    expect(nodeVisual('start').shape).toBe('terminal');
    expect(nodeVisual('end').shape).toBe('terminal');
    expect(nodeVisual('process').shape).toBe('rectangle');
    expect(nodeVisual('decision').shape).toBe('diamond');
    expect(nodeVisual('input_output').shape).toBe('parallelogram');
    expect(nodeVisual('subprocess').shape).toBe('subprocess');
    expect(nodeVisual('external_system').shape).toBe('hexagon');
    expect(nodeVisual('data').shape).toBe('document');
    expect(FLOW_NODE_TYPES).toHaveLength(8);
  });

  it('never relies on colour alone: every type except the start/end pair has its own shape', () => {
    const shapes = new Set(FLOW_NODE_TYPES.map((type) => NODE_VISUALS[type].shape));
    expect(shapes.size).toBe(FLOW_NODE_TYPES.length - 1);
  });

  it('keeps a small palette rather than a colour per node', () => {
    const strokes = new Set(FLOW_NODE_TYPES.map((type) => NODE_VISUALS[type].stroke));
    expect(strokes.size).toBeLessThanOrEqual(7);
  });

  it('falls back to a process box for unknown types', () => {
    expect(nodeVisual('mystery').shape).toBe('rectangle');
  });

  it('sizes nodes from their label so layout can run before anything is measured', () => {
    const short = estimateNodeSize('Merge', 'process');
    const long = estimateNodeSize('Insert start in priority queue with a very long explanation', 'process');
    expect(long.height).toBeGreaterThan(short.height);
    expect(short.width).toBeGreaterThanOrEqual(NODE_VISUALS.process.minWidth);
    // A decision needs extra room so its text stays inside the diamond.
    expect(estimateNodeSize('OK?', 'decision').width).toBeGreaterThan(estimateNodeSize('OK?', 'process').width);
  });
});

describe('edge visual grammar', () => {
  it('distinguishes normal, yes/success, no/failure and retry flow', () => {
    expect(edgeVisual('normal').dashed).toBe(false);
    expect(edgeVisual('yes').color).toBe(edgeVisual('success').color);
    expect(edgeVisual('no').color).toBe(edgeVisual('failure').color);
    expect(edgeVisual('yes').color).not.toBe(edgeVisual('no').color);
    expect(edgeVisual('retry').dashed).toBe(true);
    expect(edgeVisual('nonsense')).toEqual(edgeVisual('normal'));
  });

  it('gives semantic relationships their own secondary style, distinct from process flow', () => {
    expect(EDGE_VISUALS.semantic.dashed).toBe(true);
    expect(EDGE_VISUALS.semantic.color).not.toBe(EDGE_VISUALS.normal.color);
  });
});

describe('semantic zoom levels', () => {
  it('switches level of detail at fixed zoom thresholds', () => {
    expect(lodForZoom(LOD_LOW_BELOW - 0.01)).toBe('low');
    expect(lodForZoom(LOD_LOW_BELOW)).toBe('normal');
    expect(lodForZoom(1)).toBe('normal');
    expect(lodForZoom(LOD_HIGH_ABOVE)).toBe('normal');
    expect(lodForZoom(LOD_HIGH_ABOVE + 0.01)).toBe('high');
  });
});
