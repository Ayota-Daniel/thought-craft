import { useEffect, useRef, useState } from 'react';
import type { Entity } from '../../domain/entity';
import {
  STORY_COLLECTIONS,
  queryStory,
  type StorySort,
  type StoryType,
} from '../../application/story-query';
import { paginateInbox, type InboxPageSize } from '../../application/inbox-pagination';
import { InboxPagination } from '../inbox/inbox-pagination';
import { InboxRow } from '../inbox/inbox-row';

export function StoryCollection({
  entities,
  workspaceId,
  workspaceLabel,
  type,
  typeLabel,
  available,
  enabled,
  create,
  open,
  add,
  trash,
  manageTypes,
}: {
  entities: readonly Entity[];
  workspaceId: string;
  workspaceLabel: string;
  type: StoryType;
  typeLabel: string;
  available: boolean;
  enabled: boolean;
  create: () => void;
  open: (id: string) => void;
  add: (id: string) => void;
  trash: (id: string) => void;
  manageTypes: () => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<StorySort>('updated');
  const [pageSize, setPageSize] = useState<InboxPageSize>(50);
  const [page, setPage] = useState(1);
  const resultsRef = useRef<HTMLDivElement>(null);
  const collection = STORY_COLLECTIONS.find((item) => item.id === type)!;
  const results = queryStory(entities, workspaceId, type, search, sort);
  const pagination = paginateInbox(results, page, pageSize);
  useEffect(() => setPage(pagination.page), [pagination.page]);
  function changePage(next: number): void {
    setPage(next);
    resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  return (
    <section aria-label={collection.label}>
      <header className="tc-story-collection-header">
        <h2>{collection.label}</h2>
        <button disabled={!available || !enabled} onClick={create}>
          + {collection.singular}
        </button>
      </header>
      {!available && (
        <div className="tc-story-unavailable">
          <p>{collection.singular} type unavailable. Existing notes remain readable.</p>
          <button onClick={manageTypes}>Manage Entity Types</button>
        </div>
      )}
      {available && !enabled && (
        <p className="tc-inspector-hint">
          {collection.singular} creation is disabled in this Workspace. Enable it in Story setup.
        </p>
      )}
      <div className="tc-story-search">
        <label>
          <span className="tc-visually-hidden">Search {collection.label.toLowerCase()}</span>
          <input
            type="search"
            placeholder={`Search ${collection.label.toLowerCase()}…`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="tc-visually-hidden">Sort {collection.label.toLowerCase()}</span>
          <select
            aria-label={`Sort ${collection.label.toLowerCase()}`}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as StorySort);
              setPage(1);
            }}
          >
            <option value="updated">Recently updated</option>
            <option value="newest">Newest created</option>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </label>
      </div>
      <div ref={resultsRef} />
      {pagination.total ? (
        <ul className="tc-inbox-list tc-story-list">
          {pagination.items.map((entity) => (
            <InboxRow
              key={entity.id}
              entity={entity}
              typeLabel={typeLabel}
              workspaceLabel={workspaceLabel}
              selected={false}
              selectable={false}
              select={() => undefined}
              open={() => open(entity.id)}
              add={() => add(entity.id)}
              trash={() => trash(entity.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="tc-empty">
          <h3>
            {search.trim()
              ? `No ${collection.label.toLowerCase()} match this search.`
              : `No ${collection.label.toLowerCase()} yet.`}
          </h3>
          {!search.trim() && collection.hint && <p>{collection.hint}</p>}
          {search.trim() ? (
            <button
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
            >
              Clear search
            </button>
          ) : (
            <button disabled={!available || !enabled} onClick={create}>
              Create {collection.singular}
            </button>
          )}
        </div>
      )}
      <InboxPagination
        {...pagination}
        label={`${collection.label} pagination`}
        pageSize={pageSize}
        changePage={changePage}
        changeSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
