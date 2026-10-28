import type { Entity } from '../domain/entity';
import { titleFromPath } from '../shared/note-path';
import type { EntityRelation } from '../domain/entity-relation';

export interface OutgoingRelation {
  relation: EntityRelation;
  target: Entity | undefined;
}

export interface IncomingRelation {
  relation: EntityRelation;
  source: Entity;
}

/** Disposable UUID-keyed projection of the Markdown notes in the vault. */
export class EntityIndex {
  private entities = new Map<string, Entity>();
  private listeners = new Set<() => void>();
  private inbox: readonly Entity[] = Object.freeze([]);
  private ready = false;

  getById(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getByPath(path: string): Entity | undefined {
    return [...this.entities.values()].find((entity) => entity.filePath === path);
  }

  getAll(): readonly Entity[] {
    return [...this.entities.values()];
  }

  getOutgoingRelations(entityId: string): readonly OutgoingRelation[] {
    const entity = this.getById(entityId);
    return (entity?.relations ?? []).map((relation) => ({
      relation,
      target: this.getById(relation.targetEntityId),
    }));
  }

  getIncomingRelations(entityId: string): readonly IncomingRelation[] {
    const incoming: IncomingRelation[] = [];

    // M2 favors a direct scan over maintaining a second relationship index.
    for (const source of this.entities.values()) {
      for (const relation of source.relations) {
        if (relation.targetEntityId === entityId) {
          incoming.push({ relation, source });
        }
      }
    }

    return incoming;
  }

  isReady(): boolean {
    return this.ready;
  }

  markReady(): void {
    this.ready = true;
    this.emit();
  }

  getInbox = (): readonly Entity[] => this.inbox;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  upsert(entity: Entity): void {
    const previous = this.entities.get(entity.id);
    const occupying = this.getByPath(entity.filePath);

    if (occupying && occupying.id !== entity.id) {
      this.entities.delete(occupying.id);
    }

    const isUnchanged =
      previous &&
      Object.keys(entity).every((key) => {
        const field = key as keyof Entity;
        return previous[field] === entity[field];
      });

    if (isUnchanged) {
      return;
    }

    this.entities.set(entity.id, Object.freeze({ ...entity }));
    this.emit();
  }

  removePath(path: string): void {
    let changed = false;

    for (const [id, entity] of this.entities) {
      const matchesPath = entity.filePath === path || entity.filePath.startsWith(path + '/');

      if (matchesPath) {
        this.entities.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.emit();
    }
  }

  renamePath(oldPath: string, newPath: string): void {
    let changed = false;

    for (const [id, entity] of this.entities) {
      const matchesPath = entity.filePath === oldPath || entity.filePath.startsWith(oldPath + '/');

      if (!matchesPath) {
        continue;
      }

      const filePath = newPath + entity.filePath.slice(oldPath.length);

      if (!/\.md$/i.test(filePath)) {
        this.entities.delete(id);
      } else {
        this.entities.set(
          id,
          Object.freeze({
            ...entity,
            filePath,
            title: titleFromPath(filePath),
          }),
        );
      }

      changed = true;
    }

    if (changed) {
      this.emit();
    }
  }

  private emit(): void {
    const inboxEntities = [...this.entities.values()]
      .filter((entity) => entity.type === 'idea' && entity.status === 'inbox')
      .sort((first, second) => {
        const dateDifference = Date.parse(second.createdAt) - Date.parse(first.createdAt);
        return dateDifference || first.id.localeCompare(second.id);
      });

    this.inbox = Object.freeze(inboxEntities);

    for (const listener of this.listeners) {
      listener();
    }
  }
}
