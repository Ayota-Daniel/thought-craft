/** Selection is always intersected with currently visible IDs before any batch action. */
export function visibleSelection(
  selected: readonly string[],
  visible: readonly string[],
): string[] {
  const allowed = new Set(visible);
  return selected.filter((id) => allowed.has(id));
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function selectRange(
  selected: readonly string[],
  visible: readonly string[],
  anchor: string | null,
  target: string,
): string[] {
  const start = anchor ? visible.indexOf(anchor) : -1;
  const end = visible.indexOf(target);
  if (start < 0 || end < 0) return toggleSelection(visibleSelection(selected, visible), target);
  const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1);
  return [...new Set([...visibleSelection(selected, visible), ...range])];
}
