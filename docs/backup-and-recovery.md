# Backup and recovery

Back up **the whole vault**, including its active configuration folder, before installing or updating a candidate. Close Obsidian while making a consistent copy. Keep the backup outside the working vault, and test restoration on a copy first.

## What to preserve

| Data | Actual location |
| --- | --- |
| Entity content, UUIDs, custom values, source-owned relations, Scene/Section ranks | Markdown notes wherever you placed them in the vault, including folders outside Brainstorm |
| Global type/property schemas, Workspace definitions and enabled types/experiences | `<configDir>/plugins/thought-craft/data.json` |
| Brainstorm positions/groups/viewports and active Workspace | The same `data.json` |
| Installed plugin build | `<configDir>/plugins/thought-craft/{main.js,manifest.json,styles.css}` |
| Enabled plugins and other vault preferences | Other files in the active configuration folder |

`configDir` normally means `.obsidian`, but it can be overridden. Check **Settings → Files and links → Override config folder** and show hidden folders in your file manager. Plugin data is saved through Obsidian’s `loadData`/`saveData`; runtime code does not invent an absolute `.obsidian` path. Obsidian exposes the active path as `app.vault.configDir`. See the official [configuration-folder guide](https://obsidian.md/help/configuration-folder) and [Vault API](https://docs.obsidian.md/Reference/TypeScript%2BAPI/App/vault).

Do not back up only `Brainstorm/Ideas`: other entity folders and configuration matter. Notes alone retain their Markdown and identity, but lost configuration can make custom schemas, Workspace labels and board organization unavailable. The installed binaries alone do not back up your work.

## Restore safely

1. Close Obsidian and make a second copy of the current state, even if it appears damaged.
2. Restore the chosen vault snapshot **and its matching configuration** into a separate folder. Use its correct configuration-folder override.
3. Restore the three compatible plugin files without deleting the backed-up `data.json`. Do not replace configuration with files from the RC1 archive; that archive intentionally contains no user settings.
4. Open the copied vault. Enable Thought Craft if needed. Check Inbox, custom types/properties, Workspace definitions, Brainstorm placement, Plot order and Thread membership.
5. Inspect the underlying Markdown for a few important entities. Only replace the working vault after you are satisfied with the recovery.

Copying notes as independent entities requires new UUIDs. Two files with the same `bs_id` represent the same identity to Thoughtcraft; do not resolve a duplicate by casually changing referenced UUIDs. Keep the originals while investigating.

## When an operation fails

- **Partial Thread removal:** two opposite Related to links may require two writes. The error counts removals with confirmed refresh. The surviving link still represents membership. Review it in Focus, then use Remove again; the operation refreshes the current endpoints before retrying. No note is deleted by removing membership.
- **Uncertain read-back:** a write may have succeeded although the following read failed. Inspect/reopen the Markdown note and resolve the filesystem/read issue before retrying. Do not repeatedly create replacement entities. A fresh membership action rereads both notes; duplicate edges are rejected.
- **Malformed metadata:** keep a copy, inspect `bs_relations` or `bs_story` in Markdown and repair the malformed container explicitly. The plugin does not silently overwrite that container or assign a missing Section.
- **Missing or moved notes:** a normal native move keeps UUID-based links. A deleted target leaves a readable unavailable reference; restore the original UUID if the deletion was accidental, or remove the specific relation explicitly.
- **External concurrent edits:** let pending edits/save operations settle and review the latest note. Stale edits are rejected rather than automatically replacing newer data. Avoid simultaneous structural edits from multiple processes.

There are no cross-note transactions, guaranteed rollback, automatic backup engine or global history/undo. Backup notes and configuration together rather than relying on undo or filesystem synchronization as a backup.
