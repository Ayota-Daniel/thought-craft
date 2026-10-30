import { describe, expect, it, vi } from 'vitest';
import {
  parseStoryPlacement,
  writeStoryPlacement,
} from '../src/infrastructure/story-placement-mapper';
import { orderBetween } from '../src/domain/story-placement';
import { planNarrativeMove } from '../src/application/plot-ordering';
import { projectPlot } from '../src/application/plot-query';
import { PlotService, PlotCreationPlacementError } from '../src/application/plot-service';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { EntityIndex } from '../src/infrastructure/entity-index';
import { RelationTypeRegistry } from '../src/application/relation-type-registry';
import { createTestEntity, SOURCE_ID, TARGET_ID, OTHER_ID } from './entity-fixtures';
import { workspacesForTypes } from './workspace-fixtures';
import type { Entity } from '../src/domain/entity';
import type { NewEntity } from '../src/application/create-entity';
import type { StoryPosition } from '../src/domain/story-placement';

const section = createTestEntity({
  type: 'story-section',
  id: TARGET_ID,
  title: 'Act I',
  filePath: 'Act I.md',
  story: parseStoryPlacement({ order: 1000 }),
});
const secondSection = createTestEntity({
  ...section,
  id: OTHER_ID,
  title: 'Act II',
  filePath: 'Act II.md',
  story: parseStoryPlacement({ order: 2000 }),
});
function scene(id = SOURCE_ID, order = 1000, sectionId = section.id): Entity {
  return createTestEntity({
    id,
    type: 'scene',
    filePath: `${id}.md`,
    story: parseStoryPlacement({ section_id: sectionId, order }),
  });
}
async function setup(entities: readonly Entity[] = [section, secondSection, scene()]) {
  const index = new EntityIndex();
  entities.forEach((entity) => index.upsert(entity));
  const types = new EntityTypeRegistry();
  const workspaces = workspacesForTypes(types);
  await workspaces.update('novel', { enabledExperiences: ['story'] });
  const writer = {
    createEntity: vi.fn(async (input: NewEntity) => {
      const entity = createTestEntity({ ...input, filePath: `${input.title}.md` });
      index.upsert(entity);
      return entity;
    }),
    setStoryPlacement: vi.fn(async (id: string, expected: unknown, position: StoryPosition) => {
      const entity = index.getById(id)!;
      const metadata = { bs_story: entity.story?.raw };
      writeStoryPlacement(metadata, expected, position);
      index.upsert({ ...entity, story: parseStoryPlacement(metadata.bs_story) });
    }),
  };
  return {
    index,
    types,
    workspaces,
    writer,
    service: new PlotService(index, writer, workspaces, types),
  };
}

describe('Story placement mapper', () => {
  it.each([undefined, {}, { section_id: null }, { section_id: '' }])(
    'reads an unplaced Scene %j without inventing order',
    (raw) => {
      expect(parseStoryPlacement(raw)).toMatchObject({ sectionId: null, order: null, issues: [] });
    },
  );
  it('reads Scene and Section ranks and normalizes UUID case', () => {
    expect(parseStoryPlacement({ section_id: TARGET_ID.toUpperCase(), order: 2500 })).toMatchObject(
      { sectionId: TARGET_ID, order: 2500, issues: [] },
    );
    expect(parseStoryPlacement({ order: 1000 })).toMatchObject({
      sectionId: null,
      order: 1000,
      issues: [],
    });
  });
  it.each([null, [], 'bad', 42])('retains malformed structure %j for recovery', (raw) => {
    const result = parseStoryPlacement(raw);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.raw).toEqual(raw);
    expect(() =>
      writeStoryPlacement({ bs_story: raw }, raw, { sectionId: TARGET_ID, order: 1000 }),
    ).toThrow('malformed');
  });
  it.each(['first', NaN, Infinity, Number.MAX_VALUE])(
    'reports malformed order %s without rejecting the Entity',
    (order) => {
      expect(parseStoryPlacement({ order }).order).toBeNull();
      expect(parseStoryPlacement({ order }).issues).toHaveLength(1);
    },
  );
  it('repairs an invalid reference explicitly while preserving neighboring metadata', () => {
    const raw = { section_id: 'missing-uuid', order: 'wrong', custom: { keep: true } };
    const metadata = {
      bs_id: SOURCE_ID,
      bs_type: 'scene',
      bs_workspace: 'novel',
      bs_updated: 'keep',
      bs_properties: { fear: 'keep' },
      bs_schema_values: { importance: 5 },
      bs_relations: ['keep'],
      user: { keep: true },
      bs_story: raw,
    };
    const original = structuredClone(metadata);
    writeStoryPlacement(metadata, raw, { sectionId: TARGET_ID, order: 2000 });
    expect(metadata).toEqual({
      ...original,
      bs_story: { ...raw, section_id: TARGET_ID, order: 2000 },
    });
    writeStoryPlacement(metadata, metadata.bs_story, { sectionId: null, order: null });
    expect(metadata.bs_story).toEqual({ custom: { keep: true } });
  });
  it('cleanly removes owned placement fields without overwriting a concurrent edit', () => {
    const metadata: Record<string, unknown> = { bs_story: { section_id: TARGET_ID, order: 1000 } };
    expect(() =>
      writeStoryPlacement(metadata, { order: 2 }, { sectionId: null, order: null }),
    ).toThrow('changed elsewhere');
    writeStoryPlacement(metadata, metadata.bs_story, { sectionId: null, order: null });
    expect(metadata).toEqual({});
  });
});

