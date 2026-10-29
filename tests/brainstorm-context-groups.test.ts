import { describe, expect, it, vi } from 'vitest';
import { WorkspaceBoardStore } from '../src/application/workspace-board-store';
import {
  contextualNeighbors,
  connectedIdeaRelations,
  createConnectedIdea,
  prepareBrainstormContext,
  ConnectedIdeaPlacementError,
} from '../src/application/contextual-brainstorm';
import { groupForEntity, groupBounds } from '../src/domain/board-group';
import {
  previewGroupMove,
  groupNodes,
  entityCenter,
  type BoardFlowNode,
} from '../src/ui/brainstorm/group-adapter';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { EntityIndex } from '../src/infrastructure/entity-index';
import type { NewEntity } from '../src/application/create-entity';
import { workspacesForTypes } from './workspace-fixtures';
import {
  createTestEntity,
  createTestRelation,
  SOURCE_ID,
  TARGET_ID,
  OTHER_ID,
} from './entity-fixtures';

async function setup() {
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types, 'default');
  const index = new EntityIndex();
  const root = createTestEntity({ workspaceId: 'default', type: 'character' });
  const other = createTestEntity({ id: TARGET_ID, workspaceId: 'default', filePath: 'Other.md' });
  index.upsert(root);
  index.upsert(other);
  const persist = vi.fn(async () => undefined);
  const boards = new WorkspaceBoardStore(undefined, workspaces, index, persist);
  await boards.addEntity('default', root.id, { x: 100, y: 100 });
  await boards.addEntity('default', other.id, { x: 400, y: 180 });
  const relations = new RelationTypeRegistry(workspaces, types);
  const writer = {
    createEntity: vi.fn(async (input: NewEntity) => {
      const entity = createTestEntity({
        ...input,
        filePath: `Ideas/${input.title}.md`,
        updatedAt: input.createdAt,
      });
      index.upsert(entity);
      return entity;
    }),
  };
  return { types, workspaces, index, boards, relations, writer, persist, root, other };
}

async function grouped() {
  const services = await setup();
  await services.boards.createGroup('default', [SOURCE_ID, TARGET_ID], 'Act I');
  const group = services.boards.getBoard('default').groups[0]!;
  return { ...services, group };
}

describe('temporary Brainstorm context', () => {
  it('uses the root workspace and preserves an existing placement', async () => {
    const services = await setup();
    await services.workspaces.create({ id: 'other', label: 'Other' });
    await services.workspaces.setActive('other');
    const before = services.boards.getBoard('default');
    await prepareBrainstormContext(SOURCE_ID, services);
    expect(services.workspaces.getActive().id).toBe('default');
    expect(services.boards.getBoard('default')).toBe(before);
    expect(JSON.stringify(before)).not.toMatch(/context|title|relation/);
  });

  it('places a root not yet on board without changing domain data', async () => {
    const services = await setup();
    await services.boards.removeEntity('default', SOURCE_ID);
    await prepareBrainstormContext(SOURCE_ID, services);
    expect(services.boards.getBoard('default').nodes[SOURCE_ID]).toBeDefined();
    expect(services.index.getById(SOURCE_ID)).toEqual(services.root);
  });

  it('rejects missing roots and retired workspaces safely', async () => {
    const services = await setup();
    await expect(prepareBrainstormContext(OTHER_ID, services)).rejects.toThrow('no longer');
    await services.workspaces.create({ id: 'retired', label: 'Retired' });
    services.index.upsert({ ...services.root, workspaceId: 'retired' });
    await services.workspaces.update('retired', { retired: true });
    await expect(prepareBrainstormContext(SOURCE_ID, services)).rejects.toThrow('Restore');
  });

  it('recognizes incoming and outgoing neighbors without placing them or including unrelated entities', async () => {
    const services = await setup();
    services.index.upsert({ ...services.root, relations: [createTestRelation()] });
    services.index.upsert(
      createTestEntity({
        id: OTHER_ID,
        workspaceId: 'default',
        filePath: 'Incoming.md',
        relations: [createTestRelation({ targetEntityId: SOURCE_ID })],
      }),
    );
    expect([...contextualNeighbors(SOURCE_ID, services.index)].sort()).toEqual(
      [SOURCE_ID, TARGET_ID, OTHER_ID].sort(),
    );
    expect(services.boards.getBoard('default').nodes[OTHER_ID]).toBeUndefined();
    services.index.upsert({ ...services.other, relations: [] });
    expect(contextualNeighbors(OTHER_ID, services.index).has(TARGET_ID)).toBe(false);
  });

  it('calculates the actual measured card center independently of viewport zoom', () => {
    expect(entityCenter({ x: 100, y: -20 }, 220, 120)).toEqual({ x: 210, y: 40 });
  });
});

