import type { EntityType } from './entity-type';
import type { WorkspaceId } from './workspace';
import type { CustomProperty } from './custom-property';
import type { EntityRelation } from './entity-relation';

export type EntityStatus = 'inbox' | 'exploring' | 'archived';
export interface Entity {
  readonly id: string;
  readonly type: EntityType;
  readonly title: string;
  readonly workspaceId: WorkspaceId;
  readonly status: EntityStatus;
  readonly filePath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly properties: readonly CustomProperty[];
  readonly propertyIssues: readonly string[];
  readonly schemaValues: unknown;
  readonly relations: readonly EntityRelation[];
  readonly relationIssues: readonly string[];
}
