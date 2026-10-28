import { Modal, type App } from 'obsidian';
import { ENTITY_TYPES } from '../../domain/entity-type';
import { RELATION_TYPES, type NewRelation, type RelationType } from '../../domain/entity-relation';
import type { EntityIndex } from '../../infrastructure/entity-index';

export class AddRelationModal extends Modal {
  private unsubscribe: (() => void) | null = null;
  private pending = false;

  constructor(
    app: App,
    private sourceEntityId: string,
    private index: EntityIndex,
    private addRelation: (input: NewRelation) => Promise<void>,
    private onClosed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add relation');
    this.modalEl.addClass('tc-add-relation-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const searchLabel = form.createEl('label', { text: 'Search entities' });
    const searchInput = searchLabel.createEl('input', {
      type: 'search',
      attr: { placeholder: 'Title or entity type…' },
    });
    const targetLabel = form.createEl('label', { text: 'Target entity' });
    const targetInput = targetLabel.createEl('select', {
      attr: { size: '6', required: 'true', 'aria-label': 'Target entity' },
    });
    const statusEl = form.createDiv({ cls: 'tc-inspector-hint', attr: { role: 'status' } });
    const typeLabel = form.createEl('label', { text: 'Relation type' });
    const typeInput = typeLabel.createEl('select', { attr: { 'aria-label': 'Relation type' } });

    for (const [type, label] of Object.entries(RELATION_TYPES)) {
      typeInput.createEl('option', { text: label, value: type });
    }

    const errorEl = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancelButton = footer.createEl('button', { text: 'Cancel', type: 'button' });
    const submitButton = footer.createEl('button', {
      text: 'Add relation',
      type: 'submit',
      cls: 'mod-cta',
    });

    const updateTargets = () => {
      const selectedId = targetInput.value;
      const query = searchInput.value.trim().toLocaleLowerCase();
      const targets = this.index
        .getAll()
        .filter((entity) => {
          const searchableText =
            `${entity.title} ${ENTITY_TYPES[entity.type].label}`.toLocaleLowerCase();
          return entity.id !== this.sourceEntityId && searchableText.includes(query);
        })
        .sort(
          (first, second) =>
            first.title.localeCompare(second.title) || first.id.localeCompare(second.id),
        );

      targetInput.empty();
      targetInput.createEl('option', {
        text: 'Choose an entity',
        value: '',
        attr: { disabled: 'true' },
      });
      for (const entity of targets) {
        targetInput.createEl('option', {
          text: `${entity.title} — ${ENTITY_TYPES[entity.type].label} · ${entity.id.slice(0, 8)}`,
          value: entity.id,
        });
      }
      targetInput.value = targets.some((entity) => entity.id === selectedId) ? selectedId : '';
      statusEl.setText(
        targets.length ? `${targets.length} available entities` : 'No matching entities.',
      );
      submitButton.disabled = this.pending || !targetInput.value;
    };

    searchInput.addEventListener('input', updateTargets);
    targetInput.addEventListener('change', () => {
      submitButton.disabled = this.pending || !targetInput.value;
    });
    this.unsubscribe = this.index.subscribe(updateTargets);
    updateTargets();

    cancelButton.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !targetInput.value) {
        return;
      }

      const input: NewRelation = {
        type: typeInput.value as RelationType,
        targetEntityId: targetInput.value,
      };
      this.pending = true;
      submitButton.disabled = true;
      errorEl.setText('');

      void this.addRelation(input)
        .then(() => {
          this.close();
        })
        .catch((error: unknown) => {
          errorEl.setText(error instanceof Error ? error.message : 'Could not add this relation.');
        })
        .finally(() => {
          this.pending = false;
          submitButton.disabled = !targetInput.value;
        });
    });

    searchInput.focus();
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.empty();
    this.onClosed();
  }
}
