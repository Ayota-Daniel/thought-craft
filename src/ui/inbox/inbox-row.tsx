import { Menu } from 'obsidian';
import type { Entity } from '../../domain/entity';
import type { MouseEvent } from 'react';
const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function InboxRow({
  entity,
  selected,
  selectable = true,
  typeLabel,
  workspaceLabel,
  select,
  open,
  add,
  trash,
}: {
  entity: Entity;
  selected: boolean;
  selectable?: boolean;
  typeLabel: string;
  workspaceLabel: string;
  select: (range: boolean) => void;
  open: () => void;
  add: () => void;
  trash: () => void;
}) {
  function rowClick(event: MouseEvent): void {
    if (selectable && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      event.preventDefault();
      select(event.shiftKey);
    } else open();
  }
  function menu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('Open').setIcon('file-text').onClick(open));
    menu.addItem((item) =>
      item.setTitle('Add to Brainstorm').setIcon('layout-dashboard').onClick(add),
    );
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('Move to trash').setIcon('trash').onClick(trash));
    const bounds = event.currentTarget.getBoundingClientRect();
    menu.showAtPosition({ x: bounds.left, y: bounds.bottom });
  }
  return (
    <li className={`tc-inbox-item${selected ? ' is-selected' : ''}`} data-entity-id={entity.id}>
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${entity.title}`}
          onChange={() => select(false)}
        />
      )}
      <button className="tc-inbox-row" onClick={rowClick}>
        <span className="tc-row-main">
          <span className="tc-row-title">{entity.title}</span>
          <span className="tc-row-workspace">
            {typeLabel} · {workspaceLabel}
          </span>
        </span>
        <time
          dateTime={entity.updatedAt}
          title={`Created: ${entity.createdAt}\nUpdated: ${entity.updatedAt}`}
        >
          {formatter.format(new Date(entity.updatedAt))}
        </time>
      </button>
      <button className="tc-row-menu" aria-label={`Actions for ${entity.title}`} onClick={menu}>
        ⋯
      </button>
    </li>
  );
}
