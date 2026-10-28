import { normalizePath } from 'obsidian';
import { validateFolderPath } from '../shared/note-path';

export interface BrainstormSettings { entitiesFolder: string; defaultWorkspace: string }
export const DEFAULT_SETTINGS: Readonly<BrainstormSettings> = Object.freeze({
  entitiesFolder: 'Brainstorm/Ideas', defaultWorkspace: 'default',
});

export function validateSettings(settings: BrainstormSettings): BrainstormSettings {
  const entitiesFolder = normalizePath(validateFolderPath(settings.entitiesFolder));
  const defaultWorkspace = settings.defaultWorkspace.trim();
  // eslint-disable-next-line no-control-regex -- Workspace identifiers must be a single plain-text line.
  if (!defaultWorkspace || /[\r\n\u0000-\u001f]/.test(defaultWorkspace)) {
    throw new Error('Enter a non-empty, single-line workspace identifier.');
  }
  return { entitiesFolder, defaultWorkspace };
}

export function settingsFromData(data: unknown): BrainstormSettings {
  if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
  const value = data as Record<string, unknown>;
  const candidate = {
    entitiesFolder: typeof value.entitiesFolder === 'string' ? value.entitiesFolder : DEFAULT_SETTINGS.entitiesFolder,
    defaultWorkspace: typeof value.defaultWorkspace === 'string' ? value.defaultWorkspace : DEFAULT_SETTINGS.defaultWorkspace,
  };
  try { return validateSettings(candidate); }
  catch { return { ...DEFAULT_SETTINGS }; }
}
