import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ObsidianEntityRepository } from '../src/infrastructure/obsidian-entity-repository';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { setThreadMembership } from '../src/application/plot-threads';
import { workspacesForTypes } from './workspace-fixtures';
import { SOURCE_ID, TARGET_ID, OTHER_ID, CREATED_AT } from './entity-fixtures';

import { TFile } from 'obsidian';

async function setup() {
  const files = new Map<string, TFile>();
  const data = new Map<string, Record<string, unknown>>();
  for (const [id, type, path] of [
    [SOURCE_ID, 'scene', 'Scene.md'],
    [TARGET_ID, 'plot-thread', 'Thread.md'],
  ]) {
    files.set(path!, new (TFile as unknown as new (path: string) => TFile)(path!));
    data.set(path!, {
      bs_id: id,
      bs_type: type,
      bs_workspace: 'novel',
      bs_status: 'exploring',
      bs_created: CREATED_AT,
      bs_updated: CREATED_AT,
      user: { keep: true },
      bs_story: { order: 1000, custom: 'keep' },
      bs_relations: [],
    });
  }
  const read = vi.fn(async (file: TFile) => JSON.stringify(data.get(file.path)));
  const processFrontMatter = vi.fn(
    async (file: TFile, mutate: (metadata: Record<string, unknown>) => void) => {
      const copy = structuredClone(data.get(file.path)!);
      mutate(copy);
      data.set(file.path, copy);
    },
  );
  const app = {
    vault: { read, getAbstractFileByPath: (path: string) => files.get(path) },
    fileManager: { processFrontMatter },
  } as unknown as App;
  const index = new EntityIndex();
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types);
  const repository = new ObsidianEntityRepository(
    app,
    index,
    () => ({ entitiesFolder: 'Ideas', defaultWorkspace: 'novel' }),
    types,
    workspaces,
    new RelationTypeRegistry(workspaces, types),
  );
  for (const file of files.values()) await repository.syncFile(file);
  const add = () =>
    repository.addRelation(
      SOURCE_ID,
      { type: 'related-to', targetEntityId: TARGET_ID },
      { workspaceId: 'novel', sourceType: 'scene', targetType: 'plot-thread' },
    );
  const membership = (associated: boolean) =>
    setThreadMembership(index, repository, 'novel', SOURCE_ID, TARGET_ID, associated);
  return { files, data, read, processFrontMatter, index, repository, add, membership };
}

afterEach(() => vi.restoreAllMocks());

