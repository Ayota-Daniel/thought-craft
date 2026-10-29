import { describe, expect, it, vi } from 'vitest';
import { WorkspaceBoardStore } from '../src/application/workspace-board-store';
import { createBoardIdea, availableBoardRelations } from '../src/application/board-actions';
import { projectBoard } from '../src/application/board-projection';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { nextBoardPosition, type WorkspaceBoardState } from '../src/domain/board';
import type { NewEntity } from '../src/application/create-entity';
import { migrateWorkspaces } from '../src/settings/workspace-migration';
import { workspacesForTypes } from './workspace-fixtures';
import { createTestEntity, createTestRelation, TARGET_ID } from './entity-fixtures';

function setup(data?: unknown) {
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types, 'default');
  const index = new EntityIndex();
  const source = createTestEntity({ workspaceId: 'default' });
  const target = createTestEntity({
    id: TARGET_ID,
    type: 'scene',
    workspaceId: 'default',
    filePath: 'Scenes/Arrival.md',
  });
  index.upsert(source);
  index.upsert(target);
  const persist = vi.fn<(boards: readonly WorkspaceBoardState[]) => Promise<void>>(
    async () => undefined,
  );
  const boards = new WorkspaceBoardStore(data, workspaces, index, persist);
  const relations = new RelationTypeRegistry(workspaces, types);
  return { types, workspaces, index, source, target, persist, boards, relations };
}

const position = { x: 120, y: 80 };

