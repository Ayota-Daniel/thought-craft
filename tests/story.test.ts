import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRegistry } from '../src/application/workspace-registry';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { migrateWorkspaces } from '../src/settings/workspace-migration';
import { createEntity, createFrom, type NewEntity } from '../src/application/create-entity';
import { EntityIndex } from '../src/infrastructure/entity-index';
import {
  queryStory,
  storyCounts,
  storyEnabled,
  storyEditedAt,
  latestStoryScene,
  STORY_COLLECTIONS,
} from '../src/application/story-query';
import { paginateInbox } from '../src/application/inbox-pagination';
import { folderForEntity } from '../src/shared/entity-path';
import { resolveSchemaField } from '../src/domain/property-schema';
import { workspacesForTypes } from './workspace-fixtures';
import { createTestEntity, SOURCE_ID, TARGET_ID } from './entity-fixtures';

const scene = createTestEntity({ type: 'scene', title: 'Arrival', status: 'exploring' });
const later = createTestEntity({
  type: 'scene',
  id: TARGET_ID,
  title: 'Departure',
  updatedAt: '2026-10-29T10:00:00Z',
});

function setup() {
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types);
  const writer = {
    createEntity: vi.fn(async (input: NewEntity) => createTestEntity({ ...input })),
  };
  return { types, workspaces, writer };
}

