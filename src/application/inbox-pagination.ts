export const INBOX_PAGE_SIZES = [25, 50, 100] as const;
export type InboxPageSize = (typeof INBOX_PAGE_SIZES)[number];

/** Pagination is the final view step; callers must supply already queried/sorted results. */
export function paginateInbox<T>(
  results: readonly T[],
  requestedPage: number,
  pageSize: InboxPageSize,
) {
  const pageCount = Math.ceil(results.length / pageSize);
  const page = Math.max(1, Math.min(Math.trunc(requestedPage) || 1, pageCount || 1));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    total: results.length,
    first: results.length ? start + 1 : 0,
    last: Math.min(start + pageSize, results.length),
    items: results.slice(start, start + pageSize),
  };
}

export function paginationButtons(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const buttons: (number | 'ellipsis')[] = [];
  visible.forEach((value, index) => {
    const previous = visible[index - 1];
    if (previous !== undefined && value - previous > 1) buttons.push('ellipsis');
    buttons.push(value);
  });
  return buttons;
}
