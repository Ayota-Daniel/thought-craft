# Thought Craft — M2

An Obsidian community plugin built around **Entity + Property + Relation**. Capture ideas, inspect local properties, connect entities by UUID, and create new entities from existing ones. Idea, Character, Scene, Location and Project share the same Focus View. Markdown remains the source of truth.

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

Permanent coding expectations are documented in [AGENTS.md](AGENTS.md). Code and tests are written for human readers; formatting improvements stay local to touched modules.

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

### Entity destinations, without a settings migration

The existing `entitiesFolder` setting remains the **Idea folder**. Other entity types use sibling folders, resolved in one path helper:

| Type      | Default destination     | Initial status |
| --------- | ----------------------- | -------------- |
| Idea      | `Brainstorm/Ideas`      | `inbox`        |
| Character | `Brainstorm/Characters` | `exploring`    |
| Scene     | `Brainstorm/Scenes`     | `exploring`    |
| Location  | `Brainstorm/Locations`  | `exploring`    |
| Project   | `Brainstorm/Projects`   | `exploring`    |

If the Idea folder is `Custom/Captures`, Characters are created in `Custom/Characters`, and so on. If it is a single root folder such as `Ideas`, the other folders are also at the vault root. No existing notes are moved and no settings keys are added. All valid entities are indexed wherever their files live. Inbox continues to list **only Ideas with status `inbox`**; related entities are available through Focus links and relation search.

`exploring` is a compatible generic default for non-Idea entities, not a specialized Character, Scene or Project workflow.

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
bs_relations:
  - id: 'e2c1b5b7-8856-42f4-a958-63ac4944b441'
    type: originated-from
    target_entity_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
    created_at: '2026-10-28T09:15:00.000Z'
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

Text, number and rating inputs commit on **Enter** or **blur**; **Escape** discards the local draft. Boolean and select controls save on change. The inspector shows save errors inline. A stale draft cannot overwrite a property changed elsewhere: discard the draft to review the current value before trying again. **Remove** opens a small inline confirmation and deletes only the selected property definition. All five entity types use these same local properties.

The `bs_properties` format above is the same nested mapping used for every type. Text, number and boolean definitions contain `label`, `type`, and `value`; rating adds `max`; select adds `options`. No schemas, parallel JSON entity storage, or database are introduced.

Invalid custom-property definitions are reported in Focus and retained verbatim in frontmatter. Valid neighboring properties remain editable. A malformed `bs_properties` container is never silently replaced; repair it in the Markdown note before making property changes. Unknown keys inside valid definitions are preserved on value updates.

## Relationships

Focus has a compact **Relationships** section below the local properties. **+ Add relation** opens a searchable target list showing title, type and a short UUID for disambiguation. Choose a target and one of:

- Related to (`related-to`)
- Supports (`supports`)
- Alternative to (`alternative-to`)
- Depends on (`depends-on`)
- Originated from (`originated-from`)

Each relation has its own UUID and timestamp. `target_entity_id` contains an **entity UUID**, never a filename or path. Relations are directed and stored **only on the source note**. Even `related-to` remains a single-source edge in M2: the target does not receive a mirrored YAML entry.

**Outgoing** links open their target in Focus and can be removed with a small confirmation. **Incoming** links are derived by scanning the current EntityIndex; they open the source that owns the relation. Incoming links cannot silently edit another note. Existing Focus tabs are reused by entity UUID.

Renaming either file changes display titles/paths without breaking the relationship. Deleting a target leaves the source's stored relation intact; Focus displays **Unavailable target** until the user removes the edge or restores that UUID. Deleting the source removes its incoming appearances from the index without modifying any target note.

Exact source/type/target duplicates and self-relations are rejected in the domain/repository, including concurrent local additions. A different relation type to the same target is allowed. Malformed, unknown, self-referencing or duplicated external definitions are reported and ignored for display, but remain in the source YAML. A malformed `bs_relations` container must be repaired manually before editing it. Removal checks the relation ID and expected definition, preserving neighboring entries and all unrelated data.

