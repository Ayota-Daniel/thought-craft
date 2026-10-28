import type { Entity, EntityStatus } from '../domain/entity';
import { titleFromPath } from '../shared/note-path';
import { isRecord } from '../shared/record';
import { parseCustomProperties } from './property-mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: readonly unknown[] = ['inbox', 'exploring', 'archived'];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    return false;
  }

  if (!Number.isFinite(Date.parse(value))) {
    return false;
  }

  // Date.parse normalizes invalid days such as February 30.
  const day = value.slice(0, 10);
  const calendarDate = new Date(day + 'T00:00:00Z');

  return calendarDate.toISOString().slice(0, 10) === day;
}

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

  const hasValidIdentity = typeof value.bs_id === 'string' && UUID.test(value.bs_id);
  const hasValidType = value.bs_type === 'idea';
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

  return Object.freeze({
    id: (value.bs_id as string).toLowerCase(),
    type: 'idea',
    title: titleFromPath(filePath),
    workspaceId: value.bs_workspace as string,
    status: value.bs_status as EntityStatus,
    filePath,
    createdAt: value.bs_created as string,
    updatedAt: value.bs_updated as string,
    properties: parsedProperties.properties,
    propertyIssues: parsedProperties.issues,
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
