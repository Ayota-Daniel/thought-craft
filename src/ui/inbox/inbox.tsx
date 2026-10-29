import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import { WorkspaceSwitcher } from '../workspaces/workspace-switcher';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { EntityIndex } from '../../infrastructure/entity-index';

interface InboxProps {
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
  manageWorkspaces: () => void;
  index: EntityIndex;
  capture: () => void;
  showBrainstorm: () => void;
  open: (id: string) => void;
}
const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Inbox({
  index,
  capture,
  open,
  workspaces,
  types,
  manageWorkspaces,
  showBrainstorm,
}: InboxProps) {
  const allInbox = useSyncExternalStore(index.subscribe, index.getInbox);
  const [, refresh] = useState(0);
  useEffect(() => workspaces.subscribe(() => refresh((version) => version + 1)), [workspaces]);
  useEffect(() => types.subscribe(() => refresh((version) => version + 1)), [types]);
  const active = workspaces.getActive();
  const entities = allInbox.filter((entity) => entity.workspaceId === active.id);
  const canCapture = workspaces
    .getAvailableEntityTypes(active.id, types)
    .some((type) => type.id === 'idea');
  return (
    <div className="tc-inbox">
      <WorkspaceSwitcher workspaces={workspaces} manage={manageWorkspaces} />
      <nav className="tc-view-switcher" aria-label="Thoughtcraft views">
        <button aria-current="page">Inbox</button>
        <button onClick={showBrainstorm}>Brainstorm</button>
      </nav>
      <header className="tc-inbox-header">
        <div>
          <span className="tc-eyebrow">Thought Craft</span>
          <h1>
            Inbox <span className="tc-count">{entities.length}</span>
          </h1>
          <p>A place for thoughts before their next step.</p>
        </div>
        <button className="mod-cta" disabled={!canCapture} onClick={capture}>
          Capture idea
        </button>
      </header>
      {entities.length === 0 ? (
        <section className="tc-empty">
          <h2>No ideas in {active.label} yet.</h2>
          <p>
            {canCapture
              ? 'Capture a thought to save it as a Markdown note in your vault.'
              : 'Idea is disabled in this workspace. Enable it in Manage workspaces to capture here.'}
          </p>
          <button disabled={!canCapture} onClick={capture}>
            Capture your first idea
          </button>
        </section>
      ) : (
        <ul className="tc-inbox-list">
          {entities.map((entity) => (
            <li key={entity.id}>
              <button className="tc-inbox-row" onClick={() => open(entity.id)}>
                <span className="tc-row-main">
                  <span className="tc-row-title">{entity.title}</span>
                  <span className="tc-row-workspace">{entity.workspaceId}</span>
                </span>
                <time
                  dateTime={entity.createdAt}
                  title={`Created: ${entity.createdAt}\nUpdated: ${entity.updatedAt}`}
                >
                  {formatter.format(new Date(entity.createdAt))}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
      <footer className="tc-inbox-footer">
        Ideas stay in your vault as ordinary Markdown notes.
      </footer>
    </div>
  );
}
