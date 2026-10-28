import { describe, expect, it, vi } from 'vitest';
import { EntityTypeRegistry, typeIdForLabel } from '../src/application/entity-type-registry';
import {
  resolveSchemaField,
  validateSchema,
  type PropertySchema,
} from '../src/domain/property-schema';
import { createFrom, type NewEntity } from '../src/application/create-entity';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { folderForEntity } from '../src/shared/entity-path';
import { createTestEntity } from './entity-fixtures';

const motivation: PropertySchema = {
  key: 'motivation',
  label: 'Motivation',
  type: 'text',
  retired: false,
};
const quest = { id: 'quest', label: 'Quest', folderName: 'Quests' };

describe('global entity type registry', () => {
  it('seeds five empty built-ins once and preserves their order after restart', async () => {
    const registry = new EntityTypeRegistry();
    expect(registry.getAll().map((type) => type.id)).toEqual([
      'idea',
      'character',
      'scene',
      'location',
      'project',
    ]);
    expect(
      registry
        .getAll()
        .every((type) => type.builtIn && !type.retired && type.properties.length === 0),
    ).toBe(true);
    await registry.updateType('character', { label: 'Person' });
    const restored = new EntityTypeRegistry(JSON.parse(JSON.stringify(registry.getAll())));
    expect(restored.getAll()).toHaveLength(5);
    expect(restored.getAll().map((type) => type.id)).toEqual(
      registry.getAll().map((type) => type.id),
    );
    expect(restored.get('character')?.label).toBe('Person');
  });

  it('keeps type identity when label and creation folder change', async () => {
    const persist = vi.fn(async () => undefined);
    const registry = new EntityTypeRegistry(undefined, persist);
    await registry.createCustomType(quest);
    await registry.updateType('quest', { label: 'Mission', folderName: 'Game/Missions' });
    expect(registry.get('quest')).toMatchObject({
      id: 'quest',
      label: 'Mission',
      folderName: 'Game/Missions',
      builtIn: false,
    });
    expect(new EntityTypeRegistry(registry.getAll()).get('quest')).toEqual(registry.get('quest'));
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Research Question', 'research-question'],
    ['Étrange créature', 'etrange-creature'],
    ['42', 'type-42'],
  ])('normalizes %s safely', (label, id) => {
    expect(typeIdForLabel(label)).toBe(id);
  });

  it('retires and restores a custom type without losing its schema', async () => {
    const registry = new EntityTypeRegistry();
    await registry.createCustomType(quest);
    await registry.addProperty('quest', motivation);
    await registry.updateType('quest', { retired: true });
    expect(registry.getActive().some((type) => type.id === 'quest')).toBe(false);
    expect(registry.get('quest')?.properties).toEqual([motivation]);
    await registry.updateType('quest', { retired: false });
    expect(registry.getActive().some((type) => type.id === 'quest')).toBe(true);
  });

  it('rejects built-in retirement, duplicate IDs and unsafe folders', async () => {
    const registry = new EntityTypeRegistry();
    await expect(registry.updateType('idea', { retired: true })).rejects.toThrow('Built-in');
    await expect(registry.createCustomType({ ...quest, id: 'character' })).rejects.toThrow(
      'already',
    );
    await expect(
      registry.createCustomType({ ...quest, folderName: '../outside' }),
    ).rejects.toThrow();
    expect(registry.get('quest')).toBeUndefined();
  });

  it('serializes concurrent changes and publishes only successfully persisted definitions', async () => {
    let fail = true;
    const registry = new EntityTypeRegistry(undefined, async () => {
      if (fail) {
        throw new Error('Disk unavailable');
      }
    });
    const listener = vi.fn();
    registry.subscribe(listener);
    await expect(registry.createCustomType(quest)).rejects.toThrow('Disk unavailable');
    expect(registry.get('quest')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    fail = false;
    await registry.createCustomType(quest);
    await Promise.all([
      registry.addProperty('quest', motivation),
      registry.updateType('quest', { label: 'Mission' }),
    ]);
    expect(registry.get('quest')?.properties).toEqual([motivation]);
    expect(registry.get('quest')?.label).toBe('Mission');
  });

  it('retains unreadable definitions for recovery while seeding missing built-ins', () => {
    const broken = { id: 'creature', properties: 'bad' };
    const registry = new EntityTypeRegistry([broken]);
    expect(registry.issues).toHaveLength(1);
    expect(registry.unreadableDefinitions).toEqual([broken]);
    expect(registry.get('creature')).toBeUndefined();
    expect(registry.label('creature')).toBe('Unknown Entity Type: creature');
    expect(registry.getAll()).toHaveLength(5);
    expect(() => new EntityTypeRegistry('broken')).toThrow('configuration');
  });
});

describe('reusable property schemas', () => {
  it.each<PropertySchema>([
    motivation,
    { key: 'cost', label: 'Cost', type: 'number', retired: false, defaultValue: -1.5 },
    {
      key: 'importance',
      label: 'Importance',
      type: 'rating',
      retired: false,
      max: 5,
      defaultValue: 3,
    },
    { key: 'secret', label: 'Secret', type: 'boolean', retired: false, defaultValue: false },
    {
      key: 'role',
      label: 'Role',
      type: 'select',
      retired: false,
      options: ['hero', 'villain'],
      defaultValue: 'hero',
    },
  ])('persists a reusable $type definition, independently of instance values', async (schema) => {
    const registry = new EntityTypeRegistry();
    await registry.addProperty('character', schema);
    expect(new EntityTypeRegistry(registry.getAll()).get('character')?.properties).toEqual([
      schema,
    ]);
  });

  it('rejects duplicate keys including retired keys, and keeps keys and types immutable', async () => {
    const registry = new EntityTypeRegistry();
    await registry.addProperty('character', motivation);
    await registry.updateProperty('character', motivation.key, {
      label: 'Primary Motivation',
      retired: true,
    });
    expect(registry.get('character')?.properties[0]).toMatchObject({
      key: motivation.key,
      label: 'Primary Motivation',
      retired: true,
    });
    await expect(registry.addProperty('character', motivation)).rejects.toThrow('key already');
    await expect(
      registry.updateProperty('character', motivation.key, { type: 'number' }),
    ).rejects.toThrow('immutable');
    await expect(
      registry.updateProperty('character', motivation.key, { key: 'new_key' }),
    ).rejects.toThrow('immutable');
    await registry.updateProperty('character', motivation.key, { retired: false });
    expect(registry.get('character')?.properties[0]?.retired).toBe(false);
  });

  it.each<Partial<PropertySchema>>([
    { key: '__proto__' },
    { label: '' },
    { type: 'formula' as PropertySchema['type'] },
    { type: 'rating', max: 0 },
    { type: 'rating', max: 2.5 },
    { type: 'rating' },
    { type: 'select', options: [] },
    { type: 'select', options: ['a', 'a'] },
    { type: 'number', defaultValue: 'invalid' },
    { type: 'rating', max: 3, defaultValue: 5 },
    { type: 'boolean', defaultValue: 'false' },
    { type: 'select', options: ['a'], defaultValue: 'b' },
  ])('rejects invalid schema configuration %j', (changes) => {
    expect(() => validateSchema({ ...motivation, ...changes })).toThrow();
  });

  it('permits max/options changes without migrating incompatible entity values', async () => {
    const registry = new EntityTypeRegistry();
    await registry.addProperty('character', { ...motivation, type: 'rating', max: 5 });
    await registry.updateProperty('character', motivation.key, { max: 3 });
    const schema = registry.get('character')!.properties[0]!;
    const values = { motivation: 5 };
    expect(resolveSchemaField(schema, values).issue).toBeTruthy();
    expect(values).toEqual({ motivation: 5 });
  });
});

describe('registry-driven generic creation', () => {
  it('creates a custom type with new UUID, inherited workspace, origin and virtual schema fields', async () => {
    const registry = new EntityTypeRegistry();
    await registry.createCustomType(quest);
    await registry.addProperty('quest', motivation);
    const source = createTestEntity();
    const index = new EntityIndex();
    index.upsert(source);
    const writer = {
      createEntity: vi.fn(async (input: NewEntity) =>
        createTestEntity({
          ...input,
          filePath: `${folderForEntity(input.type, 'Custom/Captures', registry.get(input.type)?.folderName)}/${input.title}.md`,
          schemaValues: undefined,
        }),
      ),
    };
    const created = await createFrom(
      source.id,
      { type: 'quest', title: 'Find Mira', content: '' },
      index,
      writer,
      registry,
    );
    expect(created.id).not.toBe(source.id);
    expect(created.filePath).toBe('Custom/Quests/Find Mira.md');
    expect(created.workspaceId).toBe(source.workspaceId);
    expect(created.relations[0]).toMatchObject({
      type: 'originated-from',
      targetEntityId: source.id,
    });
    expect(
      resolveSchemaField(registry.get('quest')!.properties[0]!, created.schemaValues).source,
    ).toBe('missing');
    await registry.updateType('quest', { retired: true });
    await expect(
      createFrom(
        source.id,
        { type: 'quest', title: 'Retired', content: '' },
        index,
        writer,
        registry,
      ),
    ).rejects.toThrow();
    await expect(
      createFrom(
        source.id,
        { type: 'creature', title: 'Unknown', content: '' },
        index,
        writer,
        registry,
      ),
    ).rejects.toThrow();
    expect(source.schemaValues).toBeUndefined();
  });
});
