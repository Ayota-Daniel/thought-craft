import { useState, type DragEvent } from 'react';

export interface PlotDragItem {
  kind: 'scene' | 'section';
  id: string;
}
export interface PlotDropTarget {
  kind: 'scene' | 'section';
  sectionId: string | null;
  beforeId: string | null;
}
const dragFormat = 'application/x-thoughtcraft-plot';
const targetKey = (target: PlotDropTarget) =>
  `${target.kind}:${target.sectionId}:${target.beforeId}`;

/** HTML drag/drop only adapts pointer intent. Ranking and saving stay in PlotService. */
export function usePlotDrag(
  drop: (item: PlotDragItem, target: PlotDropTarget) => void,
  disabled: boolean,
) {
  const [item, setItem] = useState<PlotDragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  function clear(): void {
    setItem(null);
    setOver(null);
  }
  return {
    dragging: item !== null,
    source: (source: PlotDragItem) => ({
      draggable: !disabled,
      onDragStart: (event: DragEvent) => {
        event.stopPropagation();
        event.dataTransfer.setData(dragFormat, JSON.stringify(source));
        event.dataTransfer.effectAllowed = 'move';
        setItem(source);
      },
      onDragEnd: clear,
    }),
    target: (target: PlotDropTarget) => ({
      onDragOver: (event: DragEvent) => {
        if (!item || item.kind !== target.kind || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setOver(targetKey(target));
      },
      onDrop: (event: DragEvent) => {
        if (!item || item.kind !== target.kind || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (item.id !== target.beforeId) drop(item, target);
        clear();
      },
    }),
    isOver: (target: PlotDropTarget) => over === targetKey(target),
  };
}
export type PlotDrag = ReturnType<typeof usePlotDrag>;
