import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import type ThoughtCraftPlugin from '../main';
import { validateSettings } from './settings';

export class ThoughtCraftSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: ThoughtCraftPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    let folder = this.plugin.settings.entitiesFolder;
    let workspace = this.plugin.settings.defaultWorkspace;
    new Setting(this.containerEl).setName('Idea folder').setDesc('Vault-relative folder for newly captured ideas. Existing notes stay in place.')
      .addText((text) => text.setValue(folder).setPlaceholder('Brainstorm/Ideas').onChange((value) => { folder = value; }));
    new Setting(this.containerEl).setName('Default workspace').setDesc('Workspace identifier attached to new ideas.')
      .addText((text) => text.setValue(workspace).setPlaceholder('default').onChange((value) => { workspace = value; }));
    new Setting(this.containerEl).setName('Save capture settings').addButton((button) => button.setButtonText('Save').setCta().onClick(async () => {
      try {
        const settings = validateSettings({ entitiesFolder: folder, defaultWorkspace: workspace });
        await this.plugin.updateSettings(settings);
        new Notice('Thought Craft settings saved.');
        this.display();
      } catch (error) { new Notice(error instanceof Error ? error.message : 'Could not save settings.'); }
    }));
  }
}
