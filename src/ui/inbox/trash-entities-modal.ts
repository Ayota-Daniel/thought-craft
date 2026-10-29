import { Modal, type App } from 'obsidian';
import { moveEntitiesToTrash, type EntityTrashWriter } from '../../application/entity-batch';
import type { EntityIndex } from '../../infrastructure/entity-index';
import type { WorkspaceBoardStore } from '../../application/workspace-board-store';

export class TrashEntitiesModal extends Modal {
  private pending = false;
  constructor(
    app: App,
    private workspaceId: string,
    private ids: readonly string[],
    private index: EntityIndex,
    private writer: EntityTrashWriter,
    private boards: WorkspaceBoardStore,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(
      `Move ${this.ids.length} ${this.ids.length === 1 ? 'entity' : 'entities'} to trash?`,
    );
    this.modalEl.addClass('tc-trash-modal');
    this.contentEl.createEl('p', {
      text: 'Notes will move to your vault’s .trash folder, where you can recover them. Cards and group memberships will be removed. Links from other notes stay as unavailable targets.',
    });
    const list = this.contentEl.createEl('ul');
    for (const id of this.ids)
      list.createEl('li', { text: this.index.getById(id)?.title ?? 'Unavailable entity' });
    const error = this.contentEl.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = this.contentEl.createDiv({ cls: 'tc-property-form-footer' });
    const cancel = footer.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', () => this.close());
    const submit = footer.createEl('button', { text: 'Move to trash', cls: 'mod-warning' });
    submit.addEventListener('click', () => {
      if (this.pending) return;
      this.pending = true;
      submit.disabled = true;
      cancel.disabled = true;
      void moveEntitiesToTrash(this.workspaceId, this.ids, this.index, this.writer, this.boards)
        .then((result) => {
          if (!result.failures.length && !result.cleanupWarning) {
            this.pending = false;
            this.close();
          } else {
            error.setText(
              `${result.succeeded.length} moved. ${result.failures.map((failure) => `${failure.title}: ${failure.message}`).join(' ')} ${result.cleanupWarning ?? ''}`,
            );
            submit.remove();
            cancel.setText('Close');
          }
        })
        .catch((failure: unknown) => {
          error.setText(
            failure instanceof Error
              ? failure.message
              : 'Could not complete trashing. Review the current list before retrying.',
          );
          submit.remove();
        })
        .finally(() => {
          this.pending = false;
          cancel.disabled = false;
        });
    });
    cancel.focus();
  }
  close(): void {
    if (!this.pending) super.close();
  }

  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
