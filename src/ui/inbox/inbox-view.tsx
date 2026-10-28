import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { EntityIndex } from '../../infrastructure/entity-index';
import { Inbox } from './inbox';

export const INBOX_VIEW_TYPE = 'thought-craft-inbox';
export class InboxView extends ItemView {
  private root: Root | null = null;
  constructor(leaf: WorkspaceLeaf, private index: EntityIndex, private capture: () => void, private openIdea: (id: string) => void) { super(leaf); }
  getViewType(): string { return INBOX_VIEW_TYPE; }
  getDisplayText(): string { return 'Thought Craft inbox'; }
  getIcon(): string { return 'inbox'; }
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tc-inbox-container');
    this.root = createRoot(this.contentEl);
    this.root.render(<Inbox index={this.index} capture={this.capture} open={this.openIdea} />);
  }
  async onClose(): Promise<void> { this.dispose(); }
  dispose(): void { this.root?.unmount(); this.root = null; }
}
