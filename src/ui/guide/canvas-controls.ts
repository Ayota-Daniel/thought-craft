/** Keep the quick help and full Guide aligned with the actual canvas configuration. */
export const CANVAS_CONTROLS = [
  ['Select a card', 'Left click'],
  ['Select an area', 'Left drag on empty canvas'],
  ['Add or remove from selection', 'Ctrl/Cmd + click · Shift + click'],
  ['Pan canvas', 'Right drag · Middle drag · Space + drag'],
  ['Zoom', 'Scroll · Zoom buttons'],
  ['Move selected cards', 'Drag any selected card'],
  ['Open an entity', 'Enter on its focused card · Double-click · Open'],
  ['Move by keyboard', 'Space selects a focused card; arrow keys move the selection'],
] as const;

export function renderCanvasControls(container: HTMLElement): void {
  const list = container.createEl('dl', { cls: 'tc-canvas-control-list' });
  for (const [action, gesture] of CANVAS_CONTROLS) {
    list.createEl('dt', { text: action });
    list.createEl('dd', { text: gesture });
  }
}
