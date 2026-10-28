import type { EntityRelation, NewRelation } from '../domain/entity-relation';

export interface EntityRelationWriter {
  addRelation(sourceEntityId: string, input: NewRelation): Promise<void>;
  removeRelation(sourceEntityId: string, relation: EntityRelation): Promise<void>;
}
