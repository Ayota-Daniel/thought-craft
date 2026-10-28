import { RELATION_TYPES } from '../domain/entity-relation';
import type { Entity } from '../domain/entity';
import type { WorkspaceRelationTypeDefinition } from '../domain/workspace';
import type { EntityTypeRegistry } from './entity-type-registry';
import type { WorkspaceRegistry } from './workspace-registry';

type RelationEndpoint = Pick<Entity, 'id' | 'workspaceId' | 'type'>;

export interface ResolvedRelationType extends WorkspaceRelationTypeDefinition {
  readonly builtIn: boolean;
}

/** Resolves definitions using the owning source workspace, never the active UI workspace. */
export class RelationTypeRegistry {
  constructor(
    private workspaces: WorkspaceRegistry,
    private types: EntityTypeRegistry,
  ) {}

  getUniversal(): readonly ResolvedRelationType[] {
    return Object.entries(RELATION_TYPES).map(([id, label]) => ({
      id,
      label,
      builtIn: true,
      retired: false,
      sourceEntityTypeIds: [],
      targetEntityTypeIds: [],
    }));
  }

  getForWorkspace(workspaceId: string): readonly ResolvedRelationType[] {
    return [
      ...this.getUniversal(),
      ...(this.workspaces.get(workspaceId)?.relationTypes ?? []).map((relation) => ({
        ...relation,
        builtIn: false,
      })),
    ];
  }

  resolve(workspaceId: string, id: string): ResolvedRelationType | undefined {
    return this.getForWorkspace(workspaceId).find((relation) => relation.id === id);
  }

  label(workspaceId: string, id: string): string {
    return this.resolve(workspaceId, id)?.label ?? `Unknown relation: ${id}`;
  }

  getAvailableForSource(source: RelationEndpoint): readonly ResolvedRelationType[] {
    const workspace = this.workspaces.get(source.workspaceId);
    if (!workspace || workspace.retired) {
      return [];
    }
    return this.getForWorkspace(source.workspaceId).filter(
      (relation) =>
        !relation.retired &&
        (relation.builtIn ||
          (this.isEnabled(source) && this.matches(relation.sourceEntityTypeIds, source.type))),
    );
  }

  /** Also used for read-time compatibility hints. It never modifies a stored edge. */
  compatibilityIssue(
    source: RelationEndpoint,
    target: RelationEndpoint | undefined,
    typeId: string,
  ): string | undefined {
    const relation = this.resolve(source.workspaceId, typeId);
    if (!relation) {
      return `Unknown relation: ${typeId}`;
    }
    if (relation.builtIn) {
      return undefined;
    }
    if (!this.matches(relation.sourceEntityTypeIds, source.type) || !this.isEnabled(source)) {
      return 'Incompatible source entity type.';
    }
    if (target && target.workspaceId !== source.workspaceId) {
      return 'Custom relations require the same workspace.';
    }
    if (
      target &&
      (!this.matches(relation.targetEntityTypeIds, target.type) || !this.isEnabled(target))
    ) {
      return 'Incompatible target entity type.';
    }
    return undefined;
  }

  validateNew(source: RelationEndpoint, target: RelationEndpoint, typeId: string): void {
    const available = this.getAvailableForSource(source).some((relation) => relation.id === typeId);
    if (!available) {
      throw new Error('This relation type is unavailable for the source workspace or entity type.');
    }
    const issue = this.compatibilityIssue(source, target, typeId);
    if (issue) {
      throw new Error(issue);
    }
  }

  private isEnabled(entity: RelationEndpoint): boolean {
    return Boolean(
      this.workspaces.get(entity.workspaceId)?.enabledEntityTypeIds.includes(entity.type) &&
      this.types.get(entity.type) &&
      !this.types.get(entity.type)?.retired,
    );
  }

  private matches(allowed: readonly string[], typeId: string): boolean {
    return allowed.length === 0 || allowed.includes(typeId);
  }
}
