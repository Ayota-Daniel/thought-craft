import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceRegistry,
  type WorkspaceConfiguration,
} from '../src/application/workspace-registry';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { migrateWorkspaces } from '../src/settings/workspace-migration';
import { createFrom, type NewEntity } from '../src/application/create-entity';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { entityFromFrontmatter } from '../src/infrastructure/frontmatter-mapper';
import {
  addEntityRelation,
  removeEntityRelation,
  serializeRelation,
} from '../src/infrastructure/relation-mapper';
import { createTestEntity, createTestRelation, TARGET_ID, OTHER_ID } from './entity-fixtures';
import { workspacesForTypes } from './workspace-fixtures';

function setup() {
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types);
  const relations = new RelationTypeRegistry(workspaces, types);
  const character = createTestEntity({ type: 'character' });
  const scene = createTestEntity({ id: TARGET_ID, type: 'scene', filePath: 'Scenes/Arrival.md' });
  return { types, workspaces, relations, character, scene };
}

const appearsIn = {
  id: 'appears-in',
  label: 'Appears in',
  sourceEntityTypeIds: ['character'],
  targetEntityTypeIds: ['scene'],
};

describe('workspace configuration and active context', () => {
  it('seeds default with all pre-existing active types once, without changing the M3 configuration', async () => {
    const types = new EntityTypeRegistry();
    await types.createCustomType({ id: 'quest', label: 'Quest', folderName: 'Quests' });
    const m3 = {
      configVersion: 3,
      entitiesFolder: 'Custom/Captures',
      defaultWorkspace: 'default',
      entityTypes: types.getAll(),
      user_setting: true,
    };
    const original = structuredClone(m3);
    const migrated = migrateWorkspaces(
      m3,
      types.getActive().map((type) => type.id),
    );
    const registry = new WorkspaceRegistry(migrated.workspaces, migrated.activeWorkspaceId, []);
    expect(registry.getActive().id).toBe('default');
    expect(registry.get('default')?.enabledEntityTypeIds).toContain('quest');
    const persisted = {
      ...m3,
      workspaces: registry.getAll(),
      activeWorkspaceId: registry.getActive().id,
      configVersion: 4,
    };
    const restarted = migrateWorkspaces(persisted, []);
    expect(
      new WorkspaceRegistry(restarted.workspaces, restarted.activeWorkspaceId, []).getAll(),
    ).toHaveLength(1);
    expect(persisted.entityTypes).toEqual(m3.entityTypes);
    expect(persisted.user_setting).toBe(true);
    expect(m3).toEqual(original);
  });

  it('preserves the configured pre-M4 capture workspace without inferring IDs from notes', () => {
    const migrated = migrateWorkspaces({ configVersion: 3, defaultWorkspace: 'novel' }, ['idea']);
    const registry = new WorkspaceRegistry(migrated.workspaces, migrated.activeWorkspaceId, []);
    expect(registry.getActive().id).toBe('novel');
    expect(registry.get('default')).toBeDefined();
    expect(registry.get('novel')?.enabledEntityTypeIds).toEqual(['idea']);
    expect(registry.get('some-note-workspace')).toBeUndefined();
  });

  it('does not revive the obsolete capture setting after M4 configuration loss', () => {
    const migrated = migrateWorkspaces(
      { configVersion: 4, defaultWorkspace: 'novel', activeWorkspaceId: 'lost' },
      ['idea'],
    );
    const registry = new WorkspaceRegistry(migrated.workspaces, migrated.activeWorkspaceId, []);
    expect(registry.getActive().id).toBe('default');
    expect(registry.get('novel')).toBeUndefined();
    expect(() => migrateWorkspaces({ configVersion: 6 }, [])).toThrow('newer');
  });

  it('creates a normalized stable ID, description and default Idea membership', async () => {
    const registry = new WorkspaceRegistry(undefined, undefined, ['idea']);
    await registry.create({
      id: 'The Last Train',
      label: 'The Last Train',
      description: 'Novel workspace',
    });
    await registry.update('the-last-train', { label: 'The Last Train — Novel' });
    expect(registry.get('the-last-train')).toMatchObject({
      id: 'the-last-train',
      label: 'The Last Train — Novel',
      description: 'Novel workspace',
      enabledEntityTypeIds: ['idea'],
    });
  });

  it('persists switching and retirement fallback before publishing', async () => {
    const saved = vi.fn<(configuration: WorkspaceConfiguration) => Promise<void>>(
      async () => undefined,
    );
    const registry = new WorkspaceRegistry(undefined, 'missing', ['idea'], saved);
    await registry.create({ id: 'novel', label: 'Novel' });
    await registry.setActive('novel');
    expect(saved.mock.calls.at(-1)?.[0]).toMatchObject({ activeWorkspaceId: 'novel' });
    const restarted = new WorkspaceRegistry(registry.getAll(), 'novel', []);
    expect(restarted.getActive().id).toBe('novel');
    await registry.update('novel', { retired: true });
    expect(registry.getActive().id).toBe('default');
    expect(registry.getSelectable().map((workspace) => workspace.id)).toEqual(['default']);
    expect(registry.get('novel')?.retired).toBe(true);
    expect(saved.mock.calls.at(-1)?.[0]).toMatchObject({ activeWorkspaceId: 'default' });
    await registry.update('novel', { retired: false });
    await registry.setActive('novel');
    expect(registry.getActive().id).toBe('novel');
  });

  it('rejects protected retirement, duplicate IDs, unknown switching and unsafe identifiers', async () => {
    const registry = new WorkspaceRegistry(undefined, undefined, []);
    await expect(registry.update('default', { retired: true })).rejects.toThrow('default');
    await expect(registry.create({ id: 'default', label: 'Duplicate' })).rejects.toThrow('already');
    await expect(registry.setActive('missing')).rejects.toThrow('active');
    await expect(registry.create({ id: 'constructor', label: 'Unsafe' })).rejects.toThrow();
    await expect(
      registry.update('default', { enabledEntityTypeIds: ['idea', 'idea'] }),
    ).rejects.toThrow('distinct');
  });

  it('serializes updates, preserves state on persistence failure and unsubscribes', async () => {
    let fail = false;
    const registry = new WorkspaceRegistry(undefined, undefined, ['idea'], async () => {
      if (fail) {
        throw new Error('Disk unavailable');
      }
    });
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    await registry.create({ id: 'novel', label: 'Novel' });
    await Promise.all([
      registry.update('novel', { description: 'A story' }),
      registry.update('novel', { label: 'Train' }),
    ]);
    expect(registry.get('novel')).toMatchObject({ description: 'A story', label: 'Train' });
    fail = true;
    await expect(registry.setActive('novel')).rejects.toThrow('Disk');
    expect(registry.getActive().id).toBe('default');
    unsubscribe();
    const calls = listener.mock.calls.length;
    fail = false;
    await registry.setActive('novel');
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('preserves unreadable configuration for recovery and falls back from a retired active workspace', async () => {
    const registry = new WorkspaceRegistry([{ id: 'broken' }], 'broken', ['idea']);
    expect(registry.issues).toHaveLength(1);
    expect(registry.unreadableDefinitions).toEqual([{ id: 'broken' }]);
    expect(registry.getActive().id).toBe('default');
    expect(registry.label('lost')).toBe('Unknown Workspace: lost');
    await registry.create({ id: 'retired', label: 'Retired' });
    await registry.update('retired', { retired: true });
    expect(new WorkspaceRegistry(registry.getAll(), 'retired', []).getActive().id).toBe('default');
    expect(() => new WorkspaceRegistry('broken root', 'default', [])).toThrow('list');
  });
});

describe('workspace creation boundaries and queries', () => {
  it('filters globally active types through enabled IDs and preserves disabled existing entities', async () => {
    const { types, workspaces, character } = setup();
    await workspaces.update('novel', { enabledEntityTypeIds: ['idea', 'scene'] });
    expect(workspaces.getAvailableEntityTypes('novel', types).map((type) => type.id)).toEqual([
      'idea',
      'scene',
    ]);
    expect(() => workspaces.validateCreation('novel', 'character', types)).toThrow('disabled');
    expect(character.type).toBe('character');
    const index = new EntityIndex();
    index.upsert(character);
    expect(index.getById(character.id)).toEqual(character);
    expect(() => workspaces.validateCreation('lost', 'idea', types)).toThrow('workspace');
    await workspaces.update('novel', { retired: true });
    expect(() => workspaces.validateCreation('novel', 'idea', types)).toThrow('workspace');
  });

  it('does not silently enable newly defined global types and excludes retired types', async () => {
    const { types, workspaces } = setup();
    await types.createCustomType({
      id: 'plot-thread',
      label: 'Plot Thread',
      folderName: 'Plot Threads',
    });
    expect(
      workspaces.getAvailableEntityTypes('novel', types).some((type) => type.id === 'plot-thread'),
    ).toBe(false);
    await workspaces.update('novel', { enabledEntityTypeIds: ['idea', 'plot-thread'] });
    expect(() => workspaces.validateCreation('novel', 'plot-thread', types)).not.toThrow();
    expect(
      workspaces
        .getAvailableEntityTypes('default', types)
        .some((type) => type.id === 'plot-thread'),
    ).toBe(false);
    await types.updateType('plot-thread', { retired: true });
    expect(() => workspaces.validateCreation('novel', 'plot-thread', types)).toThrow('unavailable');
  });

  it('keeps the source workspace when active context changes and rejects disabled Create From programmatically', async () => {
    const { types, workspaces } = setup();
    const source = createTestEntity();
    const index = new EntityIndex();
    index.upsert(source);
    const writer = { createEntity: vi.fn(async (input: NewEntity) => createTestEntity(input)) };
    await workspaces.setActive('default');
    const created = await createFrom(
      source.id,
      { type: 'scene', title: 'Scene', content: '' },
      index,
      writer,
      types,
      workspaces,
    );
    expect(created.workspaceId).toBe('novel');
    expect(created.relations[0]?.type).toBe('originated-from');
    await workspaces.update('novel', { enabledEntityTypeIds: ['idea'] });
    await expect(
      createFrom(
        source.id,
        { type: 'scene', title: 'Scene', content: '' },
        index,
        writer,
        types,
        workspaces,
      ),
    ).rejects.toThrow('disabled');
    expect(writer.createEntity).toHaveBeenCalledTimes(1);
  });

  it('filters Inbox without changing the global UUID index or existing Focus identity', async () => {
    const { workspaces } = setup();
    const index = new EntityIndex();
    const novel = createTestEntity();
    const defaultIdea = createTestEntity({
      id: TARGET_ID,
      workspaceId: 'default',
      filePath: 'Default idea.md',
    });
    index.upsert(novel);
    index.upsert(defaultIdea);
    const query = () =>
      index.getInbox().filter((entity) => entity.workspaceId === workspaces.getActive().id);
    expect(query().map((entity) => entity.id)).toEqual([novel.id]);
    await workspaces.setActive('default');
    expect(query().map((entity) => entity.id)).toEqual([defaultIdea.id]);
    expect(index.getById(novel.id)).toEqual(novel);
    expect(index.getAll()).toHaveLength(2);
  });
});

describe('workspace relation definitions and policy', () => {
  it('keeps all five universal kinds independent of workspace configuration', () => {
    const { relations } = setup();
    expect(relations.getUniversal()).toHaveLength(5);
    expect(relations.getForWorkspace('lost').map((relation) => relation.id)).toContain(
      'originated-from',
    );
    expect(relations.resolve('novel', 'related-to')?.builtIn).toBe(true);
  });

  it('resolves a custom relation only in its owning workspace and preserves its stable ID on edits', async () => {
    const { workspaces, relations } = setup();
    await workspaces.addRelationType('novel', appearsIn);
    await workspaces.updateRelationType('novel', 'appears-in', { label: 'Present in scene' });
    expect(relations.resolve('novel', 'appears-in')?.label).toBe('Present in scene');
    expect(relations.resolve('default', 'appears-in')).toBeUndefined();
    expect(
      new WorkspaceRegistry(workspaces.getAll(), 'novel', []).get('novel')?.relationTypes[0]?.id,
    ).toBe('appears-in');
  });

  it.each(['related-to', 'supports', 'alternative-to', 'depends-on', 'originated-from'])(
    'protects universal ID %s from custom replacement',
    async (id) => {
      const { workspaces } = setup();
      await expect(workspaces.addRelationType('novel', { ...appearsIn, id })).rejects.toThrow(
        'reserved',
      );
    },
  );

  it.each([
    ['character', 'scene', 'novel', true],
    ['location', 'scene', 'novel', false],
    ['character', 'character', 'novel', false],
    ['character', 'scene', 'default', false],
  ])('validates %s → %s in %s', async (sourceType, targetType, targetWorkspace, valid) => {
    const { workspaces, relations, character, scene } = setup();
    await workspaces.addRelationType('novel', appearsIn);
    const validate = () =>
      relations.validateNew(
        { ...character, type: sourceType },
        { ...scene, type: targetType, workspaceId: targetWorkspace },
        'appears-in',
      );
    if (valid) {
      expect(validate).not.toThrow();
    } else {
      expect(validate).toThrow();
    }
  });

  it('interprets empty restrictions as any enabled active type', async () => {
    const { types, workspaces, relations, character, scene } = setup();
    await workspaces.addRelationType('novel', {
      ...appearsIn,
      sourceEntityTypeIds: [],
      targetEntityTypeIds: [],
    });
    expect(() => relations.validateNew(character, scene, 'appears-in')).not.toThrow();
    await workspaces.update('novel', { enabledEntityTypeIds: ['idea', 'character'] });
    expect(() => relations.validateNew(character, scene, 'appears-in')).toThrow('target');
    await types.updateType('character', { label: 'Person' });
    expect(relations.resolve('novel', 'appears-in')?.sourceEntityTypeIds).toEqual([]);
  });

  it('preserves retired definitions for display but excludes new links and supports restoration', async () => {
    const { workspaces, relations, character, scene } = setup();
    await workspaces.addRelationType('novel', appearsIn);
    await workspaces.updateRelationType('novel', 'appears-in', { retired: true });
    expect(relations.resolve('novel', 'appears-in')?.retired).toBe(true);
    expect(
      relations.getAvailableForSource(character).some((relation) => relation.id === 'appears-in'),
    ).toBe(false);
    expect(() => relations.validateNew(character, scene, 'appears-in')).toThrow('unavailable');
    await workspaces.updateRelationType('novel', 'appears-in', { retired: false });
    expect(() => relations.validateNew(character, scene, 'appears-in')).not.toThrow();
    await expect(workspaces.addRelationType('novel', appearsIn)).rejects.toThrow('already');
  });

  it('permits universal cross-workspace edges, preserving UUID resolution across rename/delete', () => {
    const { relations, character, scene } = setup();
    const target = { ...scene, workspaceId: 'default' };
    expect(() => relations.validateNew(character, target, 'related-to')).not.toThrow();
    const edge = createTestRelation({ targetEntityId: target.id });
    const index = new EntityIndex();
    index.upsert({ ...character, relations: [edge] });
    index.upsert(target);
    index.renamePath(target.filePath, 'Renamed scene.md');
    expect(index.getOutgoingRelations(character.id)[0]?.target?.id).toBe(target.id);
    index.removePath('Renamed scene.md');
    expect(index.getOutgoingRelations(character.id)[0]?.target).toBeUndefined();
    expect(index.getById(character.id)?.relations).toEqual([edge]);
  });

  it('marks incompatible manual edges and unknown definitions without discarding target identity', async () => {
    const { workspaces, relations, character, scene } = setup();
    await workspaces.addRelationType('novel', appearsIn);
    expect(
      relations.compatibilityIssue(character, { ...scene, workspaceId: 'default' }, 'appears-in'),
    ).toMatch('same workspace');
    expect(relations.label('novel', 'betrayed-by')).toBe('Unknown relation: betrayed-by');
    expect(relations.compatibilityIssue(character, scene, 'betrayed-by')).toMatch(
      'Unknown relation',
    );
    const edge = createTestRelation({ type: 'betrayed-by' });
    const metadata = {
      bs_id: character.id,
      bs_type: character.type,
      bs_workspace: 'lost-project',
      bs_status: 'exploring',
      bs_created: character.createdAt,
      bs_updated: character.updatedAt,
      bs_properties: { note: { label: 'Note', type: 'text', value: 'Keep' } },
      bs_schema_values: { motivation: 'Keep' },
      bs_relations: [serializeRelation(edge)],
      user: true,
    };
    const entity = entityFromFrontmatter(metadata, 'Unknown.md');
    expect(entity?.workspaceId).toBe('lost-project');
    expect(entity?.relations[0]).toEqual(edge);
    expect(entity?.schemaValues).toEqual({ motivation: 'Keep' });
    expect(entity?.properties[0]?.value).toBe('Keep');
    removeEntityRelation(metadata, edge);
    expect(metadata.bs_relations).toEqual([]);
    expect(metadata.user).toBe(true);
    expect(metadata.bs_schema_values.motivation).toBe('Keep');
  });

  it('uses the existing YAML structure and duplicate/self protections for custom edges', () => {
    const edge = createTestRelation({ type: 'appears-in' });
    const metadata: Record<string, unknown> = {
      user: 'keep',
      bs_schema_values: { importance: 4 },
      bs_properties: { note: { label: 'Note', type: 'text', value: 'Local' } },
    };
    addEntityRelation(metadata, createTestEntity().id, edge);
    expect(metadata.bs_relations).toEqual([
      { id: edge.id, type: 'appears-in', target_entity_id: TARGET_ID, created_at: edge.createdAt },
    ]);
    expect(() =>
      addEntityRelation(metadata, createTestEntity().id, { ...edge, id: OTHER_ID }),
    ).toThrow('already exists');
    expect(() =>
      addEntityRelation({}, createTestEntity().id, {
        ...edge,
        targetEntityId: createTestEntity().id,
      }),
    ).toThrow('itself');
    expect(metadata.user).toBe('keep');
    expect(metadata.bs_schema_values).toEqual({ importance: 4 });
    expect(metadata.bs_properties).toEqual({
      note: { label: 'Note', type: 'text', value: 'Local' },
    });
  });
});
