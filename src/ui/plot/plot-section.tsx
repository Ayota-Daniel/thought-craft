import { useEffect, useState } from 'react';
import type { PlotSection as ProjectedSection } from '../../application/plot-query';
import { paginateInbox, type InboxPageSize } from '../../application/inbox-pagination';
import { InboxPagination } from '../inbox/inbox-pagination';
import { PlotSceneCard } from './plot-scene-card';
import type { PlotDrag } from './use-plot-drag';
import type { Entity } from '../../domain/entity';

export function PlotSection({
  section,
  search,
  filtering,
  visible,
  highlighted,
  memberships,
  relationshipIssue,
  selected,
  select,
  write,
  sceneMenu,
  sectionMenu,
  create,
  canCreate,
  drag,
}: {
  section: ProjectedSection;
  search: string;
  filtering: boolean;
  visible: (entity: Entity) => boolean;
  highlighted: (entity: Entity) => boolean;
  memberships: (entity: Entity) => Entity[];
  relationshipIssue: (entity: Entity) => boolean;
  selected: string | null;
  select: (id: string) => void;
  write: (id: string) => void;
  sceneMenu: (entity: Entity, button: HTMLButtonElement) => void;
  sectionMenu: (entity: Entity, button: HTMLButtonElement) => void;
  create: () => void;
  canCreate: boolean;
  drag: PlotDrag;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<InboxPageSize>(50);
  const query = search.trim().toLocaleLowerCase();
  const matches = section.scenes
    .filter(visible)
    .filter((entity) => entity.title.toLocaleLowerCase().includes(query));
  const pagination = paginateInbox(matches, page, size);
  useEffect(() => setPage(1), [search, matches.length]);
  useEffect(() => setPage(pagination.page), [pagination.page]);
  const sectionTarget = { kind: 'section' as const, sectionId: null, beforeId: section.entity.id };
  const endTarget = { kind: 'scene' as const, sectionId: section.entity.id, beforeId: null };
  return (
    <section
      className="tc-plot-section"
      data-section-id={section.entity.id}
      aria-label={section.entity.title}
      {...drag.target(endTarget)}
    >
      <header
        className={`tc-plot-section-header${drag.isOver(sectionTarget) ? ' is-drag-over' : ''}`}
        {...drag.source({ kind: 'section', id: section.entity.id })}
        {...drag.target(sectionTarget)}
      >
        <h3>{section.entity.title}</h3>
        <span className="tc-inspector-hint">
          {section.scenes.length} {section.scenes.length === 1 ? 'scene' : 'scenes'}
        </span>
        <button
          className="tc-row-menu"
          aria-label={`Section actions for ${section.entity.title}`}
          onClick={(event) => sectionMenu(section.entity, event.currentTarget)}
        >
          ⋯
        </button>
      </header>
      {section.entity.story?.issues.length ? (
        <p className="tc-plot-issue">{section.entity.story.issues.join(' ')}</p>
      ) : null}
      <ol className="tc-plot-scenes">
        {pagination.items.map((entity) => (
          <PlotSceneCard
            key={entity.id}
            entity={entity}
            threads={memberships(entity)}
            highlighted={highlighted(entity)}
            relationshipIssue={relationshipIssue(entity)}
            number={section.scenes.findIndex((scene) => scene.id === entity.id) + 1}
            sectionId={section.entity.id}
            selected={selected === entity.id}
            select={() => select(entity.id)}
            write={() => write(entity.id)}
            menu={(button) => sceneMenu(entity, button)}
            drag={drag}
          />
        ))}
      </ol>
      <div
        className={`tc-plot-drop-end${drag.isOver(endTarget) ? ' is-drag-over' : ''}`}
        {...drag.target(endTarget)}
      >
        <button disabled={!canCreate} onClick={create}>
          + Scene in {section.entity.title}
        </button>
        <span className="tc-inspector-hint">
          {drag.dragging
            ? 'Drop here to append'
            : matches.length
              ? ''
              : query || filtering
                ? 'No matching scenes.'
                : 'Place a scene here.'}
        </span>
      </div>
      {pagination.total > 25 && (
        <InboxPagination
          {...pagination}
          label={`${section.entity.title} scenes pagination`}
          pageSize={size}
          changePage={setPage}
          changeSize={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
