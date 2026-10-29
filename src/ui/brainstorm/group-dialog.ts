import { Modal, type App } from 'obsidian';

/** A small native form reused for group creation, rename and explicit membership. */
export class GroupDialog extends Modal {
  private pending = false;

  constructor(
    app: App,
    private heading: string,
    private initial: string,
    private save: (value: string) => Promise<void>,
    private closed: () => void,
    private options?: readonly { id: string; label: string }[],
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.modalEl.addClass('tc-group-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const label = form.createEl('label', { text: this.options ? 'Group' : 'Name' });
    let input: HTMLSelectElement | HTMLInputElement;
    if (this.options) {
      input = label.createEl('select', { attr: { 'aria-label': 'Group' } });
      for (const option of this.options) {
        input.createEl('option', { text: option.label, value: option.id });
      }
    } else {
      input = label.createEl('input', {
        type: 'text',
        attr: { maxlength: '100', required: '', 'aria-label': 'Name' },
      });
    }
    input.value = this.initial;
    if (this.options && !input.value) {
      input.value = this.options[0]?.id ?? '';
    }
    form.createEl('p', {
      cls: 'tc-inspector-hint',
      text: 'Groups organize this board only. Notes, properties and relationships remain unchanged.',
    });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    footer
      .createEl('button', { text: 'Cancel', type: 'button' })
      .addEventListener('click', () => this.close());
    const submit = footer.createEl('button', {
      text: this.heading.startsWith('Group selected') ? 'Create group' : 'Save',
      type: 'submit',
      cls: 'mod-cta',
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !input.value.trim()) {
        return;
      }
      this.pending = true;
      submit.disabled = true;
      input.disabled = true;
      error.setText('');
      void this.save(input.value)
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(failure instanceof Error ? failure.message : 'Could not save this group.');
        })
        .finally(() => {
          this.pending = false;
          submit.disabled = false;
          input.disabled = false;
        });
    });
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
