import type { EntityRelation, NewRelation } from '../domain/entity-relation';

/** Optional commit-time scope for contextual tools; generic relation behavior stays unchanged. */
export interface RelationWriteScope {
  workspaceId: string;
  sourceType: string;
  targetType: string;
}

export interface EntityRelationWriter {
  /** Storage adapters refresh before a membership no-op/retry; in-memory writers are already current. */
  refreshEntity?(entityId: string): Promise<void>;
  addRelation(
    sourceEntityId: string,
    input: NewRelation,
    scope?: RelationWriteScope,
  ): Promise<void>;
  removeRelation(sourceEntityId: string, relation: EntityRelation): Promise<void>;
}
