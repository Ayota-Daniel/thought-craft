export interface BoardSelection {
  kind: 'node' | 'edge';
  id: string;
}

interface BoardToolbarProps {
  canCreate: boolean;
  ready: boolean;
  selected: BoardSelection | null;
  zoom: number;
  create: () => void;
  addExisting: () => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  openSelected: () => void;
  connectSelected: () => void;
  removeSelected: () => void;
}

export function BrainstormToolbar(props: BoardToolbarProps) {
  return (
    <div className="tc-board-toolbar" aria-label="Board actions">
      <div className="tc-board-actions">
        <button
          className="mod-cta"
          disabled={!props.ready || !props.canCreate}
          title={
            props.canCreate
              ? 'Create a real Idea in this Workspace'
              : 'Enable Idea in Workspace Manager to create here'
          }
          onClick={props.create}
        >
          + Idea
        </button>
        <button disabled={!props.ready} onClick={props.addExisting}>
          + Add existing
        </button>
      </div>
      <div className="tc-board-selection-actions" aria-live="polite">
        {props.selected?.kind === 'node' && (
          <>
            <button onClick={props.openSelected}>Open entity</button>
            <button onClick={props.connectSelected}>Connect…</button>
            <button onClick={props.removeSelected}>Remove from board</button>
          </>
        )}
        {props.selected?.kind === 'edge' && (
          <button onClick={props.removeSelected}>Remove relationship</button>
        )}
      </div>
      <div className="tc-board-viewport-controls" aria-label="Board viewport">
        <button onClick={props.fit}>Fit</button>
        <button aria-label="Zoom out" onClick={props.zoomOut}>
          −
        </button>
        <output aria-label="Zoom level">{Math.round(props.zoom * 100)}%</output>
        <button aria-label="Zoom in" onClick={props.zoomIn}>
          +
        </button>
      </div>
    </div>
  );
}
