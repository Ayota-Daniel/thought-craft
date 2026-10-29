import type { EntityIndex } from '../../infrastructure/entity-index';
import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { RelationTypeRegistry } from '../../application/relation-type-registry';
import type { WorkspaceBoardStore } from '../../application/workspace-board-store';
import type { EntityWriter } from '../../application/create-entity';
import type { EntityRelationWriter } from '../../application/entity-relations';
import type { BoardPosition } from '../../domain/board';
import type { EntityRelation } from '../../domain/entity-relation';

export interface BoardServices {
  index: EntityIndex;
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
  relations: RelationTypeRegistry;
  boards: WorkspaceBoardStore;
  writer: EntityWriter & EntityRelationWriter;
}

export interface BoardCommands {
  openFocus: (entityId: string) => void;
  showInbox: () => void;
  manageWorkspaces: () => void;
  createIdea: (workspaceId: string, position: BoardPosition) => void;
  addExisting: (workspaceId: string, position: BoardPosition) => void;
  connect: (workspaceId: string, sourceId: string, targetId: string) => void;
  removeRelationship: (sourceId: string, relation: EntityRelation) => void;
}