Incoming lookup currently scans the indexed entities and relations. This is an intentional M2 choice for early personal-vault usage, not a scale benchmark. No reverse-edge database or dual entity/path map is maintained.

## Create From

From any Focus View, choose **Create from…**, select any of the five entity types, enter a title and optional initial content, and confirm. Thought Craft:

1. Creates a real Markdown file with a new entity UUID and the selected type.
2. Inherits the source's workspace, even if the default capture workspace is different.
3. Writes one `originated-from` relation on the **new entity**, targeting the original UUID.
4. Adds the new entity to the index and opens it in the same generic Focus experience.

The original note is not rewritten. It gains an incoming appearance derived from the index, not a mirrored relation. Source properties and body are not automatically copied; the new entity starts with its supplied content and can receive its own local properties.

## Architecture

```text
src/
  main.ts                                   Plugin lifecycle and Obsidian events
  domain/
    entity.ts                               Readonly Entity and M0 status model
    custom-property.ts                      Five typed local properties and validation
    entity-type.ts                          Five built-in types, labels, icons and folder names
    entity-relation.ts                      Directed UUID edges and validation
    workspace.ts                            Workspace identifier only
  application/
    capture-idea.ts                          Validate input, generate UUID and timestamp
    open-entity.ts                           Resolve identity to current note path
    entity-properties.ts                     Property write intentions accepted by the repository
    create-entity.ts                         Generic writer contract and Create From use case
    entity-relations.ts                      Relation write intentions
  infrastructure/
    frontmatter-mapper.ts                    Validate/read bs_ metadata; write bs_ fields
    property-mapper.ts                       Parse, serialize and mutate individual definitions
    relation-mapper.ts                       Parse and safely add/remove individual edges
    obsidian-entity-repository.ts             Vault reads/writes and synchronization
    entity-index.ts                          Disposable observable in-memory projection
  settings/
    settings.ts                             Defaults, validation, persisted-settings parsing
    settings-tab.ts                          Two-field native settings screen
  shared/
    note-path.ts                            Pure title, filename and path logic
    entity-path.ts                          Backward-compatible sibling destinations
    metadata-validation.ts                  Shared UUID and timestamp validation
  ui/
    capture/quick-capture-modal.ts            Native Obsidian modal and keyboard behavior
    inbox/inbox.tsx                          React rows subscribed to EntityIndex
    inbox/inbox-view.tsx                     Obsidian ItemView / React lifecycle
    focus/focus-view.tsx                     UUID view state and native Markdown rendering
    focus/property-inspector.tsx             Metadata and custom-property inspector
    focus/property-editor.tsx                Semantic editors and commit-based drafts
    focus/add-property-modal.ts              Lightweight name/type/options dialog
    focus/relationships.tsx                  Compact outgoing and derived incoming rows
    focus/add-relation-modal.ts              Searchable, keyboard-accessible target picker
    focus/create-from-modal.ts               Generic type/title/content creation dialog
```

### Decisions

