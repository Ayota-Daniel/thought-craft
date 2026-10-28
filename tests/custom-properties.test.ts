import { describe, expect, it } from 'vitest';
import {
  createCustomProperty,
  propertyKeyForLabel,
  withPropertyValue,
  type CustomProperty,
  type NewProperty,
} from '../src/domain/custom-property';
import {
  addCustomProperty,
  parseCustomProperties,
  removeCustomProperty,
  serializeProperty,
  updateCustomProperty,
} from '../src/infrastructure/property-mapper';
import { entityFromFrontmatter } from '../src/infrastructure/frontmatter-mapper';

const textProperty: CustomProperty = { key: 'tone', label: 'Tone', type: 'text', value: 'Hopeful' };
const validMetadata = {
  bs_id: 'ca829f16-35b0-4e68-857b-d54cfc73caed',
  bs_type: 'idea',
  bs_workspace: 'default',
  bs_status: 'inbox',
  bs_created: '2026-10-28T09:15:00.000Z',
  bs_updated: '2026-10-28T09:15:00.000Z',
};

describe('property parsing', () => {
  it('accepts absent or empty properties', () => {
    expect(parseCustomProperties(undefined)).toEqual({ properties: [], issues: [] });
    expect(parseCustomProperties({})).toEqual({ properties: [], issues: [] });
  });

  it('parses a valid property with its stored key', () => {
    const parsed = parseCustomProperties({
      tone: { label: 'Tone', type: 'text', value: 'Hopeful' },
    });
    expect(parsed.properties).toEqual([textProperty]);
    expect(parsed.issues).toEqual([]);
  });

  it('parses all five types without interpreting values in the UI', () => {
    const properties = parseCustomProperties({
      note: { label: 'Note', type: 'text', value: '' },
      effort: { label: 'Effort', type: 'number', value: -2.5 },
      originality: { label: 'Originality', type: 'rating', value: 4, max: 5 },
      ready: { label: 'Ready', type: 'boolean', value: false },
      tone: { label: 'Tone', type: 'select', value: 'dark', options: ['dark', 'hopeful'] },
    });

    expect(properties.properties.map((property) => property.type)).toEqual([
      'text',
      'number',
      'rating',
      'boolean',
      'select',
    ]);
    expect(properties.issues).toEqual([]);
  });

  it.each([null, [], 'not a mapping', 42])(
    'reports a malformed property container: %j',
    (value) => {
      const parsed = parseCustomProperties(value);
      expect(parsed.properties).toEqual([]);
      expect(parsed.issues).toHaveLength(1);
    },
  );

  it.each([
    null,
    [],
    { type: 'text', value: 'missing label' },
    { label: 'Empty' },
    { label: 'Unknown', type: 'relation', value: 'other-note' },
    { label: 'Text', type: 'text', value: 4 },
    { label: 'Number', type: 'number', value: '4' },
    { label: 'Number', type: 'number', value: Number.NaN },
    { label: 'Number', type: 'number', value: Infinity },
    { label: 'Ready', type: 'boolean', value: 'false' },
    { label: 'Rating', type: 'rating', value: 6, max: 5 },
    { label: 'Rating', type: 'rating', value: -1, max: 5 },
    { label: 'Rating', type: 'rating', value: 1.5, max: 5 },
    { label: 'Rating', type: 'rating', value: 1, max: 0 },
    { label: 'Rating', type: 'rating', value: 1 },
    { label: 'Tone', type: 'select', value: 'dark', options: [] },
    { label: 'Tone', type: 'select', value: 'dark', options: ['hopeful'] },
    { label: 'Tone', type: 'select', value: 'dark', options: ['dark', 'dark'] },
    { label: 'Tone', type: 'select', value: 'dark', options: ['dark', 4] },
  ])('ignores an invalid definition without losing valid neighbors: %j', (definition) => {
    const parsed = parseCustomProperties({
      valid: { label: 'Valid', type: 'text', value: 'Keep' },
      invalid: definition,
    });
    expect(parsed.properties).toHaveLength(1);
    expect(parsed.properties[0]?.key).toBe('valid');
    expect(parsed.issues).toHaveLength(1);
  });

  it('rejects malformed machine keys', () => {
    const parsed = parseCustomProperties({
      'Human Label': { label: 'Label', type: 'text', value: '' },
    });
    expect(parsed.properties).toHaveLength(0);
    expect(parsed.issues).toHaveLength(1);
  });

  it('keeps the entity readable when one custom property is invalid', () => {
    const entity = entityFromFrontmatter(
      {
        ...validMetadata,
        bs_properties: { future: { label: 'Future', type: 'formula', value: 'x + 1' } },
      },
      'Idea.md',
    );

    expect(entity?.id).toBe(validMetadata.bs_id);
    expect(entity?.properties).toEqual([]);
    expect(entity?.propertyIssues).toHaveLength(1);
  });
});

