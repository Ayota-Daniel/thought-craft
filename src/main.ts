import { WorkspaceRegistry } from './application/workspace-registry';
import { RelationTypeRegistry } from './application/relation-type-registry';
import { migrateWorkspaces } from './settings/workspace-migration';
import { WorkspaceManagerModal } from './ui/workspaces/workspace-manager-modal';
import type { EntityTypeDefinition } from './domain/entity-type';
import { EntityTypeRegistry } from './application/entity-type-registry';
import { TypeManagerModal } from './ui/types/type-manager-modal';
import { isRecord } from './shared/record';
import { Notice, Plugin, TFile } from 'obsidian';
import { captureIdea } from './application/capture-idea';
import { openEntity } from './application/open-entity';
import { EntityIndex } from './infrastructure/entity-index';
import { ObsidianEntityRepository } from './infrastructure/obsidian-entity-repository';
import { type BrainstormSettings, DEFAULT_SETTINGS, settingsFromData } from './settings/settings';
import { ThoughtCraftSettingsTab } from './settings/settings-tab';
import { QuickCaptureModal } from './ui/capture/quick-capture-modal';
import { InboxView, INBOX_VIEW_TYPE } from './ui/inbox/inbox-view';
import { FocusView, FOCUS_VIEW_TYPE } from './ui/focus/focus-view';
import { createFrom } from './application/create-entity';

export default class ThoughtCraftPlugin extends Plugin {
  settings: BrainstormSettings = { ...DEFAULT_SETTINGS };
  readonly entityIndex = new EntityIndex();
  registry!: EntityTypeRegistry;
  workspaces!: WorkspaceRegistry;
  relationTypes!: RelationTypeRegistry;
  private workspaceManager: WorkspaceManagerModal | null = null;
  private configWrites: Promise<void> = Promise.resolve();
  private typeManager: TypeManagerModal | null = null;
  private repository!: ObsidianEntityRepository;
  private disposed = false;
  private captureModal: QuickCaptureModal | null = null;

