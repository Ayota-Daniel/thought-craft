export interface BoardPosition {
  readonly x: number;
  readonly y: number;
}

export interface BoardViewport extends BoardPosition {
  readonly zoom: number;
}

/** Curated visual state only. Entity metadata and relation instances never belong here. */
export interface WorkspaceBoardState {
  readonly workspaceId: string;
  readonly nodes: Readonly<Record<string, BoardPosition>>;
  readonly viewport: BoardViewport;
}

export const BOARD_MIN_ZOOM = 0.35;
export const BOARD_MAX_ZOOM = 1.75;
export const BOARD_LIMIT = 100_000;

export function validateBoardPosition(position: BoardPosition): void {
  if (
    ![position.x, position.y].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= BOARD_LIMIT,
    )
  ) {
    throw new Error('Choose a finite board position within the canvas limits.');
  }
}

export function validateBoardViewport(viewport: BoardViewport): void {
  validateBoardPosition(viewport);
  if (
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom < BOARD_MIN_ZOOM ||
    viewport.zoom > BOARD_MAX_ZOOM
  ) {
    throw new Error('Board zoom is outside the supported range.');
  }
}

/** A small offset avoids initial collisions without imposing an automatic layout. */
export function nextBoardPosition(
  board: WorkspaceBoardState,
  preferred: BoardPosition = { x: 40, y: 40 },
): BoardPosition {
  const occupied = Object.values(board.nodes);
  for (let attempt = 0; attempt <= occupied.length * 4; attempt += 1) {
    const position = {
      x: preferred.x + (attempt % 3) * 280,
      y: preferred.y + Math.floor(attempt / 3) * 200,
    };
    const overlaps = occupied.some(
      (other) => Math.abs(other.x - position.x) < 240 && Math.abs(other.y - position.y) < 170,
    );
    if (!overlaps) {
      return position;
    }
  }
  return { x: preferred.x, y: preferred.y + (occupied.length + 1) * 200 };
}