describe('sparse narrative ordering', () => {
  it.each([
    [null, null, 1000],
    [1000, null, 2000],
    [null, 1000, 0],
    [2000, 3000, 2500],
    [1000, 1001, null],
    [1000, 1000, null],
    [Number.MAX_SAFE_INTEGER, null, null],
  ] as const)('between %s and %s gives %s', (previous, next, expected) => {
    expect(orderBetween(previous, next)).toBe(expected);
  });
  it('changes only the moved Scene when a gap exists', () => {
    const items = [scene('a', 1000), scene('b', 2000), scene('c', 3000)];
    const plan = planNarrativeMove(items, items[2]!, 'b');
    expect(plan).toEqual([{ entity: items[2], order: 1500 }]);
    expect(planNarrativeMove(items, items[1]!, 'c')).toEqual([]);
    expect(() => planNarrativeMove(items, items[0]!, 'missing')).toThrow('destination');
  });
  it('repeated insertions eventually rebalance only the destination list deterministically', () => {
    let items = [scene('left', 1000), scene('right', 2000)];
    let rebalanced = false;
    for (let number = 0; number < 20; number++) {
      const moved = scene(`insert-${number}`, 9000);
      const plan = planNarrativeMove(items, moved, 'right');
      if (plan.length > 1) rebalanced = true;
      const ordered = [...items, moved].map((entity) => {
        const update = plan.find((item) => item.entity.id === entity.id);
        return update
          ? {
              ...entity,
              story: parseStoryPlacement({ section_id: TARGET_ID, order: update.order }),
            }
          : entity;
      });
      items = ordered.sort((a, b) => a.story!.order! - b.story!.order!);
      expect(items.at(-1)?.id).toBe('right');
      expect(new Set(items.map((entity) => entity.story!.order)).size).toBe(items.length);
    }
    expect(rebalanced).toBe(true);
    expect(planNarrativeMove(items, scene('extra'), 'right')).toEqual(
      planNarrativeMove(items, scene('extra'), 'right'),
    );
  });
  it('rebalances missing/duplicate manual ranks and gives a new Section a rank', () => {
    const unranked = createTestEntity({ type: 'story-section' });
    expect(planNarrativeMove([unranked], unranked, null)).toEqual([
      { entity: unranked, order: 1000 },
    ]);
    const items = [scene('a', 1000), scene('b', 1000)];
    expect(planNarrativeMove(items, scene('c'), null)).toHaveLength(2);
  });
});

describe('Plot projection and generic Section identity', () => {
  it('seeds one safe built-in, preserving custom conflicts and generic relation compatibility', async () => {
    const { types, workspaces } = await setup();
    expect(types.get('story-section')).toMatchObject({
      id: 'story-section',
      builtIn: true,
      label: 'Story Section',
      folderName: 'Story Sections',
    });
    expect(
      new EntityTypeRegistry(types.getAll()).getAll().filter((type) => type.id === 'story-section'),
    ).toHaveLength(1);
    const custom = {
      ...types.get('story-section')!,
      builtIn: false,
      retired: true,
      label: 'My sections',
      folderName: 'Parts',
    };
    expect(new EntityTypeRegistry([custom]).get('story-section')).toEqual(custom);
    const relations = new RelationTypeRegistry(workspaces, types);
    expect(() => relations.validateNew(section, scene(), 'related-to')).not.toThrow();
  });
  it('derives Section/Scene/global order and display numbering without persisted indexes', async () => {
    const last = scene('last', 3000);
    const first = scene('first', 1000);
    const next = scene('next', 1000, secondSection.id);
    const { index } = await setup([secondSection, section, last, first, next]);
    const plot = projectPlot(index, 'novel');
    expect(plot.sections.map((item) => item.entity.id)).toEqual([section.id, secondSection.id]);
    expect(plot.sequence.map((item) => item.id)).toEqual(['first', 'last', 'next']);
    expect(plot.sections[0]!.scenes.findIndex((item) => item.id === last.id) + 1).toBe(2);
  });
  it('leaves M7 Scenes unplaced without metadata or source mutation', async () => {
    const old = createTestEntity({ type: 'scene' });
    const original = structuredClone(old);
    const { index } = await setup([old]);
    expect(projectPlot(index, 'novel').unplaced[0]?.entity).toEqual(old);
    expect(old).toEqual(original);
  });
  it('handles missing, cross-Workspace, wrong-type and malformed references as unresolved', async () => {
    const { index } = await setup([section, scene()]);
    index.upsert({ ...section, workspaceId: 'other' });
    expect(projectPlot(index, 'novel').unplaced[0]?.issue).toContain('outside');
    index.upsert({ ...section, type: 'character' });
    expect(projectPlot(index, 'novel').unplaced[0]?.issue).toContain('missing');
    index.removePath(section.filePath);
    expect(projectPlot(index, 'novel').sequence).toEqual([]);
  });
  it('resolves a Section rename by UUID without changing Scene placement', async () => {
    const original = scene();
    const { index } = await setup([section, original]);
    index.renamePath(section.filePath, 'The Setup.md');
    expect(projectPlot(index, 'novel').sections[0]?.entity.title).toBe('The Setup');
    expect(index.getById(original.id)?.story).toEqual(original.story);
  });
});