describe('M7 configuration boundaries', () => {
  it('upgrades M6.6 without opting in or changing types, relations, boards or source configuration', () => {
    const types = new EntityTypeRegistry();
    const saved = {
      configVersion: 6,
      activeWorkspaceId: 'novel',
      entityTypes: types.getAll().filter((type) => type.id !== 'plot-thread'),
      workspaces: [
        {
          id: 'novel',
          label: 'Novel',
          builtIn: false,
          retired: false,
          enabledEntityTypeIds: ['idea', 'scene'],
          relationTypes: [
            {
              id: 'foreshadows',
              label: 'Foreshadows',
              retired: false,
              sourceEntityTypeIds: [],
              targetEntityTypeIds: [],
            },
          ],
          user_extension: { preserve: true },
        },
      ],
      boards: [
        {
          workspaceId: 'novel',
          nodes: { [SOURCE_ID]: { x: 10, y: 20 } },
          groups: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
    };
    const original = structuredClone(saved);
    const migrated = migrateWorkspaces(
      saved,
      types.getActive().map((type) => type.id),
    );
    const registry = new WorkspaceRegistry(migrated.workspaces, migrated.activeWorkspaceId, []);
    expect(registry.getActive()).toMatchObject({ ...saved.workspaces[0], enabledExperiences: [] });
    expect(registry.getActive().enabledEntityTypeIds).not.toContain('plot-thread');
    expect(storyEnabled(registry.getActive())).toBe(false);
    expect(saved).toEqual(original);
  });

  it('enables/disables/re-enables Story independently of type availability and entity data', async () => {
    const { workspaces } = setup();
    const original = workspaces.getActive();
    await workspaces.update('novel', { enabledExperiences: ['story'] });
    expect(storyEnabled(workspaces.getActive())).toBe(true);
    await workspaces.update('novel', { enabledExperiences: [] });
    expect(storyEnabled(workspaces.getActive())).toBe(false);
    expect(workspaces.getActive()).toEqual({ ...original, enabledExperiences: [] });
    await workspaces.update('novel', { enabledExperiences: ['story'] });
    const restarted = new WorkspaceRegistry(workspaces.getAll(), 'novel', []);
    expect(storyEnabled(restarted.getActive())).toBe(true);
    expect(Object.isFrozen(restarted.getActive().enabledExperiences)).toBe(true);
  });

  it('does not publish failed experience saves', async () => {
    const registry = new WorkspaceRegistry(undefined, 'default', ['idea'], async () => {
      throw new Error('Disk');
    });
    await expect(registry.update('default', { enabledExperiences: ['story'] })).rejects.toThrow(
      'Disk',
    );
    expect(registry.getActive().enabledExperiences).toEqual([]);
  });

  it('enables recommended types through a serialized registry operation without lost updates', async () => {
    const { workspaces, types } = setup();
    await workspaces.update('novel', { enabledEntityTypeIds: ['scene'] });
    await Promise.all([
      workspaces.enableEntityType('novel', 'character', types),
      workspaces.enableEntityType('novel', 'plot-thread', types),
    ]);
    expect(workspaces.getActive().enabledEntityTypeIds).toEqual([
      'scene',
      'character',
      'plot-thread',
    ]);
    await workspaces.enableEntityType('novel', 'scene', types);
    expect(workspaces.getActive().enabledEntityTypeIds).toHaveLength(3);
    expect(workspaces.getActive().enabledExperiences).toEqual([]);
    await expect(workspaces.enableEntityType('novel', 'missing', types)).rejects.toThrow(
      'unavailable',
    );
  });

  it('preserves malformed experience definitions for recovery', () => {
    const raw = {
      id: 'novel',
      label: 'Novel',
      builtIn: false,
      retired: false,
      enabledExperiences: ['unknown'],
      enabledEntityTypeIds: ['scene'],
      relationTypes: [],
    };
    const registry = new WorkspaceRegistry([raw], 'novel', []);
    expect(registry.unreadableDefinitions).toEqual([raw]);
    expect(registry.getActive().id).toBe('default');
  });
});

describe('Plot Thread generic identity', () => {
  it('seeds one stable built-in with its folder and no opinionated schema', () => {
    const types = new EntityTypeRegistry();
    expect(types.get('plot-thread')).toEqual({
      id: 'plot-thread',
      label: 'Plot Thread',
      folderName: 'Plot Threads',
      builtIn: true,
      retired: false,
      properties: [],
    });
    expect(
      new EntityTypeRegistry(types.getAll()).getAll().filter((type) => type.id === 'plot-thread'),
    ).toHaveLength(1);
    expect(
      folderForEntity('plot-thread', 'Brainstorm/Ideas', types.get('plot-thread')?.folderName),
    ).toBe('Brainstorm/Plot Threads');
  });

  it.each([false, true])(
    'preserves an existing custom conflict, retired=%s, without replacement after restart',
    (retired) => {
      const custom = {
        id: 'plot-thread',
        label: 'My threads',
        folderName: 'Custom/Threads',
        builtIn: false,
        retired,
        properties: [{ key: 'question', label: 'Question', type: 'text' as const, retired: false }],
      };
      const types = new EntityTypeRegistry([custom]);
      expect(types.get('plot-thread')).toEqual(custom);
      expect(types.issues).toEqual([]);
      expect(new EntityTypeRegistry(types.getAll()).get('plot-thread')).toEqual(custom);
    },
  );

  it('supports generic creation, properties, relations and Create From', async () => {
    const { types, workspaces, writer } = setup();
    await types.addProperty('plot-thread', {
      key: 'question',
      label: 'Question',
      type: 'text',
      retired: false,
      defaultValue: 'Who?',
    });
    const created = await createEntity(
      { type: 'plot-thread', title: ' The missing train ', content: 'Keep this body' },
      'novel',
      writer,
      types,
      workspaces,
    );
    expect(created).toMatchObject({
      title: 'The missing train',
      type: 'plot-thread',
      workspaceId: 'novel',
      relations: [],
    });
    expect(resolveSchemaField(types.get('plot-thread')!.properties[0]!, undefined).value).toBe(
      'Who?',
    );
    const relations = new RelationTypeRegistry(workspaces, types);
    expect(() => relations.validateNew(created, scene, 'related-to')).not.toThrow();
    await workspaces.addRelationType('novel', {
      id: 'foreshadows',
      label: 'Foreshadows',
      sourceEntityTypeIds: ['plot-thread'],
      targetEntityTypeIds: ['scene'],
    });
    expect(() => relations.validateNew(created, scene, 'foreshadows')).not.toThrow();
    const index = new EntityIndex();
    index.upsert(scene);
    const derived = await createFrom(
      scene.id,
      { type: 'plot-thread', title: 'A question', content: '' },
      index,
      writer,
      types,
      workspaces,
    );
    expect(derived.relations[0]).toMatchObject({
      type: 'originated-from',
      targetEntityId: scene.id,
    });
  });
});

describe('Story collections and overview', () => {
  it.each(STORY_COLLECTIONS)(
    'scopes $label to the active Workspace, retaining disabled/archived material',
    ({ id }) => {
      const entities = [
        createTestEntity({ type: id, status: 'archived' }),
        createTestEntity({ id: TARGET_ID, type: id, workspaceId: 'other' }),
        createTestEntity({ type: 'project', id: 'project' }),
      ];
      expect(queryStory(entities, 'novel', id)).toEqual([entities[0]]);
    },
  );

  it('counts real indexed material only and has no Scene fallback placeholder', () => {
    expect(storyCounts([scene, later], 'novel').map((item) => item.count)).toEqual([2, 0, 0, 0, 0]);
    expect(storyCounts([scene], 'other').every((item) => item.count === 0)).toBe(true);
    expect(latestStoryScene([], 'novel')).toBeUndefined();
  });

  it('resolves the latest updated Scene and ignores another Workspace', () => {
    expect(
      latestStoryScene(
        [
          scene,
          later,
          { ...later, id: 'other', workspaceId: 'other', updatedAt: '2030-01-01T00:00:00Z' },
        ],
        'novel',
      )?.id,
    ).toBe(later.id);
  });

  it('follows native body edits using cached mtime without changing metadata', () => {
    const snapshot = structuredClone(scene);
    const edited = Date.parse('2026-10-29T11:00:00Z');
    expect(
      latestStoryScene([scene, later], 'novel', (entity) =>
        entity.id === scene.id ? edited : undefined,
      )?.id,
    ).toBe(scene.id);
    expect(storyEditedAt(scene, edited)).toBe(edited);
    expect(scene).toEqual(snapshot);
  });

  it('falls back deterministically for unavailable timestamps', () => {
    const invalid = { ...scene, updatedAt: 'invalid', createdAt: 'invalid' };
    expect(storyEditedAt(invalid, NaN)).toBe(0);
    expect(latestStoryScene([invalid, { ...invalid, id: TARGET_ID }], 'novel')?.id).toBe(TARGET_ID);
  });

  it('searches titles only, case-insensitively, before shared pagination', () => {
    const entities = Array.from({ length: 130 }, (_, n) =>
      createTestEntity({
        id: String(n),
        type: 'scene',
        title: `Arrival ${String(n).padStart(3, '0')}`,
      }),
    );
    const snapshot = structuredClone(entities);
    expect(queryStory(entities, 'novel', 'scene', 'SCENE')).toEqual([]);
    const sorted = queryStory(entities, 'novel', 'scene', ' ARRIVAL ', 'za');
    const page = paginateInbox(sorted, 2, 50);
    expect(page.total).toBe(130);
    expect(page.items).toHaveLength(50);
    expect(page.items[0]?.title).toBe('Arrival 079');
    expect(paginateInbox(sorted, 3, 50).items).toHaveLength(30);
    expect(entities).toEqual(snapshot);
  });

  it.each(['updated', 'newest', 'az', 'za'] as const)(
    'reuses %s sorting with stable ties',
    (sort) => {
      const values = queryStory([scene, later], 'novel', 'scene', '', sort);
      const expected = sort === 'az' ? scene.id : later.id;
      expect(values[0]?.id).toBe(expected);
    },
  );

  it.each(STORY_COLLECTIONS)(
    'creates $singular through the same generic writer without extra state',
    async ({ id }) => {
      const { types, workspaces, writer } = setup();
      const created = await createEntity(
        { type: id, title: 'A title', content: '## Real Markdown' },
        'novel',
        writer,
        types,
        workspaces,
      );
      expect(created.type).toBe(id);
      expect(writer.createEntity.mock.calls[0]?.[0]).toMatchObject({
        workspaceId: 'novel',
        content: '## Real Markdown',
        relations: [],
      });
      await workspaces.update('novel', { enabledEntityTypeIds: [] });
      await expect(
        createEntity(
          { type: id, title: 'Another', content: '' },
          'novel',
          writer,
          types,
          workspaces,
        ),
      ).rejects.toThrow('disabled');
      expect(writer.createEntity).toHaveBeenCalledTimes(1);
    },
  );
});
