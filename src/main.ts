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
  private repository!: ObsidianEntityRepository;
  private disposed = false;
  private captureModal: QuickCaptureModal | null = null;

  async onload(): Promise<void> {
    this.settings = settingsFromData(await this.loadData());
    this.repository = new ObsidianEntityRepository(this.app, this.entityIndex, () => this.settings);
    this.register(() => this.repository.dispose());
    this.registerView(INBOX_VIEW_TYPE, (leaf) => {
      const view = new InboxView(
        leaf,
        this.entityIndex,
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
          );
          await this.openEntityFocus(created.id);
        },
      );
      this.register(() => view.disposeFocus());
      return view;
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
  }

  async updateSettings(settings: BrainstormSettings): Promise<void> {
    await this.saveData(settings);
    this.settings = settings;
  }

  private openCapture(): void {
    if (this.disposed || this.captureModal) {
      return;
    }
    const workspace = this.settings.defaultWorkspace;
    this.captureModal = new QuickCaptureModal(
      this.app,
      workspace,
      async (content) => {
        await captureIdea(content, workspace, this.repository);
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
