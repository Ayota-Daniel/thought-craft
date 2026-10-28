import type { Entity } from '../src/domain/entity';
import type { EntityRelation } from '../src/domain/entity-relation';

export const SOURCE_ID = 'ca829f16-35b0-4e68-857b-d54cfc73caed';
export const TARGET_ID = '06fc0cbc-0100-4b5e-92f4-938b00cb7d08';
export const OTHER_ID = '7631b173-505e-4a2f-b19e-d31e3aab8816';
export const RELATION_ID = 'e2c1b5b7-8856-42f4-a958-63ac4944b441';
export const SECOND_RELATION_ID = 'c58c7e2c-1dc6-442e-80bd-40801e231046';
export const CREATED_AT = '2026-10-28T09:15:00.000Z';

export function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: SOURCE_ID,
    type: 'idea',
    title: 'A thought',
    filePath: 'Brainstorm/Ideas/A thought.md',
    workspaceId: 'novel',
    status: 'inbox',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    properties: [],
    propertyIssues: [],
    relations: [],
    relationIssues: [],
    schemaValues: undefined,
    ...overrides,
  };
}

export function createTestRelation(overrides: Partial<EntityRelation> = {}): EntityRelation {
  return {
    id: RELATION_ID,
    type: 'related-to',
    targetEntityId: TARGET_ID,
    createdAt: CREATED_AT,
    ...overrides,
  };
}
