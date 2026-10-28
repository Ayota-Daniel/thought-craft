import type { Entity } from '../domain/entity';

export interface NewIdea {
  id: string;
  workspaceId: string;
  createdAt: string;
  content: string;
}
export interface IdeaWriter { createIdea(idea: NewIdea): Promise<Entity> }

export async function captureIdea(content: string, workspaceId: string, writer: IdeaWriter): Promise<Entity> {
  if (!content.trim()) throw new Error('Write an idea before capturing it.');
  if (!workspaceId.trim()) throw new Error('Choose a default workspace in the plugin settings.');
  return writer.createIdea({
    id: globalThis.crypto.randomUUID(), workspaceId: workspaceId.trim(),
    createdAt: new Date().toISOString(), content,
  });
}
