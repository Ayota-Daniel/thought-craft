import {
  createCustomProperty,
  isPropertyKey,
  validateProperty,
  withPropertyValue,
  type CustomProperty,
  type NewProperty,
  type PropertyValue,
} from '../domain/custom-property';
import { isRecord } from '../shared/record';

export interface ParsedProperties {
  properties: readonly CustomProperty[];
  issues: readonly string[];
}

export function propertyFromDefinition(key: string, definition: unknown): CustomProperty | null {
  if (!isPropertyKey(key) || !isRecord(definition) || typeof definition.label !== 'string') {
    return null;
  }

  const identity = { key, label: definition.label };
  let property: CustomProperty;

  switch (definition.type) {
    case 'text':
      if (typeof definition.value !== 'string') {
        return null;
      }
      property = { ...identity, type: 'text', value: definition.value };
      break;
    case 'number':
      if (typeof definition.value !== 'number') {
        return null;
      }
      property = { ...identity, type: 'number', value: definition.value };
      break;
    case 'boolean':
      if (typeof definition.value !== 'boolean') {
        return null;
      }
      property = { ...identity, type: 'boolean', value: definition.value };
      break;
    case 'rating':
      if (typeof definition.value !== 'number' || typeof definition.max !== 'number') {
        return null;
      }
      property = { ...identity, type: 'rating', value: definition.value, max: definition.max };
      break;
    case 'select':
      if (typeof definition.value !== 'string' || !Array.isArray(definition.options)) {
        return null;
      }
      if (!definition.options.every((option): option is string => typeof option === 'string')) {
        return null;
      }
      property = {
        ...identity,
        type: 'select',
        value: definition.value,
        options: Object.freeze([...definition.options]),
      };
      break;
    default:
      return null;
  }

  try {
    validateProperty(property);
    return Object.freeze(property);
  } catch {
    return null;
  }
}

export function parseCustomProperties(value: unknown): ParsedProperties {
  if (value === undefined) {
    return { properties: Object.freeze([]), issues: Object.freeze([]) };
  }

  if (!isRecord(value)) {
    return {
      properties: Object.freeze([]),
      issues: Object.freeze([
        'bs_properties must be a mapping. Open the Markdown note to inspect it.',
      ]),
    };
  }

  const properties: CustomProperty[] = [];
  const issues: string[] = [];

  for (const [key, definition] of Object.entries(value)) {
    const property = propertyFromDefinition(key, definition);

    if (property) {
      properties.push(property);
    } else {
      issues.push(`The property “${key}” has an unsupported or invalid definition.`);
    }
  }

  return {
    properties: Object.freeze(properties),
    issues: Object.freeze(issues),
  };
}

export function serializeProperty(property: CustomProperty): Record<string, unknown> {
  validateProperty(property);

  const definition: Record<string, unknown> = {
    label: property.label,
    type: property.type,
    value: property.value,
  };

  if (property.type === 'rating') {
    definition.max = property.max;
  }
  if (property.type === 'select') {
    definition.options = [...property.options];
  }

  return definition;
}

function propertyTable(frontmatter: Record<string, unknown>): Record<string, unknown> {
  if (frontmatter.bs_properties === undefined) {
    frontmatter.bs_properties = {};
  }
  if (!isRecord(frontmatter.bs_properties)) {
    throw new Error(
      'bs_properties is not a mapping. Repair it in the Markdown note before editing properties.',
    );
  }

  return frontmatter.bs_properties;
}

export function addCustomProperty(
  frontmatter: Record<string, unknown>,
  input: NewProperty,
): CustomProperty {
  const table = propertyTable(frontmatter);
  const property = createCustomProperty(input, Object.keys(table));
  table[property.key] = serializeProperty(property);
  return property;
}

function currentDefinition(
  frontmatter: Record<string, unknown>,
  expected: CustomProperty,
): Record<string, unknown> {
  const table = propertyTable(frontmatter);
  const definition = table[expected.key];
  const currentProperty = propertyFromDefinition(expected.key, definition);

  if (!currentProperty || !isRecord(definition)) {
    throw new Error(
      'This property is no longer available. Review the current note before trying again.',
    );
  }

  const hasChanged =
    JSON.stringify(serializeProperty(currentProperty)) !==
    JSON.stringify(serializeProperty(expected));

  if (hasChanged) {
    throw new Error('This property changed elsewhere. Review its current value and try again.');
  }

  return definition;
}

export function updateCustomProperty(
  frontmatter: Record<string, unknown>,
  expected: CustomProperty,
  value: PropertyValue,
): void {
  const definition = currentDefinition(frontmatter, expected);
  const updatedProperty = withPropertyValue(expected, value);
  definition.value = updatedProperty.value;
}

export function removeCustomProperty(
  frontmatter: Record<string, unknown>,
  expected: CustomProperty,
): void {
  currentDefinition(frontmatter, expected);
  const table = propertyTable(frontmatter);
  delete table[expected.key];
}
