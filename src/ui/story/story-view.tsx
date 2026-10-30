import type { PlotService } from '../../application/plot-service';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { StorySection } from '../../application/story-query';
import type { BoardServices } from '../brainstorm/board-services';
import { StoryApp, type StoryCommands } from './story-app';

export const STORY_VIEW_TYPE = 'thought-craft-story';

export class StoryView extends ItemView {
  private root: Root | null = null;
  private sections = new Map<string, StorySection>();
  private unsubscribe: (() => void) | null = null;
  constructor(
    leaf: WorkspaceLeaf,
    private services: BoardServices,
    private commands: StoryCommands,
    private plotService: PlotService,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return STORY_VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Thought Craft story';
  }
  getIcon(): string {
    return 'book-open';
  }
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tc-inbox-container');
    this.root = createRoot(this.contentEl);
    this.unsubscribe = this.services.workspaces.subscribe(() => this.renderStory());
    this.renderStory();
  }
  navigate(section: StorySection): void {
    this.sections.set(this.services.workspaces.getActive().id, section);
    this.renderStory();
  }
  private renderStory(): void {
    const workspaceId = this.services.workspaces.getActive().id;
    this.root?.render(
      <StoryApp
        services={this.services}
        plotService={this.plotService}
        commands={this.commands}
        section={this.sections.get(workspaceId) ?? 'overview'}
        navigate={(section) => this.navigate(section)}
      />,
    );
  }
  async onClose(): Promise<void> {
    this.disposeStory();
  }
  disposeStory(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.unmount();
    this.root = null;
  }
}
