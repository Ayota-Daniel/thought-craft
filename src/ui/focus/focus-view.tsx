import {
  Component,
  getFrontMatterInfo,
  ItemView,
  MarkdownRenderer,
  TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { EntityPropertyWriter } from '../../application/entity-properties';
import type { Entity } from '../../domain/entity';
import type { EntityIndex } from '../../infrastructure/entity-index';
import { isRecord } from '../../shared/record';
import { AddPropertyModal } from './add-property-modal';
import { PropertyInspector } from './property-inspector';
import { ENTITY_TYPES } from '../../domain/entity-type';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { EntitySchemaValueWriter } from '../../application/entity-schema-values';
import type { EntityRelationWriter } from '../../application/entity-relations';
import type { CreateFromInput } from '../../application/create-entity';
import { AddRelationModal } from './add-relation-modal';
import { CreateFromModal } from './create-from-modal';
import { Relationships } from './relationships';

export const FOCUS_VIEW_TYPE = 'thought-craft-focus';

export class FocusView extends ItemView {
  private unsubscribeTypes: (() => void) | null = null;
  private entityId: string | null = null;
  private headingEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private inspectorRoot: Root | null = null;
  private markdownComponent: Component | null = null;
  private unsubscribe: (() => void) | null = null;
  private propertyModal: AddPropertyModal | null = null;
  private renderVersion = 0;
  private typeLabelEl: HTMLElement | null = null;
  private relationModal: AddRelationModal | null = null;
  private createModal: CreateFromModal | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private index: EntityIndex,
    private propertyWriter: EntityPropertyWriter & EntityRelationWriter & EntitySchemaValueWriter,
    private showInbox: () => void,
    private openMarkdown: (entityId: string) => void,
    private openFocus: (entityId: string) => void,
    private createFromEntity: (sourceEntityId: string, input: CreateFromInput) => Promise<void>,
    private registry: EntityTypeRegistry,
    private manageType: (typeId: string) => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return FOCUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Thought Craft focus';
  }

  getIcon(): string {
    const entity = this.entityId ? this.index.getById(this.entityId) : undefined;
    return ENTITY_TYPES[entity?.type ?? 'idea']?.icon ?? 'file-text';
  }

  getState(): Record<string, unknown> {
    return { entityId: this.entityId };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.entityId = isRecord(state) && typeof state.entityId === 'string' ? state.entityId : null;
    await super.setState(state, result);
    await this.refreshEntity();
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tc-focus');

    const toolbar = this.contentEl.createDiv({ cls: 'tc-focus-toolbar' });
    const backButton = toolbar.createEl('button', { text: 'Back to inbox' });
    backButton.addEventListener('click', this.showInbox);
    const createButton = toolbar.createEl('button', { text: 'Create from…' });
    createButton.addEventListener('click', () => this.showCreateDialog());
    const markdownButton = toolbar.createEl('button', { text: 'Open Markdown note' });
    markdownButton.addEventListener('click', () => {
      if (this.entityId) {
        this.openMarkdown(this.entityId);
      }
    });

    const layout = this.contentEl.createDiv({ cls: 'tc-focus-layout' });
    const content = layout.createEl('article', { cls: 'tc-focus-main' });
    this.typeLabelEl = content.createSpan({ cls: 'tc-eyebrow' });
    this.headingEl = content.createEl('h1');
    this.bodyEl = content.createDiv({ cls: 'tc-focus-markdown' });

    const inspector = layout.createEl('aside', {
      cls: 'tc-focus-inspector',
      attr: { 'aria-label': 'Entity properties' },
    });
    this.inspectorRoot = createRoot(inspector);
    this.unsubscribeTypes = this.registry.subscribe(() => {
      void this.refreshEntity();
    });
    this.unsubscribe = this.index.subscribe(() => {
      void this.refreshEntity();
    });

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        const entity = this.entityId ? this.index.getById(this.entityId) : undefined;
        if (entity?.filePath === file.path) {
          void this.refreshEntity();
        }
      }),
    );

    await this.refreshEntity();
  }

  async onClose(): Promise<void> {
    this.disposeFocus();
  }

  disposeFocus(): void {
    this.renderVersion += 1;
    this.unsubscribeTypes?.();
    this.unsubscribeTypes = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.propertyModal?.close();
    this.relationModal?.close();
    this.createModal?.close();
    this.inspectorRoot?.unmount();
    this.inspectorRoot = null;
    this.markdownComponent?.unload();
    this.markdownComponent = null;
    this.bodyEl = null;
    this.headingEl = null;
    this.typeLabelEl = null;
  }

  private async refreshEntity(): Promise<void> {
    if (!this.headingEl || !this.bodyEl || !this.inspectorRoot) {
      return;
    }

    const version = ++this.renderVersion;
    const entity = this.entityId ? this.index.getById(this.entityId) : undefined;

    if (!entity) {
      this.headingEl.setText(this.index.isReady() ? 'Entity unavailable' : 'Reading your vault…');
      this.bodyEl.setText(
        this.index.isReady()
          ? 'The note may have been deleted, or its Thought Craft metadata is no longer valid.'
          : 'Your entity will appear once the Markdown index is ready.',
      );
      this.inspectorRoot.render(null);
      this.markdownComponent?.unload();
      this.markdownComponent = null;
      return;
    }

    this.headingEl.setText(entity.title);
    this.typeLabelEl?.setText(`Thought Craft · ${this.registry.label(entity.type)}`);
    this.inspectorRoot.render(
      <PropertyInspector
        key={entity.id}
        entity={entity}
        writer={this.propertyWriter}
        registry={this.registry}
        manageType={() => this.manageType(entity.type)}
        addProperty={() => this.showPropertyDialog(entity)}
      >
        <Relationships
          entity={entity}
          registry={this.registry}
          outgoing={this.index.getOutgoingRelations(entity.id)}
          incoming={this.index.getIncomingRelations(entity.id)}
          writer={this.propertyWriter}
          addRelation={() => this.showRelationDialog(entity)}
          openEntity={this.openFocus}
        />
      </PropertyInspector>,
    );

    await this.renderMarkdown(entity, version);
  }

  private async renderMarkdown(entity: Entity, version: number): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entity.filePath);
    if (!(file instanceof TFile) || !this.bodyEl) {
      return;
    }

    let component: Component | null = null;

    try {
      const markdown = await this.app.vault.read(file);
      if (version !== this.renderVersion || !this.bodyEl) {
        return;
      }

      const frontmatter = getFrontMatterInfo(markdown);
      const body = markdown.slice(frontmatter.contentStart);
      const renderedBody = this.bodyEl.ownerDocument.createElement('div');
      renderedBody.classList.add('markdown-rendered');
      component = new Component();
      component.load();

      await MarkdownRenderer.render(this.app, body, renderedBody, file.path, component);

      if (version !== this.renderVersion || !this.bodyEl) {
        component.unload();
        return;
      }

      this.markdownComponent?.unload();
      this.markdownComponent = component;
      this.bodyEl.replaceChildren(renderedBody);
    } catch (error) {
      component?.unload();
      if (version === this.renderVersion && this.bodyEl) {
        this.bodyEl.setText(error instanceof Error ? error.message : 'Could not read this note.');
      }
    }
  }

  private showPropertyDialog(entity: Entity): void {
    if (this.propertyModal) {
      return;
    }

    this.propertyModal = new AddPropertyModal(
      this.app,
      (input) => this.propertyWriter.addProperty(entity.id, input),
      () => {
        this.propertyModal = null;
      },
    );
    this.propertyModal.open();
  }

  private showRelationDialog(entity: Entity): void {
    if (this.relationModal) {
      return;
    }

    this.relationModal = new AddRelationModal(
      this.app,
      entity.id,
      this.index,
      this.registry,
      (input) => this.propertyWriter.addRelation(entity.id, input),
      () => {
        this.relationModal = null;
      },
    );
    this.relationModal.open();
  }

  private showCreateDialog(): void {
    const entity = this.entityId ? this.index.getById(this.entityId) : undefined;
    if (!entity || this.createModal) {
      return;
    }

    this.createModal = new CreateFromModal(
      this.app,
      entity,
      this.registry,
      (input) => this.createFromEntity(entity.id, input),
      () => {
        this.createModal = null;
      },
    );
    this.createModal.open();
  }
}
