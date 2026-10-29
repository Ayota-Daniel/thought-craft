import type { WorkspaceBoardState, BoardPosition } from '../domain/board';
import { validateBoardPosition } from '../domain/board';
import {
  groupBounds,
  groupForEntity,
  includeGroupMembers,
  validateGroup,
} from '../domain/board-group';

function requireMembers(board: WorkspaceBoardState, ids: readonly string[]): void {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !board.nodes[id])) {
    throw new Error('Choose distinct entities still on this board.');
  }
}

export function createGroup(
  board: WorkspaceBoardState,
  ids: readonly string[],
  label: string,
): WorkspaceBoardState {
  requireMembers(board, ids);
  if (ids.length < 2 || ids.some((id) => groupForEntity(board, id))) {
    throw new Error('Select at least two ungrouped entities. Remove existing memberships first.');
  }
  const group = {
    id: `group-${globalThis.crypto.randomUUID()}`,
    label: label.trim(),
    ...groupBounds(board.nodes, ids),
    entityIds: [...ids],
  };
  validateGroup(group);
  return { ...board, groups: [...board.groups, group] };
}

export function renameGroup(
  board: WorkspaceBoardState,
  id: string,
  label: string,
): WorkspaceBoardState {
  if (!board.groups.some((group) => group.id === id)) {
    throw new Error('This group is no longer available.');
  }
  const groups = board.groups.map((group) => {
    const next = group.id === id ? { ...group, label: label.trim() } : group;
    validateGroup(next);
    return next;
  });
  return { ...board, groups };
}

export function moveGroup(
  board: WorkspaceBoardState,
  id: string,
  position: BoardPosition,
): WorkspaceBoardState {
  const group = board.groups.find((item) => item.id === id);
  if (!group) {
    throw new Error('This group is no longer available.');
  }
  const moved = { ...group, ...position };
  validateGroup(moved);
  const nodes = { ...board.nodes };
  for (const entityId of group.entityIds) {
    const current = nodes[entityId];
    if (!current) {
      continue;
    }
    const next = { x: current.x + position.x - group.x, y: current.y + position.y - group.y };
    validateBoardPosition(next);
    nodes[entityId] = next;
  }
  return { ...board, nodes, groups: board.groups.map((item) => (item.id === id ? moved : item)) };
}

/** Moving to another group is explicit; there is never dual membership. */
export function assignGroup(
  board: WorkspaceBoardState,
  ids: readonly string[],
  groupId: string | null,
): WorkspaceBoardState {
  requireMembers(board, ids);
  if (groupId && !board.groups.some((group) => group.id === groupId)) {
    throw new Error('This group is no longer available.');
  }
  const groups = board.groups.map((group) => {
    const entityIds = group.entityIds.filter((id) => !ids.includes(id));
    if (group.id === groupId) {
      entityIds.push(...ids);
      return includeGroupMembers({ ...group, entityIds }, board.nodes);
    }
    return { ...group, entityIds };
  });
  return { ...board, groups };
}

export function removeGroup(board: WorkspaceBoardState, groupId: string): WorkspaceBoardState {
  return { ...board, groups: board.groups.filter((group) => group.id !== groupId) };
}

export function cleanGroupMembers(board: WorkspaceBoardState): WorkspaceBoardState {
  return {
    ...board,
    groups: board.groups.map((group) => ({
      ...group,
      entityIds: group.entityIds.filter((id) => board.nodes[id]),
    })),
  };
}