describe('Plot application writes', () => {
  it('places, moves, reorders and unplaces using minimal writes, with untouched other Sections', async () => {
    const another = scene('another', 2000);
    const { index, writer, service } = await setup([section, secondSection, scene(), another]);
    await service.moveScene('novel', SOURCE_ID, secondSection.id);
    expect(index.getById(SOURCE_ID)?.story).toMatchObject({
      sectionId: secondSection.id,
      order: 1000,
    });
    expect(writer.setStoryPlacement).toHaveBeenCalledTimes(1);
    await service.moveScene('novel', SOURCE_ID, section.id, another.id);
    expect(index.getById(SOURCE_ID)?.story?.order).toBe(1000);
    await service.moveScene('novel', SOURCE_ID, null);
    expect(projectPlot(index, 'novel').unplaced.map((item) => item.entity.id)).toContain(SOURCE_ID);
    expect(index.getById(another.id)).toEqual(another);
  });
  it('rejects invalid source/target types and cross-Workspace Section assignment', async () => {
    const { index, writer, service } = await setup();
    await expect(service.moveScene('novel', TARGET_ID, secondSection.id)).rejects.toThrow('scene');
    await expect(service.moveScene('novel', SOURCE_ID, SOURCE_ID)).rejects.toThrow('story-section');
    index.upsert({ ...secondSection, workspaceId: 'other' });
    await expect(service.moveScene('novel', SOURCE_ID, secondSection.id)).rejects.toThrow(
      'Workspace',
    );
    expect(writer.setStoryPlacement).not.toHaveBeenCalled();
  });
  it('serializes moves against the latest state and preserves index data on failed writes', async () => {
    const { index, writer, service } = await setup();
    await Promise.all([
      service.moveScene('novel', SOURCE_ID, secondSection.id),
      service.moveScene('novel', SOURCE_ID, section.id),
    ]);
    expect(index.getById(SOURCE_ID)?.story?.sectionId).toBe(section.id);
    writer.setStoryPlacement.mockRejectedValueOnce(new Error('Disk unavailable'));
    await expect(service.moveScene('novel', SOURCE_ID, secondSection.id)).rejects.toThrow('0 of 1');
    expect(index.getById(SOURCE_ID)?.story?.sectionId).toBe(section.id);
  });
  it('reports partial rebalance failure and leaves actual persisted order authoritative', async () => {
    const a = scene('a', 1000);
    const b = scene('b', 1001);
    const moved = createTestEntity({ type: 'scene', id: 'moved' });
    const { index, writer, service } = await setup([section, a, b, moved]);
    const save = writer.setStoryPlacement.getMockImplementation()!;
    let count = 0;
    writer.setStoryPlacement.mockImplementation(async (...args) => {
      count++;
      if (count === 2) throw new Error('Disk unavailable');
      return save(...args);
    });
    await expect(service.moveScene('novel', 'moved', section.id, 'b')).rejects.toThrow('1 of 2');
    expect(projectPlot(index, 'novel').sections[0]?.scenes.map((item) => item.id)).toEqual([
      'a',
      'b',
      'moved',
    ]);
  });
  it('creates Sections, placed Scenes and unplaced Scenes through generic EntityWriter', async () => {
    const { index, writer, service } = await setup();
    const createdSection = await service.create(
      'novel',
      { type: 'story-section', title: 'Finale', content: 'Purpose' },
      null,
    );
    expect(index.getById(createdSection.id)?.story?.order).toBe(3000);
    const created = await service.create(
      'novel',
      { type: 'scene', title: 'Arrival', content: 'Body' },
      section.id,
    );
    expect(index.getById(created.id)?.story?.sectionId).toBe(section.id);
    const unplaced = await service.create(
      'novel',
      { type: 'scene', title: 'A possibility', content: '' },
      null,
    );
    expect(index.getById(unplaced.id)?.story).toBeUndefined();
    expect(writer.createEntity).toHaveBeenCalledTimes(3);
  });
  it('reports a safe created note when placement fails, and rejects nested Sections before creation', async () => {
    const { writer, service } = await setup();
    writer.setStoryPlacement.mockRejectedValueOnce(new Error('Disk'));
    await expect(
      service.create('novel', { type: 'scene', title: 'Safe scene', content: 'Body' }, section.id),
    ).rejects.toBeInstanceOf(PlotCreationPlacementError);
    await expect(
      service.create('novel', { type: 'story-section', title: 'Nested', content: '' }, section.id),
    ).rejects.toThrow('nested');
    expect(writer.createEntity).toHaveBeenCalledTimes(1);
  });
});
