import { ENTITY_TYPES, isEntityType, type EntityTypeDefinition } from '../domain/entity-type';
import { validateSchema, type PropertySchema } from '../domain/property-schema';
import { validateFolderPath } from '../shared/note-path';
import { isRecord } from '../shared/record';

export function typeIdForLabel(label: string): string {
  const id = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(id) ? id : `type-${id || 'entity'}`;
}

function validateDefinition(definition: EntityTypeDefinition): void {
  if (!isEntityType(definition.id) || !definition.label.trim()) {
    throw new Error('Enter a label and a safe type ID.');
  }
  validateFolderPath(definition.folderName);
  if (definition.id === 'idea' && definition.folderName.includes('/')) {
    throw new Error(
      'The Idea folder name must be a single folder. Use capture settings to change its parent.',
    );
  }
  if (typeof definition.builtIn !== 'boolean' || typeof definition.retired !== 'boolean') {
    throw new Error('Invalid type state.');
  }
  // Pre-existing custom Story type IDs keep their identity, schema and retirement state.
  // It occupies the reserved ID, so seeding never creates a second definition.
  const legacyStoryType =
    ['plot-thread', 'story-section'].includes(definition.id) && !definition.builtIn;
  if (
    !legacyStoryType &&
    definition.builtIn !== Object.prototype.hasOwnProperty.call(ENTITY_TYPES, definition.id)
  ) {
    throw new Error('Built-in identity cannot be changed.');
  }
  if (definition.builtIn && definition.retired) {
    throw new Error('Built-in types cannot be retired.');
  }
  const keys = new Set<string>();
  for (const property of definition.properties) {
    validateSchema(property);
    if (keys.has(property.key)) {
      throw new Error('A property with this key already exists.');
    }
    keys.add(property.key);
  }
}

function freezeDefinition(definition: EntityTypeDefinition): EntityTypeDefinition {
  return Object.freeze({
    ...definition,
    properties: Object.freeze(
      definition.properties.map((property) =>
        Object.freeze({
          ...property,
          ...(property.options ? { options: Object.freeze([...property.options]) } : {}),
        }),
      ),
    ),
  });
}

/** Global to this plugin/vault configuration; independent of EntityIndex and workspace IDs. */
export class EntityTypeRegistry {
  private definitions = new Map<string, EntityTypeDefinition>();
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  readonly issues: string[] = [];
  readonly unreadableDefinitions: unknown[] = [];

  constructor(
    data: unknown = undefined,
    private persist: (types: readonly EntityTypeDefinition[]) => Promise<void> = async () =>
      undefined,
  ) {
    if (data !== undefined && !Array.isArray(data)) {
      throw new Error(
        'Entity type configuration must be a list. Restore data.json before enabling Thought Craft.',
      );
    }
    for (const raw of (data ?? []) as unknown[]) {
      try {
        if (!isRecord(raw) || !Array.isArray(raw.properties)) {
          throw new Error('Invalid entity type definition.');
        }
        const definition = raw as unknown as EntityTypeDefinition;
        validateDefinition(definition);
        if (this.definitions.has(definition.id)) {
          throw new Error(`Duplicate type ID: ${definition.id}`);
        }
        this.definitions.set(definition.id, freezeDefinition(definition));
      } catch (error) {
        this.unreadableDefinitions.push(raw);
        this.issues.push(error instanceof Error ? error.message : 'Unreadable type definition.');
      }
    }
    for (const [id, presentation] of Object.entries(ENTITY_TYPES)) {
      if (!this.definitions.has(id)) {
        this.definitions.set(
          id,
          freezeDefinition({
            id,
            label: presentation.label,
            folderName: presentation.folder,
            builtIn: true,
            retired: false,
            properties: [],
          }),
        );
      }
    }
  }

  get(id: string): EntityTypeDefinition | undefined {
    return this.definitions.get(id);
  }
  getAll(): readonly EntityTypeDefinition[] {
    return [...this.definitions.values()];
  }
  getActive(): readonly EntityTypeDefinition[] {
    return this.getAll().filter((type) => !type.retired);
  }
  label(id: string): string {
    return this.get(id)?.label ?? `Unknown Entity Type: ${id}`;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createCustomType(input: { id: string; label: string; folderName: string }): Promise<void> {
    const id = typeIdForLabel(input.id);
    return this.change(() => {
      if (this.get(id)) {
        throw new Error('This type ID is already in use.');
      }
      return {
        ...input,
        id,
        label: input.label.trim(),
        folderName: validateFolderPath(input.folderName),
        builtIn: false,
        retired: false,
        properties: [],
      };
    });
  }

  updateType(
    id: string,
    changes: { label?: string; folderName?: string; retired?: boolean },
  ): Promise<void> {
    return this.change(() => {
      const current = this.require(id);
      return {
        ...current,
        ...changes,
        label: (changes.label ?? current.label).trim(),
        folderName: validateFolderPath(changes.folderName ?? current.folderName),
      };
    });
  }

  addProperty(id: string, property: PropertySchema): Promise<void> {
    return this.change(() => {
      const current = this.require(id);
      return { ...current, properties: [...current.properties, property] };
    });
  }

  updateProperty(id: string, key: string, changes: Partial<PropertySchema>): Promise<void> {
    return this.change(() => {
      const current = this.require(id);
      const property = current.properties.find((candidate) => candidate.key === key);
      if (!property) {
        throw new Error('This property no longer exists.');
      }
      if (
        (changes.type && changes.type !== property.type) ||
        (changes.key && changes.key !== key)
      ) {
        throw new Error('Property type and key are immutable.');
      }
      return {
        ...current,
        properties: current.properties.map((candidate) =>
          candidate.key === key ? { ...candidate, ...changes } : candidate,
        ),
      };
    });
  }

  private require(id: string): EntityTypeDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new Error('This type is no longer available.');
    }
    return definition;
  }

  private change(build: () => EntityTypeDefinition): Promise<void> {
    const operation = this.writes
      .catch(() => undefined)
      .then(async () => {
        const next = build();
        validateDefinition(next);
        const definitions = this.getAll().map((type) => (type.id === next.id ? next : type));
        if (!this.get(next.id)) {
          definitions.push(next);
        }
        await this.persist(definitions);
        this.definitions.set(next.id, freezeDefinition(next));
        this.listeners.forEach((listener) => listener());
      });
    this.writes = operation;
    return operation;
  }
}
