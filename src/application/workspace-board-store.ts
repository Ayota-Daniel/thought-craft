import { parseBoardGroups } from './board-group-config';
import {
  createGroup,
  renameGroup,
  moveGroup,
  assignGroup,
  removeGroup,
  cleanGroupMembers,
} from './board-groups';
import type { BoardGroup } from '../domain/board-group';
import { cardIsOutside, groupBounds, validateGroup } from '../domain/board-group';
import {
  validateBoardPosition,
  validateBoardViewport,
  type BoardPosition,
  type BoardViewport,
  type WorkspaceBoardState,
} from '../domain/board';
import { isUuid } from '../shared/metadata-validation';
import { isRecord } from '../shared/record';
import type { EntityIndex } from '../infrastructure/entity-index';
import type { WorkspaceRegistry } from './workspace-registry';

function freezeBoard(board: WorkspaceBoardState): WorkspaceBoardState {
  const nodes = Object.fromEntries(
    Object.entries(board.nodes).map(([id, position]) => [
      id,
      Object.freeze({ x: position.x, y: position.y }),
    ]),
  );
  return Object.freeze({
    workspaceId: board.workspaceId,
    nodes: Object.freeze(nodes),
    groups: Object.freeze(
      board.groups.map((group) =>
        Object.freeze({
          ...group,
          entityIds: Object.freeze([...group.entityIds]),
        }),
      ),
    ),
    viewport: Object.freeze({
      x: board.viewport.x,
      y: board.viewport.y,
      zoom: board.viewport.zoom,
    }),
  });
}

function parseBoard(raw: unknown): WorkspaceBoardState {
  if (
    !isRecord(raw) ||
    typeof raw.workspaceId !== 'string' ||
    !raw.workspaceId.trim() ||
    !isRecord(raw.nodes) ||
    !isRecord(raw.viewport)
  ) {
    throw new Error('A board needs a Workspace, UUID positions and a viewport.');
  }
  const viewport = raw.viewport as unknown as BoardViewport;
  validateBoardViewport(viewport);
  const nodes: Record<string, BoardPosition> = {};
  for (const [id, value] of Object.entries(raw.nodes)) {
    if (!isUuid(id) || !isRecord(value)) {
      throw new Error('Invalid board entity position.');
    }
    const position = value as unknown as BoardPosition;
    validateBoardPosition(position);
    if (nodes[id.toLowerCase()]) {
      throw new Error('Duplicated board entity UUID.');
    }
    nodes[id.toLowerCase()] = { x: position.x, y: position.y };
  }
  const groups = parseBoardGroups(raw.groups, nodes);
  return freezeBoard({ workspaceId: raw.workspaceId, nodes, viewport, groups });
}

export class WorkspaceBoardStore {
  private boards = new Map<string, WorkspaceBoardState>();
  private emptyBoards = new Map<string, WorkspaceBoardState>();
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private disposed = false;
  readonly unreadableBoards: unknown[] = [];
  readonly issues: string[] = [];

  constructor(
    data: unknown,
    private workspaces: WorkspaceRegistry,
    private index: EntityIndex,
    private persist: (boards: readonly WorkspaceBoardState[]) => Promise<void> = async () =>
      undefined,
  ) {
    if (data !== undefined && !Array.isArray(data)) {
      throw new Error(
        'Board configuration must be a list. Restore data.json before enabling Thought Craft.',
      );
    }
    for (const raw of (data ?? []) as unknown[]) {
      try {
        const board = parseBoard(raw);
        if (this.boards.has(board.workspaceId)) {
          throw new Error('Duplicated Workspace board.');
        }
        this.boards.set(board.workspaceId, board);
      } catch (error) {
        this.unreadableBoards.push(raw);
        this.issues.push(error instanceof Error ? error.message : 'Unreadable board.');
      }
    }
  }

