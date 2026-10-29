import { ContextualCreateDialog } from './contextual-create-dialog';
import { GroupDialog } from './group-dialog';
import { ItemView, Modal, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createBoardIdea, availableBoardRelations } from '../../application/board-actions';
import type { BoardPosition } from '../../domain/board';
import type { EntityRelation } from '../../domain/entity-relation';
import { QuickCaptureModal } from '../capture/quick-capture-modal';
import { AddRelationModal } from '../focus/add-relation-modal';
import { BrainstormApp } from './brainstorm-app';
import type { BoardServices, BoardCommands } from './board-services';
import { AddEntityDialog } from './add-entity-dialog';
import { BoardRelationPicker } from './relation-picker';
import { RemoveRelationshipDialog } from './remove-relationship-dialog';

export const BRAINSTORM_VIEW_TYPE = 'thought-craft-brainstorm';

export class BrainstormView extends ItemView {
  private root: Root | null = null;
  private disposed = false;
  private dialog: Modal | null = null;
  private commands: BoardCommands;
  private contextRequest: { entityId: string; sequence: number } | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private services: BoardServices,
    navigation: Pick<BoardCommands, 'openFocus' | 'showInbox' | 'manageWorkspaces'>,
  ) {
    super(leaf);
    this.commands = {
      ...navigation,
      createIdea: (workspaceId, position) => this.createIdea(workspaceId, position),
      addExisting: (workspaceId, position) =>
        this.showDialog(
          new AddEntityDialog(this.app, workspaceId, position, services, () => this.clearDialog()),
        ),
      connect: (workspaceId, sourceId, targetId) =>
        this.showDialog(
          new BoardRelationPicker(this.app, workspaceId, sourceId, targetId, services, () =>
            this.clearDialog(),
          ),
        ),
      createConnected: (rootId, roots) =>
        this.showDialog(
          new ContextualCreateDialog(this.app, rootId, services, () => this.clearDialog(), roots),
        ),
      addFocus: (workspaceId, excluded, addRoots) =>
        this.showDialog(
          new AddEntityDialog(
            this.app,
            workspaceId,
            { x: 0, y: 0 },
            services,
            () => this.clearDialog(),
            { excluded, addRoots },
          ),
        ),
      createGroup: (workspaceId, ids) =>
        this.showDialog(
          new GroupDialog(
            this.app,
            'Group selected entities',
            '',
            (label) => services.boards.createGroup(workspaceId, ids, label),
            () => this.clearDialog(),
          ),
        ),
      renameGroup: (workspaceId, groupId) => {
        const group = services.boards
          .getBoard(workspaceId)
          .groups.find((item) => item.id === groupId);
        if (group) {
          this.showDialog(
            new GroupDialog(
              this.app,
              'Rename group',
              group.label,
              (label) => services.boards.renameGroup(workspaceId, groupId, label),
              () => this.clearDialog(),
            ),
          );
        }
      },
      moveToGroup: (workspaceId, ids) =>
        this.showDialog(
          new GroupDialog(
            this.app,
            'Move to group',
            '',
            (id) => services.boards.assignGroup(workspaceId, ids, id),
            () => this.clearDialog(),
            services.boards
              .getBoard(workspaceId)
              .groups.map((group) => ({ id: group.id, label: group.label })),
          ),
        ),
      removeRelationship: (sourceId, relation) => this.removeRelationship(sourceId, relation),
    };
  }

  getViewType(): string {
    return BRAINSTORM_VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Thought Craft brainstorm';
  }
  getIcon(): string {
    return 'layout-dashboard';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tc-brainstorm-container');
    this.disposed = false;
    // A restored ItemView can open before Obsidian's window/zoom bridge is ready.
    // React Flow measures nodes immediately, so mount it only after layout-ready.
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) {
        return;
      }
      this.root = createRoot(this.contentEl);
      this.renderBoard();
    });
  }

  enterContext(entityId: string): void {
    this.contextRequest = { entityId, sequence: (this.contextRequest?.sequence ?? 0) + 1 };
    this.renderBoard();
  }

  private renderBoard(): void {
    this.root?.render(
      <BrainstormApp
        services={this.services}
        commands={this.commands}
        contextRequest={this.contextRequest}
        connectSelected={(workspaceId, entityId) => this.connectSelected(workspaceId, entityId)}
      />,
    );
  }

  async onClose(): Promise<void> {
    this.disposeBoard();
  }
  disposeBoard(): void {
    this.disposed = true;
    this.contextRequest = null;
    this.dialog?.close();
    this.dialog = null;
    this.root?.unmount();
    this.root = null;
  }

  private createIdea(workspaceId: string, position: BoardPosition): void {
    const { writer, boards, workspaces, types } = this.services;
    this.showDialog(
      new QuickCaptureModal(
        this.app,
        workspaces.label(workspaceId),
        async (content) => {
          await createBoardIdea(content, workspaceId, position, writer, boards, workspaces, types);
        },
        () => this.clearDialog(),
      ),
    );
  }

  private connectSelected(workspaceId: string, sourceId: string): void {
    const { index, types, workspaces, relations, boards, writer } = this.services;
    this.showDialog(
      new AddRelationModal(
        this.app,
        sourceId,
        index,
        types,
        workspaces,
        relations,
        async (input) => {
          const allowed = availableBoardRelations(
            workspaceId,
            sourceId,
            input.targetEntityId,
            boards,
            index,
            relations,
          );
          if (!allowed.some((definition) => definition.id === input.type)) {
            throw new Error(
              'Choose a new, compatible relationship between entities still on this board.',
            );
          }
          await writer.addRelation(sourceId, input);
        },
        () => this.clearDialog(),
        (id) => Boolean(boards.getBoard(workspaceId).nodes[id]),
      ),
    );
  }

  private removeRelationship(sourceId: string, relation: EntityRelation): void {
    const source = this.services.index.getById(sourceId);
    const label = this.services.relations.label(source?.workspaceId ?? '', relation.type);
    this.showDialog(
      new RemoveRelationshipDialog(
        this.app,
        label,
        () => this.services.writer.removeRelation(sourceId, relation),
        () => this.clearDialog(),
      ),
    );
  }

  private showDialog(dialog: Modal): void {
    if (this.dialog) {
      return;
    }
    this.dialog = dialog;
    dialog.open();
  }
  private clearDialog(): void {
    this.dialog = null;
  }
}
