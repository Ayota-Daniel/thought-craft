import { PlotBoard } from '../plot/plot-board';
import type { PlotService } from '../../application/plot-service';
import { useEffect, useState } from 'react';
import type { Entity } from '../../domain/entity';
import {
  storyEnabled,
  type StoryOrigin,
  type StorySection,
  type StoryType,
} from '../../application/story-query';
import type { BoardServices } from '../brainstorm/board-services';
import { WorkspaceSwitcher } from '../workspaces/workspace-switcher';
import { WorkspaceTabs } from '../shared/workspace-tabs';
import { StoryNavigation } from './story-navigation';
import { StoryOverview } from './story-overview';
import { StoryCollection } from './story-collection';
import { StorySetupNotice } from './story-setup-notice';

export interface StoryCommands {
  inbox: () => void;
  brainstorm: () => void;
  manageWorkspaces: () => void;
  manageTypes: (id: string) => void;
  open: (id: string, origin: StoryOrigin) => void;
  write: (id: string) => void;
  create: (type: StoryType, origin: StoryOrigin) => void;
  add: (id: string) => void;
  trash: (id: string) => void;
  modifiedAt: (entity: Entity) => number | undefined;
  guide: () => void;
  plotGuide: () => void;
  threadGuide: () => void;
  createPlot: (
    type: 'scene' | 'story-section',
    origin: StoryOrigin,
    sectionId: string | null,
  ) => void;
  renameSection: (id: string) => void;
  chooseSection: (id: string) => void;
}

export function StoryApp({
  services,
  plotService,
  commands,
  section,
  navigate,
}: {
  services: BoardServices;
  plotService: PlotService;
  commands: StoryCommands;
  section: StorySection;
  navigate: (section: StorySection) => void;
}) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const stops = [services.index, services.types, services.workspaces].map((service) =>
      service.subscribe(() => refresh((version) => version + 1)),
    );
    return () => stops.forEach((stop) => stop());
  }, [services]);
  const workspace = services.workspaces.getActive();
  const enabled = storyEnabled(workspace);
  const entities = services.index.getAll();
  const origin = { workspaceId: workspace.id, section };
  const available = services.workspaces.getAvailableEntityTypes(workspace.id, services.types);
  return (
    <div
      className="tc-inbox tc-story"
      id="tc-story-panel"
      role={enabled ? 'tabpanel' : undefined}
      aria-labelledby={enabled ? 'tc-story-story-tab' : undefined}
    >
      <WorkspaceSwitcher workspaces={services.workspaces} manage={commands.manageWorkspaces} />
      <WorkspaceTabs
        active="Story"
        inbox={commands.inbox}
        brainstorm={commands.brainstorm}
        story={enabled ? () => undefined : undefined}
      />
      {enabled ? (
        <>
          <header className="tc-story-header">
            <div>
              <span className="tc-eyebrow">Story</span>
              <h1>{workspace.label}</h1>
            </div>
            <button onClick={commands.guide}>Guide</button>
          </header>
          <StoryNavigation section={section} navigate={navigate} />
          {section === 'overview' ? (
            <StoryOverview
              entities={entities}
              workspaceId={workspace.id}
              canCreateScene={available.some((type) => type.id === 'scene')}
              createScene={() =>
                commands.create('scene', { workspaceId: workspace.id, section: 'scene' })
              }
              write={commands.write}
              modifiedAt={commands.modifiedAt}
              navigate={navigate}
              brainstorm={commands.brainstorm}
            />
          ) : section === 'plot' ? (
            <PlotBoard
              key={`plot:${workspace.id}`}
              index={services.index}
              workspaceId={workspace.id}
              service={plotService}
              writer={services.writer}
              canCreateThread={available.some((type) => type.id === 'plot-thread')}
              canCreateScene={available.some((type) => type.id === 'scene')}
              canCreateSection={available.some((type) => type.id === 'story-section')}
              commands={{
                create: (type, sectionId) => commands.createPlot(type, origin, sectionId),
                focus: (id) => commands.open(id, origin),
                write: commands.write,
                rename: commands.renameSection,
                chooseSection: commands.chooseSection,
                guide: commands.plotGuide,
                threadGuide: commands.threadGuide,
                createThread: () => commands.create('plot-thread', origin),
              }}
            />
          ) : (
            <StoryCollection
              key={`${workspace.id}:${section}`}
              entities={entities}
              workspaceId={workspace.id}
              workspaceLabel={workspace.label}
              type={section}
              typeLabel={services.types.label(section)}
              available={Boolean(
                services.types.get(section) && !services.types.get(section)?.retired,
              )}
              enabled={workspace.enabledEntityTypeIds.includes(section)}
              create={() => commands.create(section, origin)}
              open={(id) => commands.open(id, origin)}
              add={commands.add}
              trash={commands.trash}
              manageTypes={() => commands.manageTypes(section)}
            />
          )}
          <StorySetupNotice
            key={workspace.id}
            workspaceId={workspace.id}
            workspaces={services.workspaces}
            types={services.types}
            manageTypes={commands.manageTypes}
          />
        </>
      ) : (
        <section className="tc-empty">
          <h1>Story is not enabled in {workspace.label}.</h1>
          <p>
            Enable Story in Manage workspaces. Your notes and board stay available in Inbox and
            Brainstorm.
          </p>
          <button onClick={commands.manageWorkspaces}>Manage workspaces</button>
        </section>
      )}
    </div>
  );
}
