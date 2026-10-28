# M3 validation — Reusable entity types and property schemas

Validated on **28 October 2026**, in real **Obsidian 1.14.4** on Linux. Tests use isolated profiles and disposable vaults. Screenshots were inspected for native control styling, restrained configuration layout, content/inspector hierarchy, legacy-value feedback and unknown-type access.

## Delivered architecture and models

M3 adds a global `EntityTypeRegistry` beside the unchanged `EntityIndex`. The registry contains reusable definitions; the index contains entity instances. Registry dependencies are passed explicitly to repository and UI. Workspace IDs do not filter definitions.

```ts
interface EntityTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly folderName: string;
  readonly builtIn: boolean;
  readonly retired: boolean;
  readonly properties: readonly PropertySchema[];
}

interface PropertySchema {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyType;
  readonly retired: boolean;
  readonly defaultValue?: PropertyValue;
  readonly max?: number;
  readonly options?: readonly string[];
}
```

The existing five value types remain Text, Number, Rating, Boolean and Select. No per-entity subclasses or specialized Character/Scene/Project implementation exists. The five built-ins seed empty schemas; labels and folders remain editable, and built-ins cannot retire. Custom IDs are safely normalized and stable. Property keys follow M1’s readable snake_case convention; keys and property types are immutable after creation. Duplicate keys, including retired keys, are rejected.

Full architecture and lifecycle: [architecture.md](architecture.md).

## Configuration versus note data

Versioned `data.json` stores the two existing capture settings, `configVersion: 3` and `entityTypes`. It never contains entity instances, their values, bodies or relations. M0/M1/M2 settings are accepted, and absent built-in definitions are seeded without duplicating existing IDs or rewriting notes. Settings and schema changes use a serialized merge queue; registry changes publish only after persistence succeeds. Unknown configuration fields and unreadable individual definitions are retained for recovery. A malformed type-list root or future configuration version blocks loading rather than overwriting configuration.

Explicit reusable values remain human-readable Markdown:

```yaml
bs_schema_values:
  motivation: Find her brother
  importance: 4
  role: protagonist
```

M1 `bs_properties` is unchanged and remains local to one entity. M2 `bs_relations` is unchanged and remains source-owned. Focus displays separate Type properties and Local properties, using the same value-editor component. The native Markdown preview and native-note editing remain intact.

New fields appear immediately on existing entities through registry subscriptions, without bulk file writes. Resolution distinguishes missing, default and explicit values. Defaults are virtual and are not written on creation, schema changes or mere viewing. Reset removes only the explicit value and reveals the current schema default or missing state.

## Editing, retirement and unknown types

Type Manager is available from the command palette, settings and the Focus “Manage … properties” entry. It lists built-in/custom types and supports custom creation, label/folder editing, custom type retirement/restoration, schema creation, label/default/max/options changes and property retirement/restoration. Insertion order persists; drag-and-drop ordering is not introduced.

Select option removal and rating maximum reductions preserve explicit values, mark incompatibilities and permit valid replacement or reset. They never clamp, delete or rewrite notes. A schema’s own optional default must remain valid under its edited constraints.

Retired types retain schemas and existing entity access while leaving normal creation choices. Retired properties retain definitions; stored values appear under “Stored values without an active schema.” Restoration reconnects the same key. Unknown types retain UUID, body, local properties, raw schema values and relations, display “Unknown Entity Type: …”, and allow native Markdown access. Configuration loss therefore does not lose entity data; restoring configuration restores normal field editors.

Value writes share the existing per-entity queue and `processFrontMatter()` path. The transaction checks current UUID, schema and expected source/value, validates before changing one key, and preserves unrelated metadata, other values, local properties, relations and exact body. Malformed containers are reported and require native repair. Stale drafts cannot overwrite newer external values.

## Creation and folders

Create From reads active types from the registry; no five-type UI list remains. The repository checks active registration again and uses the definition’s folder. Generic creation still supplies a new UUID, inherited workspace, `originated-from` targeting the source and no source rewrite. New Focus automatically resolves the selected schema without writing defaults.

`entitiesFolder` retains its original Idea destination. Other type folders are relative to that destination’s parent, preserving all M2 defaults. Custom nested relative folders are validated. Idea’s editable folder name synchronizes the existing capture setting; its parent remains controlled by capture settings. Changing labels/folders never changes type IDs or moves existing notes.

EntityIndex remains the same single UUID map. No additional path index, schema storage, reverse-edge store or speculative optimization was added. M2 relations remain the five fixed kinds and work across custom and built-in types without restrictions.

## Results

| Check | Result |
| --- | --- |
| Strict TypeScript / production esbuild | Passed |
| ESLint | Passed |
| Unit tests | **190 passed**: 140 inherited plus 50 M3 tests |
| Real Obsidian M3 | Passed, including repeated restarts and configuration loss/restoration |
| Real Obsidian M2 regression | Passed: relations, generic creation, renames/deletions and restart |
| Real Obsidian M1 regression | Passed: all five local properties, native Markdown, external edits and restart |
| Real Obsidian M0 regression | Passed: Quick Capture, Inbox, native note, synchronization, settings and restart |
| Plugin renderer errors | None in successful runs |

