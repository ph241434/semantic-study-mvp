import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NodeLabelEditor } from './NodeLabelEditor';

describe('NodeLabelEditor', () => {
  afterEach(cleanup);

  it('renders plain text, not an input, when not editing', () => {
    render(<NodeLabelEditor label="New step" />);
    expect(screen.getByText('New step')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a focused, pre-selected input seeded with the current label when editing starts', () => {
    render(<NodeLabelEditor label="New step" editing={{ onSave: vi.fn(), onCancel: vi.fn() }} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toHaveValue('New step');
    expect(input).toHaveFocus();
  });

  it('typing updates the field, and Enter saves the trimmed, changed label', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel }} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '  Choose toppings  ' } });
    expect(input).toHaveValue('  Choose toppings  ');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('Choose toppings');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape cancels without saving, discarding the typed text', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel }} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something else' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clicking away (blur) saves a changed label', () => {
    const onSave = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel: vi.fn() }} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Choose toppings' } });
    fireEvent.blur(screen.getByRole('textbox'));

    expect(onSave).toHaveBeenCalledWith('Choose toppings');
  });

  it('Enter with an unchanged or emptied label cancels instead of saving a no-op', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel }} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); // unchanged
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    cleanup();
    const onSave2 = vi.fn();
    const onCancel2 = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave: onSave2, onCancel: onCancel2 }} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } }); // emptied
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onCancel2).toHaveBeenCalledTimes(1);
    expect(onSave2).not.toHaveBeenCalled();
  });

  it('never fires both a save and a cancel for the same edit — a blur right after Enter does not double-fire', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel }} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Choose toppings' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input); // the DOM can still emit blur right as the input is removed

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a fresh edit session (component remounted) is not affected by a previous session already having settled', () => {
    const onSave = vi.fn();
    const view = render(<NodeLabelEditor label="New step" editing={{ onSave, onCancel: vi.fn() }} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' }); // settle #1: cancel
    view.unmount();

    const onSave2 = vi.fn();
    render(<NodeLabelEditor label="New step" editing={{ onSave: onSave2, onCancel: vi.fn() }} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Choose toppings' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSave2).toHaveBeenCalledWith('Choose toppings');
  });
});
