import type { BoardPosition } from '../domain/board';
import { validateGroup, type BoardGroup } from '../domain/board-group';
import { isRecord } from '../shared/record';

/** M5 layouts have no groups. Invalid M6 layouts stay unreadable rather than losing membership. */
export function parseBoardGroups(
  raw: unknown,
  nodes: Readonly<Record<string, BoardPosition>>,
): readonly BoardGroup[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('Board groups must be a list.');
  }
  const groupIds = new Set<string>();
  const members = new Set<string>();
  return raw.map((value: unknown) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.label !== 'string' ||
      !Array.isArray(value.entityIds)
    ) {
      throw new Error('Invalid board group.');
    }
    const entityIds: string[] = [];
    for (const id of value.entityIds as unknown[]) {
      if (typeof id !== 'string' || !nodes[id.toLowerCase()] || members.has(id.toLowerCase())) {
        throw new Error('Group members must be unique entities placed on this board.');
      }
      members.add(id.toLowerCase());
      entityIds.push(id.toLowerCase());
    }
    const group = {
      id: value.id,
      label: value.label,
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      entityIds,
    } as BoardGroup;
    validateGroup(group);
    if (groupIds.has(group.id)) {
      throw new Error('Duplicated board group ID.');
    }
    groupIds.add(group.id);
    return group;
  });
}