The 29 registry/schema tests cover seeds, restart/order, lookup, custom IDs, rename/folder, retirement/restoration, built-in protection, duplicate IDs/keys, safe folders, persistence failure, serialized changes, all five schema kinds, default validation, immutable key/type, incompatible constraints and custom Create From. The 21 value tests cover explicit/default/missing resolution, legacy select/rating and malformed values, unknown/orphan data, all five read/write kinds, update/reset, stale schema/value rejection and preservation of unrelated metadata/local fields/relations.

Inherited tests remain passing. The former unsupported-type fixture now uses a malformed type identifier, since valid unknown IDs must remain readable in M3. The M0 real-app script now checks versioned schema configuration alongside the two capture settings instead of requiring a settings-only data file. No behavioral regression assertions were removed.

## Real application scenarios

1. Started with an actual two-key M2 settings file and captured an Idea in workspace `novel`.
2. Created Character Mira through the existing Create From flow and added local/user-owned metadata externally.
3. Opened Type Manager through the command palette and added Character Motivation Text.
4. Confirmed the already-open Character immediately displayed a missing field; its exact disk bytes were unchanged.
5. Saved Motivation and inspected `bs_schema_values.motivation`, preserving local data, relations, extra `bs_*` fields, user metadata and exact Markdown body.
6. Restarted real Obsidian and confirmed the value restored.
7. Renamed Motivation to Primary Motivation, with disabled stable key/type controls; confirmed its original key and value survived.
8. Added Importance Rating max 5 with virtual default 3, Role Select with three options, Cost Number and Secret Boolean with virtual default false.
9. Confirmed defaults were absent from YAML until explicit interaction; saved all five value kinds through their controls.
10. Removed the active Role option and lowered Importance max to 3; confirmed old values remained in the exact unchanged file and appeared incompatible.
11. Chose valid replacements; reset Importance and confirmed it returned to virtual default 3 with no explicit key.
12. Created Quest through Type Manager, with stable `quest` ID, folder Quests, Difficulty Rating and Status Select.
13. Created Quest from the source Idea; checked destination, UUID, workspace, origin and unchanged source bytes.
14. Set Quest values, added/removed/restored a directed dependency to Character, then restarted and verified values and edges.
15. Renamed Quest display label to Mission and changed folder to Missions; confirmed the existing note was neither rewritten nor moved.
16. Retired the custom type; confirmed existing Focus/schema remained usable while Create From excluded it. Restored it.
17. Retired Difficulty and confirmed its stored value appeared in the inactive-schema section without deletion. Restored it afterward.
18. Created another entity of stable type `quest` and confirmed its new Missions destination.
19. Externally changed Difficulty to invalid text, confirmed refresh/incompatibility, and corrected it through Focus.
20. Manually created an unknown `creature` note with content, local property and schema value; confirmed Focus and the actual native Markdown editor remained available, with unchanged file bytes.
21. Changed the built-in Idea folder through Type Manager; confirmed the existing capture setting synchronized and only future captures used Brainstorm/Thoughts.
22. Stopped Obsidian, removed type definitions from configuration and restarted. Quest remained indexed as unknown with values and relations intact and exact file bytes preserved.
23. Restored saved configuration and restarted again; the same Quest ID and stored schema values resolved normally.
24. Inspected reports and screenshots; no plugin renderer errors occurred.

These grouped scenarios cover the requested 45-step M3 journey and additional preservation/default/folder/configuration-loss checks. Full M0/M1/M2 real-app regressions run separately against the M3 implementation.

## Evidence and reproduction

- [M3 report](../.artifacts/m3-1793220490013/report.json)
- [Type Manager](../.artifacts/m3-1793220490013/type-manager.png)
- [Character reusable and local properties](../.artifacts/m3-1793220490013/character-type-and-local.png)
- [Preserved incompatible values](../.artifacts/m3-1793220490013/legacy-values.png)
- [Custom Quest and directed relations](../.artifacts/m3-1793220490013/custom-quest.png)
- [Unknown type with native note access](../.artifacts/m3-1793220490013/unknown-type.png)
- [M2 regression report](../.artifacts/m2-1793220293715/report.json)
- [M1 regression report](../.artifacts/m1-1793220443318/report.json)
- [M0 regression report](../.artifacts/m0-1793220518080/report.json)

Evidence is local under ignored `.artifacts/`. Tests use their own vault/profile and close their own application process. Reproduce with:

```sh
npm run check
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
npm run test:obsidian:m3
```

## Limitations and deferred scope

Raw malformed containers and orphan values are repaired/edited through Markdown; orphan values are read-only in Focus. Invalid individual configuration definitions require manual repair while the plugin is disabled. External edits to `data.json` take effect after plugin reload. Text fields remain single-line. Type IDs, property keys and property types cannot be migrated through the UI. Schema deletion and automatic data cleanup are intentionally unavailable; retirement/restoration provides preservation instead.

This run validates Linux Obsidian 1.14.4, not other platforms, mobile or older releases. Existing duplicate-UUID semantics and linear incoming-edge scans remain unchanged.

Workspace scoping and custom relation schemas are intentionally deferred, along with boards, timeline/graph views, evaluation profiles, formulas and specialized entity UI. **M4 has not been started.**
