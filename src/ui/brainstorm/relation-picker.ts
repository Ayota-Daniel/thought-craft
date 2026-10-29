import { addRelationHelp } from '../guide/guide-modal';
import { Modal, type App } from 'obsidian';
import { availableBoardRelations } from '../../application/board-actions';
import type { BoardServices } from './board-services';

export class BoardRelationPicker extends Modal {
  private unsubscribers: (() => void)[] = [];
  private pending = false;
  constructor(
    app: App,
    private workspaceId: string,
    private sourceId: string,
    private targetId: string,
    private services: BoardServices,
    private closed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { index, types, workspaces, boards, relations, writer } = this.services;
    this.titleEl.setText(
      `Connect ${index.getById(this.sourceId)?.title ?? 'entity'} → ${index.getById(this.targetId)?.title ?? 'entity'}`,
    );
    this.modalEl.addClass('tc-board-relation-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    addRelationHelp(form, this.app);
    const label = form.createEl('label', { text: 'Relationship' });
    const select = label.createEl('select', { attr: { 'aria-label': 'Relationship' } });
    const hint = form.createEl('p', {
      cls: 'tc-inspector-hint',
      text: 'This creates a real directed relationship in the source Markdown note.',
    });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    const submit = footer.createEl('button', {
      text: 'Create relationship',
      attr: { type: 'submit' },
      cls: 'mod-cta',
    });
    const refresh = () => {
      const previous = select.value;
      const definitions = availableBoardRelations(
        this.workspaceId,
        this.sourceId,
        this.targetId,
        boards,
        index,
        relations,
      );
      select.empty();
      for (const builtIn of [true, false]) {
        const group = select.createEl('optgroup', {
          attr: { label: builtIn ? 'Universal' : 'Workspace' },
        });
        for (const definition of definitions.filter((candidate) => candidate.builtIn === builtIn)) {
          group.createEl('option', { text: definition.label, value: definition.id });
        }
      }
      if (definitions.some((definition) => definition.id === previous)) {
        select.value = previous;
      }
      hint.setText(
        definitions.length
          ? 'This creates a real directed relationship in the source Markdown note.'
          : 'No new relationship is available for these entities. Existing duplicates and incompatible types are excluded.',
      );
      submit.disabled = this.pending || !definitions.length;
    };
    this.unsubscribers = [
      index.subscribe(refresh),
      types.subscribe(refresh),
      workspaces.subscribe(refresh),
      boards.subscribe(refresh),
    ];
    cancel.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !select.value) {
        return;
      }
      const valid = availableBoardRelations(
        this.workspaceId,
        this.sourceId,
        this.targetId,
        boards,
        index,
        relations,
      ).some((definition) => definition.id === select.value);
      if (!valid) {
        error.setText('The connection changed. Choose a currently available relationship.');
        refresh();
        return;
      }
      this.pending = true;
      submit.disabled = true;
      error.setText('');
      void writer
        .addRelation(this.sourceId, { type: select.value, targetEntityId: this.targetId })
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(
            failure instanceof Error ? failure.message : 'Could not create this relationship.',
          );
        })
        .finally(() => {
          this.pending = false;
          refresh();
        });
    });
    refresh();
    select.focus();
  }

  onClose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.contentEl.empty();
    this.closed();
  }
}
