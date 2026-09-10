import {
  BarChart3,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Focus,
  GitFork,
  Link2,
  Map,
  Network,
  Plus,
  Search,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  graphLayoutLabels,
  graphLayoutModes,
  type GraphLayoutMode,
  type LayoutCommunity,
} from '../graph/layout';

export type GraphDestination = 'dashboard' | 'graph' | 'study' | 'reconstruction';

type Props = {
  collapsed: boolean;
  depth: number;
  layoutMode: GraphLayoutMode;
  graphLabel: string;
  nodeCount: number;
  loading: boolean;
  error: string | null;
  showGrid: boolean;
  currentView: GraphDestination;
  communities: LayoutCommunity[];
  selectedCommunityId: number | null;
  focusedCommunityId: number | null;
  communityLabels: Record<string, string>;
  search: ReactNode;
  onCollapsedChange: (collapsed: boolean) => void;
  onDepthChange: (depth: number) => void;
  onLayoutModeChange: (mode: GraphLayoutMode) => void;
  onGridChange: (showGrid: boolean) => void;
  onCommunitySelect: (communityId: number) => void;
  onCommunityFocus: (communityId: number) => void;
  onShowAllCommunities: () => void;
  onCommunityLabelChange: (stableKey: string, label: string) => void;
  onOpenConcept: () => void;
  onOpenRelationship: () => void;
  onFitGraph: () => void;
  onResetExpanded: () => void;
  onNavigate: (view: GraphDestination) => void;
};

const navItems: Array<{ view: GraphDestination; label: string; icon: ReactNode }> = [
  { view: 'graph', label: 'Graph', icon: <Network /> },
  { view: 'study', label: 'Study', icon: <BookOpenCheck /> },
  { view: 'dashboard', label: 'Dashboard', icon: <BarChart3 /> },
  { view: 'reconstruction', label: 'Reconstruct', icon: <Map /> },
];

