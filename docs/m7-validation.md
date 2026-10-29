# M7 validation — Story Workspace foundation

M7 composes the existing Entity engine. **M8 has not been started.** Validated on **29 October 2026** in real **Obsidian 1.14.5 on Linux**, using an isolated profile and disposable vault. Regression evidence is recorded below.

## Completion report

| Requested area | Implementation / result |
| --- | --- |
| 1. Experience model | `WorkspaceExperienceId = 'story'`; immutable `enabledExperiences` in each Workspace definition |
| 2. M6.6 migration | Version 7 configuration; absent experience list becomes `[]`; existing enabled type IDs, relations, active Workspace, boards/groups and unknown settings retained; no Markdown rewrite |
| 3. Primary tabs | Same WorkspaceTabs component; Story appears only when explicitly enabled; roving arrow/Home/End navigation retained |
| 4. Internal navigation | Light horizontal button navigation with aria-current; Overview and five material collections; per-Workspace section kept in ItemView memory |
| 5. Plot Thread | Stable `plot-thread` built-in, label Plot Thread, folder Plot Threads, empty schema; custom-ID conflict preserved as described below |
| 6. Overview | Continue Writing plus computed collection rows, shared Brainstorm action and optional setup notice; no metrics dashboard |
| 7. Continue Writing | Latest Scene in active Workspace, effective timestamp and real native Markdown note target |
| 8. Collections | One StoryCollection component over EntityIndex snapshots; Scenes, Characters, Locations, Plot Threads, Ideas |
| 9. List reuse | Shared sortEntities, M6.6 paginateInbox/InboxPagination and InboxRow/native row menu; title-only Story search before sorting/paging |
| 10. Creation | Generic source-free createEntity application helper → existing repository; Scene opens Markdown, other types open Focus |
| 11. Focus origin | Small in-memory Workspace/section context; Back returns there; generic entry resets origin; disabled/retired origin falls back to Inbox |
| 12. Brainstorm | Existing board/store/cards only; Story row Add action places UUID with the normal batch operation; Overview opens shared Brainstorm |
| 13. Relations | Existing source-owned universal and Workspace custom definitions; no automatic Story relation schema |
| 14. Properties | Existing global schemas/local properties and Focus editor; no Story overrides or collection property copies |
| 15. Persistence | Only capability definition is new durable state; entities/content/values/relations remain in Markdown; no counts or scene bodies in settings |
| 16. Architecture | Story UI composition and small application query helper; no second domain engine, ExperienceRegistry or routing framework |
| 17. EntityIndex | Unchanged, no new maps/indexes |
| 18. Added tests | 28 focused unit cases and native M7 scenario with 107 Scenes, two Workspaces, actual editor writes and restart |
| 19. Total tests | 363 unit tests in 16 files |
| 20. Build | Passed; final check recorded below |
| 21. Lint | Passed; final check recorded below |
| 22. Native validation | M7 passed, including actual editor writes, two Workspaces and restart; regression evidence below |
| 23. Themes/narrow | Overview, collections, setup, navigation and creation dialogs captured; narrow screenshots visually inspected, no horizontal pane overflow |
| 24. Accessibility | Native forms/buttons, labelled search/sort/pagination, current section, primary tab keyboard handling, dialog autofocus/Escape/native focus return; full AT certification not claimed |
| 25. Limits | Shared metadata sorting differs from native mtime-aware Continue Writing; collection drafts reset on section changes; origin/subsections not restored after restart |
| 26. Deferred | Plot/Story Boards, Acts/Chapters, narrative ordering, Timeline, Scene Editor, arcs/graphs, manuscript tools, Story schemas, AI and all M8 work |

## Capability migration and Plot Thread conflict policy

The existing Workspace parser accepts a missing `enabledExperiences` field as pre-M7 configuration and normalizes it to `[]`. The manager saves explicit choices through WorkspaceRegistry; Story setup enables only individually requested recommended types through `enableEntityType()` inside the serialized application commit. This avoids lost concurrent enables and keeps raw configuration mutation out of React. Newly configured Workspaces still start with Idea unless explicitly changed. Types and the experience remain independent.

M6.6 Workspace type arrays are never expanded merely because Plot Thread is seeded globally. Story never infers activation from existing Scenes or Characters. Disabling the experience hides its tab and tools; an already-open native Story pane explains the disabled state. It never alters entity files, type availability, relation definitions, membership, properties or board state. Re-enable restores normal access.

