import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { placePopover } from './popover-placement';

/** Native top-layer popover: outside dismissal and Escape do not depend on parent overflow. */
export function FloatingPopover({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = panel.current;
    const anchor = trigger.current;
    const view = anchor?.ownerDocument.defaultView;
    if (!element || !anchor || !view) return;

    const position = (): void => {
      if (!element.matches(':popover-open')) return;
      if (!anchor.getClientRects().length) {
        element.hidePopover();
        return;
      }
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > view.innerHeight) {
        element.hidePopover();
        return;
      }
      // Set width before measuring: narrow content wraps and needs a different height.
      element.style.width = `${Math.min(280, view.innerWidth - 16)}px`;
      element.style.maxHeight = 'none';
      const placement = placePopover(bounds, element.getBoundingClientRect().height, {
        width: view.innerWidth,
        height: view.innerHeight,
      });
      Object.assign(element.style, {
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        width: `${placement.width}px`,
        maxHeight: `${placement.maxHeight}px`,
      });
    };
    const toggle = () => {
      const shown = element.matches(':popover-open');
      setOpen(shown);
      if (shown) position();
    };
    element.addEventListener('toggle', toggle);
    view.addEventListener('resize', position);
    const scroll = (event: Event) => {
      if (event.target && event.target !== view && element.contains(event.target as Node)) return;
      position();
    };
    view.addEventListener('scroll', scroll, true);
    const observer = new ResizeObserver(position);
    observer.observe(anchor);
    // Obsidian panes resize independently of the desktop window. The button itself
    // can keep its size while its position changes inside a narrower content area.
    const pane = anchor.closest('.view-content');
    if (pane) observer.observe(pane);
    if (anchor.parentElement) observer.observe(anchor.parentElement);
    return () => {
      observer.disconnect();
      element.removeEventListener('toggle', toggle);
      view.removeEventListener('resize', position);
      view.removeEventListener('scroll', scroll, true);
    };
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tc-filter-trigger"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
      >
        {label}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="tc-floating-popover"
        role="dialog"
        aria-label="Inbox filters"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            panel.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}
