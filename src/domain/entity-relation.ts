import { isTimestamp, isUuid } from '../shared/metadata-validation';

export type RelationType =
  'related-to' | 'supports' | 'alternative-to' | 'depends-on' | 'originated-from';

export const RELATION_TYPES: Readonly<Record<RelationType, string>> = {
  'related-to': 'Related to',
  supports: 'Supports',
  'alternative-to': 'Alternative to',
  'depends-on': 'Depends on',
  'originated-from': 'Originated from',
};

export interface EntityRelation {
  readonly id: string;
  readonly type: RelationType;
  readonly targetEntityId: string;
  readonly createdAt: string;
}

export interface NewRelation {
  type: RelationType;
  targetEntityId: string;
}

export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RELATION_TYPES, value);
}

export function validateRelation(relation: EntityRelation): void {
  if (!isUuid(relation.id) || !isUuid(relation.targetEntityId)) {
    throw new Error('Relations need their own UUID and a target entity UUID.');
  }
  if (!isRelationType(relation.type)) {
    throw new Error('Choose a supported relation type.');
  }
  if (!isTimestamp(relation.createdAt)) {
    throw new Error('A relation needs a valid creation timestamp.');
  }
}

export function validateNewRelation(
  sourceEntityId: string,
  input: NewRelation,
  existingRelations: readonly EntityRelation[],
): void {
  if (!isUuid(sourceEntityId) || !isUuid(input.targetEntityId) || !isRelationType(input.type)) {
    throw new Error('Choose a valid entity and relation type.');
  }

  if (sourceEntityId.toLowerCase() === input.targetEntityId.toLowerCase()) {
    throw new Error('An entity cannot be related to itself.');
  }

  const isDuplicate = existingRelations.some((relation) => {
    return (
      relation.type === input.type && relation.targetEntityId === input.targetEntityId.toLowerCase()
    );
  });

  if (isDuplicate) {
    throw new Error('This relation already exists. Choose another relation type or entity.');
  }
}
