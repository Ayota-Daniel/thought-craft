import { describe, expect, it } from 'vitest';
import { validateNewRelation } from '../src/domain/entity-relation';
import { entityFromFrontmatter } from '../src/infrastructure/frontmatter-mapper';
import {
  addEntityRelation,
  parseRelations,
  removeEntityRelation,
  serializeRelation,
} from '../src/infrastructure/relation-mapper';
import {
  createTestRelation,
  SOURCE_ID,
  TARGET_ID,
  RELATION_ID,
  SECOND_RELATION_ID,
  CREATED_AT,
} from './entity-fixtures';

const validDefinition = {
  id: RELATION_ID,
  type: 'related-to',
  target_entity_id: TARGET_ID,
  created_at: CREATED_AT,
};

describe('relation parsing', () => {
  it('accepts absent and empty relations', () => {
    expect(parseRelations(undefined, SOURCE_ID)).toEqual({ relations: [], issues: [] });
    expect(parseRelations([], SOURCE_ID)).toEqual({ relations: [], issues: [] });
  });

  it('maps one valid relation with a UUID target', () => {
    expect(parseRelations([validDefinition], SOURCE_ID)).toEqual({
      relations: [createTestRelation()],
      issues: [],
    });
  });

  it('parses several relations and normalizes UUID case', () => {
    const definitions = [
      validDefinition,
      {
        ...validDefinition,
        id: SECOND_RELATION_ID.toUpperCase(),
        type: 'depends-on',
        target_entity_id: TARGET_ID.toUpperCase(),
      },
    ];
    const parsed = parseRelations(definitions, SOURCE_ID);
    expect(parsed.relations).toHaveLength(2);
    expect(parsed.relations[1]).toMatchObject({
      id: SECOND_RELATION_ID,
      targetEntityId: TARGET_ID,
      type: 'depends-on',
    });
    expect(parsed.issues).toEqual([]);
  });

  it.each([
    { ...validDefinition, id: undefined },
    { ...validDefinition, id: 'invalid' },
    { ...validDefinition, target_entity_id: undefined },
    { ...validDefinition, target_entity_id: 'Characters/Noah.md' },
    { ...validDefinition, type: 'invalid type!' },
    { ...validDefinition, created_at: 'yesterday' },
    { ...validDefinition, created_at: '2026-02-30T10:00:00.000Z' },
    { ...validDefinition, target_entity_id: SOURCE_ID },
    null,
    [],
    'not an object',
  ])('reports an invalid entry without hiding valid neighbors: %j', (definition) => {
    const parsed = parseRelations([validDefinition, definition], SOURCE_ID);
    expect(parsed.relations).toEqual([createTestRelation()]);
    expect(parsed.issues).toHaveLength(1);
  });

  it.each([null, {}, 'invalid', 12])('reports a malformed container: %j', (value) => {
    expect(parseRelations(value, SOURCE_ID).relations).toEqual([]);
    expect(parseRelations(value, SOURCE_ID).issues).toHaveLength(1);
  });

  it('reports manually duplicated edge identities and exact duplicates', () => {
    const duplicatedId = { ...validDefinition, type: 'supports' };
    const duplicatedPair = { ...validDefinition, id: SECOND_RELATION_ID };
    const parsed = parseRelations([validDefinition, duplicatedId, duplicatedPair], SOURCE_ID);
    expect(parsed.relations).toHaveLength(1);
    expect(parsed.issues).toHaveLength(2);
  });

  it('keeps an entity usable despite malformed relation YAML', () => {
    const entity = entityFromFrontmatter(
      {
        bs_id: SOURCE_ID,
        bs_type: 'scene',
        bs_workspace: 'novel',
        bs_status: 'exploring',
        bs_created: CREATED_AT,
        bs_updated: CREATED_AT,
        bs_relations: [validDefinition, { broken: true }],
      },
      'Scenes/A scene.md',
    );

    expect(entity?.type).toBe('scene');
    expect(entity?.relations).toEqual([createTestRelation()]);
    expect(entity?.relationIssues).toHaveLength(1);
  });
});

describe('relation validation', () => {
  it('rejects an exact duplicate in domain logic', () => {
    expect(() =>
      validateNewRelation(SOURCE_ID, createTestRelation(), [createTestRelation()]),
    ).toThrow('already exists');
  });

  it('allows different relation types to the same target', () => {
    expect(() =>
      validateNewRelation(SOURCE_ID, { type: 'depends-on', targetEntityId: TARGET_ID }, [
        createTestRelation(),
      ]),
    ).not.toThrow();
  });

  it('rejects self-relations including alternate UUID casing', () => {
    expect(() =>
      validateNewRelation(
        SOURCE_ID,
        { type: 'related-to', targetEntityId: SOURCE_ID.toUpperCase() },
        [],
      ),
    ).toThrow('itself');
  });
});

describe('relation persistence', () => {
  function frontmatter(): Record<string, unknown> {
    return {
      bs_id: SOURCE_ID,
      bs_type: 'idea',
      bs_workspace: 'novel',
      bs_status: 'inbox',
      bs_created: CREATED_AT,
      bs_updated: CREATED_AT,
      bs_properties: { originality: { label: 'Originality', type: 'rating', value: 4, max: 5 } },
      bs_future_flag: { keep: true },
      tags: ['keep'],
      user_data: { nested: ['keep'] },
      bs_relations: [validDefinition, { malformed: 'preserve this entry' }],
    };
  }

  it('serializes the requested names without paths', () => {
    expect(serializeRelation(createTestRelation())).toEqual(validDefinition);
  });

  it('adds one edge and preserves other relations, properties and user metadata', () => {
    const metadata = frontmatter();
    const expected = structuredClone(metadata);
    const added = createTestRelation({ id: SECOND_RELATION_ID, type: 'supports' });
    (expected.bs_relations as unknown[]).push(serializeRelation(added));

    addEntityRelation(metadata, SOURCE_ID, added);
    expect(metadata).toEqual(expected);
  });

  it('removes exactly one edge, preserving malformed neighbors and all metadata', () => {
    const metadata = frontmatter();
    const expected = structuredClone(metadata);
    (expected.bs_relations as unknown[]).shift();

    removeEntityRelation(metadata, createTestRelation());
    expect(metadata).toEqual(expected);
  });

  it('cannot create duplicates even when called without the UI', () => {
    const metadata = frontmatter();
    const before = structuredClone(metadata);

    expect(() =>
      addEntityRelation(metadata, SOURCE_ID, createTestRelation({ id: SECOND_RELATION_ID })),
    ).toThrow('already exists');
    expect(metadata).toEqual(before);
  });

  it('refuses to replace malformed containers', () => {
    const metadata = { bs_relations: 'preserve this' };
    expect(() => addEntityRelation(metadata, SOURCE_ID, createTestRelation())).toThrow(
      'not a list',
    );
    expect(metadata.bs_relations).toBe('preserve this');
  });

  it('rejects stale removal and duplicated IDs without changing YAML', () => {
    const changed = { bs_relations: [{ ...validDefinition, type: 'supports' }] };
    expect(() => removeEntityRelation(changed, createTestRelation())).toThrow('changed elsewhere');
    const duplicated = {
      bs_relations: [validDefinition, { ...validDefinition, type: 'supports' }],
    };
    expect(() => removeEntityRelation(duplicated, createTestRelation())).toThrow('duplicated');
  });
});