describe('connected ideas', () => {
  it('creates a real UUID Idea with a single explicit new-to-root relation and nearby placement', async () => {
    const services = await setup();
    const original = structuredClone(services.root);
    const created = await createConnectedIdea(
      SOURCE_ID,
      'What if Mira knew?\n\nBody',
      'related-to',
      services,
    );
    expect(created.type).toBe('idea');
    expect(created.workspaceId).toBe('default');
    expect(created.id).toMatch(/^[a-f\d-]{36}$/);
    expect(created.relations).toHaveLength(1);
    expect(created.relations[0]).toMatchObject({ type: 'related-to', targetEntityId: SOURCE_ID });
    expect(services.writer.createEntity.mock.calls[0]?.[0].content).toContain('\n\nBody');
    expect(services.index.getById(SOURCE_ID)).toEqual(original);
    const position = services.boards.getBoard('default').nodes[created.id]!;
    expect(Math.abs(position.x - 100)).toBeLessThan(900);
    expect(Math.abs(position.y - 100)).toBeLessThan(500);
  });

  it('offers only valid new-Idea-to-root kinds and uses a chosen alternate', async () => {
    const services = await setup();
    await services.workspaces.addRelationType('default', {
      id: 'questions',
      label: 'Questions',
      sourceEntityTypeIds: ['idea'],
      targetEntityTypeIds: ['character'],
    });
    await services.workspaces.addRelationType('default', {
      id: 'appears-in',
      label: 'Appears in',
      sourceEntityTypeIds: ['character'],
      targetEntityTypeIds: ['scene'],
    });
    expect(connectedIdeaRelations(SOURCE_ID, services).map((item) => item.id)).toContain(
      'questions',
    );
    expect(connectedIdeaRelations(SOURCE_ID, services).map((item) => item.id)).not.toContain(
      'appears-in',
    );
    const created = await createConnectedIdea(SOURCE_ID, 'A question', 'questions', services);
    expect(created.relations[0]?.type).toBe('questions');
  });

  it.each(['unknown-kind', 'appears-in'])(
    'rejects invalid kind %s before writing',
    async (kind) => {
      const services = await setup();
      await expect(createConnectedIdea(SOURCE_ID, 'Invalid', kind, services)).rejects.toThrow(
        'unavailable',
      );
      expect(services.writer.createEntity).not.toHaveBeenCalled();
    },
  );

  it('rechecks retired kinds and disabled Idea creation at commit time', async () => {
    const services = await setup();
    await services.workspaces.addRelationType('default', {
      id: 'questions',
      label: 'Questions',
      sourceEntityTypeIds: ['idea'],
      targetEntityTypeIds: ['character'],
    });
    expect(
      connectedIdeaRelations(SOURCE_ID, services).some((item) => item.id === 'questions'),
    ).toBe(true);
    await services.workspaces.updateRelationType('default', 'questions', { retired: true });
    await expect(createConnectedIdea(SOURCE_ID, 'Stale', 'questions', services)).rejects.toThrow(
      'unavailable',
    );
    await services.workspaces.update('default', { enabledEntityTypeIds: ['character'] });
    await expect(
      createConnectedIdea(SOURCE_ID, 'Disabled', 'related-to', services),
    ).rejects.toThrow('disabled');
    expect(services.writer.createEntity).not.toHaveBeenCalled();
  });

  it('rejects empty content or a removed root without creating orphan notes', async () => {
    const services = await setup();
    await expect(createConnectedIdea(SOURCE_ID, '  ', 'related-to', services)).rejects.toThrow(
      'Write',
    );
    await services.boards.removeEntity('default', SOURCE_ID);
    await expect(createConnectedIdea(SOURCE_ID, 'Missing', 'related-to', services)).rejects.toThrow(
      'root',
    );
    expect(services.writer.createEntity).not.toHaveBeenCalled();
  });

  it('inherits the current root group and expands bounds without moving existing cards', async () => {
    const services = await grouped();
    const before = services.boards.getBoard('default');
    const created = await createConnectedIdea(SOURCE_ID, 'Grouped idea', 'supports', services);
    const after = services.boards.getBoard('default');
    expect(groupForEntity(after, created.id)?.id).toBe(services.group.id);
    expect(after.nodes[SOURCE_ID]).toEqual(before.nodes[SOURCE_ID]);
    expect(after.nodes[TARGET_ID]).toEqual(before.nodes[TARGET_ID]);
  });

  it('reports saved-note recovery after placement failure without losing the real relation', async () => {
    const services = await setup();
    services.persist.mockRejectedValueOnce(new Error('Disk unavailable'));
    await expect(
      createConnectedIdea(SOURCE_ID, 'Recover me', 'related-to', services),
    ).rejects.toBeInstanceOf(ConnectedIdeaPlacementError);
    const saved = await services.writer.createEntity.mock.results[0]!.value;
    expect(services.index.getById(saved.id)?.relations[0]?.targetEntityId).toBe(SOURCE_ID);
    expect(services.boards.getBoard('default').nodes[saved.id]).toBeUndefined();
  });
});

