import {
  projectPlotThreads,
  setThreadMembership,
  threadAssociations,
} from '../../application/plot-threads';
import type { EntityRelationWriter } from '../../application/entity-relations';
import { PlotThreadPanel } from './plot-thread-panel';
import { useEffect, useRef, useState } from 'react';
import type { Entity } from '../../domain/entity';
import type { EntityIndex } from '../../infrastructure/entity-index';
import { projectPlot } from '../../application/plot-query';
import type { PlotService } from '../../application/plot-service';
import { paginateInbox, type InboxPageSize } from '../../application/inbox-pagination';
import { InboxPagination } from '../inbox/inbox-pagination';
import { PlotSceneCard } from './plot-scene-card';
import { PlotSection } from './plot-section';
import { usePlotDrag } from './use-plot-drag';
import { showSceneMenu, showSectionMenu } from './plot-menus';

export interface PlotCommands {
  create: (type: 'scene' | 'story-section', sectionId: string | null) => void;
  focus: (id: string) => void;
  write: (id: string) => void;
  rename: (id: string) => void;
  chooseSection: (sceneId: string) => void;
  guide: () => void;
  threadGuide: () => void;
  createThread: () => void;
}

export function PlotBoard({
  index,
  workspaceId,
  service,
  commands,
  canCreateScene,
  canCreateSection,
  canCreateThread,
  writer,
}: {
  index: EntityIndex;
  workspaceId: string;
  service: PlotService;
  commands: PlotCommands;
  canCreateScene: boolean;
  canCreateSection: boolean;
  canCreateThread: boolean;
  writer: EntityRelationWriter;
}) {
  const membershipTrigger = useRef<HTMLButtonElement | null>(null);
  const saving = useRef(false);
  const [threadIds, setThreadIds] = useState<string[]>([]);
  const [threadMode, setThreadMode] = useState<'highlight' | 'filter'>('highlight');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [threadsExpanded, setThreadsExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<InboxPageSize>(25);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const plot = projectPlot(index, workspaceId);
  const threads = projectPlotThreads(index, workspaceId);
  const activeThreads = threads.filter(({ entity }) => threadIds.includes(entity.id));
  const activeIds = activeThreads.map(({ entity }) => entity.id);
  const filtering = threadMode === 'filter' && activeIds.length > 0;
  const memberships = (scene: Entity) =>
    threads
      .filter(({ entity }) => threadAssociations(scene, entity).length)
      .map(({ entity }) => entity);
  const matchesThread = (scene: Entity) =>
    activeThreads.some(({ entity }) => threadAssociations(scene, entity).length);
  const visible = (scene: Entity) => !filtering || matchesThread(scene);
  const highlighted = (scene: Entity) => activeIds.length > 0 && matchesThread(scene);
  const editingScene = editingSceneId ? index.getById(editingSceneId) : undefined;
  const matches = plot.unplaced
    .filter(({ entity }) => visible(entity))
    .filter(({ entity }) =>
      entity.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    );
  const pagination = paginateInbox(matches, page, size);
  useEffect(() => setPage(pagination.page), [pagination.page]);
  async function run(operation: () => Promise<void>, narrative = true): Promise<void> {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    setStatus(narrative ? 'Saving narrative order…' : 'Saving thread associations…');
    try {
      await operation();
      setStatus(narrative ? 'Plot saved.' : 'Thread associations saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save Plot.');
      setStatus('');
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const drag = usePlotDrag((item, target) => {
    void run(() =>
      item.kind === 'scene'
        ? service.moveScene(workspaceId, item.id, target.sectionId, target.beforeId)
        : service.reorderSection(workspaceId, item.id, target.beforeId),
    );
  }, pending);
  function sceneMenu(entity: Entity, button: HTMLButtonElement): void {
    showSceneMenu(entity, plot, button, {
      write: () => commands.write(entity.id),
      focus: () => commands.focus(entity.id),
      chooseSection: () => commands.chooseSection(entity.id),
      threads: () => {
        membershipTrigger.current = button;
        setEditingSceneId(entity.id);
        setThreadsExpanded(true);
      },
      move: (sectionId, beforeId = null) => {
        void run(() => service.moveScene(workspaceId, entity.id, sectionId, beforeId));
      },
    });
  }
  const unplacedTarget = { kind: 'scene' as const, sectionId: null, beforeId: null };
  const sectionsEnd = { kind: 'section' as const, sectionId: null, beforeId: null };
  return (
    <section className="tc-plot" aria-label="Plot Board" aria-busy={pending}>
      <header className="tc-plot-toolbar">
        <h2>Plot</h2>
        <button onClick={commands.guide}>Plot guide</button>
        <button
          disabled={!canCreateSection || pending}
          onClick={() => commands.create('story-section', null)}
        >
          + Story Section
        </button>
      </header>
      <p className="tc-inspector-hint">
        Narrative order. Select a scene; double-click or Write to use Markdown. Actions offer
        keyboard movement.
      </p>
      <p role="status" className="tc-plot-status">
        {status}
      </p>
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
      <PlotThreadPanel
        threads={threads}
        selected={activeIds}
        select={setThreadIds}
        mode={threadMode}
        changeMode={setThreadMode}
        scene={editingScene?.type === 'scene' ? editingScene : undefined}
        finishEditing={() => {
          setEditingSceneId(null);
          membershipTrigger.current?.focus();
        }}
        pending={pending}
        membership={(threadId, associated) => {
          if (editingScene)
            void run(
              () =>
                setThreadMembership(
                  index,
                  writer,
                  workspaceId,
                  editingScene.id,
                  threadId,
                  associated,
                ),
              false,
            );
        }}
        focus={commands.focus}
        write={commands.write}
        create={commands.createThread}
        canCreate={canCreateThread}
        guide={commands.threadGuide}
        expanded={threadsExpanded}
        expand={setThreadsExpanded}
      />
      {activeIds.length > 0 && (
        <p className="tc-inspector-hint" role="status">
          {filtering
            ? 'Filtering: non-matching scenes are hidden. '
            : 'Highlighting: all scenes remain visible. '}
          {activeIds.length} selected {activeIds.length === 1 ? 'thread' : 'threads'}.
          <button onClick={() => setThreadIds([])}>Show full Plot</button>
        </p>
      )}
      <label className="tc-plot-search">
        <span className="tc-visually-hidden">Search Plot scenes</span>
        <input
          type="search"
          placeholder="Search scene titles…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <section
        aria-label="Unplaced scenes"
        className={`tc-plot-unplaced${drag.isOver(unplacedTarget) ? ' is-drag-over' : ''}`}
        {...drag.target(unplacedTarget)}
      >
        <header className="tc-plot-section-header">
          <h3>
            Unplaced <span className="tc-count">{plot.unplaced.length}</span>
          </h3>
          <button
            disabled={!canCreateScene || pending}
            onClick={() => commands.create('scene', null)}
          >
            + Unplaced Scene
          </button>
        </header>
        <ul className="tc-plot-scenes tc-plot-unplaced-scenes">
          {pagination.items.map(({ entity, issue }) => (
            <PlotSceneCard
              key={entity.id}
              entity={entity}
              issue={issue}
              threads={memberships(entity)}
              highlighted={highlighted(entity)}
              relationshipIssue={
                entity.relationIssues.length > 0 ||
                entity.relations.some(
                  (relation) =>
                    relation.type === 'related-to' && !index.getById(relation.targetEntityId),
                )
              }
              sectionId={null}
              selected={selected === entity.id}
              select={() => setSelected(entity.id)}
              write={() => commands.write(entity.id)}
              menu={(button) => sceneMenu(entity, button)}
              drag={drag}
            />
          ))}
        </ul>
        {!pagination.total && (
          <p className="tc-inspector-hint">
            {search.trim() || filtering ? 'No matching unplaced scenes.' : 'No unplaced scenes.'}
          </p>
        )}

        <InboxPagination
          {...pagination}
          label="Unplaced scenes pagination"
          pageSize={size}
          changePage={setPage}
          changeSize={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      </section>
      <div className="tc-plot-narrative">
        <h2>Story sequence</h2>
        {!plot.sections.length && (
          <p className="tc-inspector-hint">
            Create a Story Section, then place scenes into it. No Acts are created automatically.
          </p>
        )}
        {plot.sections.map((section) => (
          <PlotSection
            key={section.entity.id}
            section={section}
            search={search}
            filtering={filtering}
            visible={visible}
            highlighted={highlighted}
            memberships={memberships}
            relationshipIssue={(entity) =>
              entity.relationIssues.length > 0 ||
              entity.relations.some(
                (relation) =>
                  relation.type === 'related-to' && !index.getById(relation.targetEntityId),
              )
            }
            selected={selected}
            select={setSelected}
            write={commands.write}
            sceneMenu={sceneMenu}
            sectionMenu={(entity, button) =>
              showSectionMenu(entity, plot, button, {
                focus: () => commands.focus(entity.id),
                rename: () => commands.rename(entity.id),
                create: () => commands.create('scene', entity.id),
                canCreate: canCreateScene && !pending,
                reorder: (beforeId) => {
                  void run(() => service.reorderSection(workspaceId, entity.id, beforeId));
                },
              })
            }
            create={() => commands.create('scene', section.entity.id)}
            canCreate={canCreateScene && !pending}
            drag={drag}
          />
        ))}
        {plot.sections.length > 1 && (
          <div
            className={`tc-plot-section-end${drag.isOver(sectionsEnd) ? ' is-drag-over' : ''}`}
            {...drag.target(sectionsEnd)}
          >
            {drag.dragging ? 'Drop a Section here to move it to the end.' : ''}
          </div>
        )}
      </div>
    </section>
  );
}
