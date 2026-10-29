import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  applyEdgeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
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
import { EntityNode } from './entity-node';
import { BoardGroupNode } from './board-group';
import { type BoardFlowNode } from './group-adapter';
import { useBoardNodes } from './use-board-nodes';
import { useBrainstormContext, BrainstormContext, type ContextRequest } from './brainstorm-context';
import { groupForEntity } from '../../domain/board-group';
import { RelationEdge } from './relation-edge';
import { relationEdges, selectionIsVisible } from './flow-adapter';
import { BrainstormToolbar, type BoardSelection } from './brainstorm-toolbar';

const nodeTypes = { entity: EntityNode, boardGroup: BoardGroupNode };
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
  contextRequest,
  contextHandled,
}: {
  contextRequest: ContextRequest | null;
  contextHandled: () => void;
  state: WorkspaceBoardState;
  version: number;
  services: BoardServices;
  commands: BoardCommands;
  connectSelected: (workspaceId: string, sourceId: string) => void;
}) {
  const flow = useReactFlow<BoardFlowNode, Edge>();
  const canvasEl = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [storedSelection, setSelection] = useState<BoardSelection | null>(null);
  const [viewport, setViewport] = useState<Viewport>(state.viewport);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const context = useBrainstormContext(state, services, version, contextRequest, contextHandled);
  const visibleSelectedIds = selectedIds.filter(
    (id) => !context.visibility || context.visibility.has(id),
  );
  const selection = selectionIsVisible(storedSelection, context.visibility, state.groups, edges)
    ? storedSelection
    : null;

  const { nodes, changeNodes } = useBoardNodes(
    state,
    version,
    services,
    commands.openFocus,
    context.rootIds,
    context.visibility,
    report,
  );
  const canCreate = services.workspaces
    .getAvailableEntityTypes(state.workspaceId, services.types)
    .some((type) => type.id === 'idea');

  useEffect(() => {
    const projection = projectBoard(state, services.index);
    setEdges((previous) =>
      relationEdges(projection.relationships, services).map((edge) => ({
        ...edge,
        hidden: Boolean(
          context.visibility &&
          (!context.visibility.has(edge.source) || !context.visibility.has(edge.target)),
        ),
        selected:
          context.visibility &&
          (!context.visibility.has(edge.source) || !context.visibility.has(edge.target))
            ? false
            : (previous.find((candidate) => candidate.id === edge.id)?.selected ?? false),
      })),
    );
  }, [state, version, services, commands.openFocus, context.visibility]);

  const select = useCallback(({ nodes, edges }: { nodes: BoardFlowNode[]; edges: Edge[] }) => {
    setSelectedIds((current) => {
      const next = nodes
        .filter((node) => node.type === 'entity' && !node.hidden)
        .map((node) => node.id);
      return current.join(',') === next.join(',') ? current : next;
    });
    const node = nodes.length === 1 ? nodes[0] : undefined;
    const edge = edges[0];
    let next: BoardSelection | null = null;
    if (node) {
      next = { kind: node.type === 'boardGroup' ? 'group' : 'node', id: node.id };
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
    if (event.key === 'Escape' && context.rootId && !document.querySelector('.modal-container')) {
      event.preventDefault();
      event.stopPropagation();
      context.exitContext();
      return;
    }
    if (event.key !== 'Enter' || !(event.target instanceof Element)) {
      return;
    }
    const node = event.target.closest<HTMLElement>('.react-flow__node');
    if (!node || event.target !== node) {
      return;
    }
    const id = node.dataset.id;
    if (id && state.nodes[id]) {
      event.preventDefault();
      event.stopPropagation();
      commands.openFocus(id);
    }
  }

  function removeSelected(): void {
    if (!selection) {
      return;
    }
    if (selection.kind === 'group') {
      void services.boards
        .removeGroup(state.workspaceId, selection.id)
        .then(() => setSelection(null))
        .catch(report);
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
    <div className="tc-board-body" onKeyDownCapture={openFocusedEntity}>
      {context.root && (
        <BrainstormContext
          roots={context.rootIds.flatMap((id) => {
            const entity = services.index.getById(id);
            return entity ? [entity] : [];
          })}
          remove={context.removeRoot}
          add={() => commands.addFocus(state.workspaceId, context.rootIds, context.addRoots)}
          exit={context.exitContext}
        />
      )}
      <BrainstormToolbar
        showControls={commands.showControls}
        canFitGroup={Boolean(
          state.groups.find((group) => group.id === selection?.id)?.entityIds.length,
        )}
        contextActive={Boolean(context.root)}
        selectedCount={visibleSelectedIds.length}
        canGroup={
          visibleSelectedIds.length >= 2 &&
          visibleSelectedIds.every((id) => !groupForEntity(state, id))
        }
        hasGroups={state.groups.length > 0}
        hasMembership={visibleSelectedIds.some((id) => groupForEntity(state, id))}
        brainstormAround={() => {
          if (selection?.kind === 'node') context.enterContext(selection.id);
        }}
        groupSelection={() => commands.createGroup(state.workspaceId, visibleSelectedIds)}
        moveToGroup={() => commands.moveToGroup(state.workspaceId, visibleSelectedIds)}
        removeFromGroup={() => {
          void services.boards
            .assignGroup(state.workspaceId, visibleSelectedIds, null)
            .catch(report);
        }}
        renameGroup={() => {
          if (selection?.kind === 'group') commands.renameGroup(state.workspaceId, selection.id);
        }}
        fitGroup={() => {
          if (selection?.kind === 'group')
            void services.boards.fitGroup(state.workspaceId, selection.id).catch(report);
        }}
        ready={ready && services.index.isReady()}
        canCreate={canCreate}
        selected={selection}
        zoom={viewport.zoom}
        create={() =>
          context.root
            ? commands.createConnected(context.root.id, context.rootIds)
            : commands.createIdea(state.workspaceId, placementAtCenter())
        }
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
      <div className="tc-board-canvas" ref={canvasEl}>
        <ReactFlow<BoardFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={changeNodes}
          onEdgesChange={(changes: EdgeChange[]) =>
            setEdges((current) => applyEdgeChanges(changes, current))
          }
          onSelectionChange={select}
          onNodeDoubleClick={(_event, node) => {
            if (node.type === 'entity') commands.openFocus(node.id);
          }}
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
          multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          selectionOnDrag={true}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          selectionKeyCode="Shift"
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
    </div>
  );
}
