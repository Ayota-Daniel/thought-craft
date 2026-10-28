import { describe, expect, it } from 'vitest';
import { resolveSchemaField, type PropertySchema } from '../src/domain/property-schema';
import { writeSchemaValue } from '../src/infrastructure/schema-value-mapper';
import { entityFromFrontmatter } from '../src/infrastructure/frontmatter-mapper';
import { createTestEntity, createTestRelation } from './entity-fixtures';

const schema: PropertySchema = {
  key: 'motivation',
  label: 'Motivation',
  type: 'text',
  retired: false,
};

function metadata() {
  const entity = createTestEntity();
  return {
    bs_id: entity.id,
    bs_type: 'character',
    bs_workspace: entity.workspaceId,
    bs_status: 'exploring',
    bs_created: entity.createdAt,
    bs_updated: entity.updatedAt,
  };
}

describe('schema value projection', () => {
  it('distinguishes absent, default and explicit values without materializing defaults', () => {
    const withDefault = { ...schema, defaultValue: 'Find her brother' };
    const values = {};
    expect(resolveSchemaField(schema, values)).toMatchObject({
      source: 'missing',
      value: undefined,
    });
    expect(resolveSchemaField(withDefault, values)).toMatchObject({
      source: 'default',
      value: 'Find her brother',
    });
    expect(resolveSchemaField(withDefault, { motivation: '' })).toMatchObject({
      source: 'explicit',
      value: '',
    });
    expect(values).toEqual({});
  });

  it.each([
    [{ ...schema, type: 'rating', max: 3 }, 5],
    [{ ...schema, type: 'select', options: ['hero'] }, 'villain'],
    [schema, { nested: 'keep' }],
    [schema, null],
    [{ ...schema, type: 'number' }, '4'],
    [{ ...schema, type: 'boolean' }, 'false'],
  ])('retains incompatible explicit values %j', (definition, value) => {
    const values = { motivation: value };
    expect(resolveSchemaField(definition as PropertySchema, values)).toMatchObject({
      source: 'explicit',
      value,
      issue: expect.any(String),
    });
    expect(values.motivation).toEqual(value);
  });

  it('preserves unknown type IDs, orphaned values, local properties and relations', () => {
    const relation = createTestRelation();
    const values = { difficulty: 4, unrecognized: { text: 'preserve' } };
    const entity = entityFromFrontmatter(
      {
        ...metadata(),
        bs_type: 'creature',
        bs_schema_values: values,
        bs_properties: { note: { label: 'Note', type: 'text', value: 'local' } },
        bs_relations: [
          {
            id: relation.id,
            type: relation.type,
            target_entity_id: relation.targetEntityId,
            created_at: relation.createdAt,
          },
        ],
      },
      'Creatures/Mira.md',
    );
    expect(entity?.type).toBe('creature');
    expect(entity?.schemaValues).toEqual(values);
    expect(entity?.properties[0]?.value).toBe('local');
    expect(entity?.relations[0]?.id).toBe(relation.id);
  });

  it.each(['bad container', [1, 2], null, 42])(
    'keeps malformed roots available for repair: %j',
    (raw) => {
      expect(
        entityFromFrontmatter({ ...metadata(), bs_schema_values: raw }, 'x.md')?.schemaValues,
      ).toEqual(raw);
    },
  );
});

describe('narrow schema value writes', () => {
  it('writes, updates and resets only an explicit value, preserving all neighbors', () => {
    const frontmatter: Record<string, unknown> = {
      ...metadata(),
      bs_properties: { local: 'untouched' },
      bs_relations: ['untouched'],
      bs_future: 'keep',
      user: { nested: 'keep' },
      bs_schema_values: { orphan: [1, 2] },
    };
    const original = structuredClone(frontmatter);
    writeSchemaValue(
      frontmatter,
      resolveSchemaField(schema, frontmatter.bs_schema_values),
      schema,
      'Find her brother',
    );
    expect(frontmatter.bs_schema_values).toEqual({
      orphan: [1, 2],
      motivation: 'Find her brother',
    });
    writeSchemaValue(
      frontmatter,
      resolveSchemaField(schema, frontmatter.bs_schema_values),
      schema,
      'Return home',
    );
    expect(frontmatter.bs_schema_values).toEqual({ orphan: [1, 2], motivation: 'Return home' });
    writeSchemaValue(
      frontmatter,
      resolveSchemaField(schema, frontmatter.bs_schema_values),
      schema,
      undefined,
    );
    expect(frontmatter).toEqual(original);
  });

  it.each<[PropertySchema, string | number | boolean]>([
    [schema, 'text'],
    [{ ...schema, type: 'number' }, -3.25],
    [{ ...schema, type: 'rating', max: 5 }, 4],
    [{ ...schema, type: 'boolean' }, false],
    [{ ...schema, type: 'select', options: ['a', 'b'] }, 'b'],
  ])('writes the $0.type value without persisting the schema', (definition, value) => {
    const frontmatter: Record<string, unknown> = metadata();
    writeSchemaValue(frontmatter, resolveSchemaField(definition, undefined), definition, value);
    expect(frontmatter.bs_schema_values).toEqual({ motivation: value });
    expect(entityFromFrontmatter(frontmatter, 'x.md')?.schemaValues).toEqual({ motivation: value });
  });

  it('resets explicit values to a virtual default', () => {
    const definition = { ...schema, defaultValue: 'Default' };
    const frontmatter = { bs_schema_values: { motivation: 'Explicit' } };
    writeSchemaValue(
      frontmatter,
      resolveSchemaField(definition, frontmatter.bs_schema_values),
      definition,
      undefined,
    );
    expect(frontmatter.bs_schema_values).toEqual({});
    expect(resolveSchemaField(definition, frontmatter.bs_schema_values).source).toBe('default');
  });

  it('rejects stale values and schema changes without touching metadata', () => {
    const frontmatter = { bs_schema_values: { motivation: 'External' } };
    const original = structuredClone(frontmatter);
    expect(() =>
      writeSchemaValue(
        frontmatter,
        resolveSchemaField(schema, { motivation: 'Old' }),
        schema,
        'New',
      ),
    ).toThrow('elsewhere');
    expect(() =>
      writeSchemaValue(
        frontmatter,
        resolveSchemaField(schema, frontmatter.bs_schema_values),
        { ...schema, label: 'Renamed' },
        'New',
      ),
    ).toThrow('schema changed');
    expect(() =>
      writeSchemaValue(
        frontmatter,
        resolveSchemaField(schema, frontmatter.bs_schema_values),
        { ...schema, retired: true },
        'New',
      ),
    ).toThrow();
    expect(frontmatter).toEqual(original);
  });

  it('rejects invalid replacements and malformed roots without changing them', () => {
    const frontmatter = { bs_schema_values: { motivation: 'Keep' } };
    expect(() =>
      writeSchemaValue(
        frontmatter,
        resolveSchemaField(schema, frontmatter.bs_schema_values),
        schema,
        3,
      ),
    ).toThrow();
    expect(frontmatter.bs_schema_values.motivation).toBe('Keep');
    const malformed = { bs_schema_values: 'keep raw' };
    expect(() =>
      writeSchemaValue(
        malformed,
        resolveSchemaField(schema, malformed.bs_schema_values),
        schema,
        'new',
      ),
    ).toThrow('Repair');
    expect(malformed.bs_schema_values).toBe('keep raw');
  });
});
