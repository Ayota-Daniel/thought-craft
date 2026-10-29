import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
  type NodeChange,
  type Edge,
  type EdgeChange,
  type Connection,
  type Viewport,
} from '@xyflow/react';
import {
  BOARD_LIMIT,
  BOARD_MIN_ZOOM,
  BOARD_MAX_ZOOM,
  type WorkspaceBoardState,
} from '../../domain/board';
import { availableBoardRelations } from '../../application/board-actions';
import { projectBoard } from '../../application/board-projection';
import type { BoardServices, BoardCommands } from './board-services';
import { EntityNode, type EntityFlowNode } from './entity-node';
import { RelationEdge } from './relation-edge';
import { entityNodes, relationEdges } from './flow-adapter';
import { BrainstormToolbar, type BoardSelection } from './brainstorm-toolbar';

const nodeTypes = { entity: EntityNode };
const edgeTypes = { relation: RelationEdge };
const ariaLabels = {
  'node.a11yDescription.default':
    'Press Enter to open. Use arrow keys to move a selected card. Relationships and removal are available in the board toolbar. Escape clears selection.',
  'edge.a11yDescription.default':
    'Press Enter to select this relationship. Use Remove relationship in the toolbar to remove it from Markdown.',
};

export function BrainstormCanvas({
  state,
  version,
  services,
  commands,
  connectSelected,
}: {
  state: WorkspaceBoardState;
  version: number;
  services: BoardServices;
  commands: BoardCommands;
  connectSelected: (workspaceId: string, sourceId: string) => void;
}) {
  const flow = useReactFlow<EntityFlowNode, Edge>();
  const canvasEl = useRef<HTMLDivElement>(null);
  const pendingPositions = useRef(new Map<string, number>());
  const [nodes, setNodes] = useState<EntityFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const [viewport, setViewport] = useState<Viewport>(state.viewport);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const canCreate = services.workspaces
    .getAvailableEntityTypes(state.workspaceId, services.types)
    .some((type) => type.id === 'idea');

  useEffect(() => {
    const projection = projectBoard(state, services.index);
    setNodes((previous) =>
      entityNodes(projection.entities, services, commands.openFocus).map((node) => {
        const existing = previous.find((candidate) => candidate.id === node.id);
        if (!existing) {
          return node;
        }
        const moving = existing.dragging || pendingPositions.current.has(node.id);
        return {
          ...node,
          // Domain refreshes must retain React Flow's local size measurement.
          // Otherwise restored cards can stay hidden until another resize event.
          measured: existing.measured,
          selected: existing.selected,
          dragging: existing.dragging,
          position: moving ? existing.position : node.position,
        };
      }),
    );
    setEdges((previous) =>
      relationEdges(projection.relationships, services).map((edge) => ({
        ...edge,
        selected: previous.find((candidate) => candidate.id === edge.id)?.selected ?? false,
      })),
    );
  }, [state, version, services, commands.openFocus]);

  const select = useCallback(({ nodes, edges }: { nodes: EntityFlowNode[]; edges: Edge[] }) => {
    const node = nodes[0];
    const edge = edges[0];
    let next: BoardSelection | null = null;
    if (node) {
      next = { kind: 'node', id: node.id };
    } else if (edge) {
      next = { kind: 'edge', id: edge.id };
    }
    setSelection((current) =>
      current?.id === next?.id && current?.kind === next?.kind ? current : next,
    );
  }, []);

  function report(failure: unknown): void {
    setError(failure instanceof Error ? failure.message : 'Could not save the board layout.');
  }

  function changeNodes(changes: NodeChange<EntityFlowNode>[]): void {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes) {
      // React Flow emits settled positions for both drag release and arrow-key moves.
      // Intermediate dragging positions stay entirely in this component.
      if (change.type !== 'position' || change.dragging !== false || !change.position) {
        continue;
      }
      pendingPositions.current.set(change.id, (pendingPositions.current.get(change.id) ?? 0) + 1);
      void services.boards
        .moveEntity(state.workspaceId, change.id, change.position)
        .catch((failure: unknown) => {
          report(failure);
          const saved = services.boards.getBoard(state.workspaceId).nodes[change.id];
          if (saved && pendingPositions.current.get(change.id) === 1) {
            setNodes((current) =>
              current.map((node) => (node.id === change.id ? { ...node, position: saved } : node)),
            );
          }
        })
        .finally(() => {
          const remaining = (pendingPositions.current.get(change.id) ?? 1) - 1;
          if (remaining > 0) {
            pendingPositions.current.set(change.id, remaining);
          } else {
            pendingPositions.current.delete(change.id);
          }
        });
    }
  }

  function placementAtCenter() {
    const bounds = canvasEl.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: 40, y: 40 };
    }
    return flow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2 - 110,
      y: bounds.top + bounds.height / 2 - 60,
    });
  }

  function finishViewport(_event: MouseEvent | TouchEvent | null, next: Viewport): void {
    setViewport(next);
    void services.boards.setViewport(state.workspaceId, next).catch(report);
  }

  function connect(connection: Connection): void {
    setError('');
    // The drawn line is temporary. Only a successful Markdown mutation creates an edge.
    commands.connect(state.workspaceId, connection.source, connection.target);
  }

  function openFocusedEntity(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof Element)) {
      return;
    }
    const node = event.target.closest<HTMLElement>('.react-flow__node');
    if (!node || event.target !== node) {
      return;
    }
    const id = node.dataset.id;
    if (id) {
      event.preventDefault();
      event.stopPropagation();
      commands.openFocus(id);
    }
  }

  function removeSelected(): void {
    if (!selection) {
      return;
    }
    if (selection.kind === 'node') {
      void services.boards
        .removeEntity(state.workspaceId, selection.id)
        .then(() => setSelection(null))
        .catch(report);
      return;
    }
    const relationship = projectBoard(state, services.index).relationships.find(
      ({ source, relation }) => `${source.id}:${relation.id}` === selection.id,
    );
    if (relationship) {
      commands.removeRelationship(relationship.source.id, relationship.relation);
    }
  }

  return (
    <>
      <BrainstormToolbar
        ready={ready && services.index.isReady()}
        canCreate={canCreate}
        selected={selection}
        zoom={viewport.zoom}
        create={() => commands.createIdea(state.workspaceId, placementAtCenter())}
        addExisting={() => commands.addExisting(state.workspaceId, placementAtCenter())}
        fit={() => {
          void flow.fitView({ padding: 0.25, duration: 0, minZoom: BOARD_MIN_ZOOM, maxZoom: 1 });
        }}
        zoomIn={() => {
          void flow.zoomIn({ duration: 0 });
        }}
        zoomOut={() => {
          void flow.zoomOut({ duration: 0 });
        }}
        openSelected={() => {
          if (selection?.kind === 'node') {
            commands.openFocus(selection.id);
          }
        }}
        connectSelected={() => {
          if (selection?.kind === 'node') {
            connectSelected(state.workspaceId, selection.id);
          }
        }}
        removeSelected={removeSelected}
      />
      {error && (
        <div className="tc-board-error tc-error" role="alert">
          {error}
        </div>
      )}
      <div className="tc-board-canvas" ref={canvasEl} onKeyDownCapture={openFocusedEntity}>
        <ReactFlow<EntityFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={changeNodes}
          onEdgesChange={(changes: EdgeChange[]) =>
            setEdges((current) => applyEdgeChanges(changes, current))
          }
          onSelectionChange={select}
          onNodeDoubleClick={(_event, node) => commands.openFocus(node.id)}
          onInit={() => setReady(true)}
          defaultViewport={state.viewport}
          onMoveEnd={finishViewport}
          onMove={(_event, next) => setViewport(next)}
          minZoom={BOARD_MIN_ZOOM}
          maxZoom={BOARD_MAX_ZOOM}
          translateExtent={[
            [-BOARD_LIMIT, -BOARD_LIMIT],
            [BOARD_LIMIT, BOARD_LIMIT],
          ]}
          nodeExtent={[
            [-BOARD_LIMIT, -BOARD_LIMIT],
            [BOARD_LIMIT, BOARD_LIMIT],
          ]}
          onConnect={connect}
          isValidConnection={(connection) =>
            availableBoardRelations(
              state.workspaceId,
              connection.source,
              connection.target,
              services.boards,
              services.index,
              services.relations,
            ).length > 0
          }
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          edgesReconnectable={false}
          zoomOnDoubleClick={false}
          ariaLabelConfig={ariaLabels}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>
        {ready && nodes.length === 0 && (
          <section className="tc-board-empty">
            <h2>{services.index.isReady() ? 'This board is empty.' : 'Reading your vault…'}</h2>
            <p>Place the thoughts you want to work with.</p>
            <div>
              <button
                className="mod-cta"
                disabled={!canCreate || !services.index.isReady()}
                onClick={() => commands.createIdea(state.workspaceId, placementAtCenter())}
              >
                Create an idea
              </button>
              <button
                disabled={!services.index.isReady()}
                onClick={() => commands.addExisting(state.workspaceId, placementAtCenter())}
              >
                Add existing
              </button>
            </div>
            {!canCreate && <p>Enable Idea in Workspace Manager to create here.</p>}
          </section>
        )}
      </div>
      <p className="tc-board-hint">
        Drag cards to arrange · Drag the canvas to pan · Scroll to zoom · Connect using handles or
        the selected card’s Connect action
      </p>
    </>
  );
}
