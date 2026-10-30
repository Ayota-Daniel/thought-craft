import { describe, expect, it, vi } from 'vitest';
import {
  projectPlotThreads,
  setThreadMembership,
  threadAssociations,
} from '../src/application/plot-threads';
import { EntityIndex } from '../src/infrastructure/entity-index';
import {
  parseStoryPlacement,
  writeStoryPlacement,
} from '../src/infrastructure/story-placement-mapper';
import {
  addEntityRelation,
  parseRelations,
  removeEntityRelation,
  serializeRelation,
} from '../src/infrastructure/relation-mapper';
import { createEntity } from '../src/application/create-entity';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { workspacesForTypes } from './workspace-fixtures';
import {
  createTestEntity,
  createTestRelation,
  SOURCE_ID,
  TARGET_ID,
  OTHER_ID,
  RELATION_ID,
} from './entity-fixtures';
import type { Entity } from '../src/domain/entity';
import type { EntityRelationWriter } from '../src/application/entity-relations';

const scene = createTestEntity({ type: 'scene', filePath: 'Scene.md' });
const thread = createTestEntity({
  id: TARGET_ID,
  type: 'plot-thread',
  title: 'The Missing Artifact',
  filePath: 'Thread.md',
});
const otherThread = createTestEntity({
  id: OTHER_ID,
  type: 'plot-thread',
  title: 'Maya and Eli',
  filePath: 'Other Thread.md',
});
const sectionId = '10000000-0000-4000-8000-000000000001';
const secondSectionId = '10000000-0000-4000-8000-000000000002';
const otherSceneId = '10000000-0000-4000-8000-000000000003';
const section = createTestEntity({
  id: sectionId,
  type: 'story-section',
  filePath: 'Act I.md',
  story: parseStoryPlacement({ order: 1000 }),
});
const secondSection = createTestEntity({
  id: secondSectionId,
  type: 'story-section',
  filePath: 'Act II.md',
  story: parseStoryPlacement({ order: 2000 }),
});

function setup(entities: Entity[] = [scene, thread, otherThread]) {
  const index = new EntityIndex();
  entities.forEach((entity) => index.upsert(entity));
  const metadata = new Map(
    entities.map((entity) => [
      entity.id,
      {
        user: { unknown: 'keep' },
        bs_story: entity.story?.raw,
        bs_relations: entity.relations.map(serializeRelation),
      },
    ]),
  );
  const refresh = (id: string) => {
    const entity = index.getById(id)!;
    const current = metadata.get(id)!;
    index.upsert({ ...entity, relations: parseRelations(current.bs_relations, id).relations });
  };
  const writer: EntityRelationWriter = {
    addRelation: vi.fn(async (id, input) => {
      addEntityRelation(
        metadata.get(id)!,
        id,
        createTestRelation({ ...input, id: crypto.randomUUID() }),
      );
      refresh(id);
    }),
    removeRelation: vi.fn(async (id, relation) => {
      removeEntityRelation(metadata.get(id)!, relation);
      refresh(id);
    }),
  };
  const set = (threadId: string, associated = true) =>
    setThreadMembership(index, writer, 'novel', scene.id, threadId, associated);
  return { index, metadata, writer, set };
}

function related(targetEntityId = thread.id) {
  return createTestRelation({ targetEntityId });
}

