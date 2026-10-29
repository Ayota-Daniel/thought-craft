export type WorkspaceId = string;
export type WorkspaceExperienceId = 'story';

export interface WorkspaceRelationTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly sourceEntityTypeIds: readonly string[];
  readonly targetEntityTypeIds: readonly string[];
  readonly retired: boolean;
}

export interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly label: string;
  readonly description?: string;
  readonly builtIn: boolean;
  readonly retired: boolean;
  readonly enabledExperiences: readonly WorkspaceExperienceId[];
  readonly enabledEntityTypeIds: readonly string[];
  readonly relationTypes: readonly WorkspaceRelationTypeDefinition[];
}
