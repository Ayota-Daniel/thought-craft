import { Modal, type App } from 'obsidian';
import type { BoardPosition } from '../../domain/board';
import { nextBoardPosition } from '../../domain/board';
import type { BoardServices } from './board-services';

export class AddEntityDialog extends Modal {
  private unsubscribers: (() => void)[] = [];
  private pending = false;
  constructor(
    app: App,
    private workspaceId: string,
    private position: BoardPosition,
    private services: BoardServices,
    private closed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add existing entity');
    this.modalEl.addClass('tc-board-add-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const searchLabel = form.createEl('label', { text: 'Search entities' });
    const search = searchLabel.createEl('input', {
      type: 'search',
      attr: { placeholder: 'Title or entity type…' },
    });
    const entityLabel = form.createEl('label', { text: 'Entity' });
    const select = entityLabel.createEl('select', {
      attr: { size: '7', 'aria-label': 'Entity', required: 'true' },
    });
    const hint = form.createEl('p', { cls: 'tc-inspector-hint' });
    const error = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancel = footer.createEl('button', { text: 'Cancel', type: 'button' });
    const submit = footer.createEl('button', {
      text: 'Add to board',
      type: 'submit',
      cls: 'mod-cta',
    });
    const refresh = () => {
      const previous = select.value;
      const query = search.value.trim().toLocaleLowerCase();
      const board = this.services.boards.getBoard(this.workspaceId);
      const entities = this.services.index
        .getAll()
        .filter(
          (entity) =>
            entity.workspaceId === this.workspaceId &&
            !board.nodes[entity.id] &&
            `${entity.title} ${this.services.types.label(entity.type)}`
              .toLocaleLowerCase()
              .includes(query),
        )
        .sort((first, second) => first.title.localeCompare(second.title));
      select.empty();
      select.createEl('option', {
        text: 'Choose an entity',
        value: '',
        attr: { disabled: 'true' },
      });
      for (const entity of entities) {
        select.createEl('option', {
          text: `${entity.title} — ${this.services.types.label(entity.type)} · ${entity.id.slice(0, 8)}`,
          value: entity.id,
        });
      }
      select.value = entities.some((entity) => entity.id === previous) ? previous : '';
      hint.setText(
        `Workspace: ${this.services.workspaces.label(this.workspaceId)}. Entities already placed are excluded.`,
      );
      submit.disabled = this.pending || !select.value;
    };
    this.unsubscribers = [
      this.services.index.subscribe(refresh),
      this.services.types.subscribe(refresh),
      this.services.boards.subscribe(refresh),
      this.services.workspaces.subscribe(refresh),
    ];
    search.addEventListener('input', refresh);
    select.addEventListener('change', () => {
      submit.disabled = this.pending || !select.value;
    });
    cancel.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !select.value) {
        return;
      }
      this.pending = true;
      submit.disabled = true;
      error.setText('');
      const position = nextBoardPosition(
        this.services.boards.getBoard(this.workspaceId),
        this.position,
      );
      void this.services.boards
        .addEntity(this.workspaceId, select.value, position)
        .then(() => this.close())
        .catch((failure: unknown) => {
          error.setText(
            failure instanceof Error ? failure.message : 'Could not place this entity.',
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
    this.unsubscribers = [];
    this.contentEl.empty();
    this.closed();
  }
}
