import type { EntityIndex } from '../infrastructure/entity-index';
import type { WorkspaceBoardState } from '../domain/board';
import { contextualNeighbors } from './contextual-brainstorm';

export function validFocusRoots(
  roots: readonly string[],
  board: WorkspaceBoardState,
  index: EntityIndex,
): string[] {
  return [...new Set(roots)].filter(
    (id) => board.nodes[id] && index.getById(id)?.workspaceId === board.workspaceId,
  );
}

/** One hop from each root. Neighbors are never recursively expanded. */
export function focusVisibility(
  roots: readonly string[],
  board: WorkspaceBoardState,
  index: EntityIndex,
): ReadonlySet<string> | null {
  const valid = validFocusRoots(roots, board, index);
  if (!valid.length) return null;
  const visible = new Set<string>();
  for (const id of valid) {
    for (const neighbor of contextualNeighbors(id, index)) {
      if (board.nodes[neighbor] && index.getById(neighbor)?.workspaceId === board.workspaceId)
        visible.add(neighbor);
    }
  }
  return visible;
}
