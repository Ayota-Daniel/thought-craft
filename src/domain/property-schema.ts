import {
  createCustomProperty,
  isPropertyKey,
  validateProperty,
  type CustomProperty,
  type PropertyType,
  type PropertyValue,
} from './custom-property';
import { isRecord } from '../shared/record';

export interface PropertySchema {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyType;
  readonly retired: boolean;
  readonly defaultValue?: PropertyValue;
  readonly max?: number;
  readonly options?: readonly string[];
}

export function schemaEditorProperty(schema: PropertySchema, value: unknown): CustomProperty {
  return { ...schema, value } as CustomProperty;
}

export function validateSchema(schema: PropertySchema): void {
  if (!isPropertyKey(schema.key) || typeof schema.retired !== 'boolean') {
    throw new Error('Use a stable snake_case property key.');
  }
  if (!['text', 'number', 'rating', 'boolean', 'select'].includes(schema.type)) {
    throw new Error('Choose one of the five supported property types.');
  }
  const initial = createCustomProperty(schema, []);
  if (schema.defaultValue !== undefined) {
    validateProperty(schemaEditorProperty(schema, schema.defaultValue));
  }
  validateProperty(schemaEditorProperty(schema, initial.value));
}

export interface ResolvedSchemaField {
  schema: PropertySchema;
  source: 'explicit' | 'default' | 'missing';
  value: unknown;
  issue?: string;
}

/** Resolution never changes a note: defaults and incompatibilities are projections. */
export function resolveSchemaField(schema: PropertySchema, values: unknown): ResolvedSchemaField {
  const explicit = isRecord(values) && Object.prototype.hasOwnProperty.call(values, schema.key);
  const source = explicit ? 'explicit' : schema.defaultValue !== undefined ? 'default' : 'missing';
  const value = explicit ? values[schema.key] : schema.defaultValue;
  let issue: string | undefined;
  if (source !== 'missing') {
    try {
      validateProperty(schemaEditorProperty(schema, value));
    } catch (error) {
      issue = error instanceof Error ? error.message : 'Incompatible value.';
    }
  }
  return { schema, source, value, issue };
}
