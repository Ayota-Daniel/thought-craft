import { useEffect, useRef, useState } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import type { WorkspaceBoardState } from '../../domain/board';
import type { BoardServices } from './board-services';
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
  const [rootId, setRootId] = useState<string | null>(null);
  const [centerRequest, setCenterRequest] = useState<string | null>(null);
  const handled = useRef<ContextRequest | null>(null);
  const flow = useReactFlow<BoardFlowNode>();
  const initialized = useNodesInitialized();
  const root = rootId ? services.index.getById(rootId) : undefined;

  function enterContext(id: string): void {
    const entity = services.index.getById(id);
    if (entity?.workspaceId === state.workspaceId && state.nodes[id]) {
      setRootId(id);
      setCenterRequest(id);
    }
  }

  useEffect(() => {
    if (request && request !== handled.current && state.nodes[request.entityId]) {
      handled.current = request;
      contextHandled();
      const entity = services.index.getById(request.entityId);
      if (entity?.workspaceId === state.workspaceId) {
        setRootId(entity.id);
        setCenterRequest(entity.id);
      }
    }
  }, [request, state, services, contextHandled]);

  useEffect(() => {
    if (
      rootId &&
      services.index.isReady() &&
      (!root || root.workspaceId !== state.workspaceId || !state.nodes[rootId])
    ) {
      setRootId(null);
      setCenterRequest(null);
    }
  }, [rootId, root, state, version, services]);

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
    enterContext,
    exitContext: () => {
      setRootId(null);
      setCenterRequest(null);
    },
  };
}

export function BrainstormContext({
  title,
  typeLabel,
  exit,
}: {
  title: string;
  typeLabel: string;
  exit: () => void;
}) {
  return (
    <div className="tc-board-context" role="status">
      <div>
        <span>Brainstorming around</span>
        <strong>{title}</strong>
        <span>{typeLabel}</span>
      </div>
      <button onClick={exit}>Exit context</button>
    </div>
  );
}
