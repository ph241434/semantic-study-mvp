import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type ContextMenuItem = { label: string; onSelect: () => void };

type Props = { x: number; y: number; items: ContextMenuItem[]; onClose: () => void };

/** A small, dependency-free right-click menu. Clamped to the viewport; closes on outside click, Escape, or scroll. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: y, left: x, visibility: 'hidden' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setStyle({ position: 'fixed', left: Math.max(8, left), top: Math.max(8, top), visibility: 'visible' });
  }, [x, y]);

  useLayoutEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="flow-context-menu" style={style} role="menu" data-testid="flow-context-menu">
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          role="menuitem"
          className="flow-context-menu-item"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
