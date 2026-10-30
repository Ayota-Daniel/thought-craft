import type { EntityRelation, NewRelation } from '../domain/entity-relation';

/** Optional commit-time scope for contextual tools; generic relation behavior stays unchanged. */
export interface RelationWriteScope {
  workspaceId: string;
  sourceType: string;
  targetType: string;
}

export interface EntityRelationWriter {
  addRelation(
    sourceEntityId: string,
    input: NewRelation,
    scope?: RelationWriteScope,
  ): Promise<void>;
  removeRelation(sourceEntityId: string, relation: EntityRelation): Promise<void>;
}
