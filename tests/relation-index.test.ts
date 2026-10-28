import { describe, expect, it } from 'vitest';
import { EntityIndex } from '../src/infrastructure/entity-index';
import {
  createTestEntity,
  createTestRelation,
  SOURCE_ID,
  TARGET_ID,
  OTHER_ID,
  SECOND_RELATION_ID,
} from './entity-fixtures';

describe('EntityIndex relation queries', () => {
  it('resolves outgoing targets and derives incoming from the source only', () => {
    const index = new EntityIndex();
    const source = createTestEntity({ relations: [createTestRelation()] });
    const target = createTestEntity({
      id: TARGET_ID,
      type: 'character',
      title: 'Noah',
      filePath: 'Characters/Noah.md',
    });

    index.upsert(source);
    index.upsert(target);

    expect(index.getOutgoingRelations(source.id)).toEqual([
      { relation: source.relations[0], target },
    ]);
    expect(index.getIncomingRelations(target.id)).toEqual([
      { relation: source.relations[0], source },
    ]);
    expect(index.getOutgoingRelations(target.id)).toEqual([]);
    expect(target.relations).toEqual([]);
  });

  it('finds multiple incoming edges across types and sources', () => {
    const index = new EntityIndex();
    const source = createTestEntity({ relations: [createTestRelation()] });
    const other = createTestEntity({
      id: OTHER_ID,
      type: 'scene',
      filePath: 'Scenes/Arrival.md',
      relations: [createTestRelation({ id: SECOND_RELATION_ID, type: 'depends-on' })],
    });

    index.upsert(source);
    index.upsert(other);

    expect(index.getIncomingRelations(TARGET_ID).map((edge) => edge.source.id)).toEqual([
      SOURCE_ID,
      OTHER_ID,
    ]);
  });

  it('survives target and source renames without changing edge identity', () => {
    const index = new EntityIndex();
    index.upsert(createTestEntity({ relations: [createTestRelation()] }));
    index.upsert(createTestEntity({ id: TARGET_ID, filePath: 'Target.md' }));

    index.renamePath('Target.md', 'Renamed target.md');
    index.renamePath('Brainstorm/Ideas/A thought.md', 'Renamed source.md');

    expect(index.getOutgoingRelations(SOURCE_ID)[0]?.target?.title).toBe('Renamed target');
    expect(index.getIncomingRelations(TARGET_ID)[0]?.source.title).toBe('Renamed source');
    expect(index.getOutgoingRelations(SOURCE_ID)[0]?.relation.targetEntityId).toBe(TARGET_ID);
  });

  it('retains dangling relations after target deletion and resolves a restored target', () => {
    const index = new EntityIndex();
    const source = createTestEntity({ relations: [createTestRelation()] });
    const target = createTestEntity({ id: TARGET_ID, filePath: 'Target.md' });
    index.upsert(source);
    index.upsert(target);

    index.removePath(target.filePath);
    expect(index.getOutgoingRelations(SOURCE_ID)).toEqual([
      { relation: source.relations[0], target: undefined },
    ]);
    expect(index.getById(SOURCE_ID)?.relations).toHaveLength(1);

    index.upsert(target);
    expect(index.getOutgoingRelations(SOURCE_ID)[0]?.target?.id).toBe(TARGET_ID);
  });

  it('updates incoming queries after external metadata edits and source deletion', () => {
    const index = new EntityIndex();
    const source = createTestEntity({ relations: [createTestRelation()] });
    index.upsert(source);
    index.upsert({ ...source, relations: [createTestRelation({ targetEntityId: OTHER_ID })] });

    expect(index.getIncomingRelations(TARGET_ID)).toEqual([]);
    expect(index.getIncomingRelations(OTHER_ID)).toHaveLength(1);

    index.removePath(source.filePath);
    expect(index.getIncomingRelations(OTHER_ID)).toEqual([]);
  });
});
