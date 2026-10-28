import { useEffect, useState } from 'react';
import type { WorkspaceRegistry } from '../../application/workspace-registry';

export function WorkspaceSwitcher({
  workspaces,
  manage,
}: {
  workspaces: WorkspaceRegistry;
  manage: () => void;
}) {
  const [, refresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => workspaces.subscribe(() => refresh((version) => version + 1)), [workspaces]);
  return (
    <div className="tc-workspace-switcher">
      <label>
        Workspace
        <select
          aria-label="Active workspace"
          value={workspaces.getActive().id}
          disabled={pending}
          onChange={(event) => {
            setPending(true);
            setError('');
            void workspaces
              .setActive(event.target.value)
              .catch((failure: unknown) => {
                setError(
                  failure instanceof Error ? failure.message : 'Could not switch workspace.',
                );
              })
              .finally(() => setPending(false));
          }}
        >
          {workspaces.getSelectable().map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.label}
            </option>
          ))}
        </select>
      </label>
      <button onClick={manage}>Manage workspaces</button>
      {error && (
        <span className="tc-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
