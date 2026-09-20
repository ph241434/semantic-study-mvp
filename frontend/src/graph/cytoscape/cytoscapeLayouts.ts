import type { LayoutOptions } from 'cytoscape';

import type { CytoscapeLayoutKind } from './graphTypes';

export function cytoscapeLayoutFor(kind: CytoscapeLayoutKind): LayoutOptions {
  if (kind === 'home') {
    return {
      name: 'breadthfirst',
      animate: false,
      circle: false,
      directed: true,
      fit: false,
      padding: 150,
      roots: 'node[entityType = "root"]',
      spacingFactor: 1.35,
    } as LayoutOptions;
  }

  if (kind === 'space') {
    return {
      name: 'cose',
      animate: false,
      componentSpacing: 150,
      fit: false,
      idealEdgeLength: 175,
      nodeOverlap: 28,
      nodeRepulsion: 580000,
      padding: 150,
      randomize: false,
    } as LayoutOptions;
  }

  return {
    name: 'fcose',
    animate: false,
    fit: false,
    gravity: 0.18,
    gravityCompound: 1,
    gravityRange: 3.8,
    gravityRangeCompound: 1.5,
    idealEdgeLength: 155,
    nestingFactor: 0.1,
    nodeDimensionsIncludeLabels: true,
    nodeRepulsion: 8200,
    numIter: 2600,
    packComponents: true,
    padding: 170,
    quality: 'default',
    randomize: true,
    tile: true,
    tilingPaddingHorizontal: 105,
    tilingPaddingVertical: 90,
    uniformNodeDimensions: false,
  } as LayoutOptions;
}
