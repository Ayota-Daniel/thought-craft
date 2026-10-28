import { Modal, type App } from 'obsidian';

export class QuickCaptureModal extends Modal {
  private pending = false;
  private input!: HTMLTextAreaElement;
  private submitButton!: HTMLButtonElement;
  private errorEl!: HTMLElement;

  constructor(app: App, private workspaceId: string, private capture: (content: string) => Promise<void>, private closed: () => void) { super(app); }

  onOpen(): void {
    this.titleEl.setText('Capture idea');
    this.modalEl.addClass('thought-craft-capture');
    const label = this.contentEl.createEl('label', { cls: 'tc-capture-label', text: 'Your idea', attr: { for: 'tc-idea-input' } });
    label.addClass('tc-visually-hidden');
    this.input = this.contentEl.createEl('textarea', {
      cls: 'tc-capture-input', attr: { id: 'tc-idea-input', placeholder: 'A thought worth keeping…', rows: '5' },
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); void this.submit();
      }
    });
    this.input.addEventListener('input', () => { this.submitButton.disabled = this.pending || !this.input.value.trim(); });
    const context = this.contentEl.createDiv({ cls: 'tc-capture-context' });
    context.createSpan({ text: 'Workspace' });
    context.createSpan({ cls: 'tc-workspace-name', text: this.workspaceId });
    this.errorEl = this.contentEl.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = this.contentEl.createDiv({ cls: 'tc-capture-footer' });
    footer.createSpan({ cls: 'tc-keyboard-hint', text: 'Enter to capture · Shift+Enter for a new line' });
    this.submitButton = footer.createEl('button', { cls: 'mod-cta', text: 'Capture idea' });
    this.submitButton.disabled = true;
    this.submitButton.addEventListener('click', () => { void this.submit(); });
    this.input.focus();
  }

  onClose(): void { this.contentEl.empty(); this.closed(); }

  private async submit(): Promise<void> {
    if (this.pending || !this.input.value.trim()) return;
    this.pending = true;
    this.submitButton.disabled = true;
    this.submitButton.setText('Capturing…');
    this.input.disabled = true;
    this.errorEl.setText('');
    try { await this.capture(this.input.value); this.close(); }
    catch (error) {
      this.errorEl.setText(error instanceof Error ? error.message : 'Could not capture this idea. Please try again.');
      this.pending = false;
      this.input.disabled = false;
      this.submitButton.disabled = false;
      this.submitButton.setText('Capture idea');
      this.input.focus();
    }
  }
}
