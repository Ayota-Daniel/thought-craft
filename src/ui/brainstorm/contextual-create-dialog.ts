import { addRelationHelp } from '../guide/guide-modal';
import { Modal, type App } from 'obsidian';
import {
  connectedIdeaRelations,
  createConnectedIdea,
  ConnectedIdeaPlacementError,
} from '../../application/contextual-brainstorm';
import type { BoardServices } from './board-services';

export class ContextualCreateDialog extends Modal {
  private unsubscribers: (() => void)[] = [];
  private pending = false;
  private saved = false;
  private draftContent = '';
  private draftRelation = 'related-to';

  constructor(
    app: App,
    private rootId: string,
    private services: BoardServices,
    private closed: () => void,
    private roots?: readonly string[],
  ) {
    super(app);
  }

  onOpen(): void {
    const root = this.services.index.getById(this.rootId);
    this.titleEl.setText(`New idea around ${root?.title ?? 'entity'}`);
    this.modalEl.addClass('tc-connected-idea-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    addRelationHelp(form, this.app);
    if (this.roots && this.roots.length > 1) {
      const rootLabel = form.createEl('label', { text: 'Connect new idea to' });
      const rootSelect = rootLabel.createEl('select', {
        attr: { 'aria-label': 'Connect new idea to' },
      });
      for (const id of this.roots) {
        const entity = this.services.index.getById(id);
        if (entity) rootSelect.createEl('option', { text: entity.title, value: id });
      }
      rootSelect.value = this.rootId;
      rootSelect.addEventListener('change', () => {
        this.draftContent = input.value;
        this.draftRelation = select.value;
        this.rootId = rootSelect.value;
        this.contentEl.empty();
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.onOpen();
      });
    }

    const contentLabel = form.createEl('label', { text: 'Your idea' });
    const input = contentLabel.createEl('textarea', {
      attr: { rows: '4', required: '', 'aria-label': 'Your idea' },
    });
    input.value = this.draftContent;
    const relationLabel = form.createEl('label', { text: 'Connect as' });
    const select = relationLabel.createEl('select', { attr: { 'aria-label': 'Connect as' } });
    form.createEl('p', {
      cls: 'tc-inspector-hint',
      text: `New idea → chosen relationship → ${root?.title ?? 'context root'}. One directed relation; the root note stays unchanged.`,
    });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    const submit = footer.createEl('button', {
      text: 'Create connected idea',
      attr: { type: 'submit' },
      cls: 'mod-cta',
    });
    const refresh = () => {
      const previous = select.value || this.draftRelation;
      const options = connectedIdeaRelations(this.rootId, this.services);
      select.empty();
      for (const option of options) {
        select.createEl('option', { text: option.label, value: option.id });
      }
      if (options.some((option) => option.id === previous)) {
        select.value = previous;
      } else if (options.some((option) => option.id === 'related-to')) {
        select.value = 'related-to';
      }
      const current = this.services.index.getById(this.rootId);
      const placed =
        current && this.services.boards.getBoard(current.workspaceId).nodes[this.rootId];
      const allowed =
        current &&
        this.services.workspaces
          .getAvailableEntityTypes(current.workspaceId, this.services.types)
          .some((type) => type.id === 'idea');
      submit.disabled =
        this.pending || this.saved || !input.value.trim() || !options.length || !placed || !allowed;
      input.disabled = this.pending || this.saved;
      select.disabled = this.pending || this.saved;
    };
    this.unsubscribers = [
      this.services.index.subscribe(refresh),
      this.services.boards.subscribe(refresh),
      this.services.types.subscribe(refresh),
      this.services.workspaces.subscribe(refresh),
    ];
    input.addEventListener('input', refresh);
    cancel.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (submit.disabled) {
        return;
      }
      const relationType = select.value;
      this.pending = true;
      error.setText('');
      refresh();
      void createConnectedIdea(this.rootId, input.value, relationType, this.services)
        .then(() => this.close())
        .catch((failure: unknown) => {
          this.saved = failure instanceof ConnectedIdeaPlacementError;
          error.setText(
            failure instanceof Error ? failure.message : 'Could not create this connected idea.',
          );
          if (this.saved) {
            cancel.setText('Close');
          }
        })
        .finally(() => {
          this.pending = false;
          refresh();
        });
    });
    refresh();
    input.focus();
  }

  onClose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.contentEl.empty();
    this.closed();
  }
}
