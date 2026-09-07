import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';

import { masteryCategory, masteryPercent, masteryTheme } from '../styles/mastery';
import type { Concept, GraphResponse, Relationship } from '../types';

type Props = {
  graph: GraphResponse | null;
  selectedConceptId: number | null;
  selectedRelationshipId: number | null;
  onSelectConcept: (conceptId: number) => void;
  onSelectRelationship: (relationshipId: number) => void;
};

function distanceMap(centerId: number, relationships: Relationship[]) {
  const distances = new Map<number, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length) {
    const current = queue.shift()!;
    const currentDistance = distances.get(current) ?? 0;
    relationships.forEach((relationship) => {
      const neighbor =
        relationship.source_concept_id === current
          ? relationship.target_concept_id
          : relationship.target_concept_id === current
            ? relationship.source_concept_id
            : null;
      if (neighbor !== null && !distances.has(neighbor)) {
        distances.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    });
  }
  return distances;
}

function buildNodes(graph: GraphResponse, selectedConceptId: number | null): Node[] {
  const distances = distanceMap(graph.center_id, graph.relationships);
  const groups = graph.nodes.reduce<Record<number, Concept[]>>((acc, concept) => {
    const distance = distances.get(concept.id) ?? 1;
    acc[distance] = [...(acc[distance] ?? []), concept];
    return acc;
  }, {});

  return graph.nodes.map((concept) => {
    const distance = distances.get(concept.id) ?? 1;
    const peers = groups[distance] ?? [concept];
    const index = peers.findIndex((item) => item.id === concept.id);
    const angle = peers.length <= 1 ? -Math.PI / 2 : (index / peers.length) * Math.PI * 2 - Math.PI / 2;
    const radius = distance === 0 ? 0 : 220 + (distance - 1) * 180;
    const category = masteryCategory(concept.mastery_score);
    const theme = masteryTheme[category];

    return {
      id: String(concept.id),
      position: {
        x: 380 + Math.cos(angle) * radius,
        y: 260 + Math.sin(angle) * radius,
      },
      data: {
        label: (
          <div className="flex h-full min-h-[68px] w-[176px] flex-col justify-between gap-2 overflow-hidden rounded-md px-3 py-2">
            <div className="truncate text-sm font-bold text-ink" title={concept.name}>
              {concept.name}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-ink/60">
              <span className="truncate">{concept.concept_type}</span>
              <span>{masteryPercent(concept.mastery_score)}</span>
            </div>
          </div>
        ),
      },
      style: {
        width: 176,
        minHeight: 68,
        padding: 0,
        background: theme.nodeBackground,
        border: `2px solid ${selectedConceptId === concept.id ? '#22221f' : theme.nodeBorder}`,
        borderRadius: 8,
        boxShadow: selectedConceptId === concept.id ? '0 12px 30px rgba(34, 34, 31, 0.22)' : undefined,
      },
    };
  });
}

function buildEdges(graph: GraphResponse, selectedRelationshipId: number | null): Edge[] {
  return graph.relationships.map((relationship) => {
    const category = masteryCategory(relationship.mastery_score);
    const theme = masteryTheme[category];
    return {
      id: String(relationship.id),
      source: String(relationship.source_concept_id),
      target: String(relationship.target_concept_id),
      label: relationship.relationship_type,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: theme.edge },
      style: {
        stroke: selectedRelationshipId === relationship.id ? '#22221f' : theme.edge,
        strokeWidth: selectedRelationshipId === relationship.id ? 3 : 2,
      },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
      labelStyle: { fill: '#22221f', fontSize: 12 },
    };
  });
}

export function GraphCanvas({
  graph,
  selectedConceptId,
  selectedRelationshipId,
  onSelectConcept,
  onSelectRelationship,
}: Props) {
  if (!graph) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-md border border-dashed border-line bg-panel text-sm text-ink/60">
        Select a concept to load its local graph.
      </div>
    );
  }

  const nodes = buildNodes(graph, selectedConceptId);
  const edges = buildEdges(graph, selectedRelationshipId);

  return (
    <div className="graph-shell h-full min-h-[560px] overflow-hidden rounded-md border border-line bg-panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.25}
        maxZoom={1.8}
        onNodeClick={(_, node) => onSelectConcept(Number(node.id))}
        onEdgeClick={(_, edge) => onSelectRelationship(Number(edge.id))}
      >
        <Background color="#d9d4c8" gap={26} />
        <MiniMap
          nodeStrokeWidth={2}
          pannable
          zoomable
          nodeColor={(node) => {
            const concept = graph.nodes.find((item) => String(item.id) === node.id);
            return concept ? masteryTheme[masteryCategory(concept.mastery_score)].nodeBackground : '#ffffff';
          }}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}

