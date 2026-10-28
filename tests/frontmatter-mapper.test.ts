import { describe, expect, it } from 'vitest';
import {
  entityFromFrontmatter,
  writeEntityFrontmatter,
} from '../src/infrastructure/frontmatter-mapper';

const valid = {
  bs_id: 'ca829f16-35b0-4e68-857b-d54cfc73caed',
  bs_type: 'idea',
  bs_workspace: 'default',
  bs_status: 'inbox',
  bs_created: '2026-10-28T09:15:00.000Z',
  bs_updated: '2026-10-28T09:15:00.000Z',
};

describe('frontmatter mapper', () => {
  it('maps a valid idea without relying on the path as identity', () => {
    expect(entityFromFrontmatter(valid, 'Ideas/A thought.md')).toEqual({
      id: valid.bs_id,
      type: 'idea',
      title: 'A thought',
      workspaceId: 'default',
      status: 'inbox',
      filePath: 'Ideas/A thought.md',
      createdAt: valid.bs_created,
      updatedAt: valid.bs_updated,
      properties: [],
      propertyIssues: [],
    });
    expect(entityFromFrontmatter(valid, 'Moved/New name.md')?.id).toBe(valid.bs_id);
  });
  it('requires an id and rejects unsupported types', () => {
    expect(entityFromFrontmatter({ ...valid, bs_id: undefined }, 'x.md')).toBeNull();
    expect(entityFromFrontmatter({ ...valid, bs_type: 'scene' }, 'x.md')).toBeNull();
  });
  it.each([null, undefined, [], 'yaml', 3])('rejects non-object metadata: %s', (value) => {
    expect(entityFromFrontmatter(value, 'x.md')).toBeNull();
  });
  it.each([
    { bs_id: 'not-a-uuid' },
    { bs_id: 42 },
    { bs_status: 'other' },
    { bs_status: [] },
    { bs_workspace: ' ' },
    { bs_workspace: 1 },
    { bs_created: 'yesterday' },
    { bs_updated: '2026-99-99T00:00:00Z' },
    { bs_created: new Date() },
    { bs_created: undefined },
    { bs_created: '2026-02-30T10:00:00.000Z' },
    { bs_workspace: 'two\nlines' },
  ])('rejects malformed fields: %j', (fields) => {
    expect(entityFromFrontmatter({ ...valid, ...fields }, 'x.md')).toBeNull();
  });
  it('does not recognize non-Markdown files', () => {
    expect(entityFromFrontmatter(valid, 'x.txt')).toBeNull();
  });
  it('normalizes UUID letter case', () => {
    expect(entityFromFrontmatter({ ...valid, bs_id: valid.bs_id.toUpperCase() }, 'x.md')?.id).toBe(
      valid.bs_id,
    );
  });
  it('writes only namespaced metadata and preserves unrelated properties', () => {
    const frontmatter: Record<string, unknown> = {
      tags: ['keep'],
      title: 'My title',
      custom: { key: 2 },
    };
    const entity = entityFromFrontmatter(valid, 'x.md')!;
    writeEntityFrontmatter(frontmatter, entity);
    expect(frontmatter).toEqual({
      tags: ['keep'],
      title: 'My title',
      custom: { key: 2 },
      ...valid,
    });
  });
});
