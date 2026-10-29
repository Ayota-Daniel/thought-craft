import { useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkspaceSwitcher } from '../workspaces/workspace-switcher';
import type { BoardServices, BoardCommands } from './board-services';
import { BrainstormCanvas } from './brainstorm-canvas';
import { useBoardSubscriptions } from './use-board-subscriptions';

export function BrainstormApp({
  services,
  commands,
  connectSelected,
  contextRequest,
}: {
  contextRequest: { entityId: string; sequence: number } | null;
  services: BoardServices;
  commands: BoardCommands;
  connectSelected: (workspaceId: string, entityId: string) => void;
}) {
  const handledContext = useRef<typeof contextRequest>(null);
  const version = useBoardSubscriptions(services);
  const workspace = services.workspaces.getActive();
  const board = services.boards.getBoard(workspace.id);
  return (
    <div className="tc-brainstorm">
      <header className="tc-board-header">
        <WorkspaceSwitcher workspaces={services.workspaces} manage={commands.manageWorkspaces} />
        <nav className="tc-view-switcher" aria-label="Thoughtcraft views">
          <button onClick={commands.showInbox}>Inbox</button>
          <button aria-current="page">Brainstorm</button>
        </nav>
        <h1 className="tc-visually-hidden">Brainstorm · {workspace.label}</h1>
      </header>
      <ReactFlowProvider key={workspace.id}>
        <BrainstormCanvas
          contextRequest={contextRequest !== handledContext.current ? contextRequest : null}
          contextHandled={() => {
            handledContext.current = contextRequest;
          }}
          state={board}
          version={version}
          services={services}
          commands={commands}
          connectSelected={connectSelected}
        />
      </ReactFlowProvider>
    </div>
  );
}