describe('repository commit and refresh hardening', () => {
  it('rejects a deleted target even while its index entry remains stale', async () => {
    const context = await setup();
    context.files.delete('Thread.md');
    await expect(context.add()).rejects.toThrow(/target|available/i);
    expect(context.data.get('Scene.md')!.bs_relations).toEqual([]);
  });
  it.each([{ bs_type: 'idea' }, { bs_workspace: 'elsewhere' }, { bs_id: OTHER_ID }])(
    'reads target metadata before commit: %j',
    async (change) => {
      const context = await setup();
      Object.assign(context.data.get('Thread.md')!, change);
      await expect(context.add()).rejects.toThrow(/target|Workspace|type|identity/i);
      expect(context.data.get('Scene.md')!.bs_relations).toEqual([]);
    },
  );
  it('rejects a source type changed externally before its queued commit', async () => {
    const context = await setup();
    context.data.get('Scene.md')!.bs_type = 'idea';
    await expect(context.add()).rejects.toThrow('changed type or Workspace');
    expect(context.index.getById(SOURCE_ID)!.type).toBe('idea');
  });
  it('rejects a target deleted after preparation but before the source callback', async () => {
    const context = await setup();
    const original = context.processFrontMatter.getMockImplementation()!;
    context.processFrontMatter.mockImplementationOnce(async (file, mutate) => {
      context.files.delete('Thread.md');
      await original(file, mutate);
    });
    await expect(context.add()).rejects.toThrow('target entity is no longer available');
    expect(context.data.get('Scene.md')!.bs_relations).toEqual([]);
  });
  it('does not let an older delayed read overwrite a newer external edit', async () => {
    const context = await setup();
    const oldContent = JSON.stringify(context.data.get('Scene.md'));
    let finishRead: (content: string) => void = () => undefined;
    context.read.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        }),
    );
    const refreshing = context.repository.refreshEntity(SOURCE_ID);
    context.data.get('Scene.md')!.bs_type = 'idea';
    await context.repository.syncFile(context.files.get('Scene.md')!);
    finishRead(oldContent);
    await expect(refreshing).rejects.toThrow('changed during refresh');
    expect(context.index.getById(SOURCE_ID)!.type).toBe('idea');
    expect(context.processFrontMatter).not.toHaveBeenCalled();
  });
  it('does not claim success if post-write refresh cannot read persisted data', async () => {
    const context = await setup();
    context.read.mockImplementation(async (file) => {
      if (file.path === 'Scene.md') throw new Error('Read failed');
      return JSON.stringify(context.data.get(file.path));
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(context.add()).rejects.toThrow(/refresh|read/i);
    expect(context.data.get('Scene.md')!.bs_relations).toHaveLength(1);
  });
  it('preserves both original rejection and refresh failure in the error', async () => {
    const context = await setup();
    context.processFrontMatter.mockRejectedValueOnce(new Error('Disk full'));
    context.read.mockImplementation(async (file) => {
      if (file.path === 'Scene.md') throw new Error('Read failed');
      return JSON.stringify(context.data.get(file.path));
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(context.add()).rejects.toThrow(/Disk full.*refresh|refresh.*Disk full/i);
  });
  it('serializes two additions and rejects the duplicate without losing the first', async () => {
    const context = await setup();
    const results = await Promise.allSettled([context.add(), context.add()]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(context.data.get('Scene.md')!.bs_relations).toHaveLength(1);
    expect(context.index.getById(SOURCE_ID)!.relations).toHaveLength(1);
  });
  it('refreshes externally removed relations after a stale removal rejects', async () => {
    const context = await setup();
    await context.add();
    const relation = context.index.getById(SOURCE_ID)!.relations[0]!;
    context.data.get('Scene.md')!.bs_relations = [];
    await expect(context.repository.removeRelation(SOURCE_ID, relation)).rejects.toThrow('missing');
    expect(context.index.getById(SOURCE_ID)!.relations).toEqual([]);
  });
  it('refreshes a stale existing membership before treating Add as a no-op', async () => {
    const context = await setup();
    await context.add();
    context.data.get('Scene.md')!.bs_relations = [];
    await context.membership(true);
    expect(context.data.get('Scene.md')!.bs_relations).toHaveLength(1);
    expect(context.index.getById(SOURCE_ID)!.relations).toHaveLength(1);
  });
  it('rejects a changed relation rather than deleting the newer target', async () => {
    const context = await setup();
    await context.add();
    const relation = context.index.getById(SOURCE_ID)!.relations[0]!;
    const entries = context.data.get('Scene.md')!.bs_relations as Record<string, unknown>[];
    entries[0]!.target_entity_id = OTHER_ID;
    await expect(context.repository.removeRelation(SOURCE_ID, relation)).rejects.toThrow(
      'changed elsewhere',
    );
    expect(context.index.getById(SOURCE_ID)!.relations[0]!.targetEntityId).toBe(OTHER_ID);
  });
  it('rejects malformed containers without overwriting unknown data', async () => {
    const context = await setup();
    context.data.get('Scene.md')!.bs_relations = { user: 'repair manually' };
    const before = structuredClone(context.data.get('Scene.md'));
    await expect(context.add()).rejects.toThrow('not a list');
    expect(context.data.get('Scene.md')).toEqual(before);
    expect(context.index.getById(SOURCE_ID)!.relationIssues).toHaveLength(1);
  });
  it('recovers from partial removal by rebuilding persisted state before retry', async () => {
    const context = await setup();
    await context.add();
    await context.repository.addRelation(TARGET_ID, {
      type: 'related-to',
      targetEntityId: SOURCE_ID,
    });
    const beforeScene = structuredClone(context.data.get('Scene.md')!);
    const beforeThread = structuredClone(context.data.get('Thread.md')!);
    const original = context.processFrontMatter.getMockImplementation()!;
    context.processFrontMatter.mockImplementation(async (file, mutate) => {
      if (file.path === 'Thread.md') throw new Error('Read only');
      await original(file, mutate);
    });
    await expect(context.membership(false)).rejects.toThrow('Removed 1 of 2');
    expect(context.index.getById(SOURCE_ID)!.relations).toHaveLength(0);
    expect(context.index.getById(TARGET_ID)!.relations).toHaveLength(1);
    context.processFrontMatter.mockImplementation(original);
    // Rebuild the disposable projection from actual files, as a restart does.
    for (const file of context.files.values()) await context.repository.syncFile(file);
    await context.membership(false);
    expect(context.index.getById(TARGET_ID)!.relations).toHaveLength(0);
    for (const [path, before] of [
      ['Scene.md', beforeScene],
      ['Thread.md', beforeThread],
    ] as const) {
      const { bs_relations: oldRelations, bs_updated: oldUpdated, ...untouched } = before;
      const {
        bs_relations: newRelations,
        bs_updated: newUpdated,
        ...after
      } = context.data.get(path)!;
      expect(after).toEqual(untouched);
      expect(oldRelations).toHaveLength(1);
      expect(newRelations).toEqual([]);
      expect(typeof oldUpdated).toBe('string');
      expect(typeof newUpdated).toBe('string');
    }
  });
});
