import { Modal, type App } from 'obsidian';
import type { BoardPosition } from '../../domain/board';
import { addEntitiesToBoard } from '../../application/entity-batch';
import type { BoardServices } from './board-services';
import { visibleSelection } from '../../application/entity-selection';

interface FocusPicker {
  excluded: readonly string[];
  addRoots: (ids: readonly string[]) => void;
}

/** Native checkboxes provide selection semantics without a custom ARIA listbox. */
export class AddEntityDialog extends Modal {
  private unsubscribers: (() => void)[] = [];
  private pending = false;
  private selected: string[] = [];
  constructor(
    app: App,
    private workspaceId: string,
    private position: BoardPosition,
    private services: BoardServices,
    private closed: () => void,
    private focusPicker?: FocusPicker,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.focusPicker ? 'Add focus' : 'Add to Brainstorm');
    this.modalEl.addClass('tc-board-add-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const label = form.createEl('label', { text: 'Search entities' });
    const search = label.createEl('input', {
      type: 'search',
      attr: { placeholder: 'Title or entity type…' },
    });
    const list = form.createEl('fieldset', { cls: 'tc-entity-picker-list' });
    list.createEl('legend', { text: 'Entities', cls: 'tc-visually-hidden' });
    const rows = list.createDiv();
    const count = form.createEl('p', { cls: 'tc-inspector-hint', attr: { role: 'status' } });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    const submit = footer.createEl('button', {
      text: 'Add',
      attr: { type: 'submit' },
      cls: 'mod-cta',
    });
    const updateCount = () => {
      count.setText(
        `${this.selected.length} selected · ${this.services.workspaces.label(this.workspaceId)}`,
      );
      submit.setText(`Add ${this.selected.length || ''}`.trim());
      submit.disabled = this.pending || !this.selected.length;
    };
    const refresh = () => {
      const focusedId = (document.activeElement as HTMLElement | null)?.dataset.entityId;
      const board = this.services.boards.getBoard(this.workspaceId);
      const query = search.value.trim().toLocaleLowerCase();
      const entities = this.services.index
        .getAll()
        .filter((entity) => {
          const placed = Boolean(board.nodes[entity.id]);
          const candidate = this.focusPicker
            ? placed && !this.focusPicker.excluded.includes(entity.id)
            : !placed;
          return (
            entity.workspaceId === this.workspaceId &&
            candidate &&
            `${entity.title} ${this.services.types.label(entity.type)}`
              .toLocaleLowerCase()
              .includes(query)
          );
        })
        .sort((a, b) => a.title.localeCompare(b.title));
      this.selected = visibleSelection(
        this.selected,
        entities.map((entity) => entity.id),
      );
      rows.empty();
      for (const entity of entities) {
        const row = rows.createEl('label', { cls: 'tc-entity-picker-row' });
        const checkbox = row.createEl('input', {
          type: 'checkbox',
          attr: { 'data-entity-id': entity.id, 'aria-label': `Select ${entity.title}` },
        });
        checkbox.checked = this.selected.includes(entity.id);
        checkbox.disabled = this.pending;
        const text = row.createSpan();
        text.createSpan({ text: entity.title, cls: 'tc-picker-title' });
        text.createSpan({ text: this.services.types.label(entity.type), cls: 'tc-picker-type' });
        checkbox.addEventListener('change', () => {
          this.selected = checkbox.checked
            ? [...this.selected, entity.id]
            : this.selected.filter((id) => id !== entity.id);
          updateCount();
        });
      }
      if (!entities.length)
        rows.createEl('p', {
          text: 'No matching entities. Already added entities are excluded.',
          cls: 'tc-inspector-hint',
        });
      updateCount();
      if (focusedId)
        rows.querySelector<HTMLInputElement>(`input[data-entity-id="${focusedId}"]`)?.focus();
    };
    this.unsubscribers = [
      this.services.index,
      this.services.types,
      this.services.boards,
      this.services.workspaces,
    ].map((service) => service.subscribe(refresh));
    search.addEventListener('input', refresh);
    cancel.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !this.selected.length) return;
      const ids = [...this.selected];
      this.pending = true;
      refresh();
      const operation = this.focusPicker
        ? Promise.resolve(this.focusPicker.addRoots(ids))
        : addEntitiesToBoard(this.workspaceId, ids, this.services.boards, this.position);
      void operation
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(
            failure instanceof Error ? failure.message : 'Could not add this selection.',
          );
        })
        .finally(() => {
          this.pending = false;
          refresh();
        });
    });
    refresh();
    search.focus();
  }
  onClose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.contentEl.empty();
    this.closed();
  }
}
