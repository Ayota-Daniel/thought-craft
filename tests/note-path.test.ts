import { describe, expect, it } from 'vitest';
import { deriveTitle, notePath, sanitizeFilename, titleFromPath, validateFolderPath } from '../src/shared/note-path';

describe('note paths', () => {
  it('uses the first meaningful line, including Markdown heading/list markers', () => {
    expect(deriveTitle('\n  \n# A useful idea\nMore context')).toBe('A useful idea');
    expect(deriveTitle('- Another idea\nSecond line')).toBe('Another idea');
    expect(deriveTitle('')).toBe('Untitled idea');
  });
  it('sanitizes invalid characters and preserves readable Unicode', () => {
    expect(sanitizeFilename('Une idée: <gare> / train? * | " \\')).toBe('Une idée gare train');
    expect(sanitizeFilename('  Thought...  ')).toBe('Thought');
    expect(sanitizeFilename('...')).toBe('Untitled idea');
    expect(sanitizeFilename('CON')).toBe('Idea CON');
    expect(sanitizeFilename('LPT1.notes')).toBe('Idea LPT1.notes');
    expect(sanitizeFilename('a\u0000b')).toBe('a b');
  });
  it('limits UTF-8 filename length without splitting an emoji', () => {
    const title = sanitizeFilename('🚂'.repeat(200));
    expect(new TextEncoder().encode(title).length).toBeLessThanOrEqual(160);
    expect(title).toBe('🚂'.repeat(40));
  });
  it('generates collision suffixes without overwriting the first filename', () => {
    expect(notePath('Brainstorm/Ideas', 'Thought')).toBe('Brainstorm/Ideas/Thought.md');
    expect(notePath('Brainstorm/Ideas', 'Thought', 1)).toBe('Brainstorm/Ideas/Thought (2).md');
    expect(notePath('Brainstorm/Ideas', 'Thought', 9)).toBe('Brainstorm/Ideas/Thought (10).md');
  });
  it('normalizes relative folder separators before the host normalizes the path', () => {
    expect(validateFolderPath(' Brainstorm\\Ideas/ ')).toBe('Brainstorm/Ideas');
    expect(validateFolderPath('Brainstorm//Ideas')).toBe('Brainstorm/Ideas');
  });
  it.each(['', ' ', '/', '/outside', '../outside', 'Ideas/../outside', 'Ideas/./inside', 'C:\\outside', 'Ideas/bad?', 'CON', 'Ideas/folder.'])('rejects invalid folder %s', (path) => {
    expect(() => validateFolderPath(path)).toThrow();
  });
  it('takes the title from the current filename rather than the original path', () => {
    expect(titleFromPath('Moved/Renamed.MD')).toBe('Renamed');
  });
});
