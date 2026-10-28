import type { Entity } from '../domain/entity';

export async function openEntity(
  id: string,
  lookup: { getById(id: string): Entity | undefined },
  openNote: (path: string) => Promise<void>,
): Promise<void> {
  const entity = lookup.getById(id);
  if (!entity) throw new Error('This idea is no longer available in the vault.');
  await openNote(entity.filePath);
}
