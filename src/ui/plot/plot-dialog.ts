import { Modal, type App } from 'obsidian';

/** Native forms for the two non-drag Plot intents; no ordering logic lives here. */
export class PlotDialog extends Modal {
  private pending = false;
  constructor(
    app: App,
    private heading: string,
    private initial: string,
    private save: (value: string) => Promise<void>,
    private closed: () => void,
    private sections?: readonly { id: string; title: string }[],
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.modalEl.addClass('tc-plot-dialog');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const label = form.createEl('label', { text: this.sections ? 'Story Section' : 'Name' });
    const input = this.sections
      ? label.createEl('select')
      : label.createEl('input', { type: 'text', attr: { required: 'true' } });
    for (const section of this.sections ?? [])
      input.createEl('option', { value: section.id, text: section.title });
    input.value = this.initial;
    if (this.sections && !input.value) input.value = this.sections[0]?.id ?? '';
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    footer.createEl('button', { type: 'button', text: 'Cancel' }).onclick = () => this.close();
    const submit = footer.createEl('button', {
      type: 'submit',
      text: this.sections ? 'Move' : 'Rename',
      cls: 'mod-cta',
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (this.pending || !input.value.trim()) return;
      this.pending = true;
      submit.disabled = true;
      void this.save(input.value)
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(failure instanceof Error ? failure.message : 'Could not save this change.');
        })
        .finally(() => {
          this.pending = false;
          submit.disabled = false;
        });
    };
    input.focus();
  }
  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
