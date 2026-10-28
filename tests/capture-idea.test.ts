import { describe, expect, it, vi } from 'vitest';
import { captureIdea } from '../src/application/capture-idea';
import type { NewEntity } from '../src/application/create-entity';

describe('capture use case', () => {
  it('rejects blank input before invoking the writer', async () => {
    const writer = { createEntity: vi.fn() };
    await expect(captureIdea(' \n ', 'default', writer)).rejects.toThrow('Write an idea');
    expect(writer.createEntity).not.toHaveBeenCalled();
  });
  it('passes an intact multiline body and new UUID to the writer', async () => {
    const content = ' First line\n\n---\nbs_id: this is body text\nSecond line  ';
    const writer = {
      createEntity: vi.fn(async (idea: NewEntity) => ({
        id: idea.id,
        type: 'idea' as const,
        title: 'First line',
        workspaceId: idea.workspaceId,
        status: 'inbox' as const,
        filePath: 'Ideas/First line.md',
        createdAt: idea.createdAt,
        updatedAt: idea.createdAt,
        properties: [],
        propertyIssues: [],
        relations: [],
        relationIssues: [],
      })),
    };
    const a = await captureIdea(content, 'default', writer);
    const b = await captureIdea(content, 'default', writer);
    expect(a.id).toMatch(/^[a-f\d-]{36}$/);
    expect(a.id).not.toBe(b.id);
    expect(writer.createEntity.mock.calls[0]?.[0].content).toBe(content);
  });
});
