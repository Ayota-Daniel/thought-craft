import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { EntityIndex } from '../../infrastructure/entity-index';
import type { WorkspaceBoardStore } from '../../application/workspace-board-store';
import { addEntitiesToBoard, type EntityTrashWriter } from '../../application/entity-batch';
import { TrashEntitiesModal } from './trash-entities-modal';
import { ThoughtcraftGuide } from '../guide/guide-modal';
import { Inbox } from './inbox';

export const INBOX_VIEW_TYPE = 'thought-craft-inbox';
export class InboxView extends ItemView {
  private root: Root | null = null;
  private trashModal: TrashEntitiesModal | null = null;
  constructor(
    leaf: WorkspaceLeaf,
    private index: EntityIndex,
    private workspaces: WorkspaceRegistry,
    private types: EntityTypeRegistry,
    private manageWorkspaces: () => void,
    private capture: () => void,
    private showBrainstorm: () => void,
    private openIdea: (id: string) => void,
    private boards: WorkspaceBoardStore,
    private writer: EntityTrashWriter,
    private showStory: () => void,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return INBOX_VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Thought Craft inbox';
  }
  getIcon(): string {
    return 'inbox';
  }
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tc-inbox-container');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <Inbox
        boards={this.boards}
        add={(ids) => addEntitiesToBoard(this.workspaces.getActive().id, ids, this.boards)}
        trash={(ids) => {
          if (this.trashModal) return;
          this.trashModal = new TrashEntitiesModal(
            this.app,
            this.workspaces.getActive().id,
            [...ids],
            this.index,
            this.writer,
            this.boards,
            () => {
              this.trashModal = null;
            },
          );
          this.trashModal.open();
        }}
        guide={() => new ThoughtcraftGuide(this.app).open()}
        workspaces={this.workspaces}
        types={this.types}
        manageWorkspaces={this.manageWorkspaces}
        index={this.index}
        capture={this.capture}
        showBrainstorm={this.showBrainstorm}
        showStory={this.showStory}
        open={this.openIdea}
      />,
    );
  }
  async onClose(): Promise<void> {
    this.dispose();
  }
  dispose(): void {
    this.trashModal?.close();
    this.root?.unmount();
    this.root = null;
  }
}
