import type { Entity } from '../../domain/entity';
import type { PlotDrag } from './use-plot-drag';

export function PlotSceneCard({
  entity,
  number,
  issue,
  threads = [],
  highlighted = false,
  relationshipIssue = false,
  sectionId,
  selected,
  select,
  write,
  menu,
  drag,
}: {
  entity: Entity;
  number?: number;
  issue?: string;
  threads?: readonly Entity[];
  highlighted?: boolean;
  relationshipIssue?: boolean;
  sectionId: string | null;
  selected: boolean;
  select: () => void;
  write: () => void;
  menu: (button: HTMLButtonElement) => void;
  drag: PlotDrag;
}) {
  const target = { kind: 'scene' as const, sectionId, beforeId: entity.id };
  return (
    <li
      className={`tc-plot-scene${selected ? ' is-selected' : ''}${highlighted ? ' is-thread-highlighted' : ''}${drag.isOver(target) ? ' is-drag-over' : ''}`}
      data-entity-id={entity.id}
      {...drag.source({ kind: 'scene', id: entity.id })}
      {...(sectionId === null ? {} : drag.target(target))}
    >
      {number !== undefined && (
        <span className="tc-plot-number" aria-hidden="true">
          {number}
        </span>
      )}
      <button
        className="tc-plot-title"
        aria-pressed={selected}
        onClick={select}
        onDoubleClick={write}
      >
        <span>{entity.title}</span>
        {threads.length > 0 && (
          <span
            className="tc-scene-threads"
            title={`Plot Threads: ${threads.map((thread) => thread.title).join(', ')}`}
          >
            <span className="tc-visually-hidden">
              Plot Threads: {threads.map((thread) => thread.title).join(', ')}
            </span>
            {threads.slice(0, 2).map((thread) => (
              <span key={thread.id} aria-hidden="true">
                {thread.title}
              </span>
            ))}
            {threads.length > 2 && <span aria-hidden="true">+{threads.length - 2}</span>}
          </span>
        )}
        {relationshipIssue && (
          <span className="tc-plot-issue">
            Unavailable or invalid related links · inspect in Focus
          </span>
        )}
        {issue && <span className="tc-plot-issue">Unresolved placement · {issue}</span>}
      </button>
      <button className="tc-plot-write" aria-label={`Write ${entity.title}`} onClick={write}>
        Write
      </button>
      <button
        className="tc-row-menu"
        aria-label={`Actions for ${entity.title}`}
        onClick={(event) => menu(event.currentTarget)}
      >
        ⋯
      </button>
    </li>
  );
}
