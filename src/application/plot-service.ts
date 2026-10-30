import type { Entity } from '../domain/entity';
import type { StoryPosition } from '../domain/story-placement';
import type { EntityIndex } from '../infrastructure/entity-index';
import type { WorkspaceRegistry } from './workspace-registry';
import type { EntityTypeRegistry } from './entity-type-registry';
import { createEntity, type CreateFromInput, type EntityWriter } from './create-entity';
import { storyEnabled } from './story-query';
import { projectPlot } from './plot-query';
import { planNarrativeMove } from './plot-ordering';

export interface EntityStoryWriter {
  setStoryPlacement(
    entityId: string,
    expected: unknown,
    position: StoryPosition,
    workspaceId: string,
  ): Promise<void>;
}

export class PlotCreationPlacementError extends Error {
  constructor(
    readonly entity: Entity,
    cause: unknown,
  ) {
    super(
      `Created ${entity.filePath}, but placement failed. The note is safe; close this dialog and place it from Plot. ${cause instanceof Error ? cause.message : ''}`,
    );
  }
}

/** Serializes Plot intents, while the repository still owns each real Markdown commit. */
export class PlotService {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private index: EntityIndex,
    private writer: EntityStoryWriter & EntityWriter,
    private workspaces: WorkspaceRegistry,
    private types: EntityTypeRegistry,
  ) {}

  moveScene(
    workspaceId: string,
    sceneId: string,
    sectionId: string | null,
    beforeId: string | null = null,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.validateWorkspace(workspaceId);
      const scene = this.requireEntity(sceneId, workspaceId, 'scene');
      if (sectionId === null) {
        await this.writer.setStoryPlacement(
          scene.id,
          scene.story?.raw,
          { sectionId: null, order: null },
          workspaceId,
        );
        return;
      }
      this.requireEntity(sectionId, workspaceId, 'story-section');
      const target = projectPlot(this.index, workspaceId).sections.find(
        (section) => section.entity.id === sectionId,
      )!;
      const plan = planNarrativeMove(target.scenes, scene, beforeId);
      await this.persistPlan(
        workspaceId,
        plan.map(({ entity, order }) => ({ entity, position: { sectionId, order } })),
      );
    });
  }

  reorderSection(workspaceId: string, sectionId: string, beforeId: string | null): Promise<void> {
    return this.enqueue(async () => {
      this.validateWorkspace(workspaceId);
      const section = this.requireEntity(sectionId, workspaceId, 'story-section');
      const sections = projectPlot(this.index, workspaceId).sections.map((item) => item.entity);
      const plan = planNarrativeMove(sections, section, beforeId);
      await this.persistPlan(
        workspaceId,
        plan.map(({ entity, order }) => ({ entity, position: { sectionId: null, order } })),
      );
    });
  }

  /** Creation stays generic; a failed placement retains the real note and blocks duplicate retry. */
  create(workspaceId: string, input: CreateFromInput, sectionId: string | null): Promise<Entity> {
    return this.enqueue(async () => {
      this.validateWorkspace(workspaceId);
      if (!['scene', 'story-section'].includes(input.type))
        throw new Error('Plot creates Scenes or Story Sections.');
      if (input.type === 'story-section' && sectionId !== null)
        throw new Error('Story Sections cannot be nested.');
      if (sectionId !== null) this.requireEntity(sectionId, workspaceId, 'story-section');
      const entity = await createEntity(
        input,
        workspaceId,
        this.writer,
        this.types,
        this.workspaces,
      );
      try {
        const plot = projectPlot(this.index, workspaceId);
        const items =
          input.type === 'story-section'
            ? plot.sections.map((section) => section.entity)
            : (plot.sections.find((section) => section.entity.id === sectionId)?.scenes ?? []);
        if (input.type === 'story-section' || sectionId !== null) {
          const plan = planNarrativeMove(items, entity, null);
          await this.persistPlan(
            workspaceId,
            plan.map(({ entity: item, order }) => ({
              entity: item,
              position: { sectionId: input.type === 'scene' ? sectionId : null, order },
            })),
          );
        }
      } catch (error) {
        // Do not encourage creating a duplicate when only placement failed.
        throw new PlotCreationPlacementError(entity, error);
      }
      return entity;
    });
  }

  private validateWorkspace(id: string): void {
    const workspace = this.workspaces.get(id);
    if (!workspace || !storyEnabled(workspace))
      throw new Error('Story is unavailable in this Workspace.');
  }

  private requireEntity(id: string, workspaceId: string, type: string): Entity {
    const entity = this.index.getById(id);
    if (!entity || entity.workspaceId !== workspaceId || entity.type !== type) {
      throw new Error(`Choose a ${type} in this Workspace.`);
    }
    return entity;
  }

  private async persistPlan(
    workspaceId: string,
    plan: readonly { entity: Entity; position: StoryPosition }[],
  ): Promise<void> {
    let written = 0;
    try {
      for (const { entity, position } of plan) {
        await this.writer.setStoryPlacement(entity.id, entity.story?.raw, position, workspaceId);
        written++;
      }
    } catch (error) {
      throw new Error(
        `Plot save stopped after ${written} of ${plan.length} notes. Showing actual Markdown order; review before retrying. ${error instanceof Error ? error.message : 'Could not save placement.'}`,
      );
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.catch(() => undefined).then(operation);
    this.writes = pending;
    return pending;
  }
}