- **Markdown is authoritative.** There is no database, entity JSON file, migration system or service. Disabling/uninstalling the plugin leaves readable notes.
- **Frontmatter uses the host API.** New files begin with an empty frontmatter envelope. `FileManager.processFrontMatter()` adds the metadata, preserving the Markdown body, including user input that itself contains `---` and YAML-looking text. If this API fails, the original text remains in the created file and the capture modal reports its recovery path.
- **The index is a projection.** It remains a simple UUID-keyed map. Entities include parsed properties, relations and their issues. Outgoing queries resolve UUID targets; incoming queries scan current entities. Changes notify Inbox and Focus; the initial scan also announces readiness so a restored Focus tab can distinguish loading from a missing entity.
- **Initialization waits for layout-ready.** Event handlers are attached after layout initialization, then Markdown notes are read in small asynchronous batches. This avoids treating initialization `create` events as new captures.
- **External changes use Vault events.** Create/modify read the current file via the Vault API and parse frontmatter using Obsidian's parser. Delete removes the path; rename updates paths and titles without generating new IDs. Folder operations use path boundaries so `Ideas` never matches `Ideas2`.
- **Stale reads cannot resurrect renamed/deleted files.** Per-path revisions plus current-file checks reject obsolete asynchronous read results. All Vault listeners use `registerEvent`; repository and React cleanup are registered with the plugin lifecycle.
- **Small, native UI.** Capture and Add Property use `Modal`; Inbox and Focus use `ItemView`. Focus renders the real note through `MarkdownRenderer`; its React inspector receives typed domain data, never raw YAML or a parallel Markdown body. The native Markdown editor handles content editing.
- **Narrow, safe mutations.** Property and relation operations share the existing per-entity write queue. They re-resolve UUIDs to current files and check identity inside `processFrontMatter()`. The mappers change only the requested definition/list entry and `bs_updated`, preserving user frontmatter, other Thought Craft metadata, custom properties, neighboring relations and the body. No target file is edited to mirror an edge.
- **Generic creation at the point of need.** `createEntity()` replaces the Idea-specific repository method now that several types exist. Quick Capture remains an Idea use case; Create From supplies a type, explicit title, optional body, inherited workspace and one origin relation. There are no per-type entity classes or specialized screens.
- **Readability.** Touched M1 modules and tests use consistent formatting and descriptive helpers. Prettier is available as `npm run format -- <files>` for further changes; existing modules are not reorganized into a new architecture.

The integration follows the [official Obsidian API](https://github.com/obsidianmd/obsidian-api) and the bundling pattern in the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).

## Real Obsidian integration check

```sh
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
```

These opt-in Linux checks open a **real Obsidian process**, using isolated application profiles and disposable vaults under `.artifacts/`. They enable only the locally built plugin. M0 covers capture and synchronization; M1 covers Focus and custom properties; M2 covers relations, Create From, generic types, malformed external entries, dangling targets and restarts. They do not use your normal Obsidian profile or vaults. Each closes its own test process after the run. A Linux desktop session is required.

Default executable paths are `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`. Override them with `OBSIDIAN_ELECTRON` and `OBSIDIAN_APP` if necessary. No browser download is needed: Playwright connects to the test process's local debugging endpoint. Tests require permission to launch an application and use loopback networking. See [M0 validation](docs/m0-validation.md), [M1 validation](docs/m1-validation.md) and [M2 validation](docs/m2-validation.md) for results and manual checklists.

## M2 limitations and later milestones

Focus shows a native Markdown preview; body editing uses the native editor tab. Properties are local to one entity. Changing labels, types, rating maxima, option lists or their order after creation currently requires editing the real frontmatter. A text property uses a single-line editor. Unsupported/malformed definitions are preserved but cannot be edited through the inspector. Other platforms and older Obsidian versions require separate validation.

The five types share one generic Focus View. Non-Idea entities start at `exploring`; specialized lifecycles and type-specific screens are future work. Relations are directional, cross-workspace targets are allowed, and incoming ownership remains with the source. Externally duplicated entity UUIDs still represent one identity and must be corrected manually when making independent copies.

Reusable schemas, formulas, evaluations, graph/canvas visualization, timelines, Story/Brainstorm/Plot Boards, worldbuilding and project management remain deferred. M2 does not start M3.

## Files added

- Plugin source and scoped UI styles: `src/**`, `styles.css`.
- Manifest and compatibility metadata: `manifest.json`, `versions.json`.
- Tooling: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`.
- Focused unit tests: `tests/*.test.ts`.
- Development installation and real-app checks: `scripts/install-dev.mjs`, `scripts/smoke-obsidian.mjs`, `scripts/smoke-m1.mjs`, `scripts/smoke-m2.mjs`.
- Documentation: `AGENTS.md`, this README, and `docs/m0-validation.md`, `docs/m1-validation.md`, `docs/m2-validation.md`.
- Generated local artifacts: `main.js` and ignored `.artifacts/` evidence. These are not source files.