Missing `plot-thread` uses the existing built-in seed pass. A valid pre-existing **custom** definition occupying that exact ID wins: preserve custom identity, label, folder, schema and retirement state. There is no automatic conversion, rename or duplicate. EntityTypeRegistry documents this one compatibility exception; a retired custom definition remains retired and Story offers Manage Entity Types. This exception applies to loading/updating that preserved custom definition; new custom creation cannot claim an occupied built-in ID. Invalid definitions retain the existing unreadable/raw recovery behavior.

## Data and interaction boundaries

Story collection scope is Workspace → fixed Story type → title search → shared sort → shared pagination. Unlike Inbox, collections include all lifecycle states, so archived/exploring Ideas remain discoverable. Custom types stay in generic Inbox/Brainstorm/Focus. Unavailable/retired collection types show a clear manager action, preserve readable rows and disable creation. Disabled recommended types do not block the rest of Story. Counts include the same real material as collections and never persist.

Default collection sort is Recently updated. The four supported modes are Recently updated, Newest created, A–Z and Z–A; no narrative ordering is implied. Page size defaults to 50 with 25/50/100 choices, bounded direct pages, disabled boundaries, clamping and zero-result hiding. Search/sort/size reset page 1; Workspace/section changes remount the small collection, clearing its transient state. Story uses individual native row actions without adding a new batch selection feature.

Continue Writing considers current Entity timestamps and cached Obsidian `TFile.stat.mtime`. Native Markdown editing intentionally leaves `bs_updated` intact; cached mtime allows the latest body edit to become the continuation target without any extra disk scan or metadata mutation. A predictable fallback uses remaining valid timestamps, then zero and UUID tie-breaking. Collection sorting/date rows retain existing metadata timestamp behavior. This distinction is intentional and does not create a second timestamp store.

Generic source-free creation validates the real Workspace/type/title, supplies new UUID/time and empty relations, then calls the existing EntityWriter/repository. No per-type application engines or dummy scenes exist. Scenes use Create & write and open the real Markdown editor. Character/Location/Plot Thread/Idea open the existing generic Focus with native Markdown, properties, relations, Create From and Brainstorm actions. The repository’s existing commit-time validation and recoverable file errors remain authoritative.

Focus origin contains only Workspace ID and Story section in memory. Back restores that section when still enabled; related-entity/Create From actions carry the origin forward. Opening the same UUID from a generic source resets the origin. Restored Focus view state remains entityId-only. The section map stays in Story ItemView memory, scoped by Workspace; no routing history or `bs_story_view` is written.

## Tests and compatibility updates

The 28 M7 unit cases cover migration preservation/non-opt-in, enable/disable/re-enable/restart/frozen state, failed persistence, concurrent explicit type enabling, malformed recovery, safe built-in seeding/folder/idempotence, active/retired custom conflicts, generic creation/Create From/properties/custom relations, all five Workspace collection scopes, archived material, computed counts, no Scene state, latest metadata/native editor mtime/fallback, title search before multi-page slicing, stable sorts and all five generic writer/disabled-type paths.

Inherited tests remain. Necessary fixture updates reflect the new v7 future-version boundary, sixth built-in and Story Guide topic. The former M4 custom Plot Thread fixture now uses custom Story Arc, preserving its independent custom-type/retirement/Workspace assertions; Plot Thread conflict migration is tested explicitly in M7. Native prior-milestone version assertions accept v7; their behavior/preservation checks remain intact.

## Native scenario

The isolated M7 suite uses the same Electron/Obsidian paths and Playwright connection as earlier milestones, a disposable profile/vault, and native Vault/FileManager/editor APIs. It checks these grouped scenarios:

1. Upgrade an M6.6 Workspace/board with a real note; compare exact Markdown and layout, preserve unrelated settings, verify no Story or new enabled types.
2. Enable Story through Workspace Manager, show Overview/empty Scene/setup, individually enable the four missing types without forced choices.
3. Create Character, Location, Plot Thread and Idea; inspect real type/Workspace/path/content; exercise local/schema properties, generic Focus and correct Back collection.
4. Keyboard-open creation, check title autofocus, Escape and native focus return. Create Scene into native Markdown, type using its actual editor, create another Scene, later edit the first, and verify the continuation target changes correctly.
5. Open Scene Focus from collection and native Markdown through its secondary action.
6. Add 105 real Scene files with Vault API (107 total), exercise 25/50/100, direct/previous/next, title search, zero results and sorting.
7. Define a normal Workspace appears-in relation, relate Character→Scene and Plot Thread→Scene, add Story entities to the shared board, and navigate primary tabs by keyboard.
8. Use second Workspace without Story, enable it, create its Scene, confirm collection/continuation separation; disable/re-enable first Workspace and compare exact entity bytes.
9. Inspect Overview, collections, setup, dialogs and navigation in light/dark/narrow panes; exercise secondary navigation and Guide Story.
10. Restart real Obsidian, confirm Story enablement/type idempotence, exact Markdown and no renderer errors.

