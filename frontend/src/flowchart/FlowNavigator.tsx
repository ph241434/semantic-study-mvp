import { ChevronDown, ChevronRight, FileText, Folder, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Concept, FlowchartSummary, KnowledgeSpace } from '../types';

type Props = {
  spaces: KnowledgeSpace[];
  flowcharts: FlowchartSummary[];
  concepts: Concept[];
  currentFlowchartId: number | null;
  onOpenFlowchart: (flowchartId: number) => void;
  onSelectConcept: (conceptId: number) => void;
};

type GroupKey = number | 'none';

/** Navigation only: a filesystem-style list of projects, flowcharts and the concept registry. */
export function FlowNavigator({ spaces, flowcharts, concepts, currentFlowchartId, onOpenFlowchart, onSelectConcept }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<GroupKey>>(new Set());
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const byProject = new Map<GroupKey, FlowchartSummary[]>();
    for (const flowchart of flowcharts) {
      const key: GroupKey = flowchart.knowledge_space_id ?? 'none';
      byProject.set(key, [...(byProject.get(key) ?? []), flowchart]);
    }
    const list: Array<{ key: GroupKey; name: string; items: FlowchartSummary[] }> = spaces
      .filter((space) => byProject.has(space.id))
      .map((space) => ({ key: space.id, name: space.name, items: byProject.get(space.id) ?? [] }));
    if (byProject.has('none')) list.push({ key: 'none', name: 'No project', items: byProject.get('none') ?? [] });
    return list;
  }, [flowcharts, spaces]);

  const matchingConcepts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return concepts.filter((concept) => !term || concept.name.toLowerCase().includes(term)).slice(0, 40);
  }, [concepts, query]);

  if (collapsed) {
    return (
      <button type="button" className="flow-navigator-toggle" onClick={() => setCollapsed(false)} title="Show navigator" aria-label="Show navigator">
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="flow-navigator" aria-label="Project navigator" data-testid="flow-navigator">
      <div className="flow-navigator-header">
        <span>Projects</span>
        <button type="button" onClick={() => setCollapsed(true)} title="Hide navigator" aria-label="Hide navigator">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flow-navigator-scroll">
        {groups.length === 0 && <p className="flow-navigator-empty">No flowcharts yet.</p>}
        {groups.map((group) => {
          const closed = closedGroups.has(group.key);
          return (
            <div key={group.key}>
              <button
                type="button"
                className="flow-navigator-row flow-navigator-folder"
                onClick={() =>
                  setClosedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
              >
                {closed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <Folder className="h-3.5 w-3.5" />
                <span className="truncate">{group.name}</span>
              </button>
              {!closed &&
                group.items.map((flowchart) => (
                  <button
                    key={flowchart.id}
                    type="button"
                    className={`flow-navigator-row flow-navigator-file ${flowchart.id === currentFlowchartId ? 'flow-navigator-active' : ''}`}
                    onClick={() => onOpenFlowchart(flowchart.id)}
                    title={flowchart.description || flowchart.name}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="truncate">{flowchart.name}</span>
                    {flowchart.is_primary && <span className="flow-navigator-badge">main</span>}
                  </button>
                ))}
            </div>
          );
        })}
        <div className="flow-navigator-section">Concepts</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search concepts"
          aria-label="Search concepts"
          className="flow-navigator-search"
        />
        {matchingConcepts.map((concept) => (
          <button key={concept.id} type="button" className="flow-navigator-row flow-navigator-file" onClick={() => onSelectConcept(concept.id)}>
            <span className="truncate">{concept.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
