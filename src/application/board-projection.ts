import type { WorkspaceBoardState, BoardPosition } from '../domain/board';
import type { Entity } from '../domain/entity';
import type { EntityRelation } from '../domain/entity-relation';
import type { EntityIndex } from '../infrastructure/entity-index';

export interface BoardEntity {
  entity: Entity;
  position: BoardPosition;
}
export interface BoardRelationship {
  source: Entity;
  target: Entity;
  relation: EntityRelation;
}

/** A derived view: stale/moved entities and off-board/missing endpoints are omitted. */
export function projectBoard(
  board: WorkspaceBoardState,
  index: EntityIndex,
): { entities: BoardEntity[]; relationships: BoardRelationship[] } {
  const entities: BoardEntity[] = [];
  for (const [id, position] of Object.entries(board.nodes)) {
    const entity = index.getById(id);
    if (entity?.workspaceId === board.workspaceId) {
      entities.push({ entity, position });
    }
  }
  const placed = new Map(entities.map(({ entity }) => [entity.id, entity]));
  const relationships: BoardRelationship[] = [];
  for (const { entity: source } of entities) {
    for (const relation of source.relations) {
      const target = placed.get(relation.targetEntityId);
      if (target) {
        relationships.push({ source, target, relation });
      }
    }
  }
  return { entities, relationships };
}
