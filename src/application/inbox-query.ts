import type { Entity } from '../domain/entity';
import type { WorkspaceBoardState } from '../domain/board';
import type { EntityTypeRegistry } from './entity-type-registry';

export type InboxSort = 'newest' | 'updated' | 'oldest' | 'az' | 'za';
export interface InboxFilters {
  type: string;
  board: 'all' | 'on' | 'off';
  relations: 'all' | 'has' | 'none';
  recent: boolean;
}
export const EMPTY_INBOX_FILTERS: InboxFilters = {
  type: '',
  board: 'all',
  relations: 'all',
  recent: false,
};

/** Preserve the Idea inbox lifecycle while making other non-archived types discoverable. */
export function inboxCandidates(entities: readonly Entity[], workspaceId: string): Entity[] {
  return entities.filter(
    (entity) =>
      entity.workspaceId === workspaceId &&
      (entity.type === 'idea' ? entity.status === 'inbox' : entity.status !== 'archived'),
  );
}

export function queryInbox(
  entities: readonly Entity[],
  workspaceId: string,
  query: string,
  filters: InboxFilters,
  sort: InboxSort,
  board: WorkspaceBoardState,
  types: EntityTypeRegistry,
  now = Date.now(),
): Entity[] {
  const search = query.trim().toLocaleLowerCase();
  // Relations means either direction, including a stored outgoing dangling link.
  const related = new Set<string>();
  for (const entity of entities) {
    if (entity.relations.length) related.add(entity.id);
    entity.relations.forEach((relation) => related.add(relation.targetEntityId));
  }
  const workspaceEntities = inboxCandidates(entities, workspaceId);
  const searchedEntities = workspaceEntities.filter(
    (entity) =>
      !search || `${entity.title} ${types.label(entity.type)}`.toLocaleLowerCase().includes(search),
  );
  const filteredEntities = searchedEntities.filter((entity) => {
    if (filters.type && entity.type !== filters.type) return false;
    const placed = Boolean(board.nodes[entity.id]);
    if (filters.board === 'on' && !placed) return false;
    if (filters.board === 'off' && placed) return false;
    if (filters.relations === 'has' && !related.has(entity.id)) return false;
    if (filters.relations === 'none' && related.has(entity.id)) return false;
    if (filters.recent && Date.parse(entity.updatedAt) < now - 7 * 24 * 60 * 60 * 1000)
      return false;
    return true;
  });
  const sortedEntities = filteredEntities.sort((a, b) => {
    let order = 0;
    if (sort === 'newest') order = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === 'oldest') order = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (sort === 'updated') order = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (sort === 'az') order = a.title.localeCompare(b.title);
    if (sort === 'za') order = b.title.localeCompare(a.title);
    return order || a.id.localeCompare(b.id);
  });
  return sortedEntities;
}
