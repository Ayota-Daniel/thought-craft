import type { Entity, EntityStatus } from '../domain/entity';
import { titleFromPath } from '../shared/note-path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: readonly unknown[] = ['inbox', 'exploring', 'archived'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes invalid days such as February 30; reject those too.
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

export function entityFromFrontmatter(value: unknown, filePath: string): Entity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !/\.md$/i.test(filePath)) return null;
  const fm = value as Record<string, unknown>;
  if (typeof fm.bs_id !== 'string' || !UUID.test(fm.bs_id) || fm.bs_type !== 'idea' ||
    typeof fm.bs_workspace !== 'string' || !fm.bs_workspace.trim() || [...fm.bs_workspace].some((char) => char.charCodeAt(0) < 32) ||
    !STATUSES.includes(fm.bs_status) || !isTimestamp(fm.bs_created) || !isTimestamp(fm.bs_updated)) return null;
  return Object.freeze({
    id: fm.bs_id.toLowerCase(), type: 'idea', title: titleFromPath(filePath),
    workspaceId: fm.bs_workspace, status: fm.bs_status as EntityStatus,
    filePath, createdAt: fm.bs_created, updatedAt: fm.bs_updated,
  });
}

export function writeEntityFrontmatter(frontmatter: Record<string, unknown>, entity: Entity): void {
  Object.assign(frontmatter, {
    bs_id: entity.id, bs_type: entity.type, bs_workspace: entity.workspaceId,
    bs_status: entity.status, bs_created: entity.createdAt, bs_updated: entity.updatedAt,
  });
}