## Results and evidence

| Check | Result |
| --- | --- |
| Build / strict TypeScript | Passed |
| ESLint | Passed |
| Unit tests | 363 passed |
| Native M7 | Passed, no renderer errors |
| Native M6.6 | Passed |
| Native M6.5 | Passed |
| Native M6 | Passed |
| Native M5 | Passed |
| Native M4 | Passed |
| Native M3 | Passed |
| Native M2 | Passed |
| Native M1 | Passed |
| Native M0 | Passed |
| Renderer errors | None in successful M0–M7 runs |

Evidence remains local under ignored `.artifacts/`; normal user vaults/profiles are not used. Diagnostic attempts are not presented as successful evidence.

- [M7 native report](../.artifacts/m7-1793310931764/report.json)
- [Overview, dark](../.artifacts/m7-1793310931764/story-overview-dark.png)
- [Overview, light](../.artifacts/m7-1793310931764/story-overview-light.png)
- [Scenes, dark](../.artifacts/m7-1793310931764/story-scenes-dark.png)
- [Scenes, light](../.artifacts/m7-1793310931764/story-scenes-light.png)
- [Characters, dark](../.artifacts/m7-1793310931764/story-characters-dark.png)
- [Characters, light](../.artifacts/m7-1793310931764/story-characters-light.png)
- [Continue Writing](../.artifacts/m7-1793310931764/story-continue-writing-dark.png)
- [Character creation, dark](../.artifacts/m7-1793310931764/story-create-character-dark.png)
- [Scene creation, light](../.artifacts/m7-1793310931764/story-create-scene-light.png)
- [Story disabled](../.artifacts/m7-1793310931764/story-disabled-dark.png)
- [Activation in Workspace Manager](../.artifacts/m7-1793310931764/story-activation-dark.png)
- [Story enabled](../.artifacts/m7-1793310931764/story-enabled-dark.png)
- [Setup, dark](../.artifacts/m7-1793310931764/story-setup-dark.png)
- [Setup, light](../.artifacts/m7-1793310931764/story-setup-light.png)
- [Narrow Overview](../.artifacts/m7-1793310931764/story-overview-narrow-light.png)
- [Narrow Scenes](../.artifacts/m7-1793310931764/story-scenes-narrow-light.png)

- [M6.6 regression](../.artifacts/m6-6-1793310506762/report.json)
- [M6.5 regression](../.artifacts/m6-5-1793310540721/report.json)
- [M6 regression](../.artifacts/m6-1793310571562/report.json)
- [M5 regression](../.artifacts/m5-1793310611952/report.json)
- [M4 regression](../.artifacts/m4-1793310683244/report.json)
- [M3 regression](../.artifacts/m3-1793310730155/report.json)
- [M2 regression](../.artifacts/m2-1793310788925/report.json)
- [M1 regression](../.artifacts/m1-1793310839082/report.json)
- [M0 regression](../.artifacts/m0-1793310882608/report.json)

```sh
npm run check
npm run test:obsidian:m7
npm run test:obsidian:m6-6
npm run test:obsidian:m6-5
npm run test:obsidian:m6
npm run test:obsidian:m5
npm run test:obsidian:m4
npm run test:obsidian:m3
npm run test:obsidian:m2
npm run test:obsidian:m1
npm run test:obsidian
```

## Limits and deliberately deferred work

Native coverage targets this Linux desktop runtime. Full screen-reader/spatial canvas certification, other OSes/mobile, older runtimes, third-party theme combinations and large-vault benchmarks remain unvalidated. The shared M6.6 popover still requires the validated platform API. Story uses no new animation, dependency, virtualization or index optimization.

Continue Writing tracks file edits, not narrative importance or editor cursor position; a file touched by an external tool can become most recent. Collection sorting remains metadata-based. Story does not interpret Character arcs, Plot Thread resolution or Scene order. Missing Entity timestamps already fail the existing metadata parser; query fallback also remains deterministic for malformed in-memory input.

Plot/Story Boards, Acts, Chapters, drag reordering, narrative/chronological timelines, specialized Scene Editor, arcs/graphs, manuscript compilation, statistics/goals, world map/lore, automatic relation recommendations, Story PropertySchema overrides and AI writing are deferred. **M8 has not been started.**
