import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Concept, Flowchart, KnowledgeEntry } from '../types';

vi.mock('../api/client', () => ({
  api: {
    createKnowledgeEntry: vi.fn(),
    createFlowchart: vi.fn(),
    createFlowNode: vi.fn(),
  },
}));

import { buildFolderTree, FlowNavigator, type CreationRequest } from './FlowNavigator';

function folder(id: number, name: string, parentId: number | null): KnowledgeEntry {
  return { id, parent_id: parentId, name, entry_type: 'folder', concept_id: null, sort_order: 0 };
}

function flowchart(id: number, name: string, folderId: number | null): Flowchart {
  return { id, name, description: '', folder_id: folderId, node_count: 0, edge_count: 0, used_by_count: 0, created_at: '', updated_at: '' };
}

const noop = () => {};

function navProps(overrides: Partial<ComponentProps<typeof FlowNavigator>> = {}): ComponentProps<typeof FlowNavigator> {
  return {
    entries: [] as KnowledgeEntry[],
    flowcharts: [] as Flowchart[],
    concepts: [] as Concept[],
    currentFlowchartId: null,
    currentFolderId: null,
    creationRequest: null as CreationRequest | null,
    onRequestCreation: noop,
    onOpenFlowchart: noop,
    onSelectConcept: noop,
    onOpenKnowledge: noop,
    onEntryCreated: noop,
    onFlowchartCreated: noop,
    onAddStep: noop,
    ...overrides,
  };
}

function renderNav(overrides: Partial<ComponentProps<typeof FlowNavigator>> = {}) {
  return render(<FlowNavigator {...navProps(overrides)} />);
}

describe('FlowNavigator: context menus', () => {
  afterEach(cleanup);

  it('root/background right-click shows New folder and New flowchart', () => {
    renderNav();
    fireEvent.contextMenu(screen.getByTestId('flow-nav-scroll'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'New folder' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'New flowchart' })).toBeInTheDocument();
  });

  it('a folder right-click shows New folder and New flowchart, targeting that folder', () => {
    const entries = [folder(1, 'Algorithms', null)];
    const onRequestCreation = vi.fn();
    renderNav({ entries, onRequestCreation });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Algorithms' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New flowchart' }));
    expect(onRequestCreation).toHaveBeenCalledWith({ kind: 'flowchart', parentId: 1 });
  });

  it('a flowchart right-click shows only Add step', () => {
    const flowcharts = [flowchart(1, 'Dijkstra', null)];
    renderNav({ flowcharts });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Dijkstra/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: 'Add step' })).toBeInTheDocument();
  });

  it('selecting Add step calls onAddStep immediately, with no form and no request state', () => {
    const flowcharts = [flowchart(1, 'Dijkstra', null)];
    const onAddStep = vi.fn();
    renderNav({ flowcharts, onAddStep });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Dijkstra/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add step' }));
    expect(onAddStep).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('closes on outside click, on Escape, and after selecting an item', () => {
    renderNav();
    fireEvent.contextMenu(screen.getByTestId('flow-nav-scroll'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId('flow-nav-scroll'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId('flow-nav-scroll'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('left-click still toggles a folder open/closed, unaffected by the context-menu handler', () => {
    const entries = [folder(1, 'Algorithms', null), folder(2, 'Sorting', 1)];
    renderNav({ entries });
    expect(screen.getByText('Sorting')).toBeInTheDocument(); // open by default

    fireEvent.click(screen.getByRole('button', { name: 'Algorithms' }));
    expect(screen.queryByText('Sorting')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Algorithms' }));
    expect(screen.getByText('Sorting')).toBeInTheDocument();
  });
});

describe('FlowNavigator: renders the real persisted folder hierarchy', () => {
  afterEach(cleanup);

  it('renders a 3-level chain of folders even when every level is empty', () => {
    const entries = [folder(1, 'A', null), folder(2, 'B', 1), folder(3, 'C', 2)];
    renderNav({ entries });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('buildFolderTree keeps every folder regardless of content, so it survives a refresh unchanged', () => {
    const entries = [folder(1, 'A', null), folder(2, 'B', 1)];
    const tree = buildFolderTree(entries, []);
    expect(tree.folders.map((node) => node.entry.name)).toEqual(['A']);
    expect(tree.folders[0].children.map((node) => node.entry.name)).toEqual(['B']);
  });
});

describe('FlowNavigator: inline creation forms', () => {
  afterEach(cleanup);

  it('places the New folder form under the targeted folder, not its sibling, with no folder dropdown', () => {
    const entries = [folder(1, 'Algorithms', null), folder(2, 'Security', null)];
    renderNav({ entries, creationRequest: { kind: 'folder', parentId: 1 } });
    const panel = screen.getByRole('group', { name: 'New folder' });
    expect(within(panel).getByText('In Algorithms')).toBeInTheDocument();
    expect(within(panel).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('In Security')).not.toBeInTheDocument();
  });

  it('renders the New folder form at the top level with "At the top level" context', () => {
    renderNav({ creationRequest: { kind: 'folder', parentId: null } });
    const panel = screen.getByRole('group', { name: 'New folder' });
    expect(within(panel).getByText('At the top level')).toBeInTheDocument();
  });

  it('auto-expands a closed ancestor folder when a folder/flowchart creation request targets something inside it', () => {
    const entries = [folder(1, 'Algorithms', null), folder(2, 'Sorting', 1)];
    const { rerender } = renderNav({ entries });

    fireEvent.click(screen.getByRole('button', { name: 'Algorithms' })); // collapse it
    expect(screen.queryByText('Sorting')).not.toBeInTheDocument();

    rerender(<FlowNavigator {...navProps({ entries, creationRequest: { kind: 'folder', parentId: 2 } })} />);

    expect(screen.getByText('Sorting')).toBeInTheDocument(); // re-opened automatically
    expect(screen.getByRole('group', { name: 'New folder' })).toBeInTheDocument();
  });
});
