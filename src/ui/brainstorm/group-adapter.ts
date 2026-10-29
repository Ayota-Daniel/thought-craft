import type { BoardPosition, WorkspaceBoardState } from '../../domain/board';
import type { EntityFlowNode } from './entity-node';
import type { GroupFlowNode } from './board-group';

export type BoardFlowNode = EntityFlowNode | GroupFlowNode;

/** Independent top-level zones keep persisted coordinates absolute. No XYFlow parent data is stored. */
export function groupNodes(board: WorkspaceBoardState): GroupFlowNode[] {
  return board.groups.map((group) => ({
    id: group.id,
    type: 'boardGroup',
    position: { x: group.x, y: group.y },
    data: { label: group.label, memberIds: group.entityIds },
    width: group.width,
    height: group.height,
    style: { width: group.width, height: group.height },
    zIndex: -1,
    dragHandle: '.tc-board-group-title',
    connectable: false,
    deletable: false,
    ariaLabel: `Group: ${group.label}. Move using arrow keys or drag the title. Group actions are in the toolbar.`,
  }));
}

/** Preview only: group motion translates members without changing their relative layout. */
export function previewGroupMove(
  nodes: BoardFlowNode[],
  groupId: string,
  position: BoardPosition,
): BoardFlowNode[] {
  const group = nodes.find((node) => node.id === groupId);
  if (!group || group.type !== 'boardGroup') {
    return nodes;
  }
  const dx = position.x - group.position.x;
  const dy = position.y - group.position.y;
  return nodes.map((node) => {
    if (node.id === groupId) {
      return { ...node, position };
    }
    if (group.data.memberIds.includes(node.id)) {
      return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } };
    }
    return node;
  });
}

export function entityCenter(position: BoardPosition, width = 220, height = 160): BoardPosition {
  return { x: position.x + width / 2, y: position.y + height / 2 };
}
