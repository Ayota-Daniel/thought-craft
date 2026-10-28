import type { Entity } from '../domain/entity';
import type { EntityWriter } from './create-entity';
import { deriveTitle } from '../shared/note-path';

export async function captureIdea(
  content: string,
  workspaceId: string,
  writer: EntityWriter,
): Promise<Entity> {
  if (!content.trim()) {
    throw new Error('Write an idea before capturing it.');
  }
  if (!workspaceId.trim()) {
    throw new Error('Choose a default workspace in the plugin settings.');
  }

  return writer.createEntity({
    id: globalThis.crypto.randomUUID(),
    type: 'idea',
    title: deriveTitle(content),
    workspaceId: workspaceId.trim(),
    createdAt: new Date().toISOString(),
    content,
    relations: [],
  });
}
