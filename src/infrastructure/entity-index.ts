import type { Entity } from '../domain/entity';
import { titleFromPath } from '../shared/note-path';

/** A disposable projection, not a second source of truth. Identity is always UUID. */
export class EntityIndex {
  private entities = new Map<string, Entity>();
  private listeners = new Set<() => void>();
  private inbox: readonly Entity[] = Object.freeze([]);

  getById(id: string): Entity | undefined { return this.entities.get(id); }
  getByPath(path: string): Entity | undefined {
    return [...this.entities.values()].find((entity) => entity.filePath === path);
  }
  getAll(): readonly Entity[] { return [...this.entities.values()]; }
  getInbox = (): readonly Entity[] => this.inbox;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  upsert(entity: Entity): void {
    const previous = this.entities.get(entity.id);
    const occupying = this.getByPath(entity.filePath);
    if (occupying && occupying.id !== entity.id) this.entities.delete(occupying.id);
    if (previous && Object.keys(entity).every((key) => previous[key as keyof Entity] === entity[key as keyof Entity])) return;
    this.entities.set(entity.id, Object.freeze({ ...entity }));
    this.emit();
  }

  removePath(path: string): void {
    let changed = false;
    for (const [id, entity] of this.entities) {
      if (entity.filePath === path || entity.filePath.startsWith(`${path}/`)) {
        this.entities.delete(id); changed = true;
      }
    }
    if (changed) this.emit();
  }

  renamePath(oldPath: string, newPath: string): void {
    let changed = false;
    for (const [id, entity] of this.entities) {
      if (entity.filePath !== oldPath && !entity.filePath.startsWith(`${oldPath}/`)) continue;
      const filePath = newPath + entity.filePath.slice(oldPath.length);
      if (!/\.md$/i.test(filePath)) this.entities.delete(id);
      else this.entities.set(id, Object.freeze({ ...entity, filePath, title: titleFromPath(filePath) }));
      changed = true;
    }
    if (changed) this.emit();
  }

  private emit(): void {
    this.inbox = Object.freeze([...this.entities.values()]
      .filter((entity) => entity.type === 'idea' && entity.status === 'inbox')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)));
    for (const listener of this.listeners) listener();
  }
}
