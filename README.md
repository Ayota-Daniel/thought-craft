# Thought Craft — Story V1 RC1 (local candidate)

**Donner forme aux idées, quelles qu’elles soient.** Thoughtcraft is a creative environment for capturing ideas freely, connecting them and adding structure progressively. Its core tools are entities, custom types/properties, relations, Workspaces and views. **Freedom before structure, with structure always available.**

Story writing is the first specialization; Obsidian is the first host. Brainstorm is a free spatial view. Story adds Scenes, Sections and optional Plot Threads over the same Markdown notes, with native writing and generic Focus. Future Creative Environment Templates and standalone hosting are roadmap concepts, not existing capabilities.

This is a **local RC1**, with manifest version still **0.1.0** pending owner choice. It has not been published or submitted. Desktop Obsidian **1.14.5 or later** is required; Linux on 1.14.5 is verified. Windows, macOS and later runtimes are unverified, and mobile is disabled. Desktop-only cannot restrict installation to Linux. See [candidate readiness](docs/story-v1-rc-readiness.md), [validation](docs/m11-validation.md) and [draft release notes](docs/story-v1-release-notes-draft.md).

## Install the local candidate — no development tools needed

1. Back up your vault **and its active configuration folder**. Start in a copied/test vault; see [backup and recovery](docs/backup-and-recovery.md).
2. Obtain the locally prepared `thought-craft-story-v1-rc1-local.zip` and its SHA256SUMS from the owner. Extract it; the `thought-craft` folder contains exactly main.js, manifest.json and styles.css.
3. Close Obsidian. Copy that folder into `<your-vault>/<active-config-folder>/plugins/`. The configuration folder is normally `.obsidian`; if you use **Override config folder**, use that actual folder. An upgrade replaces the three program files and **preserves the existing data.json**.
4. Reopen the copied vault, allow Community plugins if required, and enable **Thought Craft** in Settings. No Node/npm installation is needed to use the plugin.
5. Run **Thought Craft: Capture idea** from the Command Palette. Enter captures, Shift+Enter adds a line. Open the Inbox row to develop it in Focus or choose Open Markdown note to write.

To reproduce the artifact as a developer: `npm ci`, then `npm run package:candidate` (Node 22+, npm and the system `zip` utility). Output lives under ignored `.artifacts/releases/story-v1-rc1-<content-hash>/`; RC1 is not a public version suffix. Build reports/checksums remain outside the install folder. Linux ZIP/UnZip are also used by the package-loading tests. For RC1 native tests, set `THOUGHTCRAFT_TEST_RUNTIME_ASAR` to a verified Obsidian 1.14.5 runtime ASAR; this seeds only the test application cache and prevents a different embedded runtime from updating midway through a scenario.

## A first creative session

Capture fragments before choosing a structure. Switch or create a Workspace when context becomes useful. Add entities to Brainstorm, connect ideas and arrange them freely. Focus exposes custom/local properties and source-owned relations for the same notes.

When you want narrative organization, enable **Story** in Manage workspaces. A Scene is one narrative moment; a Section organizes the sequence; a Plot Thread follows a development across Scenes. Keep fragments Unplaced, write in the native Markdown editor and add Threads only if they help. Character/Location collections and your custom types remain available. Brainstorm positions never become narrative order.

The Story **Guide**, **Plot guide**, **Understanding Plot Threads** link and Inbox Help provide in-app support. [Manual acceptance](docs/story-v1-manual-acceptance.md) is pending a human tester. Publication additionally requires an owner-selected project license and public version; [submission preparation](docs/community-submission-checklist.md) records the outstanding decisions.

