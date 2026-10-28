import { describe, expect, it, vi } from 'vitest';
import { captureIdea, type NewIdea } from '../src/application/capture-idea';

describe('capture use case', () => {
  it('rejects blank input before invoking the writer', async () => {
    const writer = { createIdea: vi.fn() };
    await expect(captureIdea(' \n ', 'default', writer)).rejects.toThrow('Write an idea');
    expect(writer.createIdea).not.toHaveBeenCalled();
  });
  it('passes an intact multiline body and new UUID to the writer', async () => {
    const content = ' First line\n\n---\nbs_id: this is body text\nSecond line  ';
    const writer = { createIdea: vi.fn(async (idea: NewIdea) => ({
      id: idea.id, type: 'idea' as const, title: 'First line', workspaceId: idea.workspaceId,
      status: 'inbox' as const, filePath: 'Ideas/First line.md', createdAt: idea.createdAt, updatedAt: idea.createdAt,
    })) };
    const a = await captureIdea(content, 'default', writer);
    const b = await captureIdea(content, 'default', writer);
    expect(a.id).toMatch(/^[a-f\d-]{36}$/);
    expect(a.id).not.toBe(b.id);
    expect(writer.createIdea.mock.calls[0]?.[0].content).toBe(content);
  });
});
