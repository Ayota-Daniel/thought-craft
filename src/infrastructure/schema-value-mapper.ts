import type { PropertyValue } from '../domain/custom-property';
import { validateProperty } from '../domain/custom-property';
import {
  resolveSchemaField,
  schemaEditorProperty,
  type ResolvedSchemaField,
  type PropertySchema,
} from '../domain/property-schema';
import { isRecord } from '../shared/record';

/** Only the requested explicit value changes. Invalid neighboring values remain untouched. */
export function writeSchemaValue(
  frontmatter: Record<string, unknown>,
  expected: ResolvedSchemaField,
  currentSchema: PropertySchema,
  value: PropertyValue | undefined,
): void {
  if (currentSchema.retired || JSON.stringify(currentSchema) !== JSON.stringify(expected.schema)) {
    throw new Error('The schema changed. Reopen the field before saving.');
  }
  const raw = frontmatter.bs_schema_values;
  if (raw !== undefined && !isRecord(raw)) {
    throw new Error('Repair bs_schema_values in the Markdown note before editing values.');
  }
  const current = resolveSchemaField(currentSchema, raw);
  if (
    current.source !== expected.source ||
    JSON.stringify(current.value) !== JSON.stringify(expected.value)
  ) {
    throw new Error('This value changed elsewhere. Discard the draft before saving.');
  }
  if (value !== undefined) {
    validateProperty(schemaEditorProperty(currentSchema, value));
  }
  const values = { ...(raw as Record<string, unknown> | undefined) };
  if (value === undefined) {
    delete values[currentSchema.key];
  } else {
    values[currentSchema.key] = value;
  }
  frontmatter.bs_schema_values = values;
}
