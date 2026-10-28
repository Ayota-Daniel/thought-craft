import { getFrontMatterInfo, normalizePath, parseYaml, TFile, TFolder, type App } from 'obsidian';
import type { NewIdea, IdeaWriter } from '../application/capture-idea';
import type { EntityPropertyWriter } from '../application/entity-properties';
import type { CustomProperty, NewProperty, PropertyValue } from '../domain/custom-property';
import type { Entity } from '../domain/entity';
import type { BrainstormSettings } from '../settings/settings';
import { deriveTitle, notePath, sanitizeFilename, validateFolderPath } from '../shared/note-path';
import { EntityIndex } from './entity-index';
import { entityFromFrontmatter, writeEntityFrontmatter } from './frontmatter-mapper';
import { addCustomProperty, removeCustomProperty, updateCustomProperty } from './property-mapper';

export class ObsidianEntityRepository implements IdeaWriter, EntityPropertyWriter {
  private active = true;
  private revisions = new Map<string, number>();
  private clock = 0;
  private propertyWrites = new Map<string, Promise<void>>();

  constructor(
    private app: App,
    private index: EntityIndex,
    private getSettings: () => BrainstormSettings,
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

  async createIdea(idea: NewIdea): Promise<Entity> {
    const folder = normalizePath(validateFolderPath(this.getSettings().entitiesFolder));
    await this.ensureFolder(folder);
    const stem = sanitizeFilename(deriveTitle(idea.content));
    let file: TFile | undefined;
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const path = normalizePath(notePath(folder, stem, attempt));
      if (this.app.vault.getAbstractFileByPath(path)) {
        continue;
      }
      try {
        // An empty frontmatter envelope prevents user text beginning with ---
        // from being interpreted as metadata. All fields are written by the API.
        file = await this.app.vault.create(path, `---\n---\n\n${idea.content}\n`);
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
      id: idea.id,
      type: 'idea',
      title: file.basename,
      workspaceId: idea.workspaceId,
      status: 'inbox',
      filePath: file.path,
      createdAt: idea.createdAt,
      updatedAt: idea.createdAt,
      properties: [],
      propertyIssues: [],
    };
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          writeEntityFrontmatter(frontmatter, entity);
        },
      );
    } catch (error) {
      console.error('Thought Craft: frontmatter update failed.', error);
      throw new Error(
        `Your text is safe in ${file.path}, but its idea metadata could not be saved. Check the note before capturing again.`,
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

  addProperty(entityId: string, input: NewProperty): Promise<void> {
    return this.mutateProperties(entityId, (frontmatter) => {
      addCustomProperty(frontmatter, input);
    });
  }

  updateProperty(entityId: string, property: CustomProperty, value: PropertyValue): Promise<void> {
    return this.mutateProperties(entityId, (frontmatter) => {
      updateCustomProperty(frontmatter, property, value);
    });
  }

  removeProperty(entityId: string, property: CustomProperty): Promise<void> {
    return this.mutateProperties(entityId, (frontmatter) => {
      removeCustomProperty(frontmatter, property);
    });
  }

  private mutateProperties(
    entityId: string,
    mutate: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const previousWrite = this.propertyWrites.get(entityId) ?? Promise.resolve();
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
                  'The note identity or metadata changed. Reopen the entity before editing properties.',
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

    this.propertyWrites.set(entityId, operation);

    const cleanUp = () => {
      if (this.propertyWrites.get(entityId) === operation) {
        this.propertyWrites.delete(entityId);
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
          `A file blocks the idea folder at ${current}. Choose another folder in settings.`,
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
