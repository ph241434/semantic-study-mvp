import type { StylesheetJson } from 'cytoscape';

const conceptTypeColors: Record<string, string> = {
  algorithm: '#38d8cc',
  application: '#8fd98f',
  concept: '#d8dcff',
  definition: '#f8d477',
  example: '#f59f7d',
  mechanism: '#b99cff',
  property: '#83c5ff',
  theorem: '#ff9ac2',
};

export function conceptColor(conceptType: string) {
  return conceptTypeColors[conceptType] ?? '#d8dcff';
}

export const cytoscapeStyles = [
  {
    selector: 'node',
    style: {
      width: 'data(size)',
      height: 'data(size)',
      shape: 'data(shape)',
      'background-color': 'data(color)',
      'border-color': 'data(borderColor)',
      'border-width': 'data(borderWidth)',
      color: '#f8f7f2',
      'font-family': 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      'font-size': 12,
      'font-weight': 800,
      label: 'data(label)',
      'min-zoomed-font-size': 8,
      'overlay-opacity': 0,
      'text-halign': 'center',
      'text-max-width': 150,
      'text-outline-color': '#0b0f13',
      'text-outline-width': 3,
      'text-valign': 'center',
      'text-wrap': 'wrap',
    },
  },
  {
    selector: 'node[entityType = "root"]',
    style: {
      'background-color': '#f8f7f2',
      'border-color': '#38d8cc',
      'border-width': 4,
      color: '#0b0f13',
      'font-size': 13,
      'text-outline-width': 0,
    },
  },
  {
    selector: 'node[entityType = "knowledge-space"]',
    style: {
      'border-width': 4,
      'font-size': 14,
      'text-outline-width': 4,
    },
  },
  {
    selector: 'node[entityType = "topic"]',
    style: {
      'background-color': '#18252e',
      'border-color': '#65ddd4',
      'border-width': 3,
      shape: 'round-rectangle',
    },
  },
  {
    selector: 'node[boundary]',
    style: {
      'border-color': '#f8d477',
      'border-style': 'dashed',
      opacity: 0.74,
    },
  },
  {
    selector: 'node[region = "context"]',
    style: {
      'font-size': 10,
      'text-outline-color': '#0a0d11',
      opacity: 0.72,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#ffffff',
      'border-width': 5,
      'underlay-color': '#38d8cc',
      'underlay-opacity': 0.2,
      'underlay-padding': 8,
    },
  },
  {
    selector: 'edge',
    style: {
      color: '#f8f7f2',
      'font-family': 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
      'font-size': 9,
      'font-weight': 800,
      label: 'data(label)',
      'line-color': 'data(color)',
      opacity: 0.86,
      'overlay-opacity': 0,
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'text-background-color': '#10161d',
      'text-background-opacity': 0.78,
      'text-background-padding': 3,
      'text-border-color': 'rgba(255,255,255,0.16)',
      'text-border-opacity': 1,
      'text-border-width': 1,
      'text-margin-y': -8,
      'text-rotation': 'autorotate',
      width: 'data(width)',
    },
  },
  {
    selector: 'edge[edgeType = "navigation"]',
    style: {
      color: '#d6e0dd',
      'curve-style': 'bezier',
      'line-style': 'dashed',
      'line-color': '#5b727d',
      'target-arrow-shape': 'none',
      'text-background-opacity': 0,
      'text-border-width': 0,
      label: '',
      opacity: 0.58,
      width: 1.4,
    },
  },
  {
    selector: 'edge[edgeType = "topic-connection"]',
    style: {
      'curve-style': 'bezier',
      'line-style': 'dotted',
      'line-color': 'data(color)',
      opacity: 0.7,
      'target-arrow-shape': 'none',
      'text-background-color': '#10161d',
      width: 'data(width)',
    },
  },
  {
    selector: 'edge[edgeType = "semantic"]',
    style: {
      'control-point-distances': 'data(curveDistance)',
      'control-point-weights': 'data(curveWeight)',
      'curve-style': 'unbundled-bezier',
      'line-color': 'data(color)',
      'source-endpoint': 'outside-to-node',
      'target-endpoint': 'outside-to-node',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'text-background-color': '#10161d',
      'text-margin-y': -9,
      width: 'data(width)',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      color: '#ffffff',
      'line-color': '#ffffff',
      opacity: 1,
      'target-arrow-color': '#ffffff',
      width: 3.5,
    },
  },
] as unknown as StylesheetJson;
