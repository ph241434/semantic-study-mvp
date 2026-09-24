import { useEffect, useRef, useState } from 'react';

export type NodeLabelEditing = { onSave: (label: string) => void; onCancel: () => void };

/**
 * A node's label, or — while `editing` is set — a focused inline text input in its place. Kept independent of
 * React Flow (no Handle, no node context) so typing/Enter/Escape/blur can be exercised directly in a test without
 * a real canvas. Enter and blur both "settle" the edit exactly once, since a blur can still land right after Enter
 * as the input is removed from the DOM.
 */
export function NodeLabelEditor({ label, editing, className }: { label: string; editing?: NodeLabelEditing; className?: string }) {
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settledRef.current = false;
    setDraft(label);
    inputRef.current?.focus();
    inputRef.current?.select();
    // Only meant to run once, right when this node enters edit mode — not on every label change while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) return <span className={className}>{label}</span>;

  const settle = (action: () => void) => {
    if (settledRef.current) return;
    settledRef.current = true;
    action();
  };
  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) editing.onSave(trimmed);
    else editing.onCancel(); // unchanged or emptied: nothing worth saving, revert
  };

  return (
    <input
      ref={inputRef}
      className="flow-node-label-input"
      aria-label="Step label"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          settle(save);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          settle(editing.onCancel);
        }
      }}
      onBlur={() => settle(save)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
