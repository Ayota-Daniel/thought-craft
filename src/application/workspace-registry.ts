import type {
  WorkspaceDefinition,
  WorkspaceExperienceId,
  WorkspaceRelationTypeDefinition,
} from '../domain/workspace';
import { isEntityType } from '../domain/entity-type';
import { RELATION_TYPES } from '../domain/entity-relation';
import { typeIdForLabel, type EntityTypeRegistry } from './entity-type-registry';
import { isRecord } from '../shared/record';

export interface WorkspaceConfiguration {
  workspaces: readonly WorkspaceDefinition[];
  activeWorkspaceId: string;
}

function validateIds(ids: readonly string[]): void {
  if (
    !Array.isArray(ids) ||
    ids.some((id) => !isEntityType(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Choose distinct, valid entity type IDs.');
  }
}

function validateRelationDefinition(relation: WorkspaceRelationTypeDefinition): void {
  if (
    !isEntityType(relation.id) ||
    !relation.label.trim() ||
    typeof relation.retired !== 'boolean'
  ) {
    throw new Error('A relation type needs a stable ID, label and retirement state.');
  }
  if (Object.prototype.hasOwnProperty.call(RELATION_TYPES, relation.id)) {
    throw new Error('Universal relation IDs are reserved.');
  }
  validateIds(relation.sourceEntityTypeIds);
  validateIds(relation.targetEntityTypeIds);
}

function validateWorkspace(workspace: WorkspaceDefinition): void {
  if (
    !isEntityType(workspace.id) ||
    !workspace.label.trim() ||
    typeof workspace.retired !== 'boolean' ||
    typeof workspace.builtIn !== 'boolean'
  ) {
    throw new Error('A workspace needs a safe ID, label and valid state.');
  }
  if (
    workspace.builtIn !== (workspace.id === 'default') ||
    (workspace.builtIn && workspace.retired)
  ) {
    throw new Error('The built-in default workspace cannot be retired or replaced.');
  }
  if (workspace.description !== undefined && typeof workspace.description !== 'string') {
    throw new Error('Workspace description must be text.');
  }
  if (
    !Array.isArray(workspace.enabledExperiences) ||
    workspace.enabledExperiences.some((id) => id !== 'story') ||
    new Set(workspace.enabledExperiences).size !== workspace.enabledExperiences.length
  ) {
    throw new Error('Choose distinct, supported experiences.');
  }
  validateIds(workspace.enabledEntityTypeIds);
  const ids = new Set<string>();
  for (const relation of workspace.relationTypes) {
    validateRelationDefinition(relation);
    if (ids.has(relation.id)) {
      throw new Error('This relation type ID already exists.');
    }
    ids.add(relation.id);
  }
}

function freezeWorkspace(workspace: WorkspaceDefinition): WorkspaceDefinition {
  return Object.freeze({
    ...workspace,
    enabledExperiences: Object.freeze([...workspace.enabledExperiences]),
    enabledEntityTypeIds: Object.freeze([...workspace.enabledEntityTypeIds]),
    relationTypes: Object.freeze(
      workspace.relationTypes.map((relation) =>
        Object.freeze({
          ...relation,
          sourceEntityTypeIds: Object.freeze([...relation.sourceEntityTypeIds]),
          targetEntityTypeIds: Object.freeze([...relation.targetEntityTypeIds]),
        }),
      ),
    ),
  });
}

/** Configuration and UI context only; entity membership remains in Markdown. */
export class WorkspaceRegistry {
  private definitions = new Map<string, WorkspaceDefinition>();
  private activeId: string;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  readonly unreadableDefinitions: unknown[] = [];
  readonly issues: string[] = [];

  constructor(
    data: unknown,
    activeId: unknown,
    initialTypeIds: readonly string[],
    private persist: (configuration: WorkspaceConfiguration) => Promise<void> = async () =>
      undefined,
  ) {
    if (data !== undefined && !Array.isArray(data)) {
      throw new Error(
        'Workspace configuration must be a list. Restore data.json before enabling Thought Craft.',
      );
    }
    for (const raw of (data ?? []) as unknown[]) {
      try {
        if (!isRecord(raw) || !Array.isArray(raw.relationTypes)) {
          throw new Error('Invalid workspace definition.');
        }
        // Missing experience state belongs to pre-M7 configuration. No opt-in is inferred.
        const workspace = {
          ...raw,
          enabledExperiences: raw.enabledExperiences === undefined ? [] : raw.enabledExperiences,
        } as unknown as WorkspaceDefinition;
        validateWorkspace(workspace);
        if (this.get(workspace.id)) {
          throw new Error(`Duplicate workspace ID: ${workspace.id}`);
        }
        this.definitions.set(workspace.id, freezeWorkspace(workspace));
      } catch (error) {
        this.unreadableDefinitions.push(raw);
        this.issues.push(error instanceof Error ? error.message : 'Unreadable workspace.');
      }
    }
    if (!this.get('default')) {
      this.definitions.set(
        'default',
        freezeWorkspace({
          id: 'default',
          label: 'Default',
          builtIn: true,
          retired: false,
          enabledExperiences: [],
          enabledEntityTypeIds: [...initialTypeIds],
          relationTypes: [],
        }),
      );
    }
    this.activeId =
      typeof activeId === 'string' && this.get(activeId) && !this.get(activeId)?.retired
        ? activeId
        : 'default';
  }

  get(id: string): WorkspaceDefinition | undefined {
    return this.definitions.get(id);
  }
  getAll(): readonly WorkspaceDefinition[] {
    return [...this.definitions.values()];
  }
  getSelectable(): readonly WorkspaceDefinition[] {
    return this.getAll().filter((workspace) => !workspace.retired);
  }
  getActive = (): WorkspaceDefinition => this.get(this.activeId)!;
  label(id: string): string {
    return this.get(id)?.label ?? `Unknown Workspace: ${id}`;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getAvailableEntityTypes(workspaceId: string, types: EntityTypeRegistry) {
    const workspace = this.get(workspaceId);
    if (!workspace || workspace.retired) {
      return [];
    }
    return types.getActive().filter((type) => workspace.enabledEntityTypeIds.includes(type.id));
  }

  validateCreation(workspaceId: string, typeId: string, types: EntityTypeRegistry): void {
    if (!this.get(workspaceId) || this.get(workspaceId)?.retired) {
      throw new Error('Choose an active, configured workspace before creating an entity.');
    }
    if (!this.getAvailableEntityTypes(workspaceId, types).some((type) => type.id === typeId)) {
      throw new Error('This entity type is unavailable or disabled in this workspace.');
    }
  }

  create(input: {
    id: string;
    label: string;
    description?: string;
    enabledExperiences?: readonly WorkspaceExperienceId[];
    enabledEntityTypeIds?: readonly string[];
  }): Promise<void> {
    return this.commit(() => {
      const id = typeIdForLabel(input.id);
      if (this.get(id)) {
        throw new Error('This workspace ID is already in use.');
      }
      return {
        ...input,
        id,
        label: input.label.trim(),
        builtIn: false,
        retired: false,
        enabledExperiences: input.enabledExperiences ?? [],
        enabledEntityTypeIds: input.enabledEntityTypeIds ?? ['idea'],
        relationTypes: [],
      };
    });
  }

  update(
    id: string,
    changes: {
      label?: string;
      description?: string;
      enabledExperiences?: readonly WorkspaceExperienceId[];
      enabledEntityTypeIds?: readonly string[];
      retired?: boolean;
    },
  ): Promise<void> {
    return this.commit(() => ({
      ...this.require(id),
      ...changes,
      id,
      label: (changes.label ?? this.require(id).label).trim(),
    }));
  }

  enableEntityType(workspaceId: string, typeId: string, types: EntityTypeRegistry): Promise<void> {
    return this.commit(() => {
      const workspace = this.require(workspaceId);
      if (workspace.retired || !types.get(typeId) || types.get(typeId)?.retired) {
        throw new Error('This entity type or Workspace is unavailable.');
      }
      return {
        ...workspace,
        enabledEntityTypeIds: [...new Set([...workspace.enabledEntityTypeIds, typeId])],
      };
    });
  }

  setActive(id: string): Promise<void> {
    return this.commit(() => {
      if (!this.get(id) || this.get(id)?.retired) {
        throw new Error('Choose an active workspace.');
      }
      return undefined;
    }, id);
  }

  addRelationType(
    workspaceId: string,
    input: Omit<WorkspaceRelationTypeDefinition, 'retired'>,
  ): Promise<void> {
    return this.commit(() => {
      const workspace = this.require(workspaceId);
      const relation = {
        ...input,
        id: typeIdForLabel(input.id),
        label: input.label.trim(),
        retired: false,
      };
      return { ...workspace, relationTypes: [...workspace.relationTypes, relation] };
    });
  }

  updateRelationType(
    workspaceId: string,
    relationId: string,
    changes: Partial<Omit<WorkspaceRelationTypeDefinition, 'id'>>,
  ): Promise<void> {
    return this.commit(() => {
      const workspace = this.require(workspaceId);
      if (!workspace.relationTypes.some((relation) => relation.id === relationId)) {
        throw new Error('Relation definition unavailable.');
      }
      return {
        ...workspace,
        relationTypes: workspace.relationTypes.map((relation) =>
          relation.id === relationId ? { ...relation, ...changes, id: relation.id } : relation,
        ),
      };
    });
  }

  private require(id: string): WorkspaceDefinition {
    const workspace = this.get(id);
    if (!workspace) {
      throw new Error('Workspace unavailable.');
    }
    return workspace;
  }

  private commit(
    build: () => WorkspaceDefinition | undefined,
    requestedActive?: string,
  ): Promise<void> {
    const operation = this.writes
      .catch(() => undefined)
      .then(async () => {
        const next = build();
        if (next) {
          validateWorkspace(next);
        }
        const definitions = this.getAll().map((workspace) =>
          workspace.id === next?.id ? next : workspace,
        );
        if (next && !this.get(next.id)) {
          definitions.push(next);
        }
        let activeWorkspaceId = requestedActive ?? this.activeId;
        if (
          !definitions.some((workspace) => workspace.id === activeWorkspaceId && !workspace.retired)
        ) {
          activeWorkspaceId = 'default';
        }
        await this.persist({ workspaces: definitions, activeWorkspaceId });
        if (next) {
          this.definitions.set(next.id, freezeWorkspace(next));
        }
        this.activeId = activeWorkspaceId;
        this.listeners.forEach((listener) => listener());
      });
    this.writes = operation;
    return operation;
  }
}
