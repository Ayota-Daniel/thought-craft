import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { WorkspaceBoardStore } from '../../application/workspace-board-store';
import { WorkspaceSwitcher } from '../workspaces/workspace-switcher';
import { WorkspaceTabs } from '../shared/workspace-tabs';
import { useEffect, useRef, useState } from 'react';
import type { EntityIndex } from '../../infrastructure/entity-index';
import {
  queryInbox,
  inboxCandidates,
  EMPTY_INBOX_FILTERS,
  type InboxFilters,
  type InboxSort,
} from '../../application/inbox-query';
import { visibleSelection, toggleSelection, selectRange } from '../../application/entity-selection';
import { InboxControls } from './inbox-controls';
import { InboxRow } from './inbox-row';

export interface InboxProps {
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
  boards: WorkspaceBoardStore;
  manageWorkspaces: () => void;
  index: EntityIndex;
  capture: () => void;
  showBrainstorm: () => void;
  open: (id: string) => void;
  add: (ids: readonly string[]) => Promise<void>;
  trash: (ids: readonly string[]) => void;
  guide: () => void;
}

export function Inbox(props: InboxProps) {
  const { index, workspaces, types, boards } = props;
  const [version, refresh] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_INBOX_FILTERS);
  const [sort, setSort] = useState<InboxSort>('newest');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const anchor = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = [index, workspaces, types, boards].map((service) =>
      service.subscribe(() => refresh((n) => n + 1)),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [index, workspaces, types, boards]);
  const active = workspaces.getActive();
  const all = index.getAll();
  const entities = queryInbox(
    all,
    active.id,
    search,
    filters,
    sort,
    boards.getBoard(active.id),
    types,
  );
  const ids = entities.map((entity) => entity.id);
  const safeSelection = visibleSelection(selected, ids);
  const selectionKey = ids.join(',');
  useEffect(() => {
    setSelected((current) => visibleSelection(current, selectionKey.split(',')));
  }, [selectionKey, active.id, version]);
  const canCapture = workspaces
    .getAvailableEntityTypes(active.id, types)
    .some((type) => type.id === 'idea');
  function clear(): void {
    setSearch('');
    setFilters(EMPTY_INBOX_FILTERS);
  }
  function select(id: string, range: boolean): void {
    setSelected((current) =>
      range
        ? selectRange(current, ids, anchor.current, id)
        : toggleSelection(visibleSelection(current, ids), id),
    );
    anchor.current = id;
  }
  function add(ids: readonly string[]): void {
    if (pending) return;
    setPending(true);
    setError('');
    void props
      .add(ids)
      .then(() => setSelected([]))
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Could not add this selection.'),
      )
      .finally(() => setPending(false));
  }
  const availableTypes = [
    ...new Set(inboxCandidates(all, active.id).map((entity) => entity.type)),
  ].map((id) => ({ id, label: types.label(id) }));
  return (
    <div
      className="tc-inbox"
      id="tc-inbox-panel"
      role="tabpanel"
      aria-labelledby="tc-inbox-inbox-tab"
    >
      <WorkspaceSwitcher workspaces={workspaces} manage={props.manageWorkspaces} />
      <WorkspaceTabs active="Inbox" inbox={() => undefined} brainstorm={props.showBrainstorm} />
      <header className="tc-inbox-header">
        <div>
          <span className="tc-eyebrow">Thought Craft</span>
          <h1>
            Inbox <span className="tc-count">{entities.length}</span>
          </h1>
          <p>A place for thoughts before their next step.</p>
        </div>
        <div className="tc-inbox-header-actions">
          <button onClick={props.guide}>Guide</button>
          <button className="mod-cta" disabled={!canCapture} onClick={props.capture}>
            Capture idea
          </button>
        </div>
      </header>
      <InboxControls
        search={search}
        setSearch={setSearch}
        filters={filters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        types={availableTypes}
        clear={clear}
        empty={entities.length === 0}
      />
      {safeSelection.length > 0 && (
        <div className="tc-inbox-batch" role="region" aria-label="Selected entity actions">
          <span role="status">{safeSelection.length} selected</span>
          <button disabled={pending} onClick={() => add(safeSelection)}>
            Add to Brainstorm
          </button>
          <button disabled={pending} onClick={() => props.trash(safeSelection)}>
            Move to trash
          </button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
      {entities.length === 0 ? (
        <section className="tc-empty">
          <h2>
            {inboxCandidates(all, active.id).length
              ? 'No entities match these filters.'
              : `No ideas in ${active.label} yet.`}
          </h2>
          <p>
            {canCapture
              ? 'Capture a thought or clear your filters to continue.'
              : 'Idea is disabled in this workspace. Enable it in Manage workspaces to capture here.'}
          </p>
          <button onClick={clear}>Clear filters</button>
          {inboxCandidates(all, active.id).length === 0 && (
            <button disabled={!canCapture} onClick={props.capture}>
              Capture your first idea
            </button>
          )}
        </section>
      ) : (
        <ul className="tc-inbox-list">
          {entities.map((entity) => (
            <InboxRow
              key={entity.id}
              entity={entity}
              selected={safeSelection.includes(entity.id)}
              typeLabel={types.label(entity.type)}
              workspaceLabel={active.label}
              select={(range) => select(entity.id, range)}
              open={() => props.open(entity.id)}
              add={() => add([entity.id])}
              trash={() => props.trash([entity.id])}
            />
          ))}
        </ul>
      )}
      <footer className="tc-inbox-footer">
        Entities stay in your vault as ordinary Markdown notes.
      </footer>
    </div>
  );
}
