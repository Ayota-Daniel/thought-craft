import { type KeyboardEvent } from 'react';

type WorkspaceView = 'Inbox' | 'Brainstorm' | 'Story';
export function WorkspaceTabs({
  active,
  inbox,
  brainstorm,
  story,
}: {
  active: WorkspaceView;
  inbox: () => void;
  brainstorm: () => void;
  story?: () => void;
}) {
  const views: WorkspaceView[] = story ? ['Inbox', 'Brainstorm', 'Story'] : ['Inbox', 'Brainstorm'];
  function navigate(label: WorkspaceView, keyboard = false): void {
    if (label !== active) {
      if (label === 'Inbox') inbox();
      if (label === 'Brainstorm') brainstorm();
      if (label === 'Story') story?.();
    }
    if (keyboard) {
      // Native ItemViews are separate mounted panels. Restore focus in the revealed view.
      let attempts = 0;
      const focusActive = () => {
        const candidates = document.querySelectorAll<HTMLButtonElement>(
          '.tc-view-tabs [role="tab"][aria-selected="true"]',
        );
        const target = Array.from(candidates).find(
          (button) => button.offsetParent !== null && button.textContent === label,
        );
        if (target) target.focus();
        else if (attempts++ < 20) requestAnimationFrame(focusActive);
      };
      requestAnimationFrame(focusActive);
    }
  }
  function keydown(event: KeyboardEvent): void {
    const current = views.indexOf(active);
    let index: number | null = null;
    if (event.key === 'ArrowRight') index = (current + 1) % views.length;
    if (event.key === 'ArrowLeft') index = (current + views.length - 1) % views.length;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = views.length - 1;
    if (index !== null) {
      event.preventDefault();
      navigate(views[index]!, true);
    }
  }
  return (
    <div
      className="tc-view-tabs"
      role="tablist"
      aria-label="Thoughtcraft views"
      onKeyDown={keydown}
    >
      {views.map((view) => (
        <button
          key={view}
          role="tab"
          id={`tc-${active.toLowerCase()}-${view.toLowerCase()}-tab`}
          aria-controls={`tc-${view.toLowerCase()}-panel`}
          aria-selected={view === active}
          tabIndex={view === active ? 0 : -1}
          onClick={() => navigate(view)}
        >
          {view}
        </button>
      ))}
    </div>
  );
}
