export interface AnchorBounds {
  left: number;
  top: number;
  bottom: number;
}

/** Keep a small floating form in the viewport, flipping above when below has less room. */
export function placePopover(
  anchor: AnchorBounds,
  contentHeight: number,
  viewport: { width: number; height: number },
) {
  const inset = 8;
  const gap = 6;
  const width = Math.max(0, Math.min(280, viewport.width - inset * 2));
  const maxViewportHeight = Math.max(0, viewport.height - inset * 2);
  const below = Math.max(0, viewport.height - anchor.bottom - gap - inset);
  const above = Math.max(0, anchor.top - gap - inset);
  const useBelow = below >= contentHeight || below >= above;
  const maxHeight = Math.min(maxViewportHeight, useBelow ? below : above);
  const height = Math.min(contentHeight, maxHeight);
  const preferredTop = useBelow ? anchor.bottom + gap : anchor.top - gap - height;
  return {
    left: Math.max(inset, Math.min(anchor.left, viewport.width - width - inset)),
    top: Math.max(inset, Math.min(preferredTop, viewport.height - height - inset)),
    width,
    maxHeight,
  };
}
