import type { Entity } from '../domain/entity';
import type { EntityIndex } from '../infrastructure/entity-index';
import { sortEntities } from './inbox-query';

export interface PlotScene {
  readonly entity: Entity;
  readonly issue?: string;
}
export interface PlotSection {
  readonly entity: Entity;
  readonly scenes: Entity[];
}

export function compareNarrativeOrder(first: Entity, second: Entity): number {
  const firstOrder = first.story?.order ?? Infinity;
  const secondOrder = second.story?.order ?? Infinity;
  if (firstOrder !== secondOrder) return firstOrder - secondOrder;
  return first.id.localeCompare(second.id);
}

/** Resolve UUID references without rewriting malformed or missing assignments. */
export function projectPlot(index: Pick<EntityIndex, 'getAll' | 'getById'>, workspaceId: string) {
  const entities = index.getAll().filter((entity) => entity.workspaceId === workspaceId);
  const sections: PlotSection[] = entities
    .filter((entity) => entity.type === 'story-section')
    .sort(compareNarrativeOrder)
    .map((entity) => ({ entity, scenes: [] }));
  const unplaced: PlotScene[] = [];
  const scenes = sortEntities(
    entities.filter((entity) => entity.type === 'scene'),
    'updated',
  );
  for (const entity of scenes) {
    const placement = entity.story;
    const target = placement?.sectionId ? index.getById(placement.sectionId) : undefined;
    let issue = placement?.issues.join(' ') || undefined;
    if (
      placement?.sectionId &&
      (!target || target.type !== 'story-section' || target.workspaceId !== workspaceId)
    ) {
      issue = 'Story Section missing or outside this Workspace.';
    }
    if (target && placement?.order === null) issue = 'Narrative order is missing.';
    const section =
      !issue && placement?.sectionId
        ? sections.find((candidate) => candidate.entity.id === placement.sectionId)
        : undefined;
    if (section) section.scenes.push(entity);
    else unplaced.push({ entity, issue });
  }
  sections.forEach((section) => section.scenes.sort(compareNarrativeOrder));
  return { sections, unplaced, sequence: sections.flatMap((section) => section.scenes) };
}
