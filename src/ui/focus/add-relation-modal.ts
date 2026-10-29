import { Modal, type App } from 'obsidian';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { RelationTypeRegistry } from '../../application/relation-type-registry';
import type { NewRelation } from '../../domain/entity-relation';
import type { EntityIndex } from '../../infrastructure/entity-index';

export class AddRelationModal extends Modal {
  private unsubscribers: (() => void)[] = [];
  private pending = false;

  constructor(
    app: App,
    private sourceEntityId: string,
    private index: EntityIndex,
    private types: EntityTypeRegistry,
    private workspaces: WorkspaceRegistry,
    private relationTypes: RelationTypeRegistry,
    private addRelation: (input: NewRelation) => Promise<void>,
    private onClosed: () => void,
    private targetAllowed: (entityId: string) => boolean = () => true,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add relation');
    this.modalEl.addClass('tc-add-relation-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const typeLabel = form.createEl('label', { text: 'Relation type' });
    const typeInput = typeLabel.createEl('select', { attr: { 'aria-label': 'Relation type' } });
    const scopeLabel = form.createEl('label', { text: 'Search scope' });
    const scopeInput = scopeLabel.createEl('select', { attr: { 'aria-label': 'Search scope' } });
    scopeInput.createEl('option', { value: 'source', text: 'Source workspace' });
    scopeInput.createEl('option', { value: 'all', text: 'All Workspaces' });
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
    const errorEl = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancelButton = footer.createEl('button', { text: 'Cancel', type: 'button' });
    const submitButton = footer.createEl('button', {
      text: 'Add relation',
      type: 'submit',
      cls: 'mod-cta',
    });

    const updateTargets = () => {
      const source = this.index.getById(this.sourceEntityId);
      const definition = source
        ? this.relationTypes.resolve(source.workspaceId, typeInput.value)
        : undefined;
      const selectedId = targetInput.value;
      const query = searchInput.value.trim().toLocaleLowerCase();
      scopeInput.disabled = !definition?.builtIn;
      if (!definition?.builtIn) {
        scopeInput.value = 'source';
      }
      const targets = this.index
        .getAll()
        .filter((entity) => {
          if (!source || !definition || source.id === entity.id || !this.targetAllowed(entity.id)) {
            return false;
          }
          if (scopeInput.value !== 'all' && source.workspaceId !== entity.workspaceId) {
            return false;
          }
          if (this.relationTypes.compatibilityIssue(source, entity, typeInput.value)) {
            return false;
          }
          return `${entity.title} ${this.types.label(entity.type)}`
            .toLocaleLowerCase()
            .includes(query);
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
          value: entity.id,
          text: `${entity.title} — ${this.types.label(entity.type)} · ${this.workspaces.label(entity.workspaceId)} · ${entity.id.slice(0, 8)}`,
        });
      }
      targetInput.value = targets.some((entity) => entity.id === selectedId) ? selectedId : '';
      statusEl.setText(
        targets.length ? `${targets.length} available entities` : 'No matching entities.',
      );
      submitButton.disabled = this.pending || !targetInput.value;
    };

    const updateTypes = () => {
      const source = this.index.getById(this.sourceEntityId);
      const selectedId = typeInput.value;
      const available = source ? this.relationTypes.getAvailableForSource(source) : [];
      typeInput.empty();
      for (const builtIn of [true, false]) {
        const group = typeInput.createEl('optgroup', {
          attr: { label: builtIn ? 'Universal' : 'Workspace' },
        });
        for (const definition of available.filter((relation) => relation.builtIn === builtIn)) {
          group.createEl('option', { value: definition.id, text: definition.label });
        }
      }
      if (available.some((definition) => definition.id === selectedId)) {
        typeInput.value = selectedId;
      }
      if (available.length === 0) {
        typeInput.createEl('option', {
          value: '',
          text: 'No relations available for this workspace',
        });
      }
      updateTargets();
    };

    typeInput.addEventListener('change', updateTargets);
    scopeInput.addEventListener('change', updateTargets);
    searchInput.addEventListener('input', updateTargets);
    targetInput.addEventListener('change', () => {
      submitButton.disabled = this.pending || !targetInput.value;
    });
    this.unsubscribers = [
      this.index.subscribe(updateTypes),
      this.types.subscribe(updateTypes),
      this.workspaces.subscribe(updateTypes),
    ];
    updateTypes();
    cancelButton.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending || !targetInput.value) {
        return;
      }
      this.pending = true;
      submitButton.disabled = true;
      errorEl.setText('');
      void this.addRelation({ type: typeInput.value, targetEntityId: targetInput.value })
        .then(() => this.close())
        .catch((error: unknown) => {
          errorEl.setText(error instanceof Error ? error.message : 'Could not add this relation.');
        })
        .finally(() => {
          this.pending = false;
          submitButton.disabled = !targetInput.value;
        });
    });
    typeInput.focus();
  }

  onClose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.contentEl.empty();
    this.onClosed();
  }
}
