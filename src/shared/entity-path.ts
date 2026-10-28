import { ENTITY_TYPES, type EntityType } from '../domain/entity-type';
import { validateFolderPath } from './note-path';

/** Keep the saved Idea destination; other types use siblings of that folder. */
export function folderForEntity(
  type: EntityType,
  configuredIdeaFolder: string,
  folderName?: string,
): string {
  const ideaFolder = validateFolderPath(configuredIdeaFolder);
  if (type === 'idea') {
    return ideaFolder;
  }

  const parts = ideaFolder.split('/');
  parts.pop();
  const destination = folderName ?? ENTITY_TYPES[type]?.folder;
  if (!destination) {
    throw new Error('Unknown creation folder.');
  }
  parts.push(validateFolderPath(destination));
  return parts.join('/');
}
