import { ENTITY_TYPES, type EntityType } from '../domain/entity-type';
import { validateFolderPath } from './note-path';

/** Keep the saved Idea destination; other types use siblings of that folder. */
export function folderForEntity(type: EntityType, configuredIdeaFolder: string): string {
  const ideaFolder = validateFolderPath(configuredIdeaFolder);
  if (type === 'idea') {
    return ideaFolder;
  }

  const parts = ideaFolder.split('/');
  parts.pop();
  parts.push(ENTITY_TYPES[type].folder);
  return parts.join('/');
}
