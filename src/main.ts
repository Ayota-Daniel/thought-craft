import { StoryView, STORY_VIEW_TYPE } from './ui/story/story-view';
import { StoryCreateDialog } from './ui/story/story-create-dialog';
import {
  STORY_COLLECTIONS,
  storyEnabled,
  type StoryOrigin,
  type StorySection,
  type StoryType,
} from './application/story-query';
import { TrashEntitiesModal } from './ui/inbox/trash-entities-modal';
import { ThoughtcraftGuide } from './ui/guide/guide-modal';
import { prepareBrainstormContext } from './application/contextual-brainstorm';
import { WorkspaceBoardStore } from './application/workspace-board-store';
import { nextBoardPosition } from './domain/board';
import { BrainstormView, BRAINSTORM_VIEW_TYPE } from './ui/brainstorm/brainstorm-view';
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
import { createEntity, createFrom } from './application/create-entity';

export default class ThoughtCraftPlugin extends Plugin {
  settings: BrainstormSettings = { ...DEFAULT_SETTINGS };
  readonly entityIndex = new EntityIndex();
  registry!: EntityTypeRegistry;
  workspaces!: WorkspaceRegistry;
  relationTypes!: RelationTypeRegistry;
  boards!: WorkspaceBoardStore;
  private workspaceManager: WorkspaceManagerModal | null = null;
  private configWrites: Promise<void> = Promise.resolve();
  private typeManager: TypeManagerModal | null = null;
  private repository!: ObsidianEntityRepository;
  private disposed = false;
  private storyDialog: StoryCreateDialog | null = null;
  private storyTrash: TrashEntitiesModal | null = null;
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
    this.boards = new WorkspaceBoardStore(
      isRecord(data) ? data.boards : undefined,
      this.workspaces,
      this.entityIndex,
      (boards) => this.saveConfiguration({ boards: [...boards, ...this.boards.unreadableBoards] }),
    );
    this.register(() => this.boards.dispose());
    this.register(
      this.entityIndex.subscribe(() => {
        void this.boards.cleanupDeletedEntities().catch((error: unknown) => {
          if (!this.disposed) {
            console.error('Thought Craft: board cleanup failed.', error);
            new Notice('The board layout could not be cleaned up. Missing entities remain hidden.');
          }
        });
      }),
    );
    if (this.boards.issues.length) {
      new Notice('Some board layouts could not be read. Their configuration is preserved.');
    }
    if (this.workspaces.issues.length) {
      new Notice('Some workspace definitions could not be read. Their configuration is preserved.');
    }
    const ideaFolderName = this.settings.entitiesFolder.split('/').pop() ?? 'Ideas';
    if (this.registry.get('idea')?.folderName !== ideaFolderName) {
      await this.registry.updateType('idea', { folderName: ideaFolderName });
    }
    await this.saveConfiguration({
      ...this.settings,
      ...(isRecord(data) && data.boards !== undefined
        ? { boards: [...this.boards.getSavedBoards(), ...this.boards.unreadableBoards] }
        : {}),
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
        () => {
          void this.showBrainstorm();
        },
        (id) => {
          void this.openEntityFocus(id);
        },
        this.boards,
        this.repository,
        () => {
          void this.showStory();
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
          void this.openEntityFocus(entityId, view.getNavigationOrigin());
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
          await this.openEntityFocus(created.id, view.getNavigationOrigin());
        },
        this.registry,
        (typeId) => this.openTypeManager(typeId),
        this.workspaces,
        this.relationTypes,
        this.boards,
        (id) => {
          void this.openInBrainstorm(id);
        },
        (id) => {
          void this.brainstormAround(id);
        },
      );
      this.register(() => view.disposeFocus());
      return view;
    });
    this.registerView(BRAINSTORM_VIEW_TYPE, (leaf) => {
      const view = new BrainstormView(
        leaf,
        {
          index: this.entityIndex,
          types: this.registry,
          workspaces: this.workspaces,
          relations: this.relationTypes,
          boards: this.boards,
          writer: this.repository,
        },
        {
          openFocus: (id) => {
            void this.openEntityFocus(id);
          },
          showStory: () => {
            void this.showStory();
          },
          showInbox: () => {
            void this.showInbox();
          },
          manageWorkspaces: () => this.openWorkspaceManager(),
        },
      );
      this.register(() => view.disposeBoard());
      return view;
    });
    this.registerView(STORY_VIEW_TYPE, (leaf) => {
      const view = new StoryView(
        leaf,
        {
          index: this.entityIndex,
          types: this.registry,
          workspaces: this.workspaces,
          relations: this.relationTypes,
          boards: this.boards,
          writer: this.repository,
        },
        {
          inbox: () => {
            void this.showInbox();
          },
          brainstorm: () => {
            void this.showBrainstorm();
          },
          manageWorkspaces: () => this.openWorkspaceManager(),
          manageTypes: (id) => this.openTypeManager(id),
          open: (id, origin) => {
            void this.openEntityFocus(id, origin);
          },
          write: (id) => {
            void this.openMarkdownNote(id);
          },
          create: (type, origin) => this.openStoryCreation(type, origin),
          add: (id) => {
            const entity = this.entityIndex.getById(id);
            if (!entity) return;
            void this.boards.addEntities(entity.workspaceId, [id]).catch((error: unknown) => {
              new Notice(error instanceof Error ? error.message : 'Could not add to Brainstorm.');
            });
          },
          trash: (id) => this.trashStoryEntity(id),
          modifiedAt: (entity) => {
            const file = this.app.vault.getAbstractFileByPath(entity.filePath);
            return file instanceof TFile ? file.stat.mtime : undefined;
          },
          guide: () => new ThoughtcraftGuide(this.app, 'Story').open(),
        },
      );
      this.register(() => view.disposeStory());
      return view;
    });
    this.addCommand({
      id: 'open-story',
      name: 'Open Story',
      checkCallback: (checking) => {
        const enabled = storyEnabled(this.workspaces.getActive());
        if (enabled && !checking) void this.showStory();
        return enabled;
      },
    });
    this.addCommand({
      id: 'create-scene',
      name: 'Create Scene',
      checkCallback: (checking) => {
        const workspace = this.workspaces.getActive();
        const enabled =
          storyEnabled(workspace) &&
          this.workspaces
            .getAvailableEntityTypes(workspace.id, this.registry)
            .some((type) => type.id === 'scene');
        if (enabled && !checking) {
          this.openStoryCreation('scene', { workspaceId: workspace.id, section: 'scene' });
        }
        return enabled;
      },
    });
    this.addCommand({
      id: 'open-guide',
      name: 'Open Thoughtcraft Guide',
      callback: () => new ThoughtcraftGuide(this.app).open(),
    });
    this.addCommand({
      id: 'open-brainstorm',
      name: 'Open brainstorm',
      callback: () => {
        void this.showBrainstorm();
      },
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
    this.storyDialog?.close();
    this.storyTrash?.close();
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
        if (typeof existing.configVersion === 'number' && existing.configVersion > 7) {
          throw new Error('This configuration was created by a newer Thought Craft version.');
        }
        const next = {
          ...existing,
          ...(typeof changes === 'function' ? changes(existing) : changes),
          configVersion: 7,
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

  private async brainstormAround(entityId: string): Promise<void> {
    try {
      await prepareBrainstormContext(entityId, {
        index: this.entityIndex,
        boards: this.boards,
        workspaces: this.workspaces,
      });
      await this.showBrainstorm();
      const view = this.app.workspace.getLeavesOfType(BRAINSTORM_VIEW_TYPE)[0]?.view;
      if (view instanceof BrainstormView) {
        view.enterContext(entityId);
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open contextual Brainstorm.');
    }
  }

  private async openInBrainstorm(entityId: string): Promise<void> {
    try {
      const entity = this.entityIndex.getById(entityId);
      if (!entity) {
        throw new Error('This entity is no longer available.');
      }
      const workspace = this.workspaces.get(entity.workspaceId);
      if (!workspace || workspace.retired) {
        throw new Error('Restore or configure this Workspace before using its board.');
      }
      if (!this.boards.getBoard(workspace.id).nodes[entityId]) {
        await this.boards.addEntity(
          workspace.id,
          entityId,
          nextBoardPosition(this.boards.getBoard(workspace.id)),
        );
      }
      await this.workspaces.setActive(workspace.id);
      await this.showBrainstorm();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open Brainstorm.');
    }
  }

  private async showStory(section?: StorySection): Promise<void> {
    try {
      if (!storyEnabled(this.workspaces.getActive())) {
        await this.showInbox();
        return;
      }
      const leaf =
        this.app.workspace.getLeavesOfType(STORY_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf('tab');
      if (leaf.view.getViewType() !== STORY_VIEW_TYPE) {
        await leaf.setViewState({ type: STORY_VIEW_TYPE, active: true });
      }
      if (section && leaf.view instanceof StoryView) leaf.view.navigate(section);
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open Story.');
    }
  }

  private async returnToStory(origin?: StoryOrigin): Promise<void> {
    const workspace = origin ? this.workspaces.get(origin.workspaceId) : undefined;
    if (!workspace || !storyEnabled(workspace)) {
      await this.showInbox();
      return;
    }
    try {
      await this.workspaces.setActive(workspace.id);
      await this.showStory(origin?.section);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not return to Story.');
    }
  }

  private openStoryCreation(type: StoryType, origin: StoryOrigin): void {
    if (this.storyDialog) return;
    const workspace = this.workspaces.get(origin.workspaceId);
    if (!workspace || !storyEnabled(workspace)) return;
    const collection = STORY_COLLECTIONS.find((item) => item.id === type)!;
    this.storyDialog = new StoryCreateDialog(
      this.app,
      type,
      collection.singular,
      workspace.label,
      async (input) => {
        const current = this.workspaces.get(workspace.id);
        if (!current || !storyEnabled(current))
          throw new Error('Story is no longer enabled in this Workspace.');
        const entity = await createEntity(
          input,
          workspace.id,
          this.repository,
          this.registry,
          this.workspaces,
        );
        if (type === 'scene') await this.openMarkdownNote(entity.id);
        else await this.openEntityFocus(entity.id, origin);
      },
      () => {
        this.storyDialog = null;
      },
    );
    this.storyDialog.open();
  }

  private trashStoryEntity(id: string): void {
    if (this.storyTrash) return;
    const entity = this.entityIndex.getById(id);
    if (!entity) return;
    this.storyTrash = new TrashEntitiesModal(
      this.app,
      entity.workspaceId,
      [id],
      this.entityIndex,
      this.repository,
      this.boards,
      () => {
        this.storyTrash = null;
      },
    );
    this.storyTrash.open();
  }

  private async showBrainstorm(): Promise<void> {
    try {
      const leaf =
        this.app.workspace.getLeavesOfType(BRAINSTORM_VIEW_TYPE)[0] ??
        this.app.workspace.getLeaf('tab');
      if (leaf.view.getViewType() !== BRAINSTORM_VIEW_TYPE) {
        await leaf.setViewState({ type: BRAINSTORM_VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not open Brainstorm.');
    }
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

  private async openEntityFocus(id: string, origin?: StoryOrigin): Promise<void> {
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
      if (leaf.view instanceof FocusView) {
        leaf.view.setNavigationOrigin(origin, () => {
          void this.returnToStory(origin);
        });
      }
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
