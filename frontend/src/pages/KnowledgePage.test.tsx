import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeEntry } from '../types';
import { KnowledgePage } from './KnowledgePage';

const entries: KnowledgeEntry[] = [
  { id: 1, parent_id: null, name: 'Algorithms', entry_type: 'folder', concept_id: null, sort_order: 0 },
  { id: 2, parent_id: null, name: 'Cybersecurity', entry_type: 'folder', concept_id: null, sort_order: 1 },
  { id: 3, parent_id: 2, name: 'Cryptography', entry_type: 'folder', concept_id: null, sort_order: 0 },
  { id: 4, parent_id: 3, name: 'Asymmetric Encryption', entry_type: 'concept', concept_id: 101, sort_order: 0 },
  { id: 5, parent_id: 3, name: 'Symmetric Encryption', entry_type: 'concept', concept_id: 102, sort_order: 1 },
  { id: 6, parent_id: 1, name: 'Sorting', entry_type: 'folder', concept_id: null, sort_order: 0 },
];

describe('KnowledgePage filesystem browser', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders root-level folders in sort order with a Knowledge breadcrumb', () => {
    render(<KnowledgePage folderId={null} entries={entries} onNavigateFolder={vi.fn()} onOpenConcept={vi.fn()} />);

    const list = screen.getByTestId('knowledge-list');
    expect(list).toHaveTextContent('Algorithms');
    expect(list).toHaveTextContent('Cybersecurity');
    const breadcrumb = screen.getByTestId('knowledge-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Knowledge');
  });

  it('calls onNavigateFolder when a folder row is clicked', () => {
    const onNavigateFolder = vi.fn();
    render(<KnowledgePage folderId={null} entries={entries} onNavigateFolder={onNavigateFolder} onOpenConcept={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));

    expect(onNavigateFolder).toHaveBeenCalledWith(2);
  });

  it('calls onOpenConcept with the concept id, name, and current folder when a concept-file row is clicked', () => {
    const onOpenConcept = vi.fn();
    render(<KnowledgePage folderId={3} entries={entries} onNavigateFolder={vi.fn()} onOpenConcept={onOpenConcept} />);

    fireEvent.click(screen.getByRole('button', { name: 'Asymmetric Encryption' }));

    expect(onOpenConcept).toHaveBeenCalledWith(101, 'Asymmetric Encryption', 3);
  });

  it('renders the full ancestor breadcrumb for a nested folder and navigates from any segment', () => {
    const onNavigateFolder = vi.fn();
    render(<KnowledgePage folderId={3} entries={entries} onNavigateFolder={onNavigateFolder} onOpenConcept={vi.fn()} />);

    const breadcrumb = screen.getByTestId('knowledge-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Knowledge');
    expect(breadcrumb).toHaveTextContent('Cybersecurity');
    expect(breadcrumb).toHaveTextContent('Cryptography');

    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }));
    expect(onNavigateFolder).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    expect(onNavigateFolder).toHaveBeenCalledWith(2);
  });

  it('shows an empty state for a folder with no children', () => {
    render(<KnowledgePage folderId={6} entries={entries} onNavigateFolder={vi.fn()} onOpenConcept={vi.fn()} />);

    expect(screen.getByTestId('knowledge-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-list')).not.toBeInTheDocument();
  });

  it('marks folder and concept-file rows with distinct entry types', () => {
    render(<KnowledgePage folderId={3} entries={entries} onNavigateFolder={vi.fn()} onOpenConcept={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Asymmetric Encryption' })).toHaveAttribute('data-entry-type', 'concept');
  });
});
