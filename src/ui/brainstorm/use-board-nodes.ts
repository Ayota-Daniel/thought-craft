import { useEffect, useRef, useState } from 'react';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { projectBoard } from '../../application/board-projection';
import { contextualNeighbors } from '../../application/contextual-brainstorm';
import type { WorkspaceBoardState } from '../../domain/board';
import type { BoardServices } from './board-services';
import { entityNodes } from './flow-adapter';
import { groupNodes, previewGroupMove, type BoardFlowNode } from './group-adapter';

export function useBoardNodes(
  state: WorkspaceBoardState,
  version: number,
  services: BoardServices,
  openFocus: (id: string) => void,
  rootId: string | null,
  report: (failure: unknown) => void,
) {
  const [nodes, setNodes] = useState<BoardFlowNode[]>([]);
  const pending = useRef(new Map<string, number>());

  useEffect(() => {
    const projection = projectBoard(state, services.index);
    const neighbors = rootId ? contextualNeighbors(rootId, services.index) : null;
    function contextualClass(id: string): string | undefined {
      if (id === rootId) {
        return 'tc-context-root';
      }
      if (neighbors && !neighbors.has(id)) {
        return 'tc-context-quiet';
      }
      return undefined;
    }
    const entities = entityNodes(projection.entities, services, openFocus).map((node) => ({
      ...node,
      className: contextualClass(node.id),
    }));
    const next: BoardFlowNode[] = [...groupNodes(state), ...entities];
    setNodes((previous) =>
      next.map((node) => {
        const existing = previous.find((candidate) => candidate.id === node.id);
        if (!existing) {
          return node;
        }
        return {
          ...node,
          measured: existing.measured,
          selected: existing.selected,
          dragging: existing.dragging,
          position:
            existing.dragging || pending.current.has(node.id) ? existing.position : node.position,
        };
      }),
    );
  }, [state, version, services, openFocus, rootId]);

  function savePosition(change: Extract<NodeChange<BoardFlowNode>, { type: 'position' }>): void {
    if (!change.position) {
      return;
    }
    const group = state.groups.find((item) => item.id === change.id);
    const ids = group ? [group.id, ...group.entityIds] : [change.id];
    ids.forEach((id) => pending.current.set(id, (pending.current.get(id) ?? 0) + 1));
    const operation = group
      ? services.boards.moveGroup(state.workspaceId, change.id, change.position)
      : services.boards.moveEntity(state.workspaceId, change.id, change.position);
    void operation
      .catch((failure: unknown) => {
        report(failure);
        const saved = services.boards.getBoard(state.workspaceId);
        setNodes((current) =>
          current.map((node) => {
            if (!ids.includes(node.id) || pending.current.get(node.id) !== 1) {
              return node;
            }
            const zone = saved.groups.find((item) => item.id === node.id);
            const position = zone ? { x: zone.x, y: zone.y } : saved.nodes[node.id];
            return position ? { ...node, position } : node;
          }),
        );
      })
      .finally(() => {
        ids.forEach((id) => {
          const remaining = (pending.current.get(id) ?? 1) - 1;
          if (remaining > 0) {
            pending.current.set(id, remaining);
          } else {
            pending.current.delete(id);
          }
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
    for (const change of effective) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        savePosition(change);
      }
    }
  }

  return { nodes, changeNodes };
}
