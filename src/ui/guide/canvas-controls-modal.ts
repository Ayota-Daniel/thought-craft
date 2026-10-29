import { Modal, type App } from 'obsidian';
import { renderCanvasControls } from './canvas-controls';

export class CanvasControlsModal extends Modal {
  constructor(
    app: App,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText('Brainstorm controls');
    this.modalEl.addClass('tc-canvas-controls-modal');
    renderCanvasControls(this.contentEl);
    const close = this.contentEl.createEl('button', { text: 'Close', attr: { type: 'button' } });
    close.addEventListener('click', () => this.close());
    close.focus();
  }
  onClose(): void {
    this.contentEl.empty();
    this.closed();
  }
}
