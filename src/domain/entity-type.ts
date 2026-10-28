export type EntityType = 'idea' | 'character' | 'scene' | 'location' | 'project';

export const ENTITY_TYPES: Readonly<
  Record<EntityType, { label: string; folder: string; icon: string }>
> = {
  idea: { label: 'Idea', folder: 'Ideas', icon: 'lightbulb' },
  character: { label: 'Character', folder: 'Characters', icon: 'user-round' },
  scene: { label: 'Scene', folder: 'Scenes', icon: 'clapperboard' },
  location: { label: 'Location', folder: 'Locations', icon: 'map-pin' },
  project: { label: 'Project', folder: 'Projects', icon: 'folder' },
};

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTITY_TYPES, value);
}
