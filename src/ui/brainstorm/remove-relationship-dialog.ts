import { Modal, type App } from 'obsidian';

export class RemoveRelationshipDialog extends Modal {
  private pending = false;
  constructor(
    app: App,
    private label: string,
    private remove: () => Promise<void>,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText('Remove relationship');
    this.modalEl.addClass('tc-board-remove-relation-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    form.createEl('p', {
      text: `Remove “${this.label}” from the source Markdown note? The entities stay intact.`,
    });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    footer
      .createEl('button', { text: 'Cancel', type: 'button' })
      .addEventListener('click', () => this.close());
    const submit = footer.createEl('button', {
      text: 'Remove relationship',
      type: 'submit',
      cls: 'mod-warning',
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending) {
        return;
      }
      this.pending = true;
      submit.disabled = true;
      void this.remove()
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(
            failure instanceof Error ? failure.message : 'Could not remove this relationship.',
          );
        })
        .finally(() => {
          this.pending = false;
          submit.disabled = false;
        });
    });
  }
  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
