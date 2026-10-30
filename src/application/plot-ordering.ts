import type { Entity } from '../domain/entity';
import { orderBetween, STORY_ORDER_STEP } from '../domain/story-placement';

/** The anchor is a UUID in the full destination list, never a filtered page index. */
export function planNarrativeMove(
  items: readonly Entity[],
  moved: Entity,
  beforeId: string | null,
) {
  const remaining = items.filter((item) => item.id !== moved.id);
  const destination =
    beforeId === null ? remaining.length : remaining.findIndex((item) => item.id === beforeId);
  if (destination < 0) throw new Error('The destination changed. Review Plot and try again.');
  const ordered = [...remaining];
  ordered.splice(destination, 0, moved);
  if (
    moved.story?.order !== null &&
    moved.story?.order !== undefined &&
    ordered.every((item, index) => item.id === items[index]?.id)
  )
    return [];
  const previous = remaining[destination - 1];
  const next = remaining[destination];
  const previousOrder = previous?.story?.order ?? null;
  const nextOrder = next?.story?.order ?? null;
  const hasMissingNeighbor = Boolean(
    (previous && previousOrder === null) || (next && nextOrder === null),
  );
  const order = hasMissingNeighbor ? null : orderBetween(previousOrder, nextOrder);
  // Duplicate/manual unsorted ranks can make even a local midpoint ambiguous.
  const increasing = remaining.every(
    (item, index) =>
      index === 0 ||
      (item.story?.order !== null &&
        item.story?.order !== undefined &&
        item.story.order > (remaining[index - 1]?.story?.order ?? Infinity)),
  );
  if (order !== null && increasing) return [{ entity: moved, order }];
  return ordered
    .map((entity, index) => ({ entity, order: (index + 1) * STORY_ORDER_STEP }))
    .filter(
      (update) => update.entity.story?.order !== update.order || update.entity.id === moved.id,
    );
}
