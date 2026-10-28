import { getFrontMatterInfo, normalizePath, parseYaml, TFile, TFolder, type App } from 'obsidian';
import type { EntityWriter, NewEntity } from '../application/create-entity';
import type { EntityRelationWriter } from '../application/entity-relations';
import {
  validateNewRelation,
  validateRelation,
  type EntityRelation,
  type NewRelation,
} from '../domain/entity-relation';
import { isEntityType } from '../domain/entity-type';
import type { EntityTypeRegistry } from '../application/entity-type-registry';
import type { EntitySchemaValueWriter } from '../application/entity-schema-values';
import type { ResolvedSchemaField } from '../domain/property-schema';
import { writeSchemaValue } from './schema-value-mapper';
import { isUuid, isTimestamp } from '../shared/metadata-validation';
import { folderForEntity } from '../shared/entity-path';
import { addEntityRelation, removeEntityRelation, serializeRelation } from './relation-mapper';
import type { EntityPropertyWriter } from '../application/entity-properties';
import type { CustomProperty, NewProperty, PropertyValue } from '../domain/custom-property';
import type { Entity } from '../domain/entity';
import type { BrainstormSettings } from '../settings/settings';
import { notePath, sanitizeFilename } from '../shared/note-path';
import { EntityIndex } from './entity-index';
import { entityFromFrontmatter, writeEntityFrontmatter } from './frontmatter-mapper';
import { addCustomProperty, removeCustomProperty, updateCustomProperty } from './property-mapper';

