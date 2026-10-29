import {
  INBOX_PAGE_SIZES,
  paginationButtons,
  type InboxPageSize,
} from '../../application/inbox-pagination';

export function InboxPagination({
  label = 'Inbox pagination',
  page,
  pageCount,
  first,
  last,
  total,
  pageSize,
  changePage,
  changeSize,
}: {
  label?: string;
  page: number;
  pageCount: number;
  first: number;
  last: number;
  total: number;
  pageSize: InboxPageSize;
  changePage: (page: number) => void;
  changeSize: (size: InboxPageSize) => void;
}) {
  if (!total) return null;
  return (
    <nav className="tc-pagination" aria-label={label}>
      <span role="status">
        Showing {first}–{last} of {total}
      </span>
      <label>
        <span className="tc-visually-hidden">Rows per page</span>
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => changeSize(Number(event.target.value) as InboxPageSize)}
        >
          {INBOX_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
      </label>
      <div className="tc-page-buttons">
        <button disabled={page <= 1} onClick={() => changePage(page - 1)}>
          ‹ Previous
        </button>
        {paginationButtons(page, pageCount).map((value, index) =>
          value === 'ellipsis' ? (
            <span key={`gap-${index}`} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={value}
              aria-label={`Page ${value}`}
              aria-current={value === page ? 'page' : undefined}
              onClick={() => changePage(value)}
            >
              {value}
            </button>
          ),
        )}
        <button disabled={page >= pageCount} onClick={() => changePage(page + 1)}>
          Next ›
        </button>
      </div>
    </nav>
  );
}
