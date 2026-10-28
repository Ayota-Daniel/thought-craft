# Thought Craft — M1

An Obsidian community plugin that captures ideas as real Markdown notes, lists them in a live Inbox, and opens a Focus View with local custom properties. Only `Idea` is implemented. Markdown remains the source of truth.

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
6. The Inbox opens after capture. Click a row to open the idea in **Thought Craft focus**. Use **Open Markdown note** to edit the same real file with Obsidian's native editor. The ribbon button and **Thought Craft: Open inbox** command also open the Inbox.

After rebuilding, run `install:dev` again and disable/re-enable Thought Craft in the test vault, or restart Obsidian. The watch build does not automatically copy files or reload Obsidian.

Assign an optional shortcut in **Settings → Hotkeys → Thought Craft: Capture idea**. M0 does not claim a global shortcut by default.

## Settings

Thought Craft has only two settings:

| Setting           | Default            | Purpose                                                                      |
| ----------------- | ------------------ | ---------------------------------------------------------------------------- |
| Idea folder       | `Brainstorm/Ideas` | Vault-relative destination for new ideas; created recursively when necessary |
| Default workspace | `default`          | Workspace identifier written onto new notes                                  |

Use **Save** after editing settings. Invalid or absolute folder paths are rejected. Changing settings does not move existing notes. The Inbox includes valid inbox ideas throughout the vault, across workspaces; it is not limited to the capture folder.

Settings use Obsidian's `loadData` / `saveData` APIs. `data.json` contains these two settings only, never entities or their content.

## Markdown format

```yaml
---
bs_id: 'ca829f16-35b0-4e68-857b-d54cfc73caed'
bs_type: idea
bs_workspace: default
bs_status: inbox
bs_created: '2026-10-28T09:15:00.000Z'
bs_updated: '2026-10-28T09:15:00.000Z'
bs_properties:
  originality:
    label: Originality
    type: rating
    value: 4
    max: 5
  tone:
    label: Tone
    type: select
    value: melancholic
    options:
      - melancholic
      - hopeful
      - dark
---
An idea with ordinary Markdown content.
```

The UUID is identity. Renaming or moving the note changes its path and display title, not its UUID. The title follows the current filename; capture derives that filename from the first meaningful input line and makes it safe across common filesystems. Conflicting names get `(2)`, `(3)`, and so on.

The supported statuses are `inbox`, `exploring`, and `archived`. Capture writes `inbox`; manually editing `bs_status` moves a note into or out of the Inbox. Invalid identity metadata, unsupported entity types and missing UUIDs are ignored without rewriting the files. Date fields must be ISO timestamp strings. A successful custom-property mutation updates `bs_updated`; unrelated external Markdown edits do not rewrite that field.

For notes created outside the plugin, use all six metadata fields and a unique UUID. Two notes with the same UUID represent the same entity; its index entry follows the latest observed file path. Give a copy a fresh UUID to treat it as a separate idea. Thought Craft does not rewrite IDs in external files.

## Focus and local properties

Focus prioritizes the note content, with a secondary property inspector. Its preview is rendered by Obsidian's native `MarkdownRenderer`, using content read from the real file. **Open Markdown note** provides editing in a native Markdown tab. Focus refreshes when that file is edited externally or in Obsidian. It stores only the entity UUID in Obsidian's workspace layout so the same Focus tab can be restored after a rename or restart.

Click **+ Add property**, enter a name, and choose one of these five types:

| Type    | Initial value    | Rules / editor                                                                 |
| ------- | ---------------- | ------------------------------------------------------------------------------ |
| Text    | Empty text       | Single-line text input                                                         |
| Number  | `0`              | Any finite number, including negative and decimal values                       |
| Rating  | `0`, maximum `5` | Whole-number value from 0 through the configured positive whole-number maximum |
| Boolean | `false`          | Checkbox                                                                       |
| Select  | First option     | Dropdown; requires distinct, non-empty options                                 |

Select options are entered one per line in the Add Property dialog. Rating maximum can be specified there. The property belongs only to the current entity. Its key is generated from the label in snake case; duplicate keys receive `_2`, `_3`, etc. Labels and keys are separate: external label edits do not change identity.

Text, number and rating inputs commit on **Enter** or **blur**; **Escape** discards the local draft. Boolean and select controls save on change. The inspector shows save errors inline. A stale draft cannot overwrite a property changed elsewhere: discard the draft to review the current value before trying again. **Remove** opens a small inline confirmation and deletes only the selected property definition.

The `bs_properties` format above is the same nested mapping used for every type. Text, number and boolean definitions contain `label`, `type`, and `value`; rating adds `max`; select adds `options`. No schemas, parallel JSON entity storage, or database are introduced.

Invalid custom-property definitions are reported in Focus and retained verbatim in frontmatter. Valid neighboring properties remain editable. A malformed `bs_properties` container is never silently replaced; repair it in the Markdown note before making property changes. Unknown keys inside valid definitions are preserved on value updates.

## Architecture