describe('visual groups', () => {
  it('fits selected cards with minimum usable size and a stable persisted identity', async () => {
    const { boards, group, workspaces, index } = await grouped();
    expect(group.id).toMatch(/^group-[a-f\d-]{36}$/);
    expect(group.label).toBe('Act I');
    expect(group.entityIds).toEqual([SOURCE_ID, TARGET_ID]);
    expect(group.width).toBeGreaterThanOrEqual(300);
    expect(group.height).toBeGreaterThanOrEqual(220);
    expect(groupBounds(boards.getBoard('default').nodes, group.entityIds)).toMatchObject({
      x: 68,
      y: 44,
    });
    const restored = new WorkspaceBoardStore(
      JSON.parse(JSON.stringify(boards.getSavedBoards())),
      workspaces,
      index,
    );
    expect(restored.getBoard('default').groups[0]).toEqual(group);
    expect(Object.keys(group).sort()).toEqual([
      'entityIds',
      'height',
      'id',
      'label',
      'width',
      'x',
      'y',
    ]);
  });

  it('requires at least two ungrouped distinct current nodes, avoiding silent regrouping', async () => {
    const { boards } = await grouped();
    await expect(boards.createGroup('default', [SOURCE_ID, TARGET_ID], 'Another')).rejects.toThrow(
      'ungrouped',
    );
    await expect(boards.createGroup('default', [SOURCE_ID], 'One')).rejects.toThrow('two');
    await expect(
      boards.createGroup('default', [SOURCE_ID, SOURCE_ID], 'Duplicate'),
    ).rejects.toThrow('distinct');
    await expect(boards.createGroup('default', [SOURCE_ID, OTHER_ID], 'Missing')).rejects.toThrow(
      'still',
    );
  });

  it('moves a whole group atomically, preserving member offsets and writing once', async () => {
    const { boards, group, persist } = await grouped();
    const before = boards.getBoard('default');
    const calls = persist.mock.calls.length;
    await boards.moveGroup('default', group.id, { x: group.x + 75, y: group.y - 40 });
    expect(persist).toHaveBeenCalledTimes(calls + 1);
    for (const id of group.entityIds) {
      expect(boards.getBoard('default').nodes[id]).toEqual({
        x: before.nodes[id]!.x + 75,
        y: before.nodes[id]!.y - 40,
      });
    }
  });

  it('rejects out-of-bounds movement without changing any positions', async () => {
    const { boards, group } = await grouped();
    const before = boards.getBoard('default');
    await expect(boards.moveGroup('default', group.id, { x: 100_000, y: 0 })).rejects.toThrow();
    expect(boards.getBoard('default')).toBe(before);
  });

  it('renames groups and preserves membership, ID and domain data', async () => {
    const { boards, group, root, index } = await grouped();
    await boards.renameGroup('default', group.id, '  Act II  ');
    expect(boards.getBoard('default').groups[0]).toEqual({ ...group, label: 'Act II' });
    expect(index.getById(root.id)).toEqual(root);
    await expect(boards.renameGroup('default', group.id, '')).rejects.toThrow('name');
  });

  it('supports explicit membership changes with at most one group', async () => {
    const { boards, group } = await grouped();
    await boards.assignGroup('default', [SOURCE_ID], null);
    expect(groupForEntity(boards.getBoard('default'), SOURCE_ID)).toBeUndefined();
    expect(boards.getBoard('default').nodes[SOURCE_ID]).toBeDefined();
    await boards.assignGroup('default', [SOURCE_ID], group.id);
    expect(groupForEntity(boards.getBoard('default'), SOURCE_ID)?.id).toBe(group.id);
    await expect(boards.assignGroup('default', [SOURCE_ID], 'missing')).rejects.toThrow(
      'available',
    );
  });

  it('explicit transfer removes prior membership and retains both boundaries', async () => {
    const services = await grouped();
    services.index.upsert(
      createTestEntity({ id: OTHER_ID, filePath: 'Third.md', workspaceId: 'default' }),
    );
    await services.boards.addEntity('default', OTHER_ID, { x: 900, y: 300 });
    await services.boards.assignGroup('default', [SOURCE_ID], null);
    await services.boards.createGroup('default', [SOURCE_ID, OTHER_ID], 'Second');
    const second = services.boards.getBoard('default').groups[1]!;
    await services.boards.assignGroup('default', [TARGET_ID], second.id);
    const board = services.boards.getBoard('default');
    expect(board.groups[0]?.entityIds).toEqual([]);
    expect(board.groups.filter((group) => group.entityIds.includes(TARGET_ID))).toHaveLength(1);
  });

  it('moving a card clearly outside removes membership; inside movement keeps it', async () => {
    const { boards, group } = await grouped();
    await boards.moveEntity('default', SOURCE_ID, { x: 110, y: 105 });
    expect(groupForEntity(boards.getBoard('default'), SOURCE_ID)?.id).toBe(group.id);
    await boards.moveEntity('default', SOURCE_ID, { x: 1800, y: 1500 });
    expect(groupForEntity(boards.getBoard('default'), SOURCE_ID)).toBeUndefined();
    expect(boards.getBoard('default').groups).toHaveLength(1);
  });

  it('removes only a group, preserving absolute positions, relations and every entity', async () => {
    const { boards, group, index, root } = await grouped();
    index.upsert({ ...root, relations: [createTestRelation()] });
    const before = structuredClone(index.getAll());
    const nodes = boards.getBoard('default').nodes;
    await boards.removeGroup('default', group.id);
    expect(boards.getBoard('default').groups).toEqual([]);
    expect(boards.getBoard('default').nodes).toEqual(nodes);
    expect(index.getAll()).toEqual(before);
  });

  it('remove-from-board cleans membership and preserves the group and remaining member', async () => {
    const { boards, index, group } = await grouped();
    await boards.removeEntity('default', SOURCE_ID);
    expect(boards.getBoard('default').groups[0]).toMatchObject({
      id: group.id,
      entityIds: [TARGET_ID],
    });
    expect(index.getById(SOURCE_ID)).toBeDefined();
  });

  it('external deletion cleans group membership only after readiness and keeps the empty zone', async () => {
    const { boards, index, root, other } = await grouped();
    index.removePath(root.filePath);
    await boards.cleanupDeletedEntities();
    expect(boards.getBoard('default').groups[0]?.entityIds).toContain(SOURCE_ID);
    index.markReady();
    await boards.cleanupDeletedEntities();
    expect(boards.getBoard('default').groups[0]?.entityIds).toEqual([TARGET_ID]);
    index.removePath(other.filePath);
    await boards.cleanupDeletedEntities();
    expect(boards.getBoard('default').groups[0]?.entityIds).toEqual([]);
  });

  it('keeps independent group layouts through workspace switching, retirement and restoration', async () => {
    const { boards, workspaces, group, index } = await grouped();
    await workspaces.create({ id: 'novel', label: 'Novel' });
    const first = createTestEntity({
      id: OTHER_ID,
      workspaceId: 'novel',
      filePath: 'Novel/One.md',
    });
    const second = createTestEntity({
      id: crypto.randomUUID(),
      workspaceId: 'novel',
      filePath: 'Novel/Two.md',
    });
    index.upsert(first);
    index.upsert(second);
    await boards.addEntity('novel', first.id, { x: 800, y: 400 });
    await boards.addEntity('novel', second.id, { x: 1100, y: 400 });
    await boards.createGroup('novel', [first.id, second.id], 'Novel zone');
    const novelGroup = boards.getBoard('novel').groups[0];
    await workspaces.setActive('novel');
    expect(boards.getBoard(workspaces.getActive().id).groups[0]).toEqual(novelGroup);
    await workspaces.update('novel', { retired: true });
    expect(boards.getBoard('novel').groups[0]).toEqual(novelGroup);
    await expect(boards.removeGroup('novel', novelGroup!.id)).rejects.toThrow('active');
    await workspaces.update('novel', { retired: false });
    await workspaces.setActive('novel');
    expect(boards.getBoard('novel').groups[0]).toEqual(novelGroup);
    expect(boards.getBoard('default').groups[0]).toEqual(group);
  });

  it('upgrades a saved M5 layout without changing positions or viewport', async () => {
    const { workspaces, index } = await setup();
    const legacy = {
      workspaceId: 'default',
      nodes: { [SOURCE_ID]: { x: 41, y: -250 } },
      viewport: { x: 120, y: -20, zoom: 0.8 },
    };
    const store = new WorkspaceBoardStore([legacy], workspaces, index);
    expect(store.getBoard('default')).toEqual({ ...legacy, groups: [] });
    expect(legacy).not.toHaveProperty('groups');
  });

  it('retains invalid, dual and stale membership configurations for explicit recovery', async () => {
    const { boards, group, workspaces, index } = await grouped();
    const board = boards.getBoard('default');
    for (const groups of [
      [{ ...group, entityIds: [OTHER_ID] }],
      [group, { ...group, id: `group-${OTHER_ID}` }],
      [{ ...group, width: -1 }],
    ]) {
      const raw = { ...board, groups };
      const restored = new WorkspaceBoardStore([raw], workspaces, index);
      expect(restored.unreadableBoards).toEqual([raw]);
      expect(restored.getSavedBoards()).toEqual([]);
    }
  });

  it('fits bounds without moving or scaling members', async () => {
    const { boards, group } = await grouped();
    await boards.assignGroup('default', [TARGET_ID], null);
    const before = boards.getBoard('default').nodes;
    await boards.fitGroup('default', group.id);
    expect(boards.getBoard('default').nodes).toEqual(before);
    expect(boards.getBoard('default').groups[0]?.width).toBe(300);
  });
});

describe('XYFlow group translation boundary', () => {
  it('adapts independent absolute zones without parent metadata and previews member translation once', async () => {
    const { boards, group } = await grouped();
    const board = boards.getBoard('default');
    const zones = groupNodes(board);
    const cards: BoardFlowNode[] = Object.entries(board.nodes).map(([id, position]) => ({
      id,
      position,
      type: 'entity',
      data: {
        entity: createTestEntity({ id }),
        typeLabel: 'Idea',
        icon: 'lightbulb',
        openEntity: () => undefined,
      },
    }));
    expect(zones[0]).not.toHaveProperty('parentId');
    const moved = previewGroupMove([...zones, ...cards], group.id, {
      x: group.x + 50,
      y: group.y + 80,
    });
    expect(moved.find((node) => node.id === SOURCE_ID)?.position).toEqual({ x: 150, y: 180 });
    expect(previewGroupMove(moved, group.id, { x: group.x + 50, y: group.y + 80 })).toEqual(moved);
    expect(board.nodes[SOURCE_ID]).toEqual({ x: 100, y: 100 });
  });
});
