import { describe, expect, it, vi } from 'vitest';
import {
  queryInbox,
  EMPTY_INBOX_FILTERS,
  type InboxFilters,
  type InboxSort,
} from '../src/application/inbox-query';
import {
  visibleSelection,
  toggleSelection,
  selectRange,
} from '../src/application/entity-selection';
import { addEntitiesToBoard, moveEntitiesToTrash } from '../src/application/entity-batch';
import { focusVisibility, validFocusRoots } from '../src/application/board-focus';
import { WorkspaceBoardStore } from '../src/application/workspace-board-store';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { workspacesForTypes } from './workspace-fixtures';
import {
  createTestEntity,
  createTestRelation,
  SOURCE_ID,
  TARGET_ID,
  OTHER_ID,
} from './entity-fixtures';
import { RELATION_GUIDE, GUIDE_TOPICS } from '../src/ui/guide/guide-content';

function setup() {
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types, 'default');
  const index = new EntityIndex();
  const first = createTestEntity({
    workspaceId: 'default',
    title: 'Alpha train',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-28T12:00:00.000Z',
    relations: [createTestRelation()],
  });
  const second = createTestEntity({
    id: TARGET_ID,
    workspaceId: 'default',
    type: 'character',
    title: 'Mira',
    filePath: 'Mira.md',
    status: 'exploring',
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-21T12:00:00.000Z',
  });
  const third = createTestEntity({
    id: OTHER_ID,
    workspaceId: 'default',
    title: 'Zulu idea',
    filePath: 'Zulu.md',
    createdAt: '2026-10-25T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  });
  [first, second, third].forEach((entity) => index.upsert(entity));
  index.markReady();
  const persist = vi.fn(async () => undefined);
  const boards = new WorkspaceBoardStore(undefined, workspaces, index, persist);
  const query = (search = '', filters: Partial<InboxFilters> = {}, sort: InboxSort = 'newest') =>
    queryInbox(
      index.getAll(),
      'default',
      search,
      { ...EMPTY_INBOX_FILTERS, ...filters },
      sort,
      boards.getBoard('default'),
      types,
      Date.parse('2026-10-29T12:00:00.000Z'),
    ).map((entity) => entity.id);
  return { types, workspaces, index, boards, persist, first, second, third, query };
}

describe('Workspace-local Inbox queries', () => {
  it.each([
    ['TRAIN', SOURCE_ID],
    ['mIrA', TARGET_ID],
    ['character', TARGET_ID],
    ['  Zulu  ', OTHER_ID],
  ])('searches title or type without case sensitivity: %s', (search, id) => {
    expect(setup().query(search)).toEqual([id]);
  });
  it('returns an empty result for an unmatched search', () =>
    expect(setup().query('no match')).toEqual([]));
  it('scopes to the active Workspace and preserves the Idea inbox lifecycle', () => {
    const { index, first, second, query } = setup();
    index.upsert({ ...first, status: 'exploring' });
    index.upsert({ ...second, workspaceId: 'other' });
    expect(query()).toEqual([OTHER_ID]);
  });
  it('omits archived non-Idea entities', () => {
    const { index, second, query } = setup();
    index.upsert({ ...second, status: 'archived' });
    expect(query()).not.toContain(TARGET_ID);
  });
  it('filters by Entity type', () =>
    expect(setup().query('', { type: 'character' })).toEqual([TARGET_ID]));
  it('filters board membership in either direction', async () => {
    const { boards, query } = setup();
    await boards.addEntity('default', SOURCE_ID, { x: 0, y: 0 });
    expect(query('', { board: 'on' })).toEqual([SOURCE_ID]);
    expect(query('', { board: 'off' })).toEqual([OTHER_ID, TARGET_ID]);
  });
  it('counts incoming and outgoing relations, without treating an unrelated entity as related', () => {
    expect(setup().query('', { relations: 'has' })).toEqual([TARGET_ID, SOURCE_ID]);
    expect(setup().query('', { relations: 'none' })).toEqual([OTHER_ID]);
  });
  it('retains outgoing dangling links as relations', () => {
    const { index, second, query } = setup();
    index.removePath(second.filePath);
    expect(query('', { relations: 'has' })).toEqual([SOURCE_ID]);
  });
  it('uses a documented seven-day updated window', () =>
    expect(setup().query('', { recent: true })).toEqual([OTHER_ID, SOURCE_ID]));
  it('combines search, type, board, relations and recent filters', async () => {
    const { boards, query } = setup();
    await boards.addEntity('default', SOURCE_ID, { x: 0, y: 0 });
    expect(query('train', { type: 'idea', board: 'on', relations: 'has', recent: true })).toEqual([
      SOURCE_ID,
    ]);
  });
  it.each([
    ['newest', [OTHER_ID, TARGET_ID, SOURCE_ID]],
    ['oldest', [SOURCE_ID, TARGET_ID, OTHER_ID]],
    ['updated', [SOURCE_ID, OTHER_ID, TARGET_ID]],
    ['az', [SOURCE_ID, TARGET_ID, OTHER_ID]],
    ['za', [OTHER_ID, TARGET_ID, SOURCE_ID]],
  ] as [InboxSort, string[]][])('sorts %s deterministically', (sort, ids) =>
    expect(setup().query('', {}, sort)).toEqual(ids),
  );
});

describe('visible selection safety', () => {
  it('selects, toggles and clears without duplicates', () => {
    expect(toggleSelection([], SOURCE_ID)).toEqual([SOURCE_ID]);
    expect(toggleSelection([SOURCE_ID], SOURCE_ID)).toEqual([]);
    expect(visibleSelection([SOURCE_ID], [])).toEqual([]);
  });
  it('selects ranges in displayed order', () => {
    expect(selectRange([], [SOURCE_ID, OTHER_ID, TARGET_ID], SOURCE_ID, TARGET_ID)).toEqual([
      SOURCE_ID,
      OTHER_ID,
      TARGET_ID,
    ]);
  });
  it('clears hidden selection before batch actions and invalidates a hidden range anchor', () => {
    expect(visibleSelection([SOURCE_ID, TARGET_ID], [TARGET_ID])).toEqual([TARGET_ID]);
    expect(selectRange([SOURCE_ID], [TARGET_ID, OTHER_ID], SOURCE_ID, OTHER_ID)).toEqual([
      OTHER_ID,
    ]);
  });
});

describe('batch board actions and trash', () => {
  it('adds several distinct current-Workspace UUIDs in one save without editing entities', async () => {
    const { boards, persist, index } = setup();
    const before = structuredClone(index.getAll());
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID, SOURCE_ID, OTHER_ID], boards);
    expect(Object.keys(boards.getBoard('default').nodes)).toHaveLength(3);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(index.getAll()).toEqual(before);
    expect(
      new Set(Object.values(boards.getBoard('default').nodes).map((point) => JSON.stringify(point)))
        .size,
    ).toBe(3);
  });
  it('skips existing placements, retaining their exact position', async () => {
    const { boards } = setup();
    await boards.addEntity('default', SOURCE_ID, { x: 27, y: 52 });
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID], boards);
    expect(boards.getBoard('default').nodes[SOURCE_ID]).toEqual({ x: 27, y: 52 });
  });
  it('rejects moved/missing selections atomically', async () => {
    const { boards, index, second } = setup();
    index.upsert({ ...second, workspaceId: 'other' });
    await expect(addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID], boards)).rejects.toThrow(
      'Workspace',
    );
    expect(boards.getBoard('default').nodes).toEqual({});
  });
  it('trashes selected notes only, cleans board/groups and preserves incoming dangling edges', async () => {
    const { boards, index, second, third, first } = setup();
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID, OTHER_ID], boards);
    await boards.createGroup('default', [TARGET_ID, OTHER_ID], 'Targets');
    const writer = {
      trashEntity: vi.fn(async (id: string) => {
        const entity = index.getById(id)!;
        index.removePath(entity.filePath);
      }),
    };
    const result = await moveEntitiesToTrash(
      'default',
      [second.id, third.id],
      index,
      writer,
      boards,
    );
    expect(result.failures).toEqual([]);
    expect(result.succeeded).toEqual([TARGET_ID, OTHER_ID]);
    expect(boards.getBoard('default').groups[0]?.entityIds).toEqual([]);
    expect(Object.keys(boards.getBoard('default').nodes)).toEqual([SOURCE_ID]);
    expect(index.getById(SOURCE_ID)).toEqual(first);
    expect(index.getById(SOURCE_ID)?.relations[0]?.targetEntityId).toBe(TARGET_ID);
  });
  it('reports partial failures and deduplicates requests without cascading relations', async () => {
    const { boards, index, second } = setup();
    const writer = {
      trashEntity: vi.fn(async (id: string) => {
        if (id === TARGET_ID) throw new Error('Read-only file');
        index.removePath(index.getById(id)!.filePath);
      }),
    };
    const result = await moveEntitiesToTrash(
      'default',
      [SOURCE_ID, TARGET_ID, SOURCE_ID],
      index,
      writer,
      boards,
    );
    expect(result.succeeded).toEqual([SOURCE_ID]);
    expect(result.failures[0]).toMatchObject({
      id: TARGET_ID,
      title: second.title,
      message: 'Read-only file',
    });
    expect(writer.trashEntity).toHaveBeenCalledTimes(2);
  });
  it('reports successful trash separately from a failed layout cleanup', async () => {
    const { boards, index, first } = setup();
    vi.spyOn(boards, 'cleanupDeletedEntities').mockRejectedValueOnce(new Error('Disk full'));
    const writer = { trashEntity: vi.fn(async () => index.removePath(first.filePath)) };
    const result = await moveEntitiesToTrash('default', [SOURCE_ID], index, writer, boards);
    expect(result.succeeded).toEqual([SOURCE_ID]);
    expect(result.failures).toEqual([]);
    expect(result.cleanupWarning).toContain('layout cleanup');
    expect(index.getById(SOURCE_ID)).toBeUndefined();
  });
  it('does not trash an entity moved to another Workspace', async () => {
    const { boards, index, second } = setup();
    index.upsert({ ...second, workspaceId: 'other' });
    const writer = { trashEntity: vi.fn() };
    expect(
      (await moveEntitiesToTrash('default', [TARGET_ID], index, writer, boards)).failures,
    ).toHaveLength(1);
    expect(writer.trashEntity).not.toHaveBeenCalled();
  });
  it('settles a selection atomically and keeps its group memberships even beyond bounds', async () => {
    const { boards, persist } = setup();
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID, OTHER_ID], boards);
    await boards.createGroup('default', [SOURCE_ID, TARGET_ID], 'Thoughts');
    const before = boards.getBoard('default').groups;
    const calls = persist.mock.calls.length;
    await boards.moveSelection('default', {
      [SOURCE_ID]: { x: 2000, y: 400 },
      [TARGET_ID]: { x: 2300, y: 400 },
    });
    expect(boards.getBoard('default').groups).toEqual(before);
    expect(persist).toHaveBeenCalledTimes(calls + 1);
  });
  it('rejects invalid batch positions without publishing a partial move', async () => {
    const { boards } = setup();
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID], boards);
    const before = boards.getBoard('default');
    await expect(
      boards.moveSelection('default', {
        [SOURCE_ID]: { x: 300, y: 400 },
        [TARGET_ID]: { x: NaN, y: 0 },
      }),
    ).rejects.toThrow();
    expect(boards.getBoard('default')).toBe(before);
  });
});

