import type { Entity } from '../domain/entity';
import { nextBoardPosition } from '../domain/board';
import { groupForEntity } from '../domain/board-group';
import { validateNewRelation } from '../domain/entity-relation';
import { deriveTitle } from '../shared/note-path';
import type { EntityIndex } from '../infrastructure/entity-index';
import type { WorkspaceBoardStore } from './workspace-board-store';
import type { WorkspaceRegistry } from './workspace-registry';
import type { EntityTypeRegistry } from './entity-type-registry';
import type { RelationTypeRegistry } from './relation-type-registry';
import type { EntityWriter } from './create-entity';

interface ContextServices {
  index: EntityIndex;
  boards: WorkspaceBoardStore;
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
  relations: RelationTypeRegistry;
  writer: EntityWriter;
}

export async function prepareBrainstormContext(
  entityId: string,
  services: Pick<ContextServices, 'index' | 'boards' | 'workspaces'>,
): Promise<Entity> {
  const entity = services.index.getById(entityId);
  if (!entity) {
    throw new Error('This entity is no longer available.');
  }
  const workspace = services.workspaces.get(entity.workspaceId);
  if (!workspace || workspace.retired) {
    throw new Error('Restore or configure this Workspace before using its board.');
  }
  const board = services.boards.getBoard(entity.workspaceId);
  if (!board.nodes[entity.id]) {
    await services.boards.addEntity(entity.workspaceId, entity.id, nextBoardPosition(board));
  }
  await services.workspaces.setActive(entity.workspaceId);
  return entity;
}

/** Includes incoming and outgoing neighbors; never places them automatically. */
export function contextualNeighbors(rootId: string, index: EntityIndex): ReadonlySet<string> {
  const ids = new Set<string>([rootId]);
  for (const { target } of index.getOutgoingRelations(rootId)) {
    if (target) {
      ids.add(target.id);
    }
  }
  for (const { source } of index.getIncomingRelations(rootId)) {
    ids.add(source.id);
  }
  return ids;
}

export function connectedIdeaRelations(
  rootId: string,
  services: Pick<ContextServices, 'index' | 'relations'>,
) {
  const root = services.index.getById(rootId);
  if (!root) {
    return [];
  }
  const source = {
    id: globalThis.crypto.randomUUID(),
    type: 'idea',
    workspaceId: root.workspaceId,
  };
  return services.relations.getAvailableForSource(source).filter((definition) => {
    try {
      validateNewRelation(source.id, { type: definition.id, targetEntityId: root.id }, []);
      services.relations.validateNew(source, root, definition.id);
      return true;
    } catch {
      return false;
    }
  });
}

export class ConnectedIdeaPlacementError extends Error {
  constructor(readonly filePath: string) {
    super(
      `Your connected idea is saved in ${filePath}. Use Add existing to place it; do not create it again.`,
    );
  }
}

/** The real note and its one directed relation are created together by the existing writer. */
export async function createConnectedIdea(
  rootId: string,
  content: string,
  relationType: string,
  services: ContextServices,
): Promise<Entity> {
  const root = services.index.getById(rootId);
  if (!root || !services.boards.getBoard(root.workspaceId).nodes[root.id]) {
    throw new Error('The context root is no longer on this board.');
  }
  if (!content.trim()) {
    throw new Error('Write an idea before creating it.');
  }
  services.workspaces.validateCreation(root.workspaceId, 'idea', services.types);
  const id = globalThis.crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const relation = {
    id: globalThis.crypto.randomUUID(),
    type: relationType,
    targetEntityId: root.id,
    createdAt,
  };
  validateNewRelation(id, relation, []);
  services.relations.validateNew(
    { id, type: 'idea', workspaceId: root.workspaceId },
    root,
    relationType,
  );
  const entity = await services.writer.createEntity({
    id,
    type: 'idea',
    title: deriveTitle(content),
    content,
    workspaceId: root.workspaceId,
    createdAt,
    relations: [relation],
  });
  try {
    // Re-read layout after the write: the root/group might have moved while saving Markdown.
    const board = services.boards.getBoard(root.workspaceId);
    const position = board.nodes[root.id];
    if (!position) {
      throw new Error('The root was removed during creation.');
    }
    const preferred = { x: position.x + 280, y: position.y };
    await services.boards.addEntity(
      root.workspaceId,
      entity.id,
      nextBoardPosition(board, preferred),
      groupForEntity(board, root.id)?.id,
    );
  } catch {
    throw new ConnectedIdeaPlacementError(entity.filePath);
  }
  return entity;
}