describe('Plot Thread membership through generic relations', () => {
  it('creates a normal Plot Thread through the existing creation API', async () => {
    const types = new EntityTypeRegistry();
    const workspaces = workspacesForTypes(types);
    const writer = { createEntity: vi.fn(async (input) => createTestEntity({ ...input })) };
    const created = await createEntity(
      { type: 'plot-thread', title: 'A mystery', content: 'Notes' },
      'novel',
      writer,
      types,
      workspaces,
    );
    expect(created.type).toBe('plot-thread');
    expect(created.relations).toEqual([]);
    expect(created.story).toBeUndefined();
    expect(writer.createEntity).toHaveBeenCalledOnce();
  });
  it('adds one association using the existing writer with commit-time scope', async () => {
    const context = setup();
    await context.set(thread.id);
    expect(context.writer.addRelation).toHaveBeenCalledWith(
      scene.id,
      { type: 'related-to', targetEntityId: thread.id },
      { workspaceId: 'novel', sourceType: 'scene', targetType: 'plot-thread' },
    );
    expect(threadAssociations(context.index.getById(scene.id)!, thread)).toHaveLength(1);
  });
  it('supports multiple threads and removes only the chosen association', async () => {
    const context = setup();
    await context.set(thread.id);
    await context.set(otherThread.id);
    await context.set(thread.id, false);
    expect(threadAssociations(context.index.getById(scene.id)!, thread)).toHaveLength(0);
    expect(threadAssociations(context.index.getById(scene.id)!, otherThread)).toHaveLength(1);
    expect(context.index.getById(thread.id)).toBeDefined();
  });
  it('does not add duplicates when an outgoing association already exists', async () => {
    const context = setup();
    await context.set(thread.id);
    await context.set(thread.id);
    expect(context.writer.addRelation).toHaveBeenCalledOnce();
  });
  it('recognizes incoming generic links without writing a reverse duplicate', async () => {
    const context = setup([scene, { ...thread, relations: [related(scene.id)] }]);
    await context.set(thread.id);
    expect(context.writer.addRelation).not.toHaveBeenCalled();
    expect(projectPlotThreads(context.index, 'novel')[0]!.unplaced).toHaveLength(1);
  });
  it('removes both existing directions explicitly while preserving other relation kinds', async () => {
    const support = createTestRelation({ id: OTHER_ID, type: 'supports' });
    const context = setup([
      { ...scene, relations: [related(), support] },
      { ...thread, relations: [related(scene.id)] },
    ]);
    await context.set(thread.id, false);
    expect(context.writer.removeRelation).toHaveBeenCalledTimes(2);
    expect(context.index.getById(scene.id)!.relations).toEqual([support]);
    expect(context.index.getById(thread.id)!.relations).toEqual([]);
  });
  it.each(['supports', 'originated-from', 'appears-in'])(
    'does not reinterpret %s as membership',
    (type) => {
      expect(
        threadAssociations({ ...scene, relations: [createTestRelation({ type })] }, thread),
      ).toEqual([]);
    },
  );
  it.each([
    { ...thread, workspaceId: 'elsewhere' },
    { ...thread, type: 'idea' },
  ])('rejects incompatible endpoints without a write', async (target) => {
    const context = setup([scene, target]);
    await expect(context.set(target.id)).rejects.toThrow('this Workspace');
    expect(context.writer.addRelation).not.toHaveBeenCalled();
    expect(threadAssociations({ ...scene, relations: [related()] }, target)).toEqual([]);
  });
  it('rejects a deleted target without reporting success', async () => {
    const context = setup([scene]);
    await expect(context.set(thread.id)).rejects.toThrow('this Workspace');
    expect(context.writer.addRelation).not.toHaveBeenCalled();
  });
  it('propagates write failure without fabricating membership', async () => {
    const context = setup();
    vi.mocked(context.writer.addRelation).mockRejectedValueOnce(new Error('Disk full'));
    await expect(context.set(thread.id)).rejects.toThrow('Disk full');
    expect(context.index.getById(scene.id)!.relations).toEqual([]);
  });
  it('reports partial removal and retains actual remaining membership', async () => {
    const context = setup([
      { ...scene, relations: [related()] },
      { ...thread, relations: [related(scene.id)] },
    ]);
    vi.mocked(context.writer.removeRelation)
      .mockImplementationOnce(async () => {
        context.index.upsert(scene);
      })
      .mockRejectedValueOnce(new Error('Read only'));
    await expect(context.set(thread.id, false)).rejects.toThrow(
      'Removed 1 of 2 related links. Read only',
    );
    expect(
      threadAssociations(context.index.getById(scene.id)!, context.index.getById(thread.id)!),
    ).toHaveLength(1);
  });
  it('preserves unknown fields, narrative ranks and unrelated malformed relation entries', async () => {
    const ranked = {
      ...scene,
      story: parseStoryPlacement({ section_id: sectionId, order: 2500, custom: true }),
    };
    const context = setup([ranked, thread]);
    const metadata = context.metadata.get(scene.id)!;
    metadata.bs_relations.push({ keep: 'malformed but retained' });
    const before = structuredClone(metadata);
    await context.set(thread.id);
    await context.set(thread.id, false);
    expect(metadata).toEqual(before);
  });
  it('is a no-op when removing an absent membership', async () => {
    const context = setup();
    await context.set(thread.id, false);
    expect(context.writer.removeRelation).not.toHaveBeenCalled();
  });
});

