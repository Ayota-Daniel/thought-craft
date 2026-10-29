import { renderCanvasControls } from './canvas-controls';
import { Modal, type App } from 'obsidian';
import { GUIDE_TOPICS, RELATION_GUIDE, type GuideTopic } from './guide-content';

export class ThoughtcraftGuide extends Modal {
  constructor(
    app: App,
    private topic: GuideTopic = 'Getting started',
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText('Thoughtcraft Guide');
    this.modalEl.addClass('tc-guide-modal');
    const nav = this.contentEl.createEl('nav', { attr: { 'aria-label': 'Guide topics' } });
    const body = this.contentEl.createEl('section', { attr: { 'aria-live': 'polite' } });
    const render = (topic: GuideTopic) => {
      body.empty();
      body.createEl('h2', { text: topic });
      body.createEl('p', { text: GUIDE_TOPICS[topic] });
      if (topic === 'Brainstorm') {
        body.createEl('h3', { text: 'Canvas controls' });
        renderCanvasControls(body);
      }
      if (topic === 'Relations') {
        for (const relation of RELATION_GUIDE) {
          body.createEl('h3', { text: relation.label });
          body.createEl('p', { text: relation.meaning });
          body.createEl('p', { text: relation.example, cls: 'tc-inspector-hint' });
        }
        body.createEl('p', {
          text: 'Workspace-specific relation meanings come from your own definitions. Choose a kind valid for both entity types.',
        });
      }
      nav
        .querySelectorAll('button')
        .forEach((button) =>
          button.setAttribute('aria-current', button.textContent === topic ? 'page' : 'false'),
        );
    };
    for (const topic of Object.keys(GUIDE_TOPICS) as GuideTopic[]) {
      nav
        .createEl('button', { text: topic, attr: { type: 'button' } })
        .addEventListener('click', () => render(topic));
    }
    render(this.topic);
    nav.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

export function addRelationHelp(container: HTMLElement, app: App): void {
  container
    .createEl('button', {
      text: 'What do these relations mean?',
      attr: { type: 'button' },
      cls: 'tc-guide-link',
    })
    .addEventListener('click', (event) => {
      event.preventDefault();
      new ThoughtcraftGuide(app, 'Relations').open();
    });
}
