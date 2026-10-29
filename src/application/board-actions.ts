import type { BoardPosition } from '../domain/board';
import { nextBoardPosition, validateBoardPosition } from '../domain/board';
import { validateNewRelation } from '../domain/entity-relation';
import type { EntityIndex } from '../infrastructure/entity-index';
import type { EntityTypeRegistry } from './entity-type-registry';
import type { RelationTypeRegistry } from './relation-type-registry';
import type { WorkspaceRegistry } from './workspace-registry';
import type { WorkspaceBoardStore } from './workspace-board-store';
import type { EntityWriter } from './create-entity';
import { captureIdea } from './capture-idea';

export async function createBoardIdea(
  content: string,
  workspaceId: string,
  position: BoardPosition,
  writer: EntityWriter,
  boards: WorkspaceBoardStore,
  workspaces: WorkspaceRegistry,
  types: EntityTypeRegistry,
) {
  workspaces.validateCreation(workspaceId, 'idea', types);
  validateBoardPosition(position);
  const entity = await captureIdea(content, workspaceId, writer);
  try {
    await boards.addEntity(
      workspaceId,
      entity.id,
      nextBoardPosition(boards.getBoard(workspaceId), position),
    );
  } catch {
    throw new Error(
      `Your idea is saved in ${entity.filePath}, but could not be placed. Use Add existing to retry without creating another idea.`,
    );
  }
  return entity;
}

/** All board relation choices use the existing domain rules, outside React. */
export function availableBoardRelations(
  workspaceId: string,
  sourceId: string,
  targetId: string,
  boards: WorkspaceBoardStore,
  index: EntityIndex,
  relations: RelationTypeRegistry,
) {
  const source = index.getById(sourceId);
  const target = index.getById(targetId);
  const board = boards.getBoard(workspaceId);
  if (
    !source ||
    !target ||
    source.workspaceId !== workspaceId ||
    target.workspaceId !== workspaceId ||
    !board.nodes[sourceId] ||
    !board.nodes[targetId]
  ) {
    return [];
  }
  return relations.getAvailableForSource(source).filter((definition) => {
    try {
      validateNewRelation(
        source.id,
        { type: definition.id, targetEntityId: target.id },
        source.relations,
      );
      relations.validateNew(source, target, definition.id);
      return true;
    } catch {
      return false;
    }
  });
}