describe('board visual state', () => {
  it('creates no persisted state merely by viewing an empty workspace', () => {
    const { boards, persist } = setup();
    expect(boards.getBoard('default')).toEqual({
      workspaceId: 'default',
      nodes: {},
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(boards.getBoard('default')).toBe(boards.getBoard('default'));
    expect(boards.getSavedBoards()).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });

  it('stores UUID membership, position and viewport without any entity metadata or edges', async () => {
    const { boards, source, persist } = setup();
    await boards.addEntity('default', source.id, position);
    await boards.setViewport('default', { x: 30, y: -70, zoom: 0.75 });
    expect(persist.mock.calls[1]?.[0]).toEqual([
      {
        workspaceId: 'default',
        nodes: { [source.id]: position },
        groups: [],
        viewport: { x: 30, y: -70, zoom: 0.75 },
      },
    ]);
    expect(Object.isFrozen(boards.getBoard('default').nodes[source.id])).toBe(true);
  });

  it('persists a settled move and restores it through configuration reload', async () => {
    const { boards, source, workspaces, index } = setup();
    await boards.addEntity('default', source.id, position);
    await boards.moveEntity('default', source.id, { x: -55.5, y: 240 });
    await boards.setViewport('default', { x: 20, y: 30, zoom: 1.25 });
    const restored = new WorkspaceBoardStore(
      JSON.parse(JSON.stringify(boards.getSavedBoards())),
      workspaces,
      index,
    );
    expect(restored.getBoard('default')).toEqual(boards.getBoard('default'));
  });

  it('removes only board membership and leaves indexed entity data untouched', async () => {
    const { boards, source, index } = setup();
    const original = structuredClone(source);
    await boards.addEntity('default', source.id, position);
    await boards.removeEntity('default', source.id);
    expect(boards.getBoard('default').nodes).toEqual({});
    expect(index.getById(source.id)).toEqual(original);
  });

  it('rejects duplicate placement and cross-workspace placement', async () => {
    const { boards, workspaces, source, index } = setup();
    await workspaces.create({ id: 'novel', label: 'Novel' });
    await boards.addEntity('default', source.id, position);
    await expect(boards.addEntity('default', source.id, position)).rejects.toThrow('already');
    await expect(boards.addEntity('novel', source.id, position)).rejects.toThrow('Workspace');
    index.removePath(source.filePath);
    await expect(boards.addEntity('default', source.id, position)).rejects.toThrow('existing');
    await expect(boards.moveEntity('default', TARGET_ID, position)).rejects.toThrow('no longer');
  });

  it('isolates layouts and viewports while the active workspace changes', async () => {
    const { boards, workspaces, index, source } = setup();
    await workspaces.create({ id: 'novel', label: 'Novel' });
    index.upsert(createTestEntity({ id: TARGET_ID, workspaceId: 'novel', filePath: 'Novel.md' }));
    await boards.addEntity('default', source.id, position);
    await workspaces.setActive('novel');
    await boards.addEntity('novel', TARGET_ID, { x: 800, y: 900 });
    await boards.setViewport('novel', { x: -100, y: 20, zoom: 0.5 });
    await workspaces.setActive('default');
    expect(boards.getBoard(workspaces.getActive().id).nodes[source.id]).toEqual(position);
    expect(boards.getBoard('default').viewport.zoom).toBe(1);
    expect(boards.getBoard('novel').nodes[TARGET_ID]).toEqual({ x: 800, y: 900 });
  });

  it('retains a retired workspace layout and reuses it after restoration', async () => {
    const { boards, workspaces, index } = setup();
    await workspaces.create({ id: 'novel', label: 'Novel' });
    index.upsert(createTestEntity({ id: TARGET_ID, workspaceId: 'novel', filePath: 'Novel.md' }));
    await boards.addEntity('novel', TARGET_ID, position);
    await workspaces.update('novel', { retired: true });
    await expect(boards.setViewport('novel', { x: 1, y: 1, zoom: 1 })).rejects.toThrow('active');
    expect(boards.getBoard('novel').nodes[TARGET_ID]).toEqual(position);
    await workspaces.update('novel', { retired: false });
    expect(projectBoard(boards.getBoard('novel'), index).entities).toHaveLength(1);
  });

  it('allows existing disabled, retired and unknown types to stay placed', async () => {
    const { boards, workspaces, types, source, target, index } = setup();
    await boards.addEntity('default', target.id, position);
    await workspaces.update('default', { enabledEntityTypeIds: ['idea'] });
    expect(projectBoard(boards.getBoard('default'), index).entities[0]?.entity.type).toBe('scene');
    await types.createCustomType({ id: 'creature', label: 'Creature', folderName: 'Creatures' });
    index.upsert({ ...source, type: 'creature' });
    await boards.addEntity('default', source.id, { x: 500, y: 400 });
    await types.updateType('creature', { retired: true });
    expect(projectBoard(boards.getBoard('default'), index).entities).toHaveLength(2);
    const withoutSchema = new EntityTypeRegistry();
    expect(withoutSchema.label('creature')).toMatch('Unknown');
    expect(
      projectBoard(boards.getBoard('default'), index).entities.find(
        ({ entity }) => entity.id === source.id,
      )?.entity.type,
    ).toBe('creature');
  });

  it('serializes independent operations and skips unchanged viewport/position writes', async () => {
    const { boards, persist, source, target } = setup();
    await Promise.all([
      boards.addEntity('default', source.id, position),
      boards.addEntity('default', target.id, { x: 500, y: 300 }),
    ]);
    await Promise.all([
      boards.moveEntity('default', source.id, { x: 40, y: 60 }),
      boards.setViewport('default', { x: 20, y: 30, zoom: 0.75 }),
    ]);
    expect(Object.keys(boards.getBoard('default').nodes)).toHaveLength(2);
    expect(boards.getBoard('default').viewport.zoom).toBe(0.75);
    const before = persist.mock.calls.length;
    await boards.moveEntity('default', source.id, { x: 40, y: 60 });
    await boards.setViewport('default', { x: 20, y: 30, zoom: 0.75 });
    await boards.removeEntity('default', 'missing');
    expect(persist).toHaveBeenCalledTimes(before);
  });

  it('does not publish failed persistence and can recover on the next action', async () => {
    const { boards, persist, source } = setup();
    const listener = vi.fn();
    const unsubscribe = boards.subscribe(listener);
    persist.mockRejectedValueOnce(new Error('Disk unavailable'));
    await expect(boards.addEntity('default', source.id, position)).rejects.toThrow('Disk');
    expect(boards.getBoard('default').nodes).toEqual({});
    expect(listener).not.toHaveBeenCalled();
    await boards.addEntity('default', source.id, position);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    boards.dispose();
    await expect(boards.removeEntity('default', source.id)).rejects.toThrow('no longer active');
  });

  it.each([
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: 200_000, y: 0 },
  ])('rejects unsafe coordinates %j', async (point) => {
    const { boards, source } = setup();
    await expect(boards.addEntity('default', source.id, point)).rejects.toThrow('position');
    expect(boards.getSavedBoards()).toEqual([]);
  });

  it.each([0, -1, 10, NaN])('rejects unsafe zoom %s without altering the board', async (zoom) => {
    const { boards } = setup();
    await expect(boards.setViewport('default', { x: 0, y: 0, zoom })).rejects.toThrow('zoom');
    expect(boards.getSavedBoards()).toEqual([]);
  });

  it('finds a clear nearby slot even when several first offsets are occupied', () => {
    const board: WorkspaceBoardState = {
      workspaceId: 'default',
      groups: [],
      nodes: {
        one: { x: 100, y: 100 },
        two: { x: 550, y: 100 },
        three: { x: 100, y: 400 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const next = nextBoardPosition(board, { x: 40, y: 40 });
    expect(
      Object.values(board.nodes).every(
        (other) => Math.abs(other.x - next.x) >= 240 || Math.abs(other.y - next.y) >= 170,
      ),
    ).toBe(true);
  });

  it('retains malformed saved boards for recovery rather than replacing their raw data', () => {
    const raw = {
      workspaceId: 'default',
      nodes: { bad_id: position },
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const { boards } = setup([raw]);
    expect(boards.issues).toHaveLength(1);
    expect(boards.unreadableBoards).toEqual([raw]);
    expect(boards.getSavedBoards()).toEqual([]);
    expect(() => setup('malformed root')).toThrow('list');
  });

  it('uses a small nearby offset for occupied initial placement without rearranging other nodes', async () => {
    const { boards, source } = setup();
    const empty = boards.getBoard('default');
    expect(nextBoardPosition(empty, position)).toEqual(position);
    await boards.addEntity('default', source.id, position);
    const next = nextBoardPosition(boards.getBoard('default'), position);
    expect(next).not.toEqual(position);
    expect(boards.getBoard('default').nodes[source.id]).toEqual(position);
  });
});

describe('board synchronization and projection', () => {
  it('waits for index readiness before cleanup, then prunes only stale placements', async () => {
    const initial = [
      {
        workspaceId: 'default',
        nodes: { [createTestEntity().id]: position, [TARGET_ID]: { x: 500, y: 20 } },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    ];
    const { boards, index, target, source, persist } = setup(initial);
    index.removePath(target.filePath);
    await boards.cleanupDeletedEntities();
    expect(boards.getBoard('default').nodes[TARGET_ID]).toBeDefined();
    expect(persist).not.toHaveBeenCalled();
    index.markReady();
    await boards.cleanupDeletedEntities();
    expect(boards.getBoard('default').nodes).toEqual({ [source.id]: position });
    expect(index.getById(source.id)).toEqual(source);
    await boards.cleanupDeletedEntities();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('renames by UUID and resolves external metadata/relation updates without copying them into layout', async () => {
    const { boards, index, source, target } = setup();
    await boards.addEntity('default', source.id, position);
    await boards.addEntity('default', target.id, { x: 500, y: 100 });
    const relation = createTestRelation();
    index.upsert({ ...source, relations: [relation] });
    expect(projectBoard(boards.getBoard('default'), index).relationships[0]?.relation).toEqual(
      relation,
    );
    index.renamePath(source.filePath, 'Renamed thought.md');
    index.upsert({ ...index.getById(source.id)!, schemaValues: { importance: 5 } });
    const projection = projectBoard(boards.getBoard('default'), index);
    expect(projection.entities.find(({ entity }) => entity.id === source.id)?.entity.title).toBe(
      'Renamed thought',
    );
    expect(
      projection.entities.find(({ entity }) => entity.id === source.id)?.entity.schemaValues,
    ).toEqual({ importance: 5 });
    expect(boards.getBoard('default').nodes[source.id]).toEqual(position);
    index.upsert({ ...index.getById(source.id)!, relations: [] });
    expect(projectBoard(boards.getBoard('default'), index).relationships).toEqual([]);
  });

  it('omits off-board, missing and cross-workspace endpoints without deleting stored relations', async () => {
    const { boards, index, source, target } = setup();
    index.upsert({ ...source, relations: [createTestRelation()] });
    await boards.addEntity('default', source.id, position);
    expect(projectBoard(boards.getBoard('default'), index).relationships).toEqual([]);
    await boards.addEntity('default', target.id, { x: 500, y: 100 });
    expect(projectBoard(boards.getBoard('default'), index).relationships).toHaveLength(1);
    index.upsert({ ...target, workspaceId: 'another-workspace' });
    expect(projectBoard(boards.getBoard('default'), index).entities).toHaveLength(1);
    expect(projectBoard(boards.getBoard('default'), index).relationships).toEqual([]);
    index.removePath(target.filePath);
    expect(index.getById(source.id)?.relations).toHaveLength(1);
  });
});

describe('board actions and configuration migration', () => {
  it('creates an Idea through the existing writer, then places the real UUID in the correct workspace', async () => {
    const { boards, index, workspaces, types } = setup();
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
    const created = await createBoardIdea(
      'A real idea\n\nBody content',
      'default',
      position,
      writer,
      boards,
      workspaces,
      types,
    );
    expect(created.id).toMatch(/^[a-f\d-]{36}$/);
    expect(created.type).toBe('idea');
    expect(created.workspaceId).toBe('default');
    expect(writer.createEntity.mock.calls[0]?.[0].content).toBe('A real idea\n\nBody content');
    expect(boards.getBoard('default').nodes[created.id]).toEqual(position);
    const restored = new WorkspaceBoardStore(boards.getSavedBoards(), workspaces, index);
    expect(restored.getBoard('default').nodes[created.id]).toEqual(position);
  });

  it('rejects new Ideas when disabled and reports a recoverable placement failure without losing the created entity', async () => {
    const { boards, index, workspaces, types } = setup();
    const writer = {
      createEntity: vi.fn(async (input: NewEntity) => {
        const entity = createTestEntity({ ...input });
        index.upsert(entity);
        return entity;
      }),
    };
    await workspaces.update('default', { enabledEntityTypeIds: [] });
    await expect(
      createBoardIdea('Disabled', 'default', position, writer, boards, workspaces, types),
    ).rejects.toThrow('disabled');
    expect(writer.createEntity).not.toHaveBeenCalled();
    await workspaces.update('default', { enabledEntityTypeIds: ['idea'] });
    boards.dispose();
    await expect(
      createBoardIdea('Recoverable', 'default', position, writer, boards, workspaces, types),
    ).rejects.toThrow('idea is saved');
    const saved = await writer.createEntity.mock.results[0]!.value;
    expect(index.getById(saved.id)?.title).toBe('Recoverable');
  });

  it('rejects an invalid initial board position before creating a Markdown entity', async () => {
    const { boards, workspaces, types } = setup();
    const writer = { createEntity: vi.fn() };
    await expect(
      createBoardIdea(
        'Keep it safe',
        'default',
        { x: NaN, y: 0 },
        writer,
        boards,
        workspaces,
        types,
      ),
    ).rejects.toThrow('position');
    expect(writer.createEntity).not.toHaveBeenCalled();
  });

  it('offers universal/custom options from existing rules and excludes duplicates, self links and incompatible kinds', async () => {
    const { boards, index, workspaces, source, target, relations } = setup();
    index.upsert({ ...source, type: 'character' });
    await workspaces.addRelationType('default', {
      id: 'appears-in',
      label: 'Appears in',
      sourceEntityTypeIds: ['character'],
      targetEntityTypeIds: ['scene'],
    });
    await boards.addEntity('default', source.id, position);
    await boards.addEntity('default', target.id, { x: 500, y: 100 });
    const options = () =>
      availableBoardRelations('default', source.id, target.id, boards, index, relations).map(
        (relation) => relation.id,
      );
    expect(options()).toContain('related-to');
    expect(options()).toContain('appears-in');
    index.upsert({
      ...index.getById(source.id)!,
      relations: [createTestRelation({ type: 'appears-in' })],
    });
    expect(options()).not.toContain('appears-in');
    expect(
      availableBoardRelations('default', source.id, source.id, boards, index, relations),
    ).toEqual([]);
    index.upsert({ ...target, type: 'location' });
    expect(options()).not.toContain('appears-in');
    await boards.removeEntity('default', target.id);
    expect(options()).toEqual([]);
  });

  it('preserves M4 configuration and active context while accepting lazy M5 board state', () => {
    const { types, workspaces } = setup();
    const m4 = {
      configVersion: 4,
      activeWorkspaceId: 'default',
      workspaces: workspaces.getAll(),
      entityTypes: types.getAll(),
      other: 'keep',
    };
    const original = structuredClone(m4);
    expect(migrateWorkspaces(m4, [])).toEqual({
      workspaces: m4.workspaces,
      activeWorkspaceId: 'default',
    });
    expect(m4).toEqual(original);
    expect(() => migrateWorkspaces({ configVersion: 8 }, [])).toThrow('newer');
    expect(
      migrateWorkspaces({ configVersion: 5, defaultWorkspace: 'obsolete' }, ['idea'])
        .activeWorkspaceId,
    ).toBe('default');
  });
});
