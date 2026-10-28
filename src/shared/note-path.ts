// eslint-disable-next-line no-control-regex -- Control bytes cannot appear in portable filenames.
const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function deriveTitle(content: string): string {
  const line = content.split(/\r?\n/).find((value) => value.trim().length > 0) ?? '';
  const title = line.trim().replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '').trim();
  return title || 'Untitled idea';
}

/** Keep UTF-8 names comfortably below common filesystems' 255-byte limit. */
export function sanitizeFilename(title: string): string {
  let value = title.normalize('NFC').replace(INVALID_FILENAME, ' ').replace(/\s+/g, ' ').trim();
  let shortened = '';
  for (const char of value) {
    if (new TextEncoder().encode(shortened + char).length > 160) break;
    shortened += char;
  }
  value = shortened.replace(/[. ]+$/g, '');
  if (!value || /^\.+$/.test(value)) value = 'Untitled idea';
  if (RESERVED_FILENAME.test(value)) value = `Idea ${value}`;
  return value;
}

export function notePath(folder: string, stem: string, attempt = 0): string {
  const suffix = attempt > 0 ? ` (${attempt + 1})` : '';
  return `${folder}/${stem}${suffix}.md`;
}

/** Call before Obsidian normalizePath so absolute/traversal input is not hidden. */
export function validateFolderPath(input: string): string {
  const folder = input.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  // eslint-disable-next-line no-control-regex -- Reject control bytes in configurable vault paths.
  const invalidPart = /[<>:"|?*\u0000-\u001f]/;
  if (!folder || folder.startsWith('/') || folder.split('/').some((part) =>
    part === '.' || part === '..' || !part || invalidPart.test(part) || /[. ]$/.test(part) || RESERVED_FILENAME.test(part),
  )) throw new Error('Choose a vault-relative folder, for example Brainstorm/Ideas.');
  return folder;
}

export function titleFromPath(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}
