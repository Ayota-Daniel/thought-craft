# Thought Craft — M0

An Obsidian community plugin that captures ideas as real Markdown notes and lists them in a live Inbox. This is the first vertical slice of the Entity + Workspace + View product. Only `Idea` is implemented.

## Develop

Requires Node.js 22 or later and npm.

```sh
npm install
npm run dev          # esbuild watch mode, with inline source maps
npm run build        # strict TypeScript check + production main.js
npm run lint
npm test             # focused Vitest unit tests, no Obsidian mock runtime
npm run check        # build, lint and tests
```

The release/install files are `main.js`, `manifest.json`, and `styles.css`. React is bundled into `main.js`; Obsidian's runtime API is external. Neither Node.js nor npm is needed by the installed plugin.

## Install in a development vault

Use a separate test vault while developing.

1. Create or choose an existing test vault in Obsidian.
2. Build the plugin and copy its three install files:

   ```sh
   npm run build
   npm run install:dev -- /absolute/path/to/test-vault
   ```

   The helper writes only to `.obsidian/plugins/thought-craft/` in the supplied vault. It preserves existing plugin settings.
3. In that vault, open **Settings → Community plugins**, allow community plugins if required, and enable **Thought Craft**.
4. Run **Thought Craft: Capture idea** from the Command Palette.
5. Write an idea. **Enter** captures it, **Shift+Enter** adds a line, and **Escape** closes the modal.
6. The Inbox opens after capture. Click a row to open the real note in a Markdown tab. The ribbon button and **Thought Craft: Open inbox** command also open the Inbox.

After rebuilding, run `install:dev` again and disable/re-enable Thought Craft in the test vault, or restart Obsidian. The watch build does not automatically copy files or reload Obsidian.

Assign an optional shortcut in **Settings → Hotkeys → Thought Craft: Capture idea**. M0 does not claim a global shortcut by default.

## Settings

Thought Craft has only two settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| Idea folder | `Brainstorm/Ideas` | Vault-relative destination for new ideas; created recursively when necessary |
| Default workspace | `default` | Workspace identifier written onto new notes |

Use **Save** after editing settings. Invalid or absolute folder paths are rejected. Changing settings does not move existing notes. The Inbox includes valid inbox ideas throughout the vault, across workspaces; it is not limited to the capture folder.

Settings use Obsidian's `loadData` / `saveData` APIs. `data.json` contains these two settings only, never entities or their content.

## Markdown format

```yaml
---
bs_id: "ca829f16-35b0-4e68-857b-d54cfc73caed"
bs_type: idea
bs_workspace: default
bs_status: inbox
bs_created: "2026-10-28T09:15:00.000Z"
bs_updated: "2026-10-28T09:15:00.000Z"
---

An idea with ordinary Markdown content.
```

The UUID is identity. Renaming or moving the note changes its path and display title, not its UUID. The title follows the current filename; capture derives that filename from the first meaningful input line and makes it safe across common filesystems. Conflicting names get `(2)`, `(3)`, and so on.

The supported statuses are `inbox`, `exploring`, and `archived`. M0 writes `inbox`; manually editing `bs_status` moves a note into or out of the Inbox. Invalid metadata, unsupported types and missing UUIDs are ignored without rewriting the files. Date fields must be ISO timestamp strings. Existing user properties outside `bs_` are preserved. M0 does not automatically rewrite `bs_updated` on unrelated edits.

For notes created outside the plugin, use all six metadata fields and a unique UUID. Two notes with the same UUID represent the same entity; its index entry follows the latest observed file path. Give a copy a fresh UUID to treat it as a separate idea. M0 does not rewrite IDs in external files.

## Architecture

