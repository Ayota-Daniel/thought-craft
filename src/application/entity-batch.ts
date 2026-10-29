import type { EntityIndex } from '../infrastructure/entity-index';
import type { WorkspaceBoardStore } from './workspace-board-store';
import type { BoardPosition } from '../domain/board';

export interface EntityTrashWriter {
  trashEntity(entityId: string): Promise<void>;
}
export interface BatchResult {
  succeeded: string[];
  cleanupWarning?: string;
  failures: { id: string; title: string; message: string }[];
}

export async function addEntitiesToBoard(
  workspaceId: string,
  ids: readonly string[],
  boards: WorkspaceBoardStore,
  position?: BoardPosition,
): Promise<void> {
  await boards.addEntities(workspaceId, [...new Set(ids)], position);
}

/** Each item is re-resolved at execution; failures never pretend the whole batch succeeded. */
export async function moveEntitiesToTrash(
  workspaceId: string,
  ids: readonly string[],
  index: EntityIndex,
  writer: EntityTrashWriter,
  boards: WorkspaceBoardStore,
): Promise<BatchResult> {
  const result: BatchResult = { succeeded: [], failures: [] };
  for (const id of new Set(ids)) {
    const entity = index.getById(id);
    try {
      if (!entity || entity.workspaceId !== workspaceId)
        throw new Error('This entity is no longer in this Workspace.');
      await writer.trashEntity(id);
      result.succeeded.push(id);
    } catch (error) {
      result.failures.push({
        id,
        title: entity?.title ?? 'Unavailable entity',
        message: error instanceof Error ? error.message : 'Could not move to trash.',
      });
    }
  }
  try {
    await boards.cleanupDeletedEntities();
  } catch {
    result.cleanupWarning =
      'Notes were processed, but layout cleanup could not be saved. Missing cards stay hidden; reload to retry cleanup.';
  }
  return result;
}
