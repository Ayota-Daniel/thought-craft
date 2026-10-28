import { describe, expect, it, vi } from 'vitest';
import type { Entity } from '../src/domain/entity';
import { EntityIndex } from '../src/infrastructure/entity-index';

const idea: Entity = {
  id: 'ca829f16-35b0-4e68-857b-d54cfc73caed',
  type: 'idea',
  title: 'A thought',
  workspaceId: 'default',
  status: 'inbox',
  filePath: 'Ideas/A thought.md',
  createdAt: '2026-10-28T10:00:00Z',
  updatedAt: '2026-10-28T10:00:00Z',
  properties: [],
  propertyIssues: [],
};

describe('EntityIndex', () => {
  it('adds, updates and removes an entity', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    expect(index.getById(idea.id)).toEqual(idea);
    index.upsert({ ...idea, status: 'exploring' });
    expect(index.getById(idea.id)?.status).toBe('exploring');
    expect(index.getAll()).toHaveLength(1);
    index.removePath(idea.filePath);
    expect(index.getAll()).toHaveLength(0);
  });
  it('notifies subscribers and releases them', () => {
    const index = new EntityIndex();
    const listener = vi.fn();
    const unsubscribe = index.subscribe(listener);
    const initial = index.getInbox();
    index.upsert(idea);
    expect(index.getInbox()).not.toBe(initial);
    const snapshot = index.getInbox();
    index.upsert({ ...idea });
    expect(index.getInbox()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    index.removePath(idea.filePath);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('keeps UUID identity across a rename and updates path/title', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.renamePath(idea.filePath, 'Elsewhere/Renamed.md');
    expect(index.getById(idea.id)).toMatchObject({
      id: idea.id,
      title: 'Renamed',
      filePath: 'Elsewhere/Renamed.md',
    });
    expect(index.getByPath(idea.filePath)).toBeUndefined();
    expect(index.getInbox()).toHaveLength(1);
  });
  it('handles a path change reported as an upsert', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.upsert({ ...idea, filePath: 'Other.md', title: 'Other' });
    expect(index.getAll()).toHaveLength(1);
    expect(index.getByPath('Other.md')?.id).toBe(idea.id);
    // OS watchers can report create(new) before delete(old) for a rename.
    index.removePath(idea.filePath);
    expect(index.getByPath('Other.md')?.id).toBe(idea.id);
  });
  it('handles replacing an entity id at the same path', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.upsert({ ...idea, id: 'a-different-id' });
    expect(index.getById(idea.id)).toBeUndefined();
    expect(index.getAll()).toHaveLength(1);
  });
  it('renames and removes whole folders with safe path boundaries', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.upsert({ ...idea, id: 'other', filePath: 'Ideas2/Other.md' });
    index.renamePath('Ideas', 'Archive/Ideas');
    expect(index.getById(idea.id)?.filePath).toBe('Archive/Ideas/A thought.md');
    expect(index.getById('other')?.filePath).toBe('Ideas2/Other.md');
    index.removePath('Archive');
    expect(index.getAll()).toHaveLength(1);
  });
  it('excludes files renamed to a non-Markdown extension', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.renamePath(idea.filePath, 'No longer markdown.txt');
    expect(index.getInbox()).toHaveLength(0);
  });
  it('queries inbox only, across workspaces, newest first and with a stable tie-break', () => {
    const index = new EntityIndex();
    index.upsert(idea);
    index.upsert({ ...idea, id: 'older', createdAt: '2026-01-01T10:00:00Z', filePath: 'old.md' });
    index.upsert({ ...idea, id: 'exploring', status: 'exploring', filePath: 'exploring.md' });
    index.upsert({ ...idea, id: 'archived', status: 'archived', filePath: 'archived.md' });
    index.upsert({
      ...idea,
      id: 'newer',
      workspaceId: 'novel',
      createdAt: '2026-10-28T11:00:00Z',
      filePath: 'new.md',
    });
    expect(index.getInbox().map((entity) => entity.id)).toEqual(['newer', idea.id, 'older']);
  });
  it('starts empty so a new index can be rebuilt without persisted plugin data', () => {
    const index = new EntityIndex();
    expect(index.getInbox()).toEqual([]);
    [idea, { ...idea, id: 'second', filePath: 'second.md' }].forEach((entity) =>
      index.upsert(entity),
    );
    expect(index.getInbox()).toHaveLength(2);
  });
});
