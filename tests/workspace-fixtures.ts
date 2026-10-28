import { WorkspaceRegistry } from '../src/application/workspace-registry';
import type { EntityTypeRegistry } from '../src/application/entity-type-registry';

export function workspacesForTypes(
  types: EntityTypeRegistry,
  workspaceId = 'novel',
): WorkspaceRegistry {
  const enabledEntityTypeIds = types.getActive().map((type) => type.id);
  return new WorkspaceRegistry(
    [
      {
        id: workspaceId,
        label: workspaceId,
        builtIn: workspaceId === 'default',
        retired: false,
        enabledEntityTypeIds,
        relationTypes: [],
      },
    ],
    workspaceId,
    enabledEntityTypeIds,
  );
}
