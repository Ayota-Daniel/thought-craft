export type WorkspaceId = string;

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
  readonly enabledEntityTypeIds: readonly string[];
  readonly relationTypes: readonly WorkspaceRelationTypeDefinition[];
}
