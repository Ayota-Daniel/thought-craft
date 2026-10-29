import { isRecord } from '../shared/record';
import { isEntityType } from '../domain/entity-type';
import type { WorkspaceDefinition } from '../domain/workspace';

/** Migrate configuration only. Never scan or rewrite entity Markdown. */
export function migrateWorkspaces(
  data: unknown,
  activeTypeIds: readonly string[],
): {
  workspaces: unknown;
  activeWorkspaceId: unknown;
} {
  const saved = isRecord(data) ? data : {};
  if (typeof saved.configVersion === 'number' && saved.configVersion > 5) {
    throw new Error('This configuration was created by a newer Thought Craft version.');
  }
  if (saved.workspaces !== undefined) {
    return { workspaces: saved.workspaces, activeWorkspaceId: saved.activeWorkspaceId };
  }
  const workspaces: WorkspaceDefinition[] = [
    {
      id: 'default',
      label: 'Default',
      builtIn: true,
      retired: false,
      enabledEntityTypeIds: [...activeTypeIds],
      relationTypes: [],
    },
  ];
  // Preserve an explicitly configured pre-M4 capture destination as a definition,
  // without inferring or renaming workspace IDs from the user's notes.
  const legacy = saved.defaultWorkspace;
  if (
    (typeof saved.configVersion !== 'number' || saved.configVersion < 4) &&
    isEntityType(legacy) &&
    legacy !== 'default'
  ) {
    workspaces.push({ ...workspaces[0]!, id: legacy, label: legacy, builtIn: false });
  }
  return {
    workspaces,
    activeWorkspaceId:
      saved.activeWorkspaceId ??
      (workspaces.some((workspace) => workspace.id === legacy) ? legacy : 'default'),
  };
}