describe('temporary multi-root Focus', () => {
  async function placed() {
    const services = setup();
    await addEntitiesToBoard('default', [SOURCE_ID, TARGET_ID, OTHER_ID], services.boards);
    return services;
  }
  it('shows one root and its incoming/outgoing neighbors, hiding unrelated entities without changing state', async () => {
    const { boards, index } = await placed();
    const before = boards.getBoard('default');
    expect([...focusVisibility([TARGET_ID], before, index)!].sort()).toEqual(
      [TARGET_ID, SOURCE_ID].sort(),
    );
    expect(boards.getBoard('default')).toBe(before);
  });
  it('unions roots but never recursively expands neighbors of neighbors', async () => {
    const { boards, index, second } = await placed();
    index.upsert({ ...second, relations: [createTestRelation({ targetEntityId: OTHER_ID })] });
    const board = boards.getBoard('default');
    expect(focusVisibility([SOURCE_ID], board, index)?.has(OTHER_ID)).toBe(false);
    expect(focusVisibility([SOURCE_ID, TARGET_ID], board, index)?.has(OTHER_ID)).toBe(true);
  });
  it('removing a root recalculates visibility; an empty root list means Show all', async () => {
    const { boards, index } = await placed();
    const board = boards.getBoard('default');
    expect(focusVisibility([SOURCE_ID, OTHER_ID], board, index)?.size).toBe(3);
    expect(focusVisibility([SOURCE_ID], board, index)?.has(OTHER_ID)).toBe(false);
    expect(focusVisibility([], board, index)).toBeNull();
  });
  it('rejects missing, off-board and moved roots while deduplicating valid roots', async () => {
    const { boards, index, third } = await placed();
    index.upsert({ ...third, workspaceId: 'other' });
    expect(
      validFocusRoots(
        [SOURCE_ID, SOURCE_ID, OTHER_ID, 'missing'],
        boards.getBoard('default'),
        index,
      ),
    ).toEqual([SOURCE_ID]);
  });
  it('keeps persisted groups intact while resolving visible members', async () => {
    const { boards, index } = await placed();
    await boards.createGroup('default', [SOURCE_ID, OTHER_ID], 'Mixed');
    const before = boards.getBoard('default');
    const visible = focusVisibility([TARGET_ID], before, index)!;
    expect(before.groups[0]?.entityIds.filter((id) => visible.has(id))).toEqual([SOURCE_ID]);
    expect(before.groups[0]?.entityIds).toEqual([SOURCE_ID, OTHER_ID]);
  });
  it('includes a newly connected Idea as a neighbor without making it a root', async () => {
    const { boards, index } = await placed();
    const id = crypto.randomUUID();
    index.upsert(
      createTestEntity({
        id,
        workspaceId: 'default',
        filePath: 'Connected.md',
        relations: [createTestRelation({ targetEntityId: SOURCE_ID })],
      }),
    );
    await addEntitiesToBoard('default', [id], boards);
    expect(focusVisibility([SOURCE_ID], boards.getBoard('default'), index)?.has(id)).toBe(true);
  });
});

describe('concise product documentation', () => {
  it('includes all five universal kinds, meanings and directed examples', () => {
    expect(RELATION_GUIDE.map((entry) => entry.label)).toEqual([
      'Related to',
      'Supports',
      'Alternative to',
      'Depends on',
      'Originated from',
    ]);
    expect(
      RELATION_GUIDE.every((entry) => entry.meaning.length > 20 && entry.example.includes('→')),
    ).toBe(true);
    expect(Object.keys(GUIDE_TOPICS)).toEqual([
      'Getting started',
      'Entities',
      'Properties',
      'Workspaces',
      'Brainstorm',
      'Story',
      'Plot',
      'Plot Threads',
      'Relations',
    ]);
  });
});