describe('property domain behavior', () => {
  it('derives machine keys from labels and handles duplicates deterministically', () => {
    expect(propertyKeyForLabel('Émotion / Impact', [])).toBe('emotion_impact');
    expect(propertyKeyForLabel('Tone', ['tone', 'tone_2'])).toBe('tone_3');
    expect(propertyKeyForLabel('123', [])).toBe('property_123');
    expect(propertyKeyForLabel('世界', [])).toBe('property');
    expect(propertyKeyForLabel('constructor', [])).toBe('property_constructor');
  });

  it('keeps the key stable when the label or value changes', () => {
    const property = { ...textProperty, label: 'Atmosphere' };
    expect(withPropertyValue(property, 'Dark').key).toBe('tone');
    const restored = parseCustomProperties({ tone: serializeProperty(property) });
    expect(restored.properties[0]?.key).toBe('tone');
  });

  it('defaults ratings to 0 out of 5 and enforces boundaries', () => {
    const property = createCustomProperty({ label: 'Originality', type: 'rating' }, []);
    expect(property).toMatchObject({ type: 'rating', value: 0, max: 5 });
    expect(withPropertyValue(property, 5).value).toBe(5);
    expect(() => withPropertyValue(property, 6)).toThrow();
    expect(() => withPropertyValue(property, -1)).toThrow();
    expect(() => withPropertyValue(property, 1.5)).toThrow();
  });

  it('uses the first select option as its initial value', () => {
    const property = createCustomProperty(
      { label: 'Tone', type: 'select', options: ['dark', 'hopeful'] },
      [],
    );
    expect(property.value).toBe('dark');
    expect(() => withPropertyValue(property, 'unknown')).toThrow();
    expect(() =>
      createCustomProperty({ label: 'Tone', type: 'select', options: ['dark', 'dark'] }, []),
    ).toThrow();
  });

  it('rejects empty labels and invalid numeric values', () => {
    expect(() => createCustomProperty({ label: ' ', type: 'text' }, [])).toThrow();
    const property = createCustomProperty({ label: 'Effort', type: 'number' }, []);
    expect(() => withPropertyValue(property, '4')).toThrow();
    expect(() => withPropertyValue(property, Infinity)).toThrow();
  });
});

describe('property frontmatter mutations', () => {
  function frontmatterWithProperties(): Record<string, unknown> {
    return {
      ...validMetadata,
      bs_future_metadata: { keep: true },
      tags: ['writing'],
      user_data: { nested: ['keep', 'all'] },
      bs_properties: {
        tone: { ...serializeProperty(textProperty), future_setting: 'preserve me' },
        unsupported: { label: 'Future field', type: 'relation', value: 'other-note' },
      },
    };
  }

  it.each<NewProperty>([
    { label: 'Text', type: 'text' },
    { label: 'Number', type: 'number' },
    { label: 'Rating', type: 'rating' },
    { label: 'Boolean', type: 'boolean' },
    { label: 'Select', type: 'select', options: ['a', 'b'] },
  ])('round-trips a new $type property', (input) => {
    const frontmatter: Record<string, unknown> = {};
    const property = addCustomProperty(frontmatter, input);
    expect(parseCustomProperties(frontmatter.bs_properties).properties).toEqual([property]);
  });

  it('adds without overwriting any existing valid or invalid key', () => {
    const frontmatter = frontmatterWithProperties();
    const before = structuredClone(frontmatter);
    const property = addCustomProperty(frontmatter, { label: 'Tone', type: 'text' });
    expect(property.key).toBe('tone_2');
    expect(frontmatter).toMatchObject(before);
  });

  it('updates only the value and preserves user metadata, other bs_ fields and unknown definitions', () => {
    const frontmatter = frontmatterWithProperties();
    const expected = structuredClone(frontmatter);
    const properties = expected.bs_properties as Record<string, Record<string, unknown>>;
    properties.tone!.value = 'Melancholic';

    updateCustomProperty(frontmatter, textProperty, 'Melancholic');
    expect(frontmatter).toEqual(expected);
  });

  it('removes only the selected property', () => {
    const frontmatter = frontmatterWithProperties();
    const expected = structuredClone(frontmatter);
    delete (expected.bs_properties as Record<string, unknown>).tone;

    removeCustomProperty(frontmatter, textProperty);
    expect(frontmatter).toEqual(expected);
  });

  it('rejects stale edits and removals instead of overwriting an external value', () => {
    const frontmatter = frontmatterWithProperties();
    updateCustomProperty(frontmatter, textProperty, 'Changed externally');
    const before = structuredClone(frontmatter);

    expect(() => updateCustomProperty(frontmatter, textProperty, 'Stale draft')).toThrow(
      'changed elsewhere',
    );
    expect(() => removeCustomProperty(frontmatter, textProperty)).toThrow('changed elsewhere');
    expect(frontmatter).toEqual(before);
  });

  it('does not replace a malformed container with an empty mapping', () => {
    const frontmatter = { bs_properties: 'keep this unexpected value', custom: true };
    expect(() => addCustomProperty(frontmatter, { label: 'New', type: 'text' })).toThrow(
      'not a mapping',
    );
    expect(frontmatter.bs_properties).toBe('keep this unexpected value');
  });
});