export function GraphToolRail({
  collapsed,
  depth,
  layoutMode,
  graphLabel,
  nodeCount,
  loading,
  error,
  showGrid,
  currentView,
  communities,
  selectedCommunityId,
  focusedCommunityId,
  communityLabels,
  search,
  onCollapsedChange,
  onDepthChange,
  onLayoutModeChange,
  onGridChange,
  onCommunitySelect,
  onCommunityFocus,
  onShowAllCommunities,
  onCommunityLabelChange,
  onOpenConcept,
  onOpenRelationship,
  onFitGraph,
  onResetExpanded,
  onNavigate,
}: Props) {
  if (collapsed) {
    return (
      <aside className="graph-tool-rail graph-tool-rail-collapsed" data-testid="graph-tool-rail" data-collapsed="true">
        <IconButton label="Add Concept" onClick={onOpenConcept}>
          <Plus />
        </IconButton>
        <IconButton label="Add Relationship" onClick={onOpenRelationship}>
          <Link2 />
        </IconButton>
        <IconButton label="Search" onClick={() => onCollapsedChange(false)}>
          <Search />
        </IconButton>
        <IconButton label="Fit Graph" onClick={onFitGraph}>
          <Crosshair />
        </IconButton>
        <IconButton label="Open Sidebar" onClick={() => onCollapsedChange(false)}>
          <ChevronRight />
        </IconButton>
        <div className="graph-tool-divider" />
        <IconButton label="Study" onClick={() => onNavigate('study')}>
          <BookOpenCheck />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside className="graph-tool-rail graph-tool-rail-expanded" data-testid="graph-tool-rail" data-collapsed="false">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-wide text-white/[0.45]">Semantic Study</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{graphLabel}</p>
          <p className="mt-1 text-[12px] font-semibold text-white/[0.48]">{nodeCount} nodes in view</p>
        </div>
        <IconButton label="Collapse Sidebar" onClick={() => onCollapsedChange(true)}>
          <ChevronLeft />
        </IconButton>
      </div>

      {(loading || error) && (
        <div className={`graph-sidebar-status ${error ? 'graph-sidebar-status-error' : ''}`}>
          {error ?? 'Loading graph...'}
        </div>
      )}

      <section className="space-y-2">
        <button type="button" onClick={onOpenConcept} className="graph-sidebar-button graph-sidebar-button-primary">
          <Plus className="h-4 w-4" />
          Add Concept
        </button>
        <button type="button" onClick={onOpenRelationship} className="graph-sidebar-button">
          <Link2 className="h-4 w-4" />
          Add Relationship
        </button>
      </section>

      <section className="space-y-2">
        <p className="graph-sidebar-label">Search</p>
        {search}
      </section>

      <section className="space-y-3">
        <label className="block">
          <span className="graph-sidebar-label">Layout</span>
          <select
            aria-label="Graph layout"
            value={layoutMode}
            onChange={(event) => onLayoutModeChange(event.target.value as GraphLayoutMode)}
            className="graph-sidebar-select"
          >
            {graphLayoutModes.map((mode) => (
              <option key={mode} value={mode}>
                {graphLayoutLabels[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="graph-sidebar-label">Depth</span>
          <select
            aria-label="Graph depth"
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value))}
            className="graph-sidebar-select"
          >
            <option value={1}>Depth 1</option>
            <option value={2}>Depth 2</option>
            <option value={3}>Depth 3</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-white/75">
          <span>Grid</span>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => onGridChange(event.target.checked)}
            className="h-4 w-4 accent-teal"
          />
        </label>
        <button type="button" onClick={onFitGraph} className="graph-sidebar-button">
          <Crosshair className="h-4 w-4" />
          Fit Graph
        </button>
        <button type="button" onClick={onResetExpanded} className="graph-sidebar-button">
          <GitFork className="h-4 w-4" />
          Reset Expanded
        </button>
      </section>

      {layoutMode === 'clustered' && communities.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="graph-sidebar-label mb-0">Communities</p>
            <button type="button" onClick={onShowAllCommunities} className="graph-sidebar-mini-button">
              Show All
            </button>
          </div>
          <div className="graph-community-list">
            {communities.map((community) => {
              const label = communityLabels[community.stableKey] ?? community.label;
              const selected = selectedCommunityId === community.id;
              const focused = focusedCommunityId === community.id;
              return (
                <div key={community.stableKey} className="graph-community-list-item">
                  <button
                    type="button"
                    onClick={() => onCommunitySelect(community.id)}
                    onDoubleClick={() => onCommunityFocus(community.id)}
                    className={`graph-community-list-button ${selected ? 'graph-community-list-button-selected' : ''}`}
                  >
                    <span>{label}</span>
                    <span>
                      {community.nodeIds.length} nodes / {community.internalRelationshipCount} links
                    </span>
                  </button>
                  <div className="flex gap-2">
                    <input
                      aria-label={`${community.label} display name`}
                      value={communityLabels[community.stableKey] ?? ''}
                      onChange={(event) => onCommunityLabelChange(community.stableKey, event.target.value)}
                      placeholder={community.label}
                      className="graph-community-name-input"
                    />
                    <button
                      type="button"
                      onClick={() => onCommunityFocus(community.id)}
                      className={`graph-community-focus-button ${focused ? 'graph-community-focus-button-active' : ''}`}
                      title={`Focus ${label}`}
                    >
                      <Focus className="h-4 w-4" />
                      <span className="sr-only">Focus {label}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <nav className="space-y-2">
        <p className="graph-sidebar-label">Navigate</p>
        {navItems.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => onNavigate(item.view)}
            className={`graph-sidebar-button ${item.view === currentView ? 'graph-sidebar-button-active' : ''}`}
          >
            <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="graph-icon-button" title={label} aria-label={label}>
      <span className="[&>svg]:h-4 [&>svg]:w-4">{children}</span>
    </button>
  );
}