```text
src/
  main.ts                                   Plugin lifecycle and Obsidian events
  domain/
    entity.ts                               Readonly Entity and M0 status model
    custom-property.ts                      Five typed local properties and validation
    entity-type.ts                          Idea only
    workspace.ts                            Workspace identifier only
  application/
    capture-idea.ts                          Validate input, generate UUID and timestamp
    open-entity.ts                           Resolve identity to current note path
    entity-properties.ts                     Property write intentions accepted by the repository
  infrastructure/
    frontmatter-mapper.ts                    Validate/read bs_ metadata; write bs_ fields
    property-mapper.ts                       Parse, serialize and mutate individual definitions
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
    focus/focus-view.tsx                     UUID view state and native Markdown rendering
    focus/property-inspector.tsx             Metadata and custom-property inspector
    focus/property-editor.tsx                Semantic editors and commit-based drafts
    focus/add-property-modal.ts              Lightweight name/type/options dialog
```

### Decisions

- **Markdown is authoritative.** There is no database, entity JSON file, migration system or service. Disabling/uninstalling the plugin leaves readable notes.
- **Frontmatter uses the host API.** New files begin with an empty frontmatter envelope. `FileManager.processFrontMatter()` adds the metadata, preserving the Markdown body, including user input that itself contains `---` and YAML-looking text. If this API fails, the original text remains in the created file and the capture modal reports its recovery path.
- **The index is a projection.** It remains a simple UUID-keyed map. Entities now include parsed properties and property issues. Changes notify Inbox and Focus; the initial scan also announces readiness so a restored Focus tab can distinguish loading from a missing entity.
- **Initialization waits for layout-ready.** Event handlers are attached after layout initialization, then Markdown notes are read in small asynchronous batches. This avoids treating initialization `create` events as new captures.
- **External changes use Vault events.** Create/modify read the current file via the Vault API and parse frontmatter using Obsidian's parser. Delete removes the path; rename updates paths and titles without generating new IDs. Folder operations use path boundaries so `Ideas` never matches `Ideas2`.
- **Stale reads cannot resurrect renamed/deleted files.** Per-path revisions plus current-file checks reject obsolete asynchronous read results. All Vault listeners use `registerEvent`; repository and React cleanup are registered with the plugin lifecycle.
- **Small, native UI.** Capture and Add Property use `Modal`; Inbox and Focus use `ItemView`. Focus renders the real note through `MarkdownRenderer`; its React inspector receives typed domain data, never raw YAML or a parallel Markdown body. The native Markdown editor handles content editing.
- **Narrow, safe mutations.** Each property operation re-resolves the UUID to its current file, checks the file identity inside `processFrontMatter()`, and edits only the target definition and `bs_updated`. A small per-entity write queue serializes local intents. Updates/removals compare the current definition with the one the editor saw, rejecting conflicting external changes instead of overwriting them. The mapper retains unrelated frontmatter and unsupported definitions.
- **Readability.** Touched M1 modules and tests use consistent formatting and descriptive helpers. Prettier is available as `npm run format -- <files>` for further changes; existing modules are not reorganized into a new architecture.

The integration follows the [official Obsidian API](https://github.com/obsidianmd/obsidian-api) and the bundling pattern in the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).

## Real Obsidian integration check

```sh
npm run test:obsidian
npm run test:obsidian:m1
```

These opt-in Linux checks open a **real Obsidian process**, using isolated application profiles and disposable vaults under `.artifacts/`. They enable only the locally built plugin. The M0 regression check covers capture, actual notes and synchronization; the M1 check exercises Focus, all five property editors, frontmatter/body preservation, external changes, rename, property removal, missing files and restart. Neither uses your normal Obsidian profile or vaults. Each closes its own test process after the run. A Linux desktop session is required.

Default executable paths are `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`. Override them with `OBSIDIAN_ELECTRON` and `OBSIDIAN_APP` if necessary. No browser download is needed: Playwright connects to the test process's local debugging endpoint. Tests require permission to launch an application and use loopback networking. See [M0 validation](docs/m0-validation.md) and [M1 validation](docs/m1-validation.md) for results and manual checklists.

## M1 limitations and later milestones

Focus shows a native Markdown preview; body editing uses the native editor tab. Properties are local to one entity. Changing labels, types, rating maxima, option lists or their order after creation currently requires editing the real frontmatter. A text property uses a single-line editor. Unsupported/malformed definitions are preserved but cannot be edited through the inspector. Other platforms and older Obsidian versions require separate validation.

Additional entity types, reusable schemas, relations, formulas, evaluation profiles, boards and project management remain future milestones. M1 does not implement them.

## Files added

- Plugin source and scoped UI styles: `src/**`, `styles.css`.
- Manifest and compatibility metadata: `manifest.json`, `versions.json`.
- Tooling: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`.
- Focused unit tests: `tests/*.test.ts`.
- Development installation and real-app checks: `scripts/install-dev.mjs`, `scripts/smoke-obsidian.mjs`, `scripts/smoke-m1.mjs`.
- Documentation: this README, `docs/m0-validation.md`, `docs/m1-validation.md`.
- Generated local artifacts: `main.js` and ignored `.artifacts/` evidence. These are not source files.
