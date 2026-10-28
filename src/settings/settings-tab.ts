import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import type ThoughtCraftPlugin from '../main';
import { validateSettings } from './settings';

export class ThoughtCraftSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: ThoughtCraftPlugin,
  ) {
    super(app, plugin);
  }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Entity types and reusable properties')
      .setDesc('Manage global definitions for this vault. Entity values remain in Markdown.')
      .addButton((button) =>
        button.setButtonText('Manage entity types').onClick(() => {
          this.plugin.openTypeManager();
        }),
      );
    let folder = this.plugin.settings.entitiesFolder;
    new Setting(this.containerEl)
      .setName('Idea folder')
      .setDesc('Vault-relative folder for newly captured ideas. Existing notes stay in place.')
      .addText((text) =>
        text
          .setValue(folder)
          .setPlaceholder('Brainstorm/Ideas')
          .onChange((value) => {
            folder = value;
          }),
      );
    new Setting(this.containerEl)
      .setName('Workspaces')
      .setDesc(`Capture uses the active workspace: ${this.plugin.workspaces.getActive().label}.`)
      .addButton((button) =>
        button.setButtonText('Manage workspaces').onClick(() => this.plugin.openWorkspaceManager()),
      );
    new Setting(this.containerEl).setName('Save capture settings').addButton((button) =>
      button
        .setButtonText('Save')
        .setCta()
        .onClick(async () => {
          try {
            const settings = validateSettings({
              entitiesFolder: folder,
              defaultWorkspace: this.plugin.settings.defaultWorkspace,
            });
            await this.plugin.updateSettings(settings);
            new Notice('Thought Craft settings saved.');
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : 'Could not save settings.');
          }
        }),
    );
  }
}