describe('Thread progression derived from the M8 Plot', () => {
  it('orders membership by Section and Scene rank rather than relation creation or title', () => {
    const first = {
      ...scene,
      relations: [related()],
      story: parseStoryPlacement({ section_id: sectionId, order: 2000 }),
    };
    const second = {
      ...first,
      id: otherSceneId,
      filePath: 'Other Scene.md',
      story: parseStoryPlacement({ section_id: secondSectionId, order: -1000 }),
    };
    const context = setup([second, secondSection, thread, first, section]);
    const result = projectPlotThreads(context.index, 'novel')[0]!;
    expect(result.sequence.map(({ scene }) => scene.id)).toEqual([SOURCE_ID, otherSceneId]);
    expect(result.sequence.map(({ section }) => section.id)).toEqual([sectionId, secondSectionId]);
  });
  it('presents Unplaced separately and deterministically, including invalid Section references', () => {
    const first = { ...scene, relations: [related()] };
    const second = {
      ...first,
      id: otherSceneId,
      filePath: 'Other Scene.md',
      story: parseStoryPlacement({ section_id: sectionId, order: 1000 }),
    };
    const context = setup([second, first, thread]);
    const result = projectPlotThreads(context.index, 'novel')[0]!;
    expect(result.sequence).toEqual([]);
    expect(result.unplaced.map(({ entity }) => entity.id)).toEqual([otherSceneId, SOURCE_ID]);
    expect(result.unplaced[0]!.issue).toContain('missing');
  });
  it('recomputes order after native metadata changes without altering membership', () => {
    const ranked = {
      ...scene,
      relations: [related()],
      story: parseStoryPlacement({ section_id: sectionId, order: 1000 }),
    };
    const context = setup([ranked, thread, section, secondSection]);
    const metadata = { bs_story: ranked.story.raw };
    writeStoryPlacement(metadata, metadata.bs_story, { sectionId: secondSectionId, order: 500 });
    context.index.upsert({ ...ranked, story: parseStoryPlacement(metadata.bs_story) });
    expect(projectPlotThreads(context.index, 'novel')[0]!.sequence[0]!.section.id).toBe(
      secondSectionId,
    );
    expect(context.index.getById(scene.id)!.relations[0]!.id).toBe(RELATION_ID);
  });
  it('keeps the Plot usable when there are no threads', () => {
    expect(projectPlotThreads(setup([scene, section]).index, 'novel')).toEqual([]);
  });
  it('scopes discovery to the current Workspace and excludes foreign Scene membership', () => {
    const context = setup([
      thread,
      { ...otherThread, workspaceId: 'other' },
      { ...scene, workspaceId: 'other', relations: [related()] },
    ]);
    const result = projectPlotThreads(context.index, 'novel');
    expect(result).toHaveLength(1);
    expect(result[0]!.unplaced).toEqual([]);
  });
  it('reports missing Scene references on a thread without inventing membership', () => {
    const context = setup([{ ...thread, relations: [related(scene.id)] }]);
    const result = projectPlotThreads(context.index, 'novel')[0]!;
    expect(result.hasUnavailableLinks).toBe(true);
    expect(result.sequence).toEqual([]);
    expect(result.unplaced).toEqual([]);
  });
  it('retains unresolved Scene links and recovers if the same UUID reappears', () => {
    const context = setup([{ ...scene, relations: [related()] }]);
    expect(projectPlotThreads(context.index, 'novel')).toEqual([]);
    context.index.upsert(thread);
    expect(projectPlotThreads(context.index, 'novel')[0]!.unplaced).toHaveLength(1);
  });
  it('reloads serialized relations into a fresh index without new state', async () => {
    const context = setup();
    await context.set(thread.id);
    const reloaded = setup([
      {
        ...scene,
        relations: parseRelations(context.metadata.get(scene.id)!.bs_relations, scene.id).relations,
      },
      thread,
    ]);
    expect(
      projectPlotThreads(reloaded.index, 'novel')[0]!.unplaced.map(({ entity }) => entity.id),
    ).toEqual([scene.id]);
  });
  it('projects 107 Scenes and many threads without mutating Entities or spatial data', () => {
    const scenes = Array.from({ length: 107 }, (_, position) => ({
      ...scene,
      id: crypto.randomUUID(),
      filePath: `Scene ${position}.md`,
      relations: [related()],
    }));
    const extraThreads = Array.from({ length: 40 }, (_, position) => ({
      ...thread,
      id: crypto.randomUUID(),
      filePath: `Thread ${position}.md`,
    }));
    const board = { nodes: { [scene.id]: { x: 25, y: 100 } } };
    const before = structuredClone({ scenes, board });
    const context = setup([...scenes, ...extraThreads, thread]);
    expect(
      projectPlotThreads(context.index, 'novel').find(({ entity }) => entity.id === thread.id)!
        .unplaced,
    ).toHaveLength(107);
    expect({ scenes, board }).toEqual(before);
  });
});
