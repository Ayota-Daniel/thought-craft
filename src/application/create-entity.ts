import type { EntityTypeRegistry } from './entity-type-registry';
import type { Entity } from '../domain/entity';
import { isEntityType, type EntityType } from '../domain/entity-type';
import { validateRelation, type EntityRelation } from '../domain/entity-relation';

export interface NewEntity {
  id: string;
  type: EntityType;
  title: string;
  content: string;
  workspaceId: string;
  createdAt: string;
  relations: readonly EntityRelation[];
}

export interface EntityWriter {
  createEntity(input: NewEntity): Promise<Entity>;
}

export interface CreateFromInput {
  type: EntityType;
  title: string;
  content: string;
}

export async function createFrom(
  sourceEntityId: string,
  input: CreateFromInput,
  index: { getById(id: string): Entity | undefined },
  writer: EntityWriter,
  registry: EntityTypeRegistry,
): Promise<Entity> {
  const source = index.getById(sourceEntityId);
  if (!source) {
    throw new Error('The source entity is no longer available.');
  }
  if (
    !isEntityType(input.type) ||
    !registry.get(input.type) ||
    registry.get(input.type)?.retired ||
    !input.title.trim()
  ) {
    throw new Error('Choose an entity type and enter a title.');
  }

  const createdAt = new Date().toISOString();
  const origin: EntityRelation = {
    id: globalThis.crypto.randomUUID(),
    type: 'originated-from',
    targetEntityId: source.id,
    createdAt,
  };
  validateRelation(origin);

  return writer.createEntity({
    id: globalThis.crypto.randomUUID(),
    type: input.type,
    title: input.title.trim(),
    content: input.content,
    workspaceId: source.workspaceId,
    createdAt,
    relations: [origin],
  });
}
