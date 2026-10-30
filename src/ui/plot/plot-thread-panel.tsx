import { useEffect, useRef, useState } from 'react';
import type { Entity } from '../../domain/entity';
import type { ProjectedThread } from '../../application/plot-threads';
import { threadAssociations } from '../../application/plot-threads';
import { paginateInbox, type InboxPageSize } from '../../application/inbox-pagination';
import { InboxPagination } from '../inbox/inbox-pagination';

export function PlotThreadPanel({
  threads,
  selected,
  select,
  mode,
  changeMode,
  scene,
  finishEditing,
  pending,
  membership,
  focus,
  write,
  create,
  canCreate,
  guide,
  expanded,
  expand,
}: {
  threads: ProjectedThread[];
  selected: readonly string[];
  select: (ids: string[]) => void;
  mode: 'highlight' | 'filter';
  changeMode: (mode: 'highlight' | 'filter') => void;
  scene: Entity | undefined;
  finishEditing: () => void;
  pending: boolean;
  membership: (threadId: string, associated: boolean) => void;
  focus: (id: string) => void;
  write: (id: string) => void;
  create: () => void;
  canCreate: boolean;
  guide: () => void;
  expanded: boolean;
  expand: (open: boolean) => void;
}) {
  const summaryRef = useRef<HTMLElement>(null);
  const editingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scene) {
      editingRef.current?.focus();
      editingRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [scene?.id]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<InboxPageSize>(25);
  const matches = threads.filter(({ entity }) =>
    entity.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const pagination = paginateInbox(matches, page, size);
  useEffect(() => setPage(pagination.page), [pagination.page]);
  return (
    <details
      className="tc-plot-threads"
      open={expanded}
      onToggle={(event) => expand(event.currentTarget.open)}
    >
      <summary ref={summaryRef}>
        Plot Threads <span className="tc-count">{threads.length}</span>
      </summary>
      <p className="tc-inspector-hint">
        Optional narrative developments across scenes. Select one or more threads; scenes matching
        any selected thread are included.
      </p>
      <div className="tc-thread-controls">
        <button disabled={!canCreate || pending} onClick={create}>
          + Plot Thread
        </button>
        <button onClick={guide}>Understanding Plot Threads</button>
        <label>
          <span className="tc-visually-hidden">Search Plot Threads</span>
          <input
            type="search"
            placeholder="Search threads…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          View
          <select
            aria-label="Thread view mode"
            value={mode}
            onChange={(event) => changeMode(event.target.value as 'highlight' | 'filter')}
          >
            <option value="highlight">Highlight matches</option>
            <option value="filter">Filter to matches</option>
          </select>
        </label>
        <button disabled={!selected.length} onClick={() => select([])}>
          Show full Plot
        </button>
      </div>
      {scene && (
        <div
          className="tc-thread-editing"
          ref={editingRef}
          tabIndex={-1}
          role="group"
          aria-label={`Threads for ${scene.title}`}
        >
          <strong>Threads for {scene.title}</strong>
          <span>Use Add / Remove below. Other relationships stay in Focus.</span>
          <button
            onClick={() => {
              summaryRef.current?.focus();
              finishEditing();
            }}
          >
            Done
          </button>
        </div>
      )}
      {!threads.length && (
        <p>
          No Plot Threads yet. You can keep writing, or create a thread when a question or conflict
          begins to connect scenes.
        </p>
      )}
      {threads.length > 0 && !matches.length && <p>No matching threads.</p>}
      <ul className="tc-thread-list">
        {pagination.items.map(({ entity, sequence, unplaced }) => {
          const associated = Boolean(scene && threadAssociations(scene, entity).length);
          return (
            <li key={entity.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(entity.id)}
                  aria-label={`Select thread ${entity.title}`}
                  onChange={(event) => {
                    select(
                      event.target.checked
                        ? [...selected, entity.id]
                        : selected.filter((id) => id !== entity.id),
                    );
                  }}
                />
                <span>{entity.title}</span>
                <span className="tc-count">{sequence.length + unplaced.length}</span>
              </label>
              {scene && (
                <button
                  disabled={pending}
                  aria-label={`${associated ? 'Remove' : 'Add'} ${entity.title} ${associated ? 'from' : 'to'} ${scene.title}`}
                  onClick={() => membership(entity.id, !associated)}
                >
                  {associated ? 'Remove' : 'Add'}
                </button>
              )}
              <button
                aria-label={`Open thread ${entity.title} in Focus`}
                onClick={() => focus(entity.id)}
              >
                Open Focus
              </button>
            </li>
          );
        })}
      </ul>
      <InboxPagination
        {...pagination}
        label="Plot Threads pagination"
        pageSize={size}
        changePage={setPage}
        changeSize={(next) => {
          setSize(next);
          setPage(1);
        }}
      />
      {threads
        .filter(({ entity }) => selected.includes(entity.id))
        .map((thread) => (
          <ThreadProgression key={thread.entity.id} thread={thread} focus={focus} write={write} />
        ))}
    </details>
  );
}

function ThreadProgression({
  thread,
  focus,
  write,
}: {
  thread: ProjectedThread;
  focus: (id: string) => void;
  write: (id: string) => void;
}) {
  return (
    <section className="tc-thread-progression" aria-label={`Progression of ${thread.entity.title}`}>
      <h3>{thread.entity.title} · narrative sequence</h3>
      {!thread.sequence.length && (
        <p className="tc-inspector-hint">No placed scenes in this thread.</p>
      )}
      {thread.hasUnavailableLinks && (
        <p className="tc-plot-issue">
          Unavailable or invalid related links. Open this thread in Focus to inspect them.
        </p>
      )}
      <ol>
        {thread.sequence.map(({ scene, section }) => (
          <li key={scene.id}>
            <span className="tc-inspector-hint">{section.title}</span>
            <button onClick={() => focus(scene.id)}>{scene.title}</button>
            <button aria-label={`Write ${scene.title} from thread`} onClick={() => write(scene.id)}>
              Write
            </button>
          </li>
        ))}
      </ol>
      {thread.unplaced.length > 0 && (
        <>
          <h4>Unplaced · no narrative position</h4>
          <ul>
            {thread.unplaced.map(({ entity, issue }) => (
              <li key={entity.id}>
                <button onClick={() => focus(entity.id)}>{entity.title}</button>
                {issue && <span className="tc-plot-issue">{issue}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!thread.sequence.length && !thread.unplaced.length && (
        <p className="tc-inspector-hint">
          Use a Scene’s actions → Plot Threads… to associate scenes.
        </p>
      )}
    </section>
  );
}