## Develop

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run dev          # esbuild watch mode, with inline source maps
npm run build        # strict TypeScript check + production main.js
npm run lint
npm test             # domain tests plus isolated adapter/release-tool tests
npm run check        # build, lint and tests
```

The release/install files remain `main.js`, `manifest.json`, and `styles.css`. Edit **`src/styles.css`**, which retains the validated Focus/modal styles and imports React Flow base styles; esbuild generates root `styles.css` alongside `main.js`. Both generated files include bundled dependency notices from `THIRD_PARTY_NOTICES.txt`. React is bundled into `main.js`; Obsidian's runtime API is external. Neither Node.js nor npm is needed by the installed plugin.

Permanent coding expectations are documented in [AGENTS.md](AGENTS.md). Code and tests are written for human readers; formatting improvements stay local to touched modules.

## Install in a development vault

Use a separate test vault while developing.

1. Create or choose an existing test vault in Obsidian.
2. Build the plugin and copy its three install files:

   ```sh
   npm run build
   npm run install:dev -- /absolute/path/to/test-vault
   ```

   The helper defaults to `.obsidian/plugins/thought-craft/`. For a custom configuration folder, pass its name as the second argument: `npm run install:dev -- /absolute/path/to/test-vault .obsidian-test`. It preserves existing plugin settings.

3. In that vault, open **Settings → Community plugins**, allow community plugins if required, and enable **Thought Craft**.
4. Run **Thought Craft: Capture idea** from the Command Palette.
5. Write an idea. **Enter** captures it, **Shift+Enter** adds a line, and **Escape** closes the modal.
6. The Inbox opens after capture. Use the Workspace switcher to choose context. Click a row to open the idea in **Thought Craft focus**. Use **Open Markdown note** to edit the same real file with Obsidian's native editor. The ribbon button and **Thought Craft: Open inbox** command also open the Inbox.

After rebuilding, run `install:dev` again and disable/re-enable Thought Craft in the test vault, or restart Obsidian. The watch build does not automatically copy files or reload Obsidian.

Assign an optional shortcut in **Settings → Hotkeys → Thought Craft: Capture idea**. M0 does not claim a global shortcut by default.

## Settings

Capture uses the active Workspace. The existing Idea folder remains configurable; Workspace context is selected in Inbox. **Manage entity types** opens the reusable schema configuration:

| Setting           | Default            | Purpose                                                                      |
| ----------------- | ------------------ | ---------------------------------------------------------------------------- |
| Idea folder       | `Brainstorm/Ideas` | Vault-relative destination for new ideas; created recursively when necessary |
| Active workspace | `default` | Last selected Workspace, restored through plugin configuration |

Use **Save** after editing settings. Invalid or absolute folder paths are rejected. Changing settings does not move existing notes. The Inbox displays inbox Ideas and non-archived entities of other types in the active Workspace, wherever their notes live. Its query is not limited to the capture folder; switching Workspace does not change entity membership or close open Focus/Markdown tabs.

Settings use Obsidian's `loadData` / `saveData` APIs. `data.json` contains capture settings, `configVersion: 8`, `entityTypes`, `workspaces`, `activeWorkspaceId` and optional `boards` visual state. These are definitions, UI context and board-only visual state: entity identity, values, relations and content remain in Markdown. M0–M7 configuration migrates without rewriting notes; missing built-ins are seeded once with no opinionated properties. Unknown configuration fields and unreadable individual type definitions are retained. A malformed type-list root or a newer configuration version blocks loading rather than overwriting configuration.

### Entity destinations

The existing `entitiesFolder` setting remains the **Idea folder**. Other entity types use their definition’s `folderName` relative to the Idea folder’s parent. Built-ins retain their M2 defaults:

| Type      | Default destination     | Initial status |
| --------- | ----------------------- | -------------- |
| Idea      | `Brainstorm/Ideas`      | `inbox`        |
| Character | `Brainstorm/Characters` | `exploring`    |
| Scene     | `Brainstorm/Scenes`     | `exploring`    |
| Location  | `Brainstorm/Locations`  | `exploring`    |
| Plot Thread | `Brainstorm/Plot Threads` | `exploring` |
| Story Section | `Brainstorm/Story Sections` | `exploring` |
| Project   | `Brainstorm/Projects`   | `exploring`    |

If the Idea folder is `Custom/Captures`, Characters are created in `Custom/Characters`, and so on. If it is a single root folder such as `Ideas`, the other folders are also at the vault root. No existing notes are moved. Type Manager folder edits affect only future creations. Editing Idea’s folder name also updates the existing capture destination; its parent can be changed in capture settings. Custom types use the same folder resolver, with safe nested relative paths allowed. All valid entities are indexed wherever their files live. Inbox retains Ideas with status `inbox` and also exposes non-archived other types. Focus links and relation search remain available. Workspace membership never changes their physical folder.

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

The supported statuses are `inbox`, `exploring`, and `archived`. Capture writes `inbox`; manually editing `bs_status` moves a note into or out of the Inbox. Invalid identity metadata, malformed type identifiers and missing UUIDs are ignored. Unknown but valid type IDs remain indexed and openable without rewriting the files. Date fields must be ISO timestamp strings. A successful custom-property mutation updates `bs_updated`; unrelated external Markdown edits do not rewrite that field.

For notes created outside the plugin, use all six metadata fields and a unique UUID. Two notes with the same UUID represent the same entity; its index entry follows the latest observed file path. Give a copy a fresh UUID to treat it as a separate idea. Thought Craft does not rewrite IDs in external files.

## Focus and local properties

Focus prioritizes the note content, with a secondary property inspector. Its preview is rendered by Obsidian's native `MarkdownRenderer`, using content read from the real file. **Open Markdown note** provides editing in a native Markdown tab. Focus refreshes when that file is edited externally or in Obsidian. It stores only the entity UUID in Obsidian's workspace layout so the same Focus tab can be restored after a rename or restart.

Click **+ Add local property**, enter a name, and choose one of these five types:

| Type    | Initial value    | Rules / editor                                                                 |
| ------- | ---------------- | ------------------------------------------------------------------------------ |
| Text    | Empty text       | Single-line text input                                                         |
| Number  | `0`              | Any finite number, including negative and decimal values                       |
| Rating  | `0`, maximum `5` | Whole-number value from 0 through the configured positive whole-number maximum |
| Boolean | `false`          | Checkbox                                                                       |
| Select  | First option     | Dropdown; requires distinct, non-empty options                                 |

Select options are entered one per line in the Add Property dialog. Rating maximum can be specified there. The property belongs only to the current entity. Its key is generated from the label in snake case; duplicate keys receive `_2`, `_3`, etc. Labels and keys are separate: external label edits do not change identity.

Text, number and rating inputs commit on **Enter** or **blur**; **Escape** discards the local draft. Boolean and select controls save on change. The inspector shows save errors inline. A stale draft cannot overwrite a property changed elsewhere: discard the draft to review the current value before trying again. **Remove** opens a small inline confirmation and deletes only the selected property definition. All registered and unknown entity types use these same local properties.

The `bs_properties` format above is the same nested mapping used for every type. Text, number and boolean definitions contain `label`, `type`, and `value`; rating adds `max`; select adds `options`. Local definitions remain unchanged. They are separate from reusable schemas, and no parallel JSON entity storage or database is introduced.

Invalid custom-property definitions are reported in Focus and retained verbatim in frontmatter. Valid neighboring properties remain editable. A malformed `bs_properties` container is never silently replaced; repair it in the Markdown note before making property changes. Unknown keys inside valid definitions are preserved on value updates.

## Story — a Workspace experience

Enable **Story** in **Manage workspaces → Specialized experiences**, then save. Existing Workspaces migrate with `enabledExperiences: []`: no Story tools or additional Entity Types are enabled automatically. Story setup offers explicit Enable actions for missing recommended types; use only the types you need.

**Inbox | Brainstorm | Story** share the active Workspace. Story has light local navigation for **Overview, Scenes, Characters, Locations, Plot Threads and Ideas**. Overview offers Continue writing and computed collection counts. Collections search titles, sort by recently updated/newest/name and reuse 25/50/100-row pagination. Story includes all lifecycle states, including archived material, so the generic Inbox lifecycle cannot hide a writer’s notes. Search/sort/page state stays temporary and resets when leaving a collection.

**Continue writing** opens the latest edited Scene’s real Markdown file. It compares `bs_updated`, creation time and Obsidian’s cached native file modification time, so native body edits are included without updating frontmatter. Collection date sorting retains the shared metadata timestamp behavior. No narrative or chronological order is implied.

**+ Scene → Create & write** creates a normal Entity and opens the native Markdown editor. Other quick creations open the existing Focus View, with Properties, Relations, Create From and Brainstorm actions. Focus opened from Story returns to that collection; this small origin context stays in memory and is cleared after restart. Opening Focus through Inbox or Brainstorm restores normal Back to inbox behavior. Story subsection is remembered per Workspace while its native view remains open.

Story shares the existing Workspace Brainstorm Board, schemas and relation definitions. **Plot Thread** is a built-in type added in M7, stable ID `plot-thread`, default folder `Plot Threads`, empty schema. A pre-existing custom type with that ID retains its label, folder, schema and retirement state; no duplicate or silent replacement occurs. If it is retired, restore it through Entity Type Manager. Global type seeding does not add it to existing Workspace enabled-type lists.

Disabling Story hides its primary tab and tools; an already-open Story pane explains the disabled state. It never deletes notes, disables types, clears relations or changes the board. Re-enabling restores access. **Open Story** and **Create Scene** commands are available when the active Workspace has the required capability. Guide includes a concise Story topic.

Thoughtcraft organizes; Obsidian writes. Advanced Story Board, Chapters, Timeline, specialized Scene Editor and Story schema overrides remain deferred. **M12 has not been started.** See [M7 validation](docs/m7-validation.md).

## Plot — narrative structure in Markdown

Within a Story-enabled Workspace, choose **Story → Plot** or **Overview → Open Plot**. Brainstorm organizes thoughts spatially; Plot organizes Scenes sequentially. It is a vertical editorial sequence, with a compact searchable/paged **Unplaced** tray and ordered Story Sections. It does not use XYFlow.

Enable **Story Section** explicitly in Story setup. **+ Story Section** creates a real generic Markdown Entity (stable type `story-section`, folder `Story Sections`), with optional notes and a sparse narrative rank. A pre-existing custom definition with this ID is preserved exactly, including retirement. Existing Workspaces do not automatically enable it; migration does not create Acts or edit Scene notes.

Drag a Scene before another Scene or into a Section’s append area. Drag Section headers before another header or to the end marker. Drop a Scene into Unplaced to clear its placement. Pointer movement does not save. Native action menus provide **Move to section…**, **Move earlier/later**, **Move to Unplaced**, **Write** and **Open Focus**. Section menus provide Open, Rename, Add Scene and earlier/later. A single click selects a Scene; double-click or Write opens its real Markdown note. Focus returns to Plot.

**+ Scene in …** creates a generic Scene, appends it to that Section and opens native Markdown for writing. **+ Unplaced Scene** creates the same real Scene without placement. Section notes, properties, relations and Brainstorm participation use normal Focus. Renaming a Section changes its filename/title through Obsidian; Scenes continue to resolve its UUID without a placement migration.

Narrative data belongs in Markdown, never a hidden configuration array:

```yaml
# On a Scene:
bs_story:
  section_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
  order: 2000

