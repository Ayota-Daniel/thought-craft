import { isRecord } from '../shared/record';
import { isUuid } from '../shared/metadata-validation';
import { isStoryOrder, type StoryPlacement, type StoryPosition } from '../domain/story-placement';

export function parseStoryPlacement(raw: unknown): StoryPlacement {
  const issues: string[] = [];
  let sectionId: string | null = null;
  let order: number | null = null;
  if (raw !== undefined && !isRecord(raw)) {
    issues.push(
      'bs_story must be a mapping. Repair it in the Markdown note before editing placement.',
    );
  }
  if (isRecord(raw)) {
    if (isUuid(raw.section_id)) sectionId = raw.section_id.toLowerCase();
    else if (raw.section_id !== undefined && raw.section_id !== null && raw.section_id !== '') {
      issues.push('Invalid Story Section UUID.');
    }
    if (isStoryOrder(raw.order)) order = raw.order;
    else if (raw.order !== undefined && raw.order !== null) issues.push('Invalid narrative order.');
  }
  return Object.freeze({ sectionId, order, issues: Object.freeze(issues), raw });
}

export function writeStoryPlacement(
  frontmatter: Record<string, unknown>,
  expected: unknown,
  position: StoryPosition,
): void {
  const raw = frontmatter.bs_story;
  if (JSON.stringify(raw) !== JSON.stringify(expected)) {
    throw new Error(
      'Narrative placement changed elsewhere. Review the refreshed Plot before trying again.',
    );
  }
  if (raw !== undefined && !isRecord(raw)) {
    throw new Error('Repair the malformed bs_story mapping in Markdown before changing placement.');
  }
  if (position.sectionId !== null && !isUuid(position.sectionId))
    throw new Error('Invalid Section UUID.');
  if (position.order !== null && !isStoryOrder(position.order))
    throw new Error('Invalid narrative order.');
  const next = { ...(isRecord(raw) ? raw : {}) };
  if (position.sectionId === null) delete next.section_id;
  else next.section_id = position.sectionId;
  if (position.order === null) delete next.order;
  else next.order = position.order;
  if (Object.keys(next).length) frontmatter.bs_story = next;
  else delete frontmatter.bs_story;
}