  async onload(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = settingsFromData(data);
    const rawTypes = isRecord(data) ? data.entityTypes : undefined;
    this.registry = new EntityTypeRegistry(rawTypes, (types) => this.persistTypes(types));
    if (this.registry.issues.length) {
      new Notice(
        'Some entity type definitions could not be read. Their configuration is preserved.',
      );
    }
    const migrated = migrateWorkspaces(
      data,
      this.registry.getActive().map((type) => type.id),
    );
    this.workspaces = new WorkspaceRegistry(
      migrated.workspaces,
      migrated.activeWorkspaceId,
      this.registry.getActive().map((type) => type.id),
      (configuration) =>
        this.saveConfiguration({
          workspaces: [...configuration.workspaces, ...this.workspaces.unreadableDefinitions],
          activeWorkspaceId: configuration.activeWorkspaceId,
        }),
    );
    this.relationTypes = new RelationTypeRegistry(this.workspaces, this.registry);
    if (this.workspaces.issues.length) {
      new Notice('Some workspace definitions could not be read. Their configuration is preserved.');
    }
    const ideaFolderName = this.settings.entitiesFolder.split('/').pop() ?? 'Ideas';
    if (this.registry.get('idea')?.folderName !== ideaFolderName) {
      await this.registry.updateType('idea', { folderName: ideaFolderName });
    }
    await this.saveConfiguration({
      ...this.settings,
      workspaces: [...this.workspaces.getAll(), ...this.workspaces.unreadableDefinitions],
      activeWorkspaceId: this.workspaces.getActive().id,
      entityTypes: [...this.registry.getAll(), ...this.registry.unreadableDefinitions],
    });
    this.repository = new ObsidianEntityRepository(
      this.app,
      this.entityIndex,
      () => this.settings,
      this.registry,
      this.workspaces,
      this.relationTypes,
    );
    this.register(() => this.repository.dispose());
    this.registerView(INBOX_VIEW_TYPE, (leaf) => {
      const view = new InboxView(
        leaf,
        this.entityIndex,
        this.workspaces,
        this.registry,
        () => this.openWorkspaceManager(),
        () => this.openCapture(),
        (id) => {
          void this.openEntityFocus(id);
        },
      );
      this.register(() => view.dispose());
      return view;
    });
    this.registerView(FOCUS_VIEW_TYPE, (leaf) => {
      const view = new FocusView(
        leaf,
        this.entityIndex,
        this.repository,
        () => {
          void this.showInbox();
        },
        (entityId) => {
          void this.openMarkdownNote(entityId);
        },
        (entityId) => {
          void this.openEntityFocus(entityId);
        },
        async (sourceEntityId, input) => {
          const created = await createFrom(
            sourceEntityId,
            input,
            this.entityIndex,
            this.repository,
            this.registry,
            this.workspaces,
          );
          await this.openEntityFocus(created.id);
        },
        this.registry,
        (typeId) => this.openTypeManager(typeId),
        this.workspaces,
        this.relationTypes,
      );
      this.register(() => view.disposeFocus());
      return view;
    });
    this.addCommand({
      id: 'manage-workspaces',
      name: 'Manage workspaces',
      callback: () => this.openWorkspaceManager(),
    });
    this.addCommand({
      id: 'manage-entity-types',
      name: 'Manage entity types',
      callback: () => this.openTypeManager(),
    });
    this.addCommand({
      id: 'capture-idea',
      name: 'Capture idea',
      callback: () => this.openCapture(),
    });
    this.addCommand({
      id: 'open-inbox',
      name: 'Open inbox',
      callback: () => {
        void this.showInbox();
      },
    });
    this.addRibbonIcon('inbox', 'Thought Craft inbox', () => {
      void this.showInbox();
    });
    this.addSettingTab(new ThoughtCraftSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) {
        return;
      }
      // Registration after layout-ready ignores create events for existing files
      // during vault initialization. The initial scan handles those files once.
      this.registerEvent(
        this.app.vault.on('create', (file) => {
          if (file instanceof TFile) {
            void this.repository.syncFile(file);
          }
        }),
      );
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          if (file instanceof TFile) {
            void this.repository.syncFile(file);
          }
        }),
      );
      this.registerEvent(
        this.app.vault.on('delete', (file) => this.repository.removePath(file.path)),
      );
      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) =>
          this.repository.renamePath(oldPath, file.path),
        ),
      );
      void this.repository.rebuild().catch((error: unknown) => {
        console.error('Thought Craft: index rebuild failed.', error);
        new Notice(
          'Thought Craft could not finish reading the vault. Re-enable the plugin to retry.',
        );
      });
    });
  }

  onunload(): void {
    this.disposed = true;
    this.captureModal?.close();
    this.typeManager?.close();
    this.workspaceManager?.close();
  }

  async updateSettings(settings: BrainstormSettings): Promise<void> {
    await this.saveConfiguration(settings);
    const folderName = this.settings.entitiesFolder.split('/').pop() ?? 'Ideas';
    if (this.registry.get('idea')?.folderName !== folderName) {
      await this.registry.updateType('idea', { folderName });
    }
  }

  openWorkspaceManager(): void {
    if (this.workspaceManager) {
      return;
    }
    this.workspaceManager = new WorkspaceManagerModal(
      this.app,
      this.workspaces,
      this.registry,
      () => {
        this.workspaceManager = null;
      },
    );
    this.workspaceManager.open();
  }

  openTypeManager(typeId?: string): void {
    if (this.typeManager) {
      return;
    }
    this.typeManager = new TypeManagerModal(this.app, this.registry, typeId, () => {
      this.typeManager = null;
    });
    this.typeManager.open();
  }

  private async persistTypes(types: readonly EntityTypeDefinition[]): Promise<void> {
    const idea = types.find((type) => type.id === 'idea');
    const ideaFolderChanged = idea?.folderName !== this.registry.get('idea')?.folderName;
    await this.saveConfiguration((existing) => {
      const changes: Record<string, unknown> = {
        entityTypes: [...types, ...this.registry.unreadableDefinitions],
      };
      if (idea && ideaFolderChanged) {
        const parts = settingsFromData(existing).entitiesFolder.split('/');
        parts.pop();
        parts.push(idea.folderName);
        changes.entitiesFolder = parts.join('/');
      }
      return changes;
    });
  }

  private saveConfiguration(
    changes:
      | Record<string, unknown>
      | BrainstormSettings
      | ((existing: Record<string, unknown>) => Record<string, unknown>),
  ): Promise<void> {
    const operation = this.configWrites
      .catch(() => undefined)
      .then(async () => {
        const raw: unknown = await this.loadData();
        const existing = isRecord(raw) ? raw : {};
        if (typeof existing.configVersion === 'number' && existing.configVersion > 4) {
          throw new Error('This configuration was created by a newer Thought Craft version.');
        }
        const next = {
          ...existing,
          ...(typeof changes === 'function' ? changes(existing) : changes),
          configVersion: 4,
        };
        await this.saveData(next);
        this.settings = settingsFromData(next);
      });
    this.configWrites = operation;
    return operation;
  }

  private openCapture(): void {
    if (this.disposed || this.captureModal) {
      return;
    }
    const workspace = this.workspaces.getActive();
    this.captureModal = new QuickCaptureModal(
      this.app,
      workspace.label,
      async (content) => {
        await captureIdea(content, workspace.id, this.repository);
        new Notice('Idea captured.');
        void this.showInbox();
      },
      () => {
        this.captureModal = null;
      },
    );
    this.captureModal.open();
  }

  private async showInbox(): Promise<void> {
    try {
      const leaf =
        this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf('tab');
      if (leaf.view.getViewType() !== INBOX_VIEW_TYPE) {
        await leaf.setViewState({ type: INBOX_VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error('Thought Craft: could not open inbox.', error);
      new Notice('Could not open the inbox. Try the Open inbox command.');
    }
  }

  private async openEntityFocus(id: string): Promise<void> {
    try {
      if (!this.entityIndex.getById(id)) {
        throw new Error('This entity is no longer available in the vault.');
      }

      const existingLeaf = this.app.workspace.getLeavesOfType(FOCUS_VIEW_TYPE).find((leaf) => {
        return leaf.view.getState().entityId === id;
      });
      const leaf = existingLeaf ?? this.app.workspace.getLeaf('tab');

      await leaf.setViewState({
        type: FOCUS_VIEW_TYPE,
        state: { entityId: id },
        active: true,
      });
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open this entity.');
    }
  }

  private async openMarkdownNote(id: string): Promise<void> {
    try {
      await openEntity(id, this.entityIndex, async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
          throw new Error('This note no longer exists.');
        }
        await this.app.workspace.getLeaf('tab').openFile(file);
      });
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open this entity.');
    }
  }
}