  getBoard(workspaceId: string): WorkspaceBoardState {
    const saved = this.boards.get(workspaceId);
    if (saved) {
      return saved;
    }
    let empty = this.emptyBoards.get(workspaceId);
    if (!empty) {
      empty = freezeBoard({
        workspaceId,
        nodes: {},
        groups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      this.emptyBoards.set(workspaceId, empty);
    }
    return empty;
  }

  getSavedBoards(): readonly WorkspaceBoardState[] {
    return [...this.boards.values()];
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  addEntity(
    workspaceId: string,
    entityId: string,
    position: BoardPosition,
    groupId?: string,
  ): Promise<void> {
    return this.update(workspaceId, (board) => {
      const entity = this.index.getById(entityId);
      if (!entity || entity.workspaceId !== workspaceId) {
        throw new Error('Choose an existing entity in this Workspace.');
      }
      if (board.nodes[entityId]) {
        throw new Error('This entity is already on the board.');
      }
      validateBoardPosition(position);
      const next = { ...board, nodes: { ...board.nodes, [entityId]: position } };
      return groupId ? assignGroup(next, [entityId], groupId) : next;
    });
  }

  removeEntity(workspaceId: string, entityId: string): Promise<void> {
    return this.update(workspaceId, (board) => {
      if (!board.nodes[entityId]) {
        return board;
      }
      const nodes = { ...board.nodes };
      delete nodes[entityId];
      return cleanGroupMembers({ ...board, nodes });
    });
  }

  moveEntity(workspaceId: string, entityId: string, position: BoardPosition): Promise<void> {
    return this.update(workspaceId, (board) => {
      if (!board.nodes[entityId]) {
        throw new Error('This entity is no longer on the board.');
      }
      validateBoardPosition(position);
      if (board.nodes[entityId]?.x === position.x && board.nodes[entityId]?.y === position.y) {
        return board;
      }
      return {
        ...board,
        nodes: { ...board.nodes, [entityId]: position },
        groups: board.groups.map((group) => {
          if (!group.entityIds.includes(entityId) || !cardIsOutside(group, position)) {
            return group;
          }
          return { ...group, entityIds: group.entityIds.filter((id) => id !== entityId) };
        }),
      };
    });
  }

  createGroup(workspaceId: string, entityIds: readonly string[], label: string): Promise<void> {
    return this.update(workspaceId, (board) => createGroup(board, entityIds, label));
  }

  renameGroup(workspaceId: string, groupId: string, label: string): Promise<void> {
    return this.update(workspaceId, (board) => renameGroup(board, groupId, label));
  }

  moveGroup(workspaceId: string, groupId: string, position: BoardPosition): Promise<void> {
    return this.update(workspaceId, (board) => moveGroup(board, groupId, position));
  }

  assignGroup(
    workspaceId: string,
    entityIds: readonly string[],
    groupId: string | null,
  ): Promise<void> {
    return this.update(workspaceId, (board) => assignGroup(board, entityIds, groupId));
  }

  removeGroup(workspaceId: string, groupId: string): Promise<void> {
    return this.update(workspaceId, (board) => removeGroup(board, groupId));
  }

  fitGroup(workspaceId: string, groupId: string): Promise<void> {
    return this.update(workspaceId, (board) => {
      const group = board.groups.find((candidate) => candidate.id === groupId);
      if (!group) {
        throw new Error('This group is no longer available.');
      }
      const bounds = groupBounds(board.nodes, group.entityIds);
      const next: BoardGroup = { ...group, ...bounds };
      validateGroup(next);
      return { ...board, groups: board.groups.map((item) => (item.id === groupId ? next : item)) };
    });
  }

  setViewport(workspaceId: string, viewport: BoardViewport): Promise<void> {
    return this.update(workspaceId, (board) => {
      validateBoardViewport(viewport);
      if (JSON.stringify(board.viewport) === JSON.stringify(viewport)) {
        return board;
      }
      return { ...board, viewport };
    });
  }

  /** Initial indexing is incremental. Never prune placements until the full scan is ready. */
  cleanupDeletedEntities(): Promise<void> {
    return this.enqueue(() => {
      if (!this.index.isReady()) {
        return undefined;
      }
      let changed = false;
      const boards = this.getSavedBoards().map((board) => {
        const nodes = Object.fromEntries(
          Object.entries(board.nodes).filter(([id]) => {
            const entity = this.index.getById(id);
            return entity && entity.workspaceId === board.workspaceId;
          }),
        );
        if (Object.keys(nodes).length === Object.keys(board.nodes).length) {
          return board;
        }
        changed = true;
        return freezeBoard(cleanGroupMembers({ ...board, nodes }));
      });
      return changed ? boards : undefined;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private update(
    workspaceId: string,
    change: (board: WorkspaceBoardState) => WorkspaceBoardState,
  ): Promise<void> {
    return this.enqueue(() => {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace || workspace.retired) {
        throw new Error('Choose an active, configured Workspace board.');
      }
      const current = this.getBoard(workspaceId);
      const next = change(current);
      if (next === current) {
        return undefined;
      }
      const boards = this.getSavedBoards().filter((board) => board.workspaceId !== workspaceId);
      boards.push(freezeBoard(next));
      return boards;
    });
  }

  private enqueue(build: () => readonly WorkspaceBoardState[] | undefined): Promise<void> {
    const operation = this.writes
      .catch(() => undefined)
      .then(async () => {
        if (this.disposed) {
          throw new Error('Thought Craft is no longer active.');
        }
        const next = build();
        if (!next) {
          return;
        }
        await this.persist(next);
        this.boards = new Map(next.map((board) => [board.workspaceId, board]));
        this.listeners.forEach((listener) => listener());
      });
    this.writes = operation;
    return operation;
  }
}
