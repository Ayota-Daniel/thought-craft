import type { WorkspaceRegistry } from '../../application/workspace-registry';
import { Modal, type App } from 'obsidian';
import type { Entity } from '../../domain/entity';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { CreateFromInput } from '../../application/create-entity';

export class CreateFromModal extends Modal {
  private pending = false;
  private unsubscribeWorkspaces: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    app: App,
    private source: Entity,
    private registry: EntityTypeRegistry,
    private workspaces: WorkspaceRegistry,
    private createEntity: (input: CreateFromInput) => Promise<void>,
    private onClosed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Create from this ${this.registry.label(this.source.type).toLowerCase()}`);
    this.modalEl.addClass('tc-create-from-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });
    const typeLabel = form.createEl('label', { text: 'Entity type' });
    const typeInput = typeLabel.createEl('select', { attr: { 'aria-label': 'Entity type' } });

    const refreshTypes = () => {
      const selected = typeInput.value;
      typeInput.empty();
      for (const type of this.workspaces.getAvailableEntityTypes(
        this.source.workspaceId,
        this.registry,
      )) {
        typeInput.createEl('option', { value: type.id, text: type.label });
      }
      if (
        this.workspaces
          .getAvailableEntityTypes(this.source.workspaceId, this.registry)
          .some((type) => type.id === selected)
      ) {
        typeInput.value = selected;
      }
    };
    refreshTypes();
    this.unsubscribeWorkspaces = this.workspaces.subscribe(refreshTypes);
    this.unsubscribe = this.registry.subscribe(refreshTypes);

    const titleLabel = form.createEl('label', { text: 'Title' });
    const titleInput = titleLabel.createEl('input', {
      type: 'text',
      value: this.source.title,
      attr: { required: 'true' },
    });
    const contentLabel = form.createEl('label', { text: 'Initial content (optional)' });
    const contentInput = contentLabel.createEl('textarea', { attr: { rows: '4' } });
    form.createDiv({
      cls: 'tc-inspector-hint',
      text: `Workspace: ${this.workspaces.label(this.source.workspaceId)}. The new entity will link back to this source.`,
    });
    if (
      this.workspaces.getAvailableEntityTypes(this.source.workspaceId, this.registry).length === 0
    ) {
      form.createEl('p', {
        cls: 'tc-inspector-hint',
        text: 'No active entity types are enabled in this workspace. Manage workspaces to enable creation.',
      });
    }
    const errorEl = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancelButton = footer.createEl('button', { text: 'Cancel', type: 'button' });
    const submitButton = footer.createEl('button', {
      text: 'Create',
      type: 'submit',
      cls: 'mod-cta',
    });

    cancelButton.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending) {
        return;
      }

      const input: CreateFromInput = {
        type: typeInput.value,
        title: titleInput.value,
        content: contentInput.value,
      };
      this.pending = true;
      submitButton.disabled = true;
      errorEl.setText('');

      void this.createEntity(input)
        .then(() => {
          this.close();
        })
        .catch((error: unknown) => {
          errorEl.setText(error instanceof Error ? error.message : 'Could not create this entity.');
        })
        .finally(() => {
          this.pending = false;
          submitButton.disabled = false;
        });
    });

    typeInput.focus();
  }

  onClose(): void {
    this.unsubscribeWorkspaces?.();
    this.unsubscribeWorkspaces = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.empty();
    this.onClosed();
  }
}
