import type { BoardPosition, WorkspaceBoardState } from './board';
import { validateBoardPosition, BOARD_LIMIT } from './board';

/** A spatial zone, never an Entity. All coordinates remain absolute board coordinates. */
export interface BoardGroup extends BoardPosition {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly entityIds: readonly string[];
}

export const GROUP_MIN_WIDTH = 300;
export const GROUP_MIN_HEIGHT = 220;
export const CARD_WIDTH = 220;
export const CARD_HEIGHT = 160;

export function validateGroup(group: BoardGroup): void {
  validateBoardPosition(group);
  if (!/^group-[a-f\d-]{36}$/.test(group.id) || !group.label.trim() || group.label.length > 100) {
    throw new Error('A group needs a stable ID and a name of up to 100 characters.');
  }
  if (
    !Number.isFinite(group.width) ||
    !Number.isFinite(group.height) ||
    group.width < GROUP_MIN_WIDTH ||
    group.height < GROUP_MIN_HEIGHT ||
    group.width > BOARD_LIMIT ||
    group.height > BOARD_LIMIT
  ) {
    throw new Error('Group bounds are outside the supported range.');
  }
  validateBoardPosition({ x: group.x + group.width, y: group.y + group.height });
}

export function groupForEntity(
  board: WorkspaceBoardState,
  entityId: string,
): BoardGroup | undefined {
  return board.groups.find((group) => group.entityIds.includes(entityId));
}

export function groupBounds(
  nodes: Readonly<Record<string, BoardPosition>>,
  ids: readonly string[],
) {
  const positions = ids.map((id) => nodes[id]).filter((point) => point !== undefined);
  if (!positions.length) {
    throw new Error('Choose entities still on this board.');
  }
  const x = Math.min(...positions.map((point) => point.x)) - 32;
  const y = Math.min(...positions.map((point) => point.y)) - 56;
  return {
    x,
    y,
    width: Math.max(
      GROUP_MIN_WIDTH,
      Math.max(...positions.map((point) => point.x)) + CARD_WIDTH + 32 - x,
    ),
    height: Math.max(
      GROUP_MIN_HEIGHT,
      Math.max(...positions.map((point) => point.y)) + CARD_HEIGHT + 32 - y,
    ),
  };
}

/** Joining expands the boundary only; existing cards never move or rescale. */
export function includeGroupMembers(
  group: BoardGroup,
  nodes: WorkspaceBoardState['nodes'],
): BoardGroup {
  if (!group.entityIds.length) {
    return group;
  }
  const bounds = groupBounds(nodes, group.entityIds);
  const x = Math.min(group.x, bounds.x);
  const y = Math.min(group.y, bounds.y);
  const expanded = {
    ...group,
    x,
    y,
    width: Math.max(group.x + group.width, bounds.x + bounds.width) - x,
    height: Math.max(group.y + group.height, bounds.y + bounds.height) - y,
  };
  validateGroup(expanded);
  return expanded;
}

export function cardIsOutside(group: BoardGroup, position: BoardPosition): boolean {
  const center = { x: position.x + CARD_WIDTH / 2, y: position.y + CARD_HEIGHT / 2 };
  return (
    center.x < group.x ||
    center.x > group.x + group.width ||
    center.y < group.y ||
    center.y > group.y + group.height
  );
}