export class ObsidianEntityRepository
  implements EntityWriter, EntityPropertyWriter, EntityRelationWriter, EntitySchemaValueWriter
{
  private active = true;
  private revisions = new Map<string, number>();
  private clock = 0;
  private metadataWrites = new Map<string, Promise<void>>();

  constructor(
    private app: App,
    private index: EntityIndex,
    private getSettings: () => BrainstormSettings,
    private registry: EntityTypeRegistry,
  ) {}

  dispose(): void {
    this.active = false;
    this.revisions.clear();
  }

  /** Runs only after layout-ready. Batches avoid starting a read for every file at once. */
  async rebuild(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    for (let start = 0; this.active && start < files.length; start += 20) {
      await Promise.all(files.slice(start, start + 20).map((file) => this.syncFile(file)));
    }
    if (this.active) {
      this.index.markReady();
    }
  }

  async syncFile(file: TFile): Promise<void> {
    const path = file.path;
    if (!this.active || file.extension.toLowerCase() !== 'md') {
      return;
    }
    const revision = ++this.clock;
    this.revisions.set(path, revision);
    try {
      const content = await this.app.vault.read(file);
      if (
        !this.active ||
        this.revisions.get(path) !== revision ||
        file.path !== path ||
        this.app.vault.getAbstractFileByPath(path) !== file
      ) {
        return;
      }
      let frontmatter: unknown;
      try {
        const info = getFrontMatterInfo(content);
        frontmatter = info.exists ? (parseYaml(info.frontmatter) as unknown) : undefined;
      } catch {
        frontmatter = undefined;
      }
      const entity = entityFromFrontmatter(frontmatter, path);
      if (!entity) {
        this.index.removePath(path);
        return;
      }
      // An OS rename can emit create(new) before delete(old). Upserting by UUID
      // follows the entity immediately; removing the old path cannot delete it.
      this.index.upsert(entity);
    } catch (error) {
      if (this.active && this.app.vault.getAbstractFileByPath(path)) {
        console.error(`Thought Craft: could not read ${path}.`, error);
      }
    }
  }

  removePath(path: string): void {
    this.invalidate(path);
    this.index.removePath(path);
  }

  renamePath(oldPath: string, newPath: string): void {
    this.invalidate(oldPath);
    this.index.renamePath(oldPath, newPath);
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === newPath || file.path.startsWith(`${newPath}/`)) {
        void this.syncFile(file);
      }
    }
  }

  async createEntity(input: NewEntity): Promise<Entity> {
    if (
      !isEntityType(input.type) ||
      !this.registry.get(input.type) ||
      this.registry.get(input.type)?.retired ||
      !isUuid(input.id) ||
      !isTimestamp(input.createdAt) ||
      !input.title.trim() ||
      !input.workspaceId.trim()
    ) {
      throw new Error(
        'A new entity needs valid identity, type, title, workspace and creation time.',
      );
    }
    const validatedRelations: EntityRelation[] = [];
    for (const relation of input.relations) {
      validateRelation(relation);
      validateNewRelation(input.id, relation, validatedRelations);
      validatedRelations.push(relation);
    }

    const folder = normalizePath(
      folderForEntity(
        input.type,
        this.getSettings().entitiesFolder,
        this.registry.get(input.type)?.folderName,
      ),
    );
    await this.ensureFolder(folder);
    const stem = sanitizeFilename(input.title);
    let file: TFile | undefined;
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const path = normalizePath(notePath(folder, stem, attempt));
      if (this.app.vault.getAbstractFileByPath(path)) {
        continue;
      }
      try {
        // An empty frontmatter envelope prevents user text beginning with ---
        // from being interpreted as metadata. All fields are written by the API.
        file = await this.app.vault.create(path, `---\n---\n\n${input.content}\n`);
        break;
      } catch (error) {
        if (this.app.vault.getAbstractFileByPath(path)) {
          continue;
        }
        throw error;
      }
    }
    if (!file) {
      throw new Error('Could not find an available filename. Try a different first line.');
    }
    const entity: Entity = {
      id: input.id,
      type: input.type,
      title: file.basename,
      workspaceId: input.workspaceId,
      status: input.type === 'idea' ? 'inbox' : 'exploring',
      filePath: file.path,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      properties: [],
      propertyIssues: [],
      relations: Object.freeze([...validatedRelations]),
      relationIssues: [],
      schemaValues: undefined,
    };
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          writeEntityFrontmatter(frontmatter, entity);
          if (entity.relations.length > 0) {
            frontmatter.bs_relations = entity.relations.map(serializeRelation);
          }
        },
      );
    } catch (error) {
      console.error('Thought Craft: frontmatter update failed.', error);
      throw new Error(
        `Your text is safe in ${file.path}, but its entity metadata could not be saved. Check the note before capturing again.`,
      );
    }
    // Supersede any reads of the temporary empty frontmatter. UI updates do not
    // wait for MetadataCache's asynchronous parse.
    this.invalidate(file.path);
    if (this.active && this.app.vault.getAbstractFileByPath(file.path) === file) {
      this.index.upsert({ ...entity, filePath: file.path, title: file.basename });
      // Reconcile any external edit that raced with the capture commit.
      void this.syncFile(file);
    }
    return entity;
  }

  setSchemaValue(
    entityId: string,
    expected: ResolvedSchemaField,
    value: PropertyValue | undefined,
  ): Promise<void> {
    return this.mutateMetadata(entityId, (frontmatter) => {
      const definition = this.registry.get(String(frontmatter.bs_type));
      const schema = definition?.properties.find(
        (property) => property.key === expected.schema.key,
      );
      if (!schema) {
        throw new Error('The property schema is unavailable.');
      }
      writeSchemaValue(frontmatter, expected, schema, value);
    });
  }

  addProperty(entityId: string, input: NewProperty): Promise<void> {
    return this.mutateMetadata(entityId, (frontmatter) => {
      addCustomProperty(frontmatter, input);
    });
  }

  updateProperty(entityId: string, property: CustomProperty, value: PropertyValue): Promise<void> {
    return this.mutateMetadata(entityId, (frontmatter) => {
      updateCustomProperty(frontmatter, property, value);
    });
  }

  removeProperty(entityId: string, property: CustomProperty): Promise<void> {
    return this.mutateMetadata(entityId, (frontmatter) => {
      removeCustomProperty(frontmatter, property);
    });
  }

  addRelation(sourceEntityId: string, input: NewRelation): Promise<void> {
    const relation: EntityRelation = {
      id: globalThis.crypto.randomUUID(),
      type: input.type,
      targetEntityId: input.targetEntityId.toLowerCase(),
      createdAt: new Date().toISOString(),
    };

    return this.mutateMetadata(sourceEntityId, (frontmatter) => {
      if (!this.index.getById(relation.targetEntityId)) {
        throw new Error('The target entity is no longer available.');
      }
      addEntityRelation(frontmatter, sourceEntityId, relation);
    });
  }

  removeRelation(sourceEntityId: string, relation: EntityRelation): Promise<void> {
    return this.mutateMetadata(sourceEntityId, (frontmatter) => {
      removeEntityRelation(frontmatter, relation);
    });
  }

  private mutateMetadata(
    entityId: string,
    mutate: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const previousWrite = this.metadataWrites.get(entityId) ?? Promise.resolve();
    const operation = previousWrite
      .catch(() => undefined)
      .then(async () => {
        if (!this.active) {
          throw new Error('Thought Craft is no longer active.');
        }

        const entity = this.index.getById(entityId);
        const file = entity ? this.app.vault.getAbstractFileByPath(entity.filePath) : null;

        if (!(file instanceof TFile)) {
          throw new Error('This note is no longer available.');
        }

        try {
          await this.app.fileManager.processFrontMatter(
            file,
            (frontmatter: Record<string, unknown>) => {
              const currentEntity = entityFromFrontmatter(frontmatter, file.path);

              if (currentEntity?.id !== entityId) {
                throw new Error(
                  'The note identity or metadata changed. Reopen the entity before editing this entity.',
                );
              }

              mutate(frontmatter);
              frontmatter.bs_updated = new Date().toISOString();
            },
          );
        } finally {
          // A rejected stale edit must also refresh the inspector from the file.
          await this.syncFile(file);
        }
      });

    this.metadataWrites.set(entityId, operation);

    const cleanUp = () => {
      if (this.metadataWrites.get(entityId) === operation) {
        this.metadataWrites.delete(entityId);
      }
    };

    void operation.then(cleanUp, cleanUp);
    return operation;
  }

  private invalidate(path: string): void {
    this.revisions.set(path, ++this.clock);
    for (const key of this.revisions.keys()) {
      if (key.startsWith(`${path}/`)) {
        this.revisions.set(key, ++this.clock);
      }
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    let current = '';
    for (const part of path.split('/')) {
      current = normalizePath(current ? `${current}/${part}` : part);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(
          `A file blocks the entity folder at ${current}. Choose another folder in settings.`,
        );
      }
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
          throw error;
        }
      }
    }
  }
}