```text
src/
  main.ts                                   Plugin lifecycle and Obsidian events
  domain/
    entity.ts                               Readonly Entity and M0 status model
    entity-type.ts                          Idea only
    workspace.ts                            Workspace identifier only
  application/
    capture-idea.ts                          Validate input, generate UUID and timestamp
    open-entity.ts                           Resolve identity to current note path
  infrastructure/
    frontmatter-mapper.ts                    Validate/read bs_ metadata; write bs_ fields
    obsidian-entity-repository.ts             Vault reads/writes and synchronization
    entity-index.ts                          Disposable observable in-memory projection
  settings/
    settings.ts                             Defaults, validation, persisted-settings parsing
    settings-tab.ts                          Two-field native settings screen
  shared/
    note-path.ts                            Pure title, filename and path logic
  ui/
    capture/quick-capture-modal.ts            Native Obsidian modal and keyboard behavior
    inbox/inbox.tsx                          React rows subscribed to EntityIndex
    inbox/inbox-view.tsx                     Obsidian ItemView / React lifecycle
```

### Decisions

- **Markdown is authoritative.** There is no database, entity JSON file, migration system or service. Disabling/uninstalling the plugin leaves readable notes.
- **Frontmatter uses the host API.** New files begin with an empty frontmatter envelope. `FileManager.processFrontMatter()` adds the metadata, preserving the Markdown body, including user input that itself contains `---` and YAML-looking text. If this API fails, the original text remains in the created file and the capture modal reports its recovery path.
- **The index is a projection.** It is keyed by UUID and publishes stable immutable snapshots for React's `useSyncExternalStore`. A successful capture inserts its entity immediately. It does not wait for metadata-cache analysis.
- **Initialization waits for layout-ready.** Event handlers are attached after layout initialization, then Markdown notes are read in small asynchronous batches. This avoids treating initialization `create` events as new captures.
- **External changes use Vault events.** Create/modify read the current file via the Vault API and parse frontmatter using Obsidian's parser. Delete removes the path; rename updates paths and titles without generating new IDs. Folder operations use path boundaries so `Ideas` never matches `Ideas2`.
- **Stale reads cannot resurrect renamed/deleted files.** Per-path revisions plus current-file checks reject obsolete asynchronous read results. All Vault listeners use `registerEvent`; repository and React cleanup are registered with the plugin lifecycle.
- **Small, native UI.** Capture uses `Modal`; Inbox uses `ItemView` plus React. Theme variables, restrained typography and row separators follow the validated Trame direction. The native Markdown editor handles note editing. There is no separate Focus editor in M0.
- **No M1 abstractions.** Custom properties, relation engines, evaluation profiles, Story Board, graph, project conversion and workspace management are intentionally outside this milestone.

The integration follows the [official Obsidian API](https://github.com/obsidianmd/obsidian-api) and the bundling pattern in the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).

## Real Obsidian integration check

```sh
npm run test:obsidian
```

This opt-in Linux smoke test opens a **real Obsidian process**, using an isolated application profile and a disposable vault under `.artifacts/`. It enables only the locally built plugin. It drives the Command Palette and Quick Capture UI, verifies note contents on disk, exercises external file changes, and restarts Obsidian to verify reconstruction. It does not read or edit your normal Obsidian profile or vaults. It closes its own test process after the run. A Linux desktop session is required.

Default executable paths are `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`. Override them with `OBSIDIAN_ELECTRON` and `OBSIDIAN_APP` if necessary. No browser download is needed: Playwright connects to that test process's local debugging endpoint. The test requires permission to launch an application and use loopback networking. Other platforms can follow the manual checklist in [docs/m0-validation.md](docs/m0-validation.md).

## Files added

- Plugin source and scoped UI styles: `src/**`, `styles.css`.
- Manifest and compatibility metadata: `manifest.json`, `versions.json`.
- Tooling: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`.
- Focused unit tests: `tests/*.test.ts`.
- Development installation and real-app check: `scripts/install-dev.mjs`, `scripts/smoke-obsidian.mjs`.
- Documentation: this README and `docs/m0-validation.md`.
- Generated local artifacts: `main.js` and ignored `.artifacts/` evidence. These are not source files.
