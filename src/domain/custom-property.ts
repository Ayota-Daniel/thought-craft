export type PropertyType = 'text' | 'number' | 'rating' | 'boolean' | 'select';
export type PropertyValue = string | number | boolean;

interface PropertyIdentity {
  readonly key: string;
  readonly label: string;
}

export type CustomProperty =
  | (PropertyIdentity & { readonly type: 'text'; readonly value: string })
  | (PropertyIdentity & { readonly type: 'number'; readonly value: number })
  | (PropertyIdentity & { readonly type: 'boolean'; readonly value: boolean })
  | (PropertyIdentity & { readonly type: 'rating'; readonly value: number; readonly max: number })
  | (PropertyIdentity & {
      readonly type: 'select';
      readonly value: string;
      readonly options: readonly string[];
    });

export interface NewProperty {
  label: string;
  type: PropertyType;
  max?: number;
  options?: readonly string[];
}

const PROPERTY_KEY = /^[a-z][a-z0-9_]*$/;
const RESERVED_KEYS = new Set(['constructor', 'prototype', '__proto__']);

export function isPropertyKey(key: string): boolean {
  return PROPERTY_KEY.test(key) && !RESERVED_KEYS.has(key);
}

export function propertyKeyForLabel(label: string, existingKeys: readonly string[]): string {
  let base = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  base = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!base || !/^[a-z]/.test(base) || RESERVED_KEYS.has(base)) {
    base = base ? `property_${base}` : 'property';
  }

  const occupiedKeys = new Set(existingKeys);
  let candidate = base;
  let suffix = 2;

  while (occupiedKeys.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function validateProperty(property: CustomProperty): void {
  if (!isPropertyKey(property.key) || !property.label.trim()) {
    throw new Error('A property needs a valid key and a non-empty label.');
  }

  switch (property.type) {
    case 'text':
      if (typeof property.value !== 'string') {
        throw new Error('Text properties need a text value.');
      }
      break;
    case 'number':
      if (typeof property.value !== 'number' || !Number.isFinite(property.value)) {
        throw new Error('Enter a finite number.');
      }
      break;
    case 'boolean':
      if (typeof property.value !== 'boolean') {
        throw new Error('Boolean properties need true or false.');
      }
      break;
    case 'rating':
      if (!Number.isSafeInteger(property.max) || property.max < 1) {
        throw new Error('A rating maximum must be a positive whole number.');
      }
      if (
        !Number.isSafeInteger(property.value) ||
        property.value < 0 ||
        property.value > property.max
      ) {
        throw new Error(`Enter a whole-number rating from 0 to ${property.max}.`);
      }
      break;
    case 'select': {
      const hasInvalidOptions = property.options.some(
        (option) => typeof option !== 'string' || !option.trim(),
      );
      const hasDuplicateOptions = new Set(property.options).size !== property.options.length;

      if (property.options.length === 0 || hasInvalidOptions || hasDuplicateOptions) {
        throw new Error('Add at least one non-empty option, without duplicates.');
      }
      if (!property.options.includes(property.value)) {
        throw new Error('Choose one of the configured options.');
      }
      break;
    }
  }
}

export function createCustomProperty(
  input: NewProperty,
  existingKeys: readonly string[],
): CustomProperty {
  const identity = {
    key: propertyKeyForLabel(input.label, existingKeys),
    label: input.label.trim(),
  };

  let property: CustomProperty;

  switch (input.type) {
    case 'text':
      property = { ...identity, type: 'text', value: '' };
      break;
    case 'number':
      property = { ...identity, type: 'number', value: 0 };
      break;
    case 'boolean':
      property = { ...identity, type: 'boolean', value: false };
      break;
    case 'rating':
      property = { ...identity, type: 'rating', value: 0, max: input.max ?? 5 };
      break;
    case 'select': {
      const options = input.options?.map((option) => option.trim()) ?? [];
      property = { ...identity, type: 'select', value: options[0] ?? '', options };
      break;
    }
  }

  validateProperty(property);
  return property;
}

export function withPropertyValue(property: CustomProperty, value: PropertyValue): CustomProperty {
  const updatedProperty = { ...property, value } as CustomProperty;
  validateProperty(updatedProperty);
  return updatedProperty;
}
