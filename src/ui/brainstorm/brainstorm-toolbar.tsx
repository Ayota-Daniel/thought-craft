export interface BoardSelection {
  kind: 'node' | 'edge' | 'group';
  id: string;
}

interface BoardToolbarProps {
  contextActive: boolean;
  selectedCount: number;
  canGroup: boolean;
  hasGroups: boolean;
  hasMembership: boolean;
  brainstormAround: () => void;
  groupSelection: () => void;
  moveToGroup: () => void;
  removeFromGroup: () => void;
  renameGroup: () => void;
  fitGroup: () => void;
  canFitGroup: boolean;
  canCreate: boolean;
  ready: boolean;
  selected: BoardSelection | null;
  zoom: number;
  create: () => void;
  addExisting: () => void;
  fit: () => void;
  showControls: () => void;
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
          {props.contextActive ? '+ Connected idea' : '+ Idea'}
        </button>
        <button disabled={!props.ready} onClick={props.addExisting}>
          + Add existing
        </button>
      </div>
      <div className="tc-board-selection-actions" aria-live="polite">
        {props.selected?.kind === 'node' && (
          <>
            <button onClick={props.openSelected}>Open entity</button>
            <button onClick={props.brainstormAround}>Brainstorm around</button>
            <button onClick={props.connectSelected}>Connect…</button>
            <button onClick={props.removeSelected}>Remove from board</button>
          </>
        )}
        {props.selectedCount >= 2 && props.canGroup && (
          <button onClick={props.groupSelection}>Group selection</button>
        )}
        {props.selectedCount > 0 && props.hasGroups && (
          <button onClick={props.moveToGroup}>Move to group…</button>
        )}
        {props.selectedCount > 0 && props.hasMembership && (
          <button onClick={props.removeFromGroup}>Remove from group</button>
        )}
        {props.selected?.kind === 'group' && (
          <>
            <button onClick={props.renameGroup}>Rename group</button>
            <button disabled={!props.canFitGroup} onClick={props.fitGroup}>
              Fit group to members
            </button>
            <button
              title="Remove only the group boundary; keep every entity on the board"
              onClick={props.removeSelected}
            >
              Remove group
            </button>
          </>
        )}
        {props.selected?.kind === 'edge' && (
          <button onClick={props.removeSelected}>Remove relationship</button>
        )}
      </div>
      <div className="tc-board-viewport-controls" aria-label="Board viewport">
        <button onClick={props.showControls}>Controls</button>
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
