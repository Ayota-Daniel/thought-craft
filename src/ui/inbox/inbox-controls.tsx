import { FloatingPopover } from '../shared/floating-popover';
import type { InboxFilters, InboxSort } from '../../application/inbox-query';

export function InboxControls({
  search,
  setSearch,
  filters,
  setFilters,
  sort,
  setSort,
  types,
  clear,
  empty,
}: {
  search: string;
  setSearch: (value: string) => void;
  filters: InboxFilters;
  setFilters: (filters: InboxFilters) => void;
  sort: InboxSort;
  setSort: (sort: InboxSort) => void;
  types: readonly { id: string; label: string }[];
  clear: () => void;
  empty: boolean;
}) {
  const active = Boolean(
    search ||
    filters.type ||
    filters.board !== 'all' ||
    filters.relations !== 'all' ||
    filters.recent,
  );
  return (
    <div className="tc-inbox-controls">
      <label className="tc-inbox-search">
        <span className="tc-visually-hidden">Search ideas and entities</span>
        <input
          type="search"
          value={search}
          placeholder="Search ideas and entities…"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <FloatingPopover label={`Filters${active ? ' · active' : ''}`}>
        <div className="tc-inbox-filter-fields">
          <label>
            Entity type
            <select
              aria-label="Entity type"
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value })}
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            On Brainstorm
            <select
              aria-label="On Brainstorm"
              value={filters.board}
              onChange={(event) =>
                setFilters({ ...filters, board: event.target.value as InboxFilters['board'] })
              }
            >
              <option value="all">All entities</option>
              <option value="on">On board</option>
              <option value="off">Not on board</option>
            </select>
          </label>
          <label>
            Relations
            <select
              aria-label="Relations"
              value={filters.relations}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  relations: event.target.value as InboxFilters['relations'],
                })
              }
            >
              <option value="all">All entities</option>
              <option value="has">Has relations</option>
              <option value="none">No relations</option>
            </select>
          </label>
          <label className="tc-filter-recent">
            <input
              type="checkbox"
              checked={filters.recent}
              onChange={(event) => setFilters({ ...filters, recent: event.target.checked })}
            />
            Updated in the last 7 days
          </label>
        </div>
      </FloatingPopover>
      <label className="tc-inbox-sort">
        <span className="tc-visually-hidden">Sort entities</span>
        <select
          aria-label="Sort entities"
          value={sort}
          onChange={(event) => setSort(event.target.value as InboxSort)}
        >
          <option value="newest">Newest created</option>
          <option value="updated">Recently updated</option>
          <option value="oldest">Oldest created</option>
          <option value="az">A–Z</option>
          <option value="za">Z–A</option>
        </select>
      </label>
      {active && !empty && <button onClick={clear}>Clear filters</button>}
    </div>
  );
}
