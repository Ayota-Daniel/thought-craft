/** Narrative data; independent of spatial Brainstorm layout and any UI library. */
export interface StoryPosition {
  readonly sectionId: string | null;
  readonly order: number | null;
}

export interface StoryPlacement extends StoryPosition {
  readonly issues: readonly string[];
  /** Retained for optimistic concurrency checks, never copied into settings. */
  readonly raw: unknown;
}

export const STORY_ORDER_STEP = 1000;

export function isStoryOrder(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  );
}

/** A practical integer gap keeps hand-edited YAML readable and avoids float exhaustion. */
export function orderBetween(previous: number | null, next: number | null): number | null {
  let order = STORY_ORDER_STEP;
  if (previous !== null && next !== null) {
    if (next - previous < 2) return null;
    order = Math.floor(previous + (next - previous) / 2);
  } else if (previous !== null) {
    order = previous + STORY_ORDER_STEP;
  } else if (next !== null) {
    order = next - STORY_ORDER_STEP;
  }
  return isStoryOrder(order) &&
    (previous === null || order > previous) &&
    (next === null || order < next)
    ? order
    : null;
}
