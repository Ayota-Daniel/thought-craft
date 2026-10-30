import type { PropertySchema } from './property-schema';

export type EntityType = string;

export interface EntityTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly folderName: string;
  readonly builtIn: boolean;
  readonly retired: boolean;
  readonly properties: readonly PropertySchema[];
}

export const ENTITY_TYPES: Readonly<
  Record<EntityType, { label: string; folder: string; icon: string }>
> = {
  idea: { label: 'Idea', folder: 'Ideas', icon: 'lightbulb' },
  character: { label: 'Character', folder: 'Characters', icon: 'user-round' },
  scene: { label: 'Scene', folder: 'Scenes', icon: 'clapperboard' },
  location: { label: 'Location', folder: 'Locations', icon: 'map-pin' },
  'plot-thread': { label: 'Plot Thread', folder: 'Plot Threads', icon: 'waypoints' },
  'story-section': { label: 'Story Section', folder: 'Story Sections', icon: 'rows-3' },
  project: { label: 'Project', folder: 'Projects', icon: 'folder' },
};

export function isEntityType(value: unknown): value is EntityType {
  return (
    typeof value === 'string' &&
    /^[a-z][a-z0-9_-]*$/.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value)
  );
}
