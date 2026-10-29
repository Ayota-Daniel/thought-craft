import { useEffect, useMemo, useRef, useState } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import type { WorkspaceBoardState } from '../../domain/board';
import type { BoardServices } from './board-services';
import { focusVisibility, validFocusRoots } from '../../application/board-focus';
import type { Entity } from '../../domain/entity';
import { entityCenter, type BoardFlowNode } from './group-adapter';

export interface ContextRequest {
  entityId: string;
  sequence: number;
}

export function useBrainstormContext(
  state: WorkspaceBoardState,
  services: BoardServices,
  version: number,
  request: ContextRequest | null,
  contextHandled: () => void,
) {
  const [rootIds, setRootIds] = useState<string[]>([]);
  const rootId = rootIds[0] ?? null;
  const [centerRequest, setCenterRequest] = useState<string | null>(null);
  const handled = useRef<ContextRequest | null>(null);
  const flow = useReactFlow<BoardFlowNode>();
  const initialized = useNodesInitialized();
  const root = rootId ? services.index.getById(rootId) : undefined;

  function enterContext(id: string): void {
    const entity = services.index.getById(id);
    if (entity?.workspaceId === state.workspaceId && state.nodes[id]) {
      setRootIds([id]);
      setCenterRequest(id);
    }
  }

  useEffect(() => {
    if (request && request !== handled.current && state.nodes[request.entityId]) {
      handled.current = request;
      contextHandled();
      const entity = services.index.getById(request.entityId);
      if (entity?.workspaceId === state.workspaceId) {
        setRootIds([entity.id]);
        setCenterRequest(entity.id);
      }
    }
  }, [request, state, services, contextHandled]);

  useEffect(() => {
    if (!services.index.isReady()) return;
    setRootIds((current) => {
      const valid = validFocusRoots(current, state, services.index);
      return valid.join(',') === current.join(',') ? current : valid;
    });
  }, [state, version, services]);

  const visibility = useMemo(
    () => focusVisibility(rootIds, state, services.index),
    [rootIds, state, services, version],
  );

  useEffect(() => {
    if (!centerRequest || !initialized) {
      return;
    }
    // Context adds a compact row above the canvas. Let its ResizeObserver settle
    // before centering, otherwise the previous canvas height shifts the target.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const node = flow.getNode(centerRequest);
        if (!node) {
          return;
        }
        const center = entityCenter(node.position, node.measured?.width, node.measured?.height);
        void flow.setCenter(center.x, center.y, { zoom: flow.getZoom(), duration: 0 });
        setCenterRequest(null);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [centerRequest, initialized, flow, state]);

  return {
    root: root ?? null,
    rootId,
    rootIds,
    visibility,
    addRoots: (ids: readonly string[]) =>
      setRootIds((current) => validFocusRoots([...current, ...ids], state, services.index)),
    removeRoot: (id: string) => setRootIds((current) => current.filter((value) => value !== id)),
    enterContext,
    exitContext: () => {
      setRootIds([]);
      setCenterRequest(null);
    },
  };
}

export function BrainstormContext({
  roots,
  remove,
  add,
  exit,
}: {
  roots: readonly Entity[];
  remove: (id: string) => void;
  add: () => void;
  exit: () => void;
}) {
  return (
    <div className="tc-board-context" role="region" aria-label="Focus mode">
      <strong>Focus</strong>
      <div className="tc-focus-roots">
        {roots.map((root) => (
          <button
            key={root.id}
            className="tc-focus-chip"
            aria-label={`Remove focus ${root.title}`}
            onClick={() => remove(root.id)}
          >
            {root.title}
            <span aria-hidden="true"> ×</span>
          </button>
        ))}
      </div>
      <button onClick={add}>+ Add focus</button>
      <button onClick={exit}>Show all</button>
    </div>
  );
}
