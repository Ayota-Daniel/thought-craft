import { useEffect, useRef, useState } from 'react';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { projectBoard } from '../../application/board-projection';
import type { WorkspaceBoardState } from '../../domain/board';
import type { BoardServices } from './board-services';
import { entityNodes } from './flow-adapter';
import { groupNodes, previewGroupMove, type BoardFlowNode } from './group-adapter';

export function useBoardNodes(
  state: WorkspaceBoardState,
  version: number,
  services: BoardServices,
  openFocus: (id: string) => void,
  rootIds: readonly string[],
  visibility: ReadonlySet<string> | null,
  report: (failure: unknown) => void,
) {
  const [nodes, setNodes] = useState<BoardFlowNode[]>([]);
  const pending = useRef(new Map<string, number>());

  useEffect(() => {
    const projection = projectBoard(state, services.index);
    const entities = entityNodes(projection.entities, services, openFocus).map((node) => ({
      ...node,
      hidden: Boolean(visibility && !visibility.has(node.id)),
      className: rootIds.includes(node.id) ? 'tc-context-root' : undefined,
    }));
    const groups = groupNodes(state).map((node) => ({
      ...node,
      hidden: Boolean(visibility && !node.data.memberIds.some((id) => visibility.has(id))),
    }));
    const next: BoardFlowNode[] = [...groups, ...entities];
    setNodes((previous) =>
      next.map((node) => {
        const existing = previous.find((candidate) => candidate.id === node.id);
        if (!existing) {
          return node;
        }
        return {
          ...node,
          measured: existing.measured,
          selected: node.hidden ? false : existing.selected,
          dragging: existing.dragging,
          position:
            existing.dragging || pending.current.has(node.id) ? existing.position : node.position,
        };
      }),
    );
  }, [state, version, services, openFocus, rootIds, visibility]);

  function savePositions(
    changes: Extract<NodeChange<BoardFlowNode>, { type: 'position' }>[],
  ): void {
    const groupPositions = Object.fromEntries(
      changes
        .filter((change) => state.groups.some((group) => group.id === change.id))
        .map((change) => [change.id, change.position!]),
    );
    const positions = Object.fromEntries(
      changes
        .filter((change) => !state.groups.some((group) => group.id === change.id))
        .map((change) => [change.id, change.position!]),
    );
    const ids = [
      ...Object.keys(positions),
      ...Object.keys(groupPositions),
      ...state.groups
        .filter((group) => groupPositions[group.id])
        .flatMap((group) => group.entityIds),
    ];
    [...new Set(ids)].forEach((id) => pending.current.set(id, (pending.current.get(id) ?? 0) + 1));
    let operation: Promise<void>;
    if (changes.length === 1 && !Object.keys(groupPositions).length) {
      const change = changes[0]!;
      operation = services.boards.moveEntity(state.workspaceId, change.id, change.position!);
    } else {
      operation = services.boards.moveSelection(state.workspaceId, positions, groupPositions);
    }
    void operation
      .catch((failure: unknown) => {
        report(failure);
        const saved = services.boards.getBoard(state.workspaceId);
        setNodes((current) =>
          current.map((node) => {
            if (!ids.includes(node.id) || pending.current.get(node.id) !== 1) return node;
            const group = saved.groups.find((item) => item.id === node.id);
            const position = group ? { x: group.x, y: group.y } : saved.nodes[node.id];
            return position ? { ...node, position } : node;
          }),
        );
      })
      .finally(() => {
        [...new Set(ids)].forEach((id) => {
          const remaining = (pending.current.get(id) ?? 1) - 1;
          if (remaining > 0) pending.current.set(id, remaining);
          else pending.current.delete(id);
        });
      });
  }

  function changeNodes(changes: NodeChange<BoardFlowNode>[]): void {
    const movingGroups = changes.filter(
      (change): change is Extract<NodeChange<BoardFlowNode>, { type: 'position' }> =>
        change.type === 'position' && state.groups.some((group) => group.id === change.id),
    );
    const movedMembers = new Set(
      movingGroups.flatMap(
        (change) => state.groups.find((group) => group.id === change.id)?.entityIds ?? [],
      ),
    );
    // A selected group and selected members may all receive XYFlow changes. Translate once.
    const effective = changes.filter(
      (change) => change.type !== 'position' || !movedMembers.has(change.id),
    );
    setNodes((current) => {
      let preview = current;
      for (const change of movingGroups) {
        if (change.type === 'position' && change.position) {
          preview = previewGroupMove(preview, change.id, change.position);
        }
      }
      return applyNodeChanges(effective, preview);
    });
    const settled = effective.filter(
      (change): change is Extract<NodeChange<BoardFlowNode>, { type: 'position' }> =>
        change.type === 'position' && change.dragging === false && Boolean(change.position),
    );
    if (settled.length) savePositions(settled);
  }

  return { nodes, changeNodes };
}
