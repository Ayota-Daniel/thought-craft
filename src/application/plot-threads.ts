import type { Entity } from '../domain/entity';
import type { EntityRelation } from '../domain/entity-relation';
import type { EntityIndex } from '../infrastructure/entity-index';
import type { EntityRelationWriter } from './entity-relations';
import { projectPlot } from './plot-query';

export interface ThreadAssociation {
  readonly sourceId: string;
  readonly relation: EntityRelation;
}

/** Related to is intentionally the only membership kind; provenance/support keep their meaning.
 * Both directions are readable because generic Focus can create either directed edge.
 */
export function threadAssociations(scene: Entity, thread: Entity): ThreadAssociation[] {
  if (
    scene.type !== 'scene' ||
    thread.type !== 'plot-thread' ||
    scene.workspaceId !== thread.workspaceId
  ) {
    return [];
  }
  return [
    ...scene.relations
      .filter((relation) => relation.type === 'related-to' && relation.targetEntityId === thread.id)
      .map((relation) => ({ sourceId: scene.id, relation })),
    ...thread.relations
      .filter((relation) => relation.type === 'related-to' && relation.targetEntityId === scene.id)
      .map((relation) => ({ sourceId: thread.id, relation })),
  ];
}

export function projectPlotThreads(
  index: Pick<EntityIndex, 'getAll' | 'getById'>,
  workspaceId: string,
) {
  const plot = projectPlot(index, workspaceId);
  const threads = index
    .getAll()
    .filter((entity) => entity.workspaceId === workspaceId && entity.type === 'plot-thread')
    .sort(
      (first, second) =>
        first.title.localeCompare(second.title) || first.id.localeCompare(second.id),
    );
  return threads.map((entity) => {
    const belongs = (scene: Entity) => threadAssociations(scene, entity).length > 0;
    return {
      entity,
      hasUnavailableLinks:
        entity.relationIssues.length > 0 ||
        entity.relations.some(
          (relation) => relation.type === 'related-to' && !index.getById(relation.targetEntityId),
        ),
      sequence: plot.sections.flatMap((section) =>
        section.scenes.filter(belongs).map((scene) => ({ scene, section: section.entity })),
      ),
      unplaced: plot.unplaced.filter(({ entity: scene }) => belongs(scene)),
    };
  });
}

export type ProjectedThread = ReturnType<typeof projectPlotThreads>[number];

/** A single association at a time, through the same writer used by Focus and Brainstorm. */
export async function setThreadMembership(
  index: Pick<EntityIndex, 'getById'>,
  writer: EntityRelationWriter,
  workspaceId: string,
  sceneId: string,
  threadId: string,
  associated: boolean,
): Promise<void> {
  if (writer.refreshEntity) {
    await Promise.all([writer.refreshEntity(sceneId), writer.refreshEntity(threadId)]);
  }
  const scene = index.getById(sceneId);
  const thread = index.getById(threadId);
  if (
    !scene ||
    !thread ||
    scene.type !== 'scene' ||
    thread.type !== 'plot-thread' ||
    scene.workspaceId !== workspaceId ||
    thread.workspaceId !== workspaceId
  ) {
    throw new Error('Choose a Scene and Plot Thread in this Workspace.');
  }
  const associations = threadAssociations(scene, thread);
  if (associated) {
    if (associations.length) return;
    await writer.addRelation(
      scene.id,
      { type: 'related-to', targetEntityId: thread.id },
      {
        workspaceId,
        sourceType: 'scene',
        targetType: 'plot-thread',
      },
    );
    return;
  }
  let removed = 0;
  try {
    for (const association of associations) {
      await writer.removeRelation(association.sourceId, association.relation);
      removed++;
    }
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : 'Could not remove association.';
    throw new Error(
      `Removed ${removed} of ${associations.length} related links with confirmed refresh. ${reason} Review the remaining links in Focus, then use Remove again. A retry reads the current membership.`,
    );
  }
}
