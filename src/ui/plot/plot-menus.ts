import { Menu } from 'obsidian';
import type { Entity } from '../../domain/entity';
import type { projectPlot } from '../../application/plot-query';

function show(menu: Menu, button: HTMLButtonElement): void {
  const view = button.ownerDocument.defaultView;
  let open = true;
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (open) menu.hide();
    button.focus();
  };
  view?.addEventListener('keydown', escape, true);
  menu.onHide(() => {
    open = false;
    // Native Menu may hide earlier in the same key event. Keep the guard until
    // dispatch finishes so Escape cannot also activate the editor underneath.
    setTimeout(() => view?.removeEventListener('keydown', escape, true), 0);
  });
  button.focus();
  const bounds = button.getBoundingClientRect();
  menu.showAtPosition({ x: bounds.left, y: bounds.bottom }, button.ownerDocument);
}

export function showSceneMenu(
  entity: Entity,
  plot: ReturnType<typeof projectPlot>,
  button: HTMLButtonElement,
  actions: {
    write: () => void;
    focus: () => void;
    move: (sectionId: string | null, beforeId?: string | null) => void;
    chooseSection: () => void;
    threads: () => void;
  },
) {
  const menu = new Menu();
  const section = plot.sections.find((item) => item.scenes.some((scene) => scene.id === entity.id));
  const index = section?.scenes.findIndex((scene) => scene.id === entity.id) ?? -1;
  menu.addItem((item) => item.setTitle('Write').setIcon('file-pen-line').onClick(actions.write));
  menu.addItem((item) => item.setTitle('Open Focus').onClick(actions.focus));
  menu.addItem((item) => item.setTitle('Plot Threads…').onClick(actions.threads));
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle('Move to section…')
      .setDisabled(!plot.sections.length)
      .onClick(actions.chooseSection),
  );
  menu.addItem((item) =>
    item
      .setTitle('Move earlier')
      .setDisabled(!section || index <= 0)
      .onClick(() => {
        if (section) actions.move(section.entity.id, section.scenes[index - 1]?.id);
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle('Move later')
      .setDisabled(!section || index >= section.scenes.length - 1)
      .onClick(() => {
        if (section) actions.move(section.entity.id, section.scenes[index + 2]?.id ?? null);
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle('Move to Unplaced')
      .setDisabled(!section && !entity.story)
      .onClick(() => actions.move(null)),
  );
  show(menu, button);
}

export function showSectionMenu(
  entity: Entity,
  plot: ReturnType<typeof projectPlot>,
  button: HTMLButtonElement,
  actions: {
    focus: () => void;
    rename: () => void;
    create: () => void;
    reorder: (beforeId: string | null) => void;
    canCreate: boolean;
  },
) {
  const menu = new Menu();
  const index = plot.sections.findIndex((section) => section.entity.id === entity.id);
  menu.addItem((item) => item.setTitle('Open Section').onClick(actions.focus));
  menu.addItem((item) => item.setTitle('Rename').onClick(actions.rename));
  menu.addItem((item) =>
    item.setTitle('Add Scene').setDisabled(!actions.canCreate).onClick(actions.create),
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle('Move earlier')
      .setDisabled(index <= 0)
      .onClick(() => actions.reorder(plot.sections[index - 1]!.entity.id)),
  );
  menu.addItem((item) =>
    item
      .setTitle('Move later')
      .setDisabled(index >= plot.sections.length - 1)
      .onClick(() => actions.reorder(plot.sections[index + 2]?.entity.id ?? null)),
  );
  show(menu, button);
}
