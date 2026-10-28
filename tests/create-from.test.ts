import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { describe, expect, it, vi } from 'vitest';
import { createFrom, type NewEntity } from '../src/application/create-entity';
import { ENTITY_TYPES, type EntityType } from '../src/domain/entity-type';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { entityFromFrontmatter } from '../src/infrastructure/frontmatter-mapper';
import { folderForEntity } from '../src/shared/entity-path';
import { CREATED_AT, createTestEntity } from './entity-fixtures';

describe('Create From', () => {
  it.each<{ sourceType: EntityType; targetType: EntityType }>([
    { sourceType: 'idea', targetType: 'character' },
    { sourceType: 'idea', targetType: 'scene' },
    { sourceType: 'character', targetType: 'project' },
    { sourceType: 'scene', targetType: 'location' },
    { sourceType: 'location', targetType: 'idea' },
  ])(
    'creates $targetType from $sourceType with one source-owned origin edge',
    async ({ sourceType, targetType }) => {
      const index = new EntityIndex();
      const source = createTestEntity({ type: sourceType });
      index.upsert(source);
      const originalSource = structuredClone(source);
      const writer = {
        createEntity: vi.fn(async (input: NewEntity) => {
          const created = createTestEntity({
            id: input.id,
            type: input.type,
            title: input.title,
            workspaceId: input.workspaceId,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
            filePath: `${ENTITY_TYPES[input.type]?.folder}/${input.title}.md`,
            relations: input.relations,
          });
          index.upsert(created);
          return created;
        }),
      };

      const created = await createFrom(
        source.id,
        { type: targetType, title: 'Derived thought', content: 'Optional initial body' },
        index,
        writer,
        new EntityTypeRegistry(),
      );

      expect(created.id).not.toBe(source.id);
      expect(created.id).toMatch(/^[a-f\d-]{36}$/);
      expect(created.type).toBe(targetType);
      expect(created.workspaceId).toBe(source.workspaceId);
      expect(created.relations).toHaveLength(1);
      expect(created.relations[0]).toMatchObject({
        type: 'originated-from',
        targetEntityId: source.id,
      });
      expect(created.relations[0]?.id).not.toBe(created.id);
      expect(writer.createEntity).toHaveBeenCalledTimes(1);
      expect(writer.createEntity.mock.calls[0]?.[0].content).toBe('Optional initial body');
      expect(index.getById(created.id)).toEqual(created);
      expect(index.getIncomingRelations(source.id)[0]?.source.id).toBe(created.id);
      expect(index.getById(source.id)).toEqual(originalSource);
      expect(source.relations).toEqual([]);
    },
  );

  it('rejects a deleted source and an empty title before calling the writer', async () => {
    const index = new EntityIndex();
    const source = createTestEntity();
    const writer = { createEntity: vi.fn() };
    const input = { type: 'character' as const, title: 'Noah', content: '' };

    await expect(
      createFrom(source.id, input, index, writer, new EntityTypeRegistry()),
    ).rejects.toThrow('no longer available');
    index.upsert(source);
    await expect(
      createFrom(source.id, { ...input, title: ' ' }, index, writer, new EntityTypeRegistry()),
    ).rejects.toThrow('title');
    expect(writer.createEntity).not.toHaveBeenCalled();
  });
});

describe('entity types and destinations', () => {
  it.each<EntityType>(['idea', 'character', 'scene', 'location', 'project'])(
    'maps the %s type through the same entity mapper',
    (type) => {
      const source = createTestEntity();
      const entity = entityFromFrontmatter(
        {
          bs_id: source.id,
          bs_type: type,
          bs_workspace: 'novel',
          bs_status: type === 'idea' ? 'inbox' : 'exploring',
          bs_created: CREATED_AT,
          bs_updated: CREATED_AT,
        },
        'Any folder/A note.md',
      );

      expect(entity?.type).toBe(type);
      expect(entity?.id).toBe(source.id);
      expect(entity?.relations).toEqual([]);
    },
  );

  it('keeps the configured Idea folder and derives siblings for every other type', () => {
    expect(folderForEntity('idea', 'Brainstorm/Ideas')).toBe('Brainstorm/Ideas');
    expect(folderForEntity('character', 'Brainstorm/Ideas')).toBe('Brainstorm/Characters');
    expect(folderForEntity('scene', 'Custom/Captures')).toBe('Custom/Scenes');
    expect(folderForEntity('location', 'Custom/Captures')).toBe('Custom/Locations');
    expect(folderForEntity('project', 'Ideas')).toBe('Projects');
  });

  it('rejects invalid folder input without migrating settings or moving files', () => {
    expect(() => folderForEntity('scene', '../outside')).toThrow();
  });
});
