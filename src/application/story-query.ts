import type { Entity } from '../domain/entity';
import type { WorkspaceDefinition } from '../domain/workspace';
import { sortEntities, type InboxSort } from './inbox-query';

export const STORY_COLLECTIONS = [
  {
    id: 'scene',
    label: 'Scenes',
    singular: 'Scene',
    hint: 'Start with the moment you can see most clearly.',
  },
  { id: 'character', label: 'Characters', singular: 'Character', hint: '' },
  { id: 'location', label: 'Locations', singular: 'Location', hint: '' },
  {
    id: 'plot-thread',
    label: 'Plot Threads',
    singular: 'Plot Thread',
    hint: 'Track questions, conflicts or narrative threads.',
  },
  { id: 'idea', label: 'Ideas', singular: 'Idea', hint: '' },
] as const;
export type StoryType = (typeof STORY_COLLECTIONS)[number]['id'];
export type StorySection = 'overview' | StoryType;
export interface StoryOrigin {
  workspaceId: string;
  section: StorySection;
}
export type StorySort = Exclude<InboxSort, 'oldest'>;

export function storyEnabled(workspace: WorkspaceDefinition): boolean {
  return !workspace.retired && workspace.enabledExperiences.includes('story');
}

/** All lifecycle states remain discoverable in Story; no invented narrative ordering. */
export function queryStory(
  entities: readonly Entity[],
  workspaceId: string,
  type: StoryType,
  search = '',
  sort: StorySort = 'updated',
): Entity[] {
  const titleSearch = search.trim().toLocaleLowerCase();
  const candidates = entities.filter(
    (entity) =>
      entity.workspaceId === workspaceId &&
      entity.type === type &&
      entity.title.toLocaleLowerCase().includes(titleSearch),
  );
  return sortEntities(candidates, sort);
}

export function storyCounts(entities: readonly Entity[], workspaceId: string) {
  return STORY_COLLECTIONS.map((collection) => ({
    ...collection,
    count: queryStory(entities, workspaceId, collection.id).length,
  }));
}

/** Native file mtime is already cached by Obsidian; no disk scan or metadata write. */
export function storyEditedAt(entity: Entity, nativeModifiedAt?: number): number {
  const updated = Date.parse(entity.updatedAt);
  const created = Date.parse(entity.createdAt);
  const dates = [updated, created, nativeModifiedAt].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return dates.length ? Math.max(...dates) : 0;
}

export function latestStoryScene(
  entities: readonly Entity[],
  workspaceId: string,
  modifiedAt: (entity: Entity) => number | undefined = () => undefined,
): Entity | undefined {
  return queryStory(entities, workspaceId, 'scene').sort(
    (first, second) =>
      storyEditedAt(second, modifiedAt(second)) - storyEditedAt(first, modifiedAt(first)) ||
      first.id.localeCompare(second.id),
  )[0];
}
