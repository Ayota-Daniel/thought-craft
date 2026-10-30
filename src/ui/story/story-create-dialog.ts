import { PlotCreationPlacementError } from '../../application/plot-service';
import { Modal, type App } from 'obsidian';
import type { CreateFromInput } from '../../application/create-entity';
import type { StoryType } from '../../application/story-query';

/** Only orchestrates generic creation; no Story content or properties are stored here. */
export class StoryCreateDialog extends Modal {
  private pending = false;
  private created = false;
  constructor(
    app: App,
    private type: StoryType | 'story-section',
    private label: string,
    private workspaceLabel: string,
    private create: (input: CreateFromInput) => Promise<void>,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(`New ${this.label}`);
    this.modalEl.addClass('tc-story-create-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const titleLabel = form.createEl('label', {
      text: ['character', 'story-section'].includes(this.type) ? 'Name' : 'Title',
    });
    const title = titleLabel.createEl('input', { type: 'text', attr: { required: 'true' } });
    const notesLabel = form.createEl('label', { text: 'Initial notes (optional)' });
    const notes = notesLabel.createEl('textarea', { attr: { rows: '4' } });
    form.createEl('p', { cls: 'tc-inspector-hint', text: `Workspace: ${this.workspaceLabel}` });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    footer.createEl('button', { text: 'Cancel', type: 'button' }).onclick = () => this.close();
    const submit = footer.createEl('button', {
      text: this.type === 'scene' ? 'Create & write' : 'Create',
      type: 'submit',
      cls: 'mod-cta',
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (this.pending || this.created) return;
      this.pending = true;
      submit.disabled = true;
      error.empty();
      void this.create({ type: this.type, title: title.value, content: notes.value })
        .then(() => this.close())
        .catch((failure: unknown) => {
          this.created = failure instanceof PlotCreationPlacementError;
          error.setText(
            failure instanceof Error ? failure.message : 'Could not create this entity.',
          );
        })
        .finally(() => {
          this.pending = false;
          submit.disabled = this.created;
        });
    };
    title.focus();
  }
  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
