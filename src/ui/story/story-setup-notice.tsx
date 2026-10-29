import { useState } from 'react';
import { STORY_COLLECTIONS } from '../../application/story-query';
import type { WorkspaceRegistry } from '../../application/workspace-registry';
import type { EntityTypeRegistry } from '../../application/entity-type-registry';

export function StorySetupNotice({
  workspaceId,
  workspaces,
  types,
  manageTypes,
}: {
  workspaceId: string;
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
  manageTypes: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const workspace = workspaces.get(workspaceId)!;
  const missing = STORY_COLLECTIONS.filter(
    (item) =>
      !workspace.enabledEntityTypeIds.includes(item.id) ||
      !types.get(item.id) ||
      types.get(item.id)?.retired,
  );
  if (!missing.length) return null;
  async function enable(id: string): Promise<void> {
    setPending(true);
    setError('');
    try {
      await workspaces.enableEntityType(workspaceId, id, types);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not enable this type.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="tc-story-setup" aria-label="Story setup">
      <h2>Story setup</h2>
      <p className="tc-inspector-hint">
        Use only the types you need. Existing notes remain accessible.
      </p>
      <ul>
        {missing.map((item) => {
          const unavailable = !types.get(item.id) || types.get(item.id)?.retired;
          return (
            <li key={item.id}>
              <span>
                {item.singular} · {unavailable ? 'Type unavailable' : 'Disabled'}
              </span>
              <button
                disabled={pending}
                onClick={() => (unavailable ? manageTypes(item.id) : void enable(item.id))}
              >
                {unavailable ? 'Manage Entity Types' : `Enable ${item.singular}`}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="tc-error">
          {error}
        </p>
      )}
    </section>
  );
}
