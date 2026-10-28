import type { Entity, EntityStatus } from '../domain/entity';
import { titleFromPath } from '../shared/note-path';
import { isRecord } from '../shared/record';
import { parseCustomProperties } from './property-mapper';
import { parseRelations } from './relation-mapper';
import { isEntityType, type EntityType } from '../domain/entity-type';
import { isTimestamp, isUuid } from '../shared/metadata-validation';

const STATUSES: readonly unknown[] = ['inbox', 'exploring', 'archived'];

function isWorkspaceIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  return ![...value].some((character) => character.charCodeAt(0) < 32);
}

export function entityFromFrontmatter(value: unknown, filePath: string): Entity | null {
  if (!isRecord(value) || !/\.md$/i.test(filePath)) {
    return null;
  }

  const hasValidIdentity = isUuid(value.bs_id);
  const hasValidType = isEntityType(value.bs_type);
  const hasValidWorkspace = isWorkspaceIdentifier(value.bs_workspace);
  const hasValidStatus = STATUSES.includes(value.bs_status);
  const hasValidDates = isTimestamp(value.bs_created) && isTimestamp(value.bs_updated);

  if (
    !hasValidIdentity ||
    !hasValidType ||
    !hasValidWorkspace ||
    !hasValidStatus ||
    !hasValidDates
  ) {
    return null;
  }

  const parsedProperties = parseCustomProperties(value.bs_properties);
  const parsedRelations = parseRelations(value.bs_relations, (value.bs_id as string).toLowerCase());

  return Object.freeze({
    id: (value.bs_id as string).toLowerCase(),
    type: value.bs_type as EntityType,
    title: titleFromPath(filePath),
    workspaceId: value.bs_workspace as string,
    status: value.bs_status as EntityStatus,
    filePath,
    createdAt: value.bs_created as string,
    updatedAt: value.bs_updated as string,
    properties: parsedProperties.properties,
    propertyIssues: parsedProperties.issues,
    schemaValues: value.bs_schema_values,
    relations: parsedRelations.relations,
    relationIssues: parsedRelations.issues,
  });
}

export function writeEntityFrontmatter(frontmatter: Record<string, unknown>, entity: Entity): void {
  Object.assign(frontmatter, {
    bs_id: entity.id,
    bs_type: entity.type,
    bs_workspace: entity.workspaceId,
    bs_status: entity.status,
    bs_created: entity.createdAt,
    bs_updated: entity.updatedAt,
  });
}