# On a Story Section:
bs_story:
  order: 1000
```

Ranks start 1000 apart. A normal move writes only the moved note (midpoint, or ±1000 at an edge). If a practical gap is exhausted, only the affected Section’s Scene list is rebalanced; Section reordering rebalances Section notes only. Display numbering and the overall sequence are derived from Section rank, then Scene rank. Unplaced scenes use the existing Recently updated metadata sort, with no narrative tray order.

Writes preserve all other metadata, including `bs_updated`, and the exact body. As in M7, Continue Writing also considers native file modification time: a narrative edit can therefore become the latest edited Scene. Sparse/rebalance writes share the existing per-Entity queue and check expected placement before committing. A multi-note failure reports how many notes saved and renders actual Markdown state; there is no transaction or global undo stack. If creation succeeds but placement fails, the note/path is reported and repeat Create is disabled to avoid a duplicate.

Missing/deleted/cross-Workspace Section references remain untouched and show as unresolved Unplaced scenes. Reassigning repairs a valid mapping explicitly. A malformed `bs_story` container must be repaired in Markdown before changing placement; neighboring unknown keys in valid mappings remain intact. Deleting a Section never deletes or automatically rewrites its Scenes. Brainstorm coordinates, groups and membership remain independent.

Title search never changes narrative placement. Unplaced defaults to 25 per page, and Section lists to 50; large lists reuse 25/50/100 pagination. All Plot search, selection and page state stays temporary. Pointer drag/drop uses native HTML events; keyboard movement uses the named native menus, not a claimed keyboard-drag sensor. Plot Guide explains these controls. See [M8 validation](docs/m8-validation.md) for the 100+ Scene scenario, accessibility limits and screenshots.

Plot has one Section level. Chapters, nested hierarchy, Timeline, dedicated arcs, batch narrative movement and custom global undo remain deferred. **M12 has not been started.**

## Plot Threads — developments across scenes

In **Story → Plot**, expand **Plot Threads** to create or inspect the same generic `plot-thread` notes used by the Story collection. Creating a Thread uses the existing native form and opens generic Focus; Back returns to Plot. Type creation remains subject to Workspace enabling and retirement rules. Writing without Threads remains fully supported.

Use a Scene’s **actions → Plot Threads…** to add/remove its associations in the compact inline panel. Membership uses ordinary **Related to** links between a Scene and a Plot Thread in the same Workspace. Both directions are readable; new associations write Scene → Related to → Thread. An existing reverse link prevents a redundant new edge. Removing membership removes the matching Related to edges only; if both directions exist, both are removed, with explicit partial-failure reporting. Custom relation kinds, Supports and provenance retain their meanings and do not count as membership. Use generic Focus to manage those relationships.

Scene rows display up to two thread names and a `+N` overflow count, with full names available to assistive technology and in a tooltip. Select one or more Thread checkboxes to inspect narrative progression. **Highlight matches** retains all scenes; **Filter to matches** hides non-matches and clearly announces filtering. Multiple threads use OR matching. **Show full Plot** clears thread selection; the separate scene-title search remains independent.

Progression follows canonical M8 Section/Scene order. Unplaced Scenes stay separate in the same deterministic ordering as the Unplaced tray; no narrative positions or completion percentages are invented. Filtering, selection and pagination are temporary. Associations do not write `bs_story`, touch Brainstorm layout or duplicate content. Generic relation edits retain their existing `bs_updated` behavior. Configuration remains v8, with no new migration or runtime dependency and an unchanged EntityIndex.

The contextual **Understanding Plot Threads** Guide teaches Section/Scene/Thread distinctions, a mystery/relationship/conspiracy example, associations, progression and a flexible personal writing method. See [M9 validation](docs/m9-validation.md) for exact checks, evidence and limits.

## Brainstorm Board

Choose **Brainstorm** beside Inbox, or run **Thought Craft: Open brainstorm**. The active Workspace remains visible and switchable. Each Workspace has one curated board: existing entities are never placed automatically.

- **+ Idea** reuses Quick Capture and creates a real Markdown Idea in the board’s Workspace, then places its UUID near the current viewport centre. Idea must be enabled there.
- **+ Add existing** searches titles/types in that Workspace, excluding entities already placed. It changes layout only.
- Drag cards freely, or select a focused card with Space and use arrow keys. Positions save on release/settled keyboard movement, not during pointer motion. Drag empty canvas to rectangle-select; use Space-drag or middle-drag to pan; scroll/pinch to zoom. **Fit**, zoom buttons and last viewport work per Workspace.
- Double-click a card, press Enter on its focused wrapper, or choose **Open** to use the existing Focus View. For other enabled types, use Focus → Create From, then **Add to Brainstorm**; there is no row of per-type creation buttons.
- Focus offers **Add to Brainstorm** / **Open in Brainstorm** for its entity’s actual Workspace. That explicit action switches to the relevant Workspace when necessary.
- **Remove from board** removes visual membership only. The note, properties and relations remain intact. Delete/Backspace shortcuts do not remove entities or placements.
- Drag a source handle onto a target handle, then choose a valid relationship kind. No edge is added until the existing repository successfully saves `bs_relations`. For a keyboard alternative, select a card and use **Connect…**.
- Select an edge and use **Remove relationship**. Confirmation removes that actual Markdown relation; this differs deliberately from removing a card.

Cards share one generic renderer with native icon, registry type label and filename-derived title. Unknown/retired/disabled entity types remain safe and openable. Only edges with both endpoints placed in the current Workspace are rendered; dangling/off-board/cross-Workspace links remain available through Focus. Definition/label changes and external note/relation edits refresh the view. File renames retain UUID placement; deletion/membership changes hide stale cards and safely clean layout after the index is ready.

Only useful visual state is persisted, lazily, in `data.json`:

```json
{
  "workspaceId": "default",
  "nodes": {
    "ca829f16-35b0-4e68-857b-d54cfc73caed": { "x": 120, "y": 80 }
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "groups": []
}
```

`boards` contains one such entry per touched Workspace. It has no copied titles, content, properties, relations, selection or React Flow metadata. Coordinates never enter Markdown. Retiring a Workspace retains its layout for restoration. A saved layout is never pruned during partial startup indexing.

The canvas uses **`@xyflow/react` 12.12.0**, bundled locally. Its documented [drag/viewport interactions](https://reactflow.dev/api-reference/react-flow) and [keyboard support](https://reactflow.dev/learn/advanced-use/accessibility) avoid a custom pan/zoom engine. All library types stay in `ui/brainstorm`; application/domain state remains independent. No Redux/Zustand application store is added; React Flow’s own internal dependencies are confined to the canvas adapter.

## Contextual brainstorming and visual groups

Focus offers **Brainstorm around**, alongside its existing Add/Open in Brainstorm action. This opens the entity’s actual Workspace board, places it only if absent, preserves its position and centers the viewport. The compact Focus indicator names the roots; only roots and their direct incoming/outgoing neighbors already on the board are rendered. Unrelated placements remain intact in saved layout. Nothing is automatically flooded onto the board. Board cards expose the same action through their selection toolbar. **Show all** or Escape inside the board leaves membership, positions, relations and groups unchanged. A modal receives Escape first. Focus clears on Workspace switching/restart and is never persisted. Use + Add focus to select additional placed roots; remove each chip independently. Visible nodes are the one-hop union, never a recursive expansion. Groups render only when a member is visible. With several roots, the Connected idea dialog lets you choose its target while retaining your draft.

In Focus, **+ Connected idea** replaces the normal Idea action. The dialog explicitly shows **New idea → chosen relationship → root**, defaulting to Related to. Valid choices come from the existing relation registry, including compatible Workspace kinds. Creation writes a real Idea with one source-owned relation through the existing repository; the root note is unchanged. The new card appears in a nearby free slot and inherits the root’s current group. If the note saves but placement fails, the dialog gives its path and disables repeat creation; recover through Add existing.

Ctrl/Cmd-click cards, or drag a selection rectangle on empty canvas, then choose **Group selection** and name it. At least two distinct **ungrouped** cards are required; existing memberships must be removed first. Groups have stable board-only IDs, labels, absolute bounds and UUID member lists; they are not entities and cannot have relations or Focus views.

- Drag a group’s title, or focus its wrapper and use arrow keys, to move its boundary and members together. One configuration update saves the settled movement.
- Select a card and choose **Move to group…** or **Remove from group**. Transfer is explicit, with at most one group per card. Joining expands bounds without moving existing cards. Dragging one member’s center clearly outside its zone removes membership; moving multiple selected cards together preserves membership; overlap alone never assigns a new group.
- Select a group to **Rename group**, **Fit group to members** or **Remove group**. Removing the boundary keeps all members on the board at their current absolute positions, with every note/relation intact. Empty groups remain valid.
- Remove from board and external deletion also clean member lists, preserving the group and its other cards. Removing a root’s group leaves Focus mode active.

M5 board configuration migrates to version 6 with the exact same nodes/viewport and `groups: []`. Groups are isolated per Workspace and remain independent of React Flow metadata. Freeform boundary resizing, nested groups, arbitrary colors and a dedicated Parking Lot remain deferred. Related-entity discovery is also deferred; Add existing remains explicit and scoped.

## Inbox search, selection and recovery

Search titles or type labels within the active Workspace. Filters cover Entity type, On/Not on Brainstorm, Has/No relations (either direction, including outgoing dangling links), and updates in the last seven days. Sort by newest/oldest created, recently updated, A–Z or Z–A. Search, filters and sorting are temporary. No body indexing, AI search, saved queries or arbitrary property filters are introduced.

Select checkboxes, Ctrl/Cmd-click rows, or Shift-click a row to add a displayed range. Hidden selections are cleared when results or Workspace change, and every batch action intersects selection with currently visible rows. The compact batch bar stays visible during scrolling. **Add to Brainstorm** adds only selected UUIDs, skips existing placements, creates nearby clear slots and performs one layout save without changing Markdown or relationships. The board’s Add Existing dialog also supports multiple native-checkbox selections; changing search clears hidden picker selections. There is no UUID text in normal pickers.

The row’s **⋯** menu offers Open, Add to Brainstorm and Move to trash. Single/batch trash always opens an explicit confirmation naming the notes. Thoughtcraft uses Obsidian’s **vault-local `.trash`**, guaranteeing recoverable files independently of any permanent-delete preference. Recover by moving the file from `.trash` back into the vault; add it to the board explicitly afterward. Board/group membership cleans safely; source notes retain incoming-to-deleted-target relations as unavailable links. Partial failures name the failed files; a separate layout-cleanup failure does not conceal successful trash operations. There is no cascade deletion or irreversible-delete action. Generic Archive is deferred rather than inventing per-type lifecycle semantics.

**Inbox / Brainstorm** are compact accessible tabs with arrow/Home/End navigation and visible focus. They retain the active Workspace and native view state. **Guide** in Inbox, **Thought Craft: Open Thoughtcraft Guide**, and **What do these relations mean?** in relation/connected-idea dialogs open short in-product documentation. Relation help explains all five universal meanings, direction and examples, then returns to the intact picker draft.

## Inbox pages and canvas controls

Inbox queries run in this order: Workspace → title/type search → filters → sort → pagination. The title shows the Workspace’s full candidate count; a small result count shows when filters narrow it. Pages default to **50 rows**, with **25 / 50 / 100** choices. Previous/Next and bounded page buttons sit below the list; zero results hide pagination. Query/sort/size/Workspace changes reset to page 1; external result shrinkage clamps to the last valid page. Page state is temporary and never enters plugin configuration.

Selection is restricted to the visible page. Navigating pages or changing query/size clears it. **Select this page** selects only rendered rows, never every filtered result. Batch Add/Trash still use only explicitly selected visible UUIDs. Range selection is also page-local.

**Filters** is a floating native-browser popover: it overlaps content without changing list/search layout, avoids parent clipping, shifts or flips to stay in the viewport, and scrolls internally when space is short. Escape returns focus to Filters; outside click dismisses it. Values remain in the existing query state. Row hover/focus/selection now cover the checkbox, content, date and menu together; each control keeps its independent behavior.

Brainstorm’s **Controls** button opens concise textual help instead of keeping a long instruction sentence below the canvas. The same control table is in **Guide → Brainstorm**. Left drag on empty canvas selects an area; Ctrl/Cmd/Shift-click modifies selection; right/middle/Space-drag pans; scrolling zooms; dragging any selected card moves the selection. Enter opens a focused Entity card, and Space/arrow keys retain the existing selection/positioning alternatives. Native-app validation exercises these gestures.

## Workspaces

The compact switcher in Inbox selects the **active Workspace**, a persisted UI/application context. Quick Capture defaults to it and displays its label while writing its stable ID to `bs_workspace`. A new empty Workspace offers a direct capture action. If Idea is disabled, capture controls explain that it must be enabled; the capture command also reports a safe validation error on submission.

Open **Thought Craft: Manage workspaces**, the Inbox **Manage workspaces** button, or the matching settings entry. Create a Workspace with name, stable normalized ID, optional description and enabled global Entity Types. Idea is checked initially; it can be explicitly disabled. Rename labels without changing IDs. Global schemas are edited only in Type Manager; Workspace Manager controls type availability without duplicating schema definitions.

M3 migration seeds built-in `default` with every type active before migration. It never edits notes. If an older capture setting explicitly named another safe Workspace ID, migration also creates that definition and restores it as capture context. Arbitrary Workspace IDs found in notes are not inferred or renamed. Missing/retired active references fall back to `default`, which cannot retire. The old `defaultWorkspace` capture setting remains preserved for compatibility but is no longer the active-context control.

Custom Workspaces support reversible retirement. Retirement preserves definitions and existing entities, excludes switching/new creation, and persistently falls back to Default if necessary. Existing entities with disabled types, unknown/retired types or unknown Workspaces remain readable. Focus shows the entity’s actual Workspace, independently of the active Inbox context, and never silently reassigns it.

### Workspace relation definitions

Workspace Manager supports custom relation types with stable ID, display label, source/target Entity Type ID lists and retirement state. Empty restrictions mean **any enabled, globally active Entity Type**. Multiple restrictions use simple checkboxes. Universal IDs cannot be replaced. Custom relation labels and restrictions can be edited without rewriting existing relation instances; retire/restore keeps the same identity.

Universal relations may cross Workspaces. Target search initially uses the source Workspace and offers **All Workspaces** for universal kinds. Custom relations require both entities to belong to their defining Workspace and respect enabled source/target type restrictions. UI filtering and repository validation enforce these rules. `originated-from` remains universal and is always available to Create From.

Custom instances retain the M2 format, with no definition copied into Markdown:

```yaml
bs_relations:
  - id: 'e2c1b5b7-8856-42f4-a958-63ac4944b441'
    type: appears-in
    target_entity_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
    created_at: '2026-10-29T00:00:00.000Z'
```

Definitions resolve using the source entity’s Workspace, never the global active context. Retired relation definitions still label existing links but cannot be selected for new links. Unknown IDs show **Unknown relation: …**, retain target navigation and allow removal. Incompatible manual links remain preserved and show a reason. There is no inverse persistence, cardinality engine or automatic cleanup.

## Reusable types and properties

Open **Thought Craft: Manage entity types** from the Command Palette, from Thought Craft settings, or through **Manage Character properties** in Focus. Select a type to edit its label/folder and reusable properties. **Create type** accepts a display name, normalized stable ID and editable folder name. No automatic English pluralization is applied: for Quest, enter `Quests` explicitly if desired. Renaming Quest to Mission leaves `bs_type: quest` unchanged.

Each type definition contains `id`, `label`, `folderName`, `builtIn`, `retired` and ordered `properties`. The five built-ins cannot be retired. Custom types can be retired/restored; retirement excludes new creation without changing existing entities or their schema.

A reusable property contains a stable `snake_case` key, editable label, immutable type, retirement flag, and optional `defaultValue`, rating `max`, or select `options`. The five M1 value types are reused. Duplicate keys are rejected, including retired keys, so stored values cannot accidentally acquire a different meaning. Label changes keep the key. Rating/select changes must keep any configured default valid.

Definitions live in `data.json`; **only explicit values** live in notes:

```yaml
bs_schema_values:
  motivation: Find her brother
  importance: 4
  role: protagonist
```

Focus separates **Type properties** from **Local properties**. New schema fields immediately appear on existing entities without changing their files. The same value editors handle both sections. Type fields distinguish missing, virtual default and explicit values. **Reset** clears an explicit value, returning to the current default or missing state. Defaults are never copied into all notes.

Removing a select option or lowering a rating maximum preserves incompatible explicit values and shows a correction hint. No clamping, deletion or rewriting occurs. Retiring a property preserves its definition and values; stored retired/unknown fields appear under **Stored values without an active schema**. Restore the property to resume normal editing. Unknown entity types display **Unknown Entity Type: creature**, preserve all data, and still provide native Markdown access. Restoring configuration resolves them again.

Value writes use the existing per-entity queue and `processFrontMatter()`, rechecking UUID, schema and expected explicit value. Unrelated metadata, local properties, relations and body are retained. A stale draft reports an error; discard it to inspect the latest value. Schema configuration has a separate serialized persistence queue and publishes changes only after successful saving.

See [architecture](docs/architecture.md) for the boundaries and persistence lifecycle.

## Relationships

Focus has a compact **Relationships** section below the local properties. **+ Add relation** opens a searchable target list showing title, entity type, Workspace and a short UUID for disambiguation. Choose a relation type first, then a compatible target. Universal relations are:

- Related to (`related-to`)
- Supports (`supports`)
- Alternative to (`alternative-to`)
- Depends on (`depends-on`)
- Originated from (`originated-from`)

Each relation has its own UUID and timestamp. `target_entity_id` contains an **entity UUID**, never a filename or path. Relations are directed and stored **only on the source note**. Even `related-to` remains a single-source edge in M2: the target does not receive a mirrored YAML entry.

**Outgoing** links open their target in Focus and can be removed with a small confirmation. **Incoming** links are derived by scanning the current EntityIndex; they open the source that owns the relation. Incoming links cannot silently edit another note. Existing Focus tabs are reused by entity UUID.

Renaming either file changes display titles/paths without breaking the relationship. Deleting a target leaves the source's stored relation intact; Focus displays **Unavailable target** until the user removes the edge or restores that UUID. Deleting the source removes its incoming appearances from the index without modifying any target note.

Exact source/type/target duplicates and self-relations are rejected in the domain/repository, including concurrent local additions. A different relation type to the same target is allowed. Unknown relation IDs remain displayed with target resolution and explicit removal. Workspace-incompatible manual links are preserved and marked incompatible. Malformed, self-referencing or duplicated external entries are reported and ignored for display, while remaining in the source YAML. A malformed `bs_relations` container must be repaired manually before editing it. Removal checks the relation ID and expected definition, preserving neighboring entries and all unrelated data.

Incoming lookup currently scans the indexed entities and relations. This is an intentional M2 choice for early personal-vault usage, not a scale benchmark. No reverse-edge database or dual entity/path map is maintained.

## Create From

From any Focus View, choose **Create from…**, select an active global entity type enabled in the source Workspace, including custom types, enter a title and optional initial content, and confirm. Thought Craft:

1. Creates a real Markdown file with a new entity UUID and the selected type.
2. Inherits the source's workspace, even if the active UI Workspace is different.
3. Writes one `originated-from` relation on the **new entity**, targeting the original UUID.
4. Adds the new entity to the index and opens it in the same generic Focus experience.

The original note is not rewritten. It gains an incoming appearance derived from the index, not a mirrored relation. Creation is validated by both the application and repository, including programmatic calls. Source properties and body are not automatically copied; the new entity starts with its supplied content, automatically shows its type’s reusable fields, and can receive its own local properties. Schema defaults are not written during creation. Retired and unknown types are excluded from the creation picker, while existing entities remain accessible.

## Architecture

```text
src/
  main.ts                                   Plugin lifecycle and Obsidian events
  domain/
    entity.ts                               Readonly Entity and M0 status model
    custom-property.ts                      Five typed local properties and validation
    property-schema.ts                      Reusable field definitions and value resolution
    entity-type.ts                          Open type IDs, reusable definitions and built-in presentation seeds
    entity-relation.ts                      Directed UUID edges and validation
    workspace.ts                            Workspace and custom relation definitions
    board.ts                                Positions, viewport and visual state only
    board-group.ts                          Visual zones, bounds and membership geometry
  application/
    capture-idea.ts                          Validate input, generate UUID and timestamp
    open-entity.ts                           Resolve identity to current note path
    entity-properties.ts                     Property write intentions accepted by the repository
    create-entity.ts                         Generic writer contract and Create From use case
    entity-relations.ts                      Relation write intentions
    workspace-board-store.ts                 Serialized per-Workspace visual state
    board-actions.ts                         Board creation and available relation choices
    board-projection.ts                      Derived entities/relations for placed UUIDs
    board-groups.ts                          Pure group operations and member translation
    board-group-config.ts                    Strict group parsing and M5 layout upgrade
    contextual-brainstorm.ts                  Root navigation, neighbors and connected creation
    board-focus.ts                           One-hop multi-root visibility projection
    inbox-query.ts                           Workspace-local search, filters and sorting
    entity-selection.ts                      Visible-safe UUID selection and ranges
    entity-batch.ts                          Atomic board add and explicit partial trash results
    entity-type-registry.ts                  Global schema lookup, mutations and subscriptions
    entity-schema-values.ts                  Explicit schema value write intentions
    workspace-registry.ts                    Workspace configuration and active context
    relation-type-registry.ts                Universal/Workspace relation resolution and validation
  infrastructure/
    frontmatter-mapper.ts                    Validate/read bs_ metadata; write bs_ fields
    property-mapper.ts                       Parse, serialize and mutate individual definitions
    relation-mapper.ts                       Parse and safely add/remove individual edges
    schema-value-mapper.ts                   Guarded single-value schema mutations
    obsidian-entity-repository.ts             Vault reads/writes and synchronization
    entity-index.ts                          Disposable observable in-memory projection
  settings/
    settings.ts                             Defaults, validation, persisted-settings parsing
    settings-tab.ts                          Capture folder and configuration manager entries
    workspace-migration.ts                   M3-to-M4 configuration-only migration
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
    focus/create-from-modal.ts               Registry-driven type/title/content creation
    types/type-manager-modal.tsx             Native modal with global schema forms
    workspaces/workspace-manager-modal.tsx    Workspace types and relation configuration
    workspaces/workspace-switcher.tsx         Compact active Workspace selection
    brainstorm/                              ItemView, canvas adapter, cards/edges, toolbar and dialogs
    guide/                                   Short topics, relation meanings and native Guide
    shared/workspace-tabs.tsx                 Compact accessible native-view navigation
  styles.css                                 Authored stylesheet; root styles.css is generated
```

### Decisions

- **Markdown is authoritative.** There is no database, entity JSON file or bulk note migration. Reusable definitions and board-only visual state are versioned in plugin configuration. Disabling/uninstalling the plugin leaves readable notes.
- **Frontmatter uses the host API.** New files begin with an empty frontmatter envelope. `FileManager.processFrontMatter()` adds the metadata, preserving the Markdown body, including user input that itself contains `---` and YAML-looking text. If this API fails, the original text remains in the created file and the capture modal reports its recovery path.
- **The index is a projection.** It remains a simple UUID-keyed map. Entities include parsed local properties, relations and their issues, plus raw schema values. Schema lookup and notifications belong to the injected registry; EntityIndex remains unchanged through M6.5; Workspace filtering scans the existing index, retaining the original Idea Inbox lifecycle. Outgoing queries resolve UUID targets; incoming queries scan current entities. Changes notify Inbox and Focus; the initial scan also announces readiness so a restored Focus tab can distinguish loading from a missing entity.
- **Initialization waits for layout-ready.** Event handlers are attached after layout initialization, then Markdown notes are read in small asynchronous batches. This avoids treating initialization `create` events as new captures.
- **External changes use Vault events.** Create/modify read the current file via the Vault API and parse frontmatter using Obsidian's parser. Delete removes the path; rename updates paths and titles without generating new IDs. Folder operations use path boundaries so `Ideas` never matches `Ideas2`.
- **Stale reads cannot resurrect renamed/deleted files.** Per-path revisions plus current-file checks reject obsolete asynchronous read results. All Vault listeners use `registerEvent`; repository and React cleanup are registered with the plugin lifecycle.
- **Small, native UI.** Capture and Add Property use `Modal`; Inbox and Focus use `ItemView`. Focus renders the real note through `MarkdownRenderer`; its React inspector receives typed domain data, never raw YAML text or a parallel Markdown body. Schema values remain unmodified until validated at the value-editor boundary. The native Markdown editor handles content editing.
- **Narrow, safe mutations.** Property and relation operations share the existing per-entity write queue. They re-resolve UUIDs to current files and check identity inside `processFrontMatter()`. The mappers change only the requested definition/list entry and `bs_updated`, preserving user frontmatter, other Thought Craft metadata, custom properties, neighboring relations and the body. No target file is edited to mirror an edge.
- **Generic creation at the point of need.** `createEntity()` replaces the Idea-specific repository method now that several types exist. Quick Capture remains an Idea use case; Create From supplies a type, explicit title, optional body, inherited workspace and one origin relation. There are no per-type entity classes or specialized screens.
- **Readability.** Touched M1 modules and tests use consistent formatting and descriptive helpers. Prettier is available as `npm run format -- <files>` for further changes; existing modules are not reorganized into a new architecture.

The integration follows the [official Obsidian API](https://github.com/obsidianmd/obsidian-api) and the bundling pattern in the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).

## Real Obsidian integration check

```sh
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
npm run test:obsidian:m3
npm run test:obsidian:m4
npm run test:obsidian:m5
npm run test:obsidian:m6
npm run test:obsidian:m6-5
npm run test:obsidian:m6-6
npm run test:obsidian:m7
npm run test:obsidian:m8
npm run test:obsidian:m9
npm run test:obsidian:m10
npm run measure:story
```

These opt-in Linux checks open a **real Obsidian process**, using isolated application profiles and disposable vaults under `.artifacts/`. They enable only the locally built plugin. M0 covers capture and synchronization; M1 covers Focus and custom properties; M2 covers relations, Create From, generic types, malformed external entries, dangling targets and restarts. M3 covers type/schema configuration, all five value kinds, virtual defaults, legacy values, retirement, custom folders, unknown types and configuration loss/restoration. M4 covers Workspace migration/switching, creation restrictions, custom relations, cross-Workspace policies, compatibility feedback and retirement. M5 covers curated board membership, real creation, drag/keyboard placement, viewport/restarts, visual relations, Workspace isolation, external synchronization and styling. M6 covers contextual centering/neighbors, connected creation, visual groups, group movement/persistence, join/leave/removal, cleanup, theme/narrow/reduced-motion behavior and M5 migration. They do not use your normal Obsidian profile or vaults. Each closes its own test process after the run. M6.5 adds a 35-entity search/filter/batch/trash journey, multi-select picker, rectangle drag, multi-root Focus, tabs and Guide checks. M6.6 adds a 135-note pagination/popover/row/help journey. A Linux desktop session is required.

Default executable paths are `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`. Override them with `OBSIDIAN_ELECTRON` and `OBSIDIAN_APP` if necessary. No browser download is needed: Playwright connects to the test process's local debugging endpoint. Tests require permission to launch an application and use loopback networking. See [M0 validation](docs/m0-validation.md), [M1 validation](docs/m1-validation.md), [M2 validation](docs/m2-validation.md), [M3 validation](docs/m3-validation.md), [M4 validation](docs/m4-validation.md), [M5 validation](docs/m5-validation.md), [M6 validation](docs/m6-validation.md), [M6.5 validation](docs/m6-5-validation.md) and [M6.6 validation](docs/m6-6-validation.md) for results and manual checklists.

## Candidate limitations and later milestones

Brainstorm supports one board per Workspace, free placement and basic pan/zoom. There are no named boards, nested groups, auto-layout, dedicated Parking Lot, drawing tools or full in-card editors. Group boundary resizing is deferred; use Fit group to members after changes. Card bodies/properties are intentionally omitted. Parallel labels are offset, but paths/labels are not routed around other cards; arrange cards manually. Layout persistence and Markdown persistence are separate: if placement fails after creating a note, the dialog reports its recovery path for Add existing rather than silently losing the note.

Keyboard alternatives cover toolbar/dialog navigation, card opening, arrow positioning and relationship creation/removal. Pointer handles and the spatial arrangement are not a complete screen-reader experience, and this milestone does not claim full accessibility certification. Other platforms/mobile remain untested.

Focus previews Markdown; editing the body uses Obsidian’s native note editor. Text fields remain single-line. A malformed schema-values container must be repaired in Markdown; orphaned values are shown read-only and can be recovered by restoring the schema or edited in Markdown. Invalid individual type definitions are preserved in configuration and reported; repair those definitions in `data.json` while the plugin is disabled. Configuration changes made outside the UI take effect on plugin reload. Back up plugin configuration alongside the vault when moving reusable definitions between machines.

Type IDs, property keys and property types cannot be changed after creation through the UI. Type/property retirement is reversible; destructive schema deletion and automatic value migrations are deliberately unavailable. Schema ordering follows insertion order; there is no drag-and-drop ordering. Incoming relations still use a scan. Externally duplicated entity UUIDs still mean one identity and need manual repair when making independent copies. Only the current Linux Obsidian version was validated; mobile, other platforms and older versions require separate checks.

Entity Types and Property Schemas remain **global to this vault/plugin configuration**. Workspace templates, Workspace-specific property variants/overrides, specialized project screens, advanced Story boards, timeline/graph views, evaluation profiles and formulas remain deferred. Entity movement between Workspaces is deliberately unavailable in the UI until its custom-relation compatibility workflow can be designed safely. M12 has not been started.

## Files added

- Plugin source and authored UI styles: `src/**` including `src/styles.css`. Root `main.js` and `styles.css` are generated install artifacts.
- Manifest and compatibility metadata: `manifest.json`, `versions.json`.
- Tooling: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`.
- Focused unit tests: `tests/*.test.ts`.
- Development installation and real-app checks: `scripts/install-dev.mjs`, `scripts/smoke-obsidian.mjs`, `scripts/smoke-m1.mjs`, `scripts/smoke-m2.mjs`, `scripts/smoke-m3.mjs`, `scripts/smoke-m4.mjs`, `scripts/smoke-m5.mjs`.
- Documentation: `AGENTS.md`, this README, and `docs/m0-validation.md`, `docs/m1-validation.md`, `docs/m2-validation.md`, `docs/m3-validation.md`, `docs/m4-validation.md`, `docs/m5-validation.md`, `docs/architecture.md`.
- Bundled dependency notices: `THIRD_PARTY_NOTICES.txt`.
- Generated local artifacts: `main.js`, `styles.css` and ignored `.artifacts/` evidence. These are not source files.
