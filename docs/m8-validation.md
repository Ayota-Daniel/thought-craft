# M8 validation — Plot Board and Markdown narrative order

**M9 has not been started.** M8 adds ordered narrative structure over the existing generic engine. Validated on **30 October 2026** in real **Obsidian 1.14.5 on Linux**, using isolated profiles and disposable vaults.

## Completion report

| Requested area | Implementation / result |
| --- | --- |
| 1. Plot architecture | Story secondary view, pure projection/order helpers, serialized PlotService and existing Entity repository |
| 2. Story Section | Seventh global built-in `story-section`, real UUID Markdown note, empty global schema, normal Properties/Relations/Focus/Brainstorm |
| 3. Placement model | Optional parsed StoryPlacement on generic Entity; sectionId/order/issues/raw expected data; no Scene/Act/Chapter subclass |
| 4. Markdown format | Scene `bs_story.section_id` + `order`; Section `bs_story.order`; no copied titles, display numbers or global sequence |
| 5. Ordering | 1000-step edges and integer midpoint; deterministic UUID ties for manual duplicate/unranked data |
| 6. Rebalance | Only destination Scene list or Section-note list, skipping unchanged ranks; source Section is not compacted |
| 7. Application service | moveScene (including unplace), reorderSection and generic create orchestration; UI does not calculate ranks |
| 8. Drag adapter | Native HTML drag/drop in a small UI hook, one item at a time; no XYFlow or new dependency |
| 9. Plot UI | Vertical editorial Sections, compact Scene rows, restrained headers, search and native menus |
| 10. Unplaced | No forced assignment; unresolved/missing/wrong-Workspace references stay readable; compact scrolling and 25/50/100 paging |
| 11. Section creation | Generic createEntity → real note → assigned sparse rank; no automatic Acts |
| 12. Scene creation | In-Section appends by UUID/rank; Unplaced creates without narrative metadata; generic writer remains authoritative |
| 13. Writing | Double-click/Write and Scene creation open actual native Markdown; Open Focus retains generic tools and Back to Plot |
| 14. Missing/deleted Section | Referencing Scenes remain intact and unresolved, no cascade or automatic rewrites; explicit reassignment repairs mapping |
| 15. Workspace validation | Current source/Section type and same Workspace checked by application and repository; Story capability rechecked at commit |
| 16. Brainstorm | Plot never writes BoardStore/positions/groups/membership; both dimensions coexist |
| 17. Migration | Configuration v8 seeds type only; existing enabled IDs/Story settings/layout retained; M7 Scenes remain byte-identical and Unplaced |
| 18. EntityIndex | No implementation changes, extra maps or indexes; existing snapshots/getById only |
| 19. Dependencies | None added; native drag/drop and Obsidian Menu/Modal/FileManager reused |
| 20. Added tests | 36 focused unit cases plus native M8 suite with 107 original Scenes, pointer drags, keyboard menus, writing, rename/delete and restarts |
| 21. Total tests | 399 unit tests in 17 files |
| 22. Build | Passed; final verification below |
| 23. Lint | Passed; final verification below |
| 24. Native validation | M8 passed with pointer/keyboard/native editor/restart checks; regressions below |
| 25. 100+ Scenes | Compact rows; Unplaced defaults 25, Section lists 50; at most selected page per list mounted; observations below |
| 26. Accessibility | Labelled controls, native menus/dialogs, focus states, all movement via non-drag menus; native pointer DnD is not a keyboard-drag/AT certification claim |
| 27. Limits | Multi-file writes not transactional; malformed root needs Markdown repair; no global undo, no touch DnD certification or large-vault benchmark |
| 28. Deferred | Nested hierarchy, Chapter semantics, Timeline, Plot Thread/Character overlays, batch moves, manuscript tooling and all M9 work |

## Ownership and migration

Configuration moves to version 8, using the existing serialized merge queue. `story-section` seeds through EntityTypeRegistry with stable ID, label **Story Section**, default folder **Story Sections**, native icon and empty schema. An existing valid custom definition with this ID wins, preserving its label, destination, properties and retirement. This extends the documented Plot Thread conflict policy; it never silently replaces custom configuration or duplicates a definition on restart.

Existing Workspace enabled-type arrays do not gain this type automatically. Story setup offers explicit enabling through WorkspaceRegistry. Existing Story experience activation, schemas, custom relations, active Workspace, boards/groups and unknown configuration keys remain intact. Migration creates no Sections, Acts or Scene ranks and rewrites no Markdown. A 107-Scene M7 Workspace initially displays **107 Unplaced**.

Story Sections are generic Entities, so their real Markdown can contain narrative notes, properties and source-owned relations, and can participate in the shared Brainstorm board. There is no Section-only repository or separate Story data store. Sections have one hierarchy level; names such as Act I or Chapter 1 carry no special semantics.

```yaml
# Scene
bs_story:
  section_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
  order: 2000

# Story Section
bs_story:
  order: 1000
```

UUID references survive Scene/Section filename changes. Rename uses native FileManager.renameFile, retaining Obsidian's ordinary backlink preferences; no Scene placement migration is needed. Narrative data never goes into plugin settings. Plot search, selected Scene and pagination remain temporary UI state.

## Reading, ranking and writing

The placement mapper tolerates absent, malformed and unresolved metadata without rejecting the Entity. It records issues and raw expected data. Valid mappings preserve unknown neighboring keys during explicit changes. Malformed non-mapping containers are not overwritten; native Markdown repair is required first. Unplacing deletes only the owned section_id/order keys and removes an empty bs_story mapping, retaining any other keys.

The Plot projection scopes EntityIndex snapshots to the active Workspace, orders Sections, resolves target UUIDs with existing getById, then derives per-Section Scene order and the global sequence. Missing/deleted/wrong-type/cross-Workspace targets and malformed/missing assigned ranks appear in Unplaced with a restrained issue. Reading never silently repairs files. Archived Scenes remain material, consistently with M7 collections.

A move takes one UUID and a destination before-UUID or null append anchor, using the **full** destination sequence before search/paging. Edge ranks use ±1000; interior ranks use a floored midpoint. Zero and negative edge ranks are valid. A practical gap smaller than 2, missing ranks or duplicate manual ordering triggers normalization to 1000, 2000, etc. Only changed ranks in that destination list are written. Section reorder applies the same algorithm to Section notes only. Moving a Scene out does not close gaps in its old Section. Display indexes are derived, never persisted.

PlotService serializes intents and calculates each plan before persisting. The same ObsidianEntityRepository and per-Entity metadata queue perform processFrontMatter writes, rechecking identity, source type, Workspace, Story capability and target Section. Expected raw placement guards concurrent narrative edits. Only bs_story changes; UUID/type/Workspace, local properties, schema values, relations, user frontmatter, bs_updated and exact Markdown body are preserved. Existing property/relation writes keep their previous timestamp behavior.

Multi-note normalization can partially fail. Saving stops, reports written/total count and renders actual state refreshed from successful/rejected Markdown commits. There is no all-or-nothing promise, automatic rollback or database transaction layer. Creation first writes a normal Entity; if placement then fails, a typed error reports its safe path and repeat Create is disabled so recovery does not create duplicates.

Continue Writing retains M7's most recently edited Scene resolution. Because M7 includes native file modification time, a narrative metadata edit can become the latest edited Scene even though bs_updated is deliberately unchanged. No completion or narrative-importance inference is introduced.

## UI and drag/drop choice

Plot belongs only in Story secondary navigation and Overview's Open Plot action. Primary Inbox/Brainstorm/Story tabs are unchanged. The board uses vertical Sections rather than horizontal status columns or a free canvas. Headers show real title/count and one native menu. Scene cards show title, derived position, Write and an action menu; no invented POV/tension/status badges appear.

Existing dependencies contain a spatial canvas library, but no ordered-list adapter. A small native HTML drag/drop adapter is sufficient for the M8 one-item scope: source UUID/kind, before/end targets, a highlight and one drop intent. It adds no coordinate engine, sensors, ranking logic or library model to domain/application code. Pointer drag is validated against real Electron; non-pointer alternatives use native menus. No keyboard-drag sensor or touch support is claimed.

Scene actions: Write, Open Focus, Move to section, Move earlier/later, Move to Unplaced. Section actions: Open, Rename, Add Scene, Move earlier/later. Keyboard users Tab to actions and use the native menu/dialog. Single click selects a Scene; double-click/Write opens real Markdown. Focus shares Properties, Relations, Create From and Brainstorm around; Back restores Plot. Section creation remains on Plot; Scene creation opens native writing.

Unplaced is searchable, compact and scrollable with shared M6.6 25/50/100 pagination (default 25). Section lists use default 50 and shared paging for larger collections. Search filters titles without changing ranks or numbering of hidden Scenes. The vertical layout wraps controls in narrow native panes. Drag state never adds a new layout block that shifts targets under the pointer. Host tokens provide light/dark surfaces, borders, selection and focus; no new animation, gradient or decorative container system is introduced.

## Automated checks and native scenario

The 36 new unit cases cover missing/valid/malformed placement, empty/invalid Section IDs, invalid numbers/containers, explicit repair and neighboring field preservation, stale rejection, clean unplace, edge/midpoint ranks, exhausted gaps/overflow, repeated insertion/rebalance and deterministic results. They also cover safe built-in/custom type handling, generic relations, derived Section/Scene/global sequence and numbering, M7 absence migration, unresolved/wrong-Workspace references, rename identity, minimal place/move/unplace, invalid sources/targets, serialized intents, failed/partial writes and all creation modes/recovery.

Inherited assertions are retained. Fixture updates accept configuration v8/seventh built-in, add the Plot Guide topic and explicitly enable the newly recommended Story Section during the M7 setup scenario. Existing behavior/preservation tests are not removed.

The native suite uses a disposable M7 vault/profile with 107 real Scenes, properties/schema/user metadata and an existing Brainstorm group/positions. It checks:

1. Exact pre/post-migration bytes of all 107 Scenes, retained configuration/layout, no auto-type enabling and all Scenes Unplaced.
2. Explicit enabling and three real Section notes, sparse metadata and creation form.
3. Actual pointer place/reorder, zero writes before release and one normal drop write; retained non-story frontmatter/body and independent spatial state.
4. Restarted order, cross-Section drag, return to Unplaced, context Scene creation and real editor content.
5. Unplaced creation, Scene/Section Focus and Back, UUID-based rename, pointer Section reorder and keyboard move menus.
6. Scene Brainstorm placement coexisting with Plot movement; deleted Section leaves unresolved Scenes; explicit reassignment repairs metadata.
7. Separate Workspace with empty Plot, 100+ Scene distribution, title search, dark/light/narrow rendering and Plot Guide.
8. Final restart preserving Section/Scene order, board state and a single built-in definition; no copied narrative configuration or renderer errors.

## Results and evidence

| Check | Result |
| --- | --- |
| Strict TypeScript / production build | Passed |
| ESLint | Passed |
| Unit tests | 399 passed |
| Native M8 | Passed, no renderer errors |
| Native M7 | Passed |
| Native M6.6 | Passed |
| Native M6.5 | Passed |
| Native M6 | Passed |
| Native M5 | Passed |
| Native M4 | Passed |
| Native M3 | Passed |
| Native M2 | Passed |
| Native M1 | Passed |
| Native M0 | Passed |
| Renderer errors | None in successful M0–M8 runs |

Evidence remains local under ignored `.artifacts/`. Normal user vaults/profiles are not used. Diagnostic runs are not presented as successful evidence.

- [M0 regression](../.artifacts/m0-1793347010768/report.json)
- [M1 regression](../.artifacts/m1-1793346905406/report.json)
- [M2 regression](../.artifacts/m2-1793346880231/report.json)
- [M3 regression](../.artifacts/m3-1793346748464/report.json)
- [M4 regression](../.artifacts/m4-1793346664131/report.json)
- [M5 regression](../.artifacts/m5-1793346624998/report.json)
- [M6 regression](../.artifacts/m6-1793346497571/report.json)
- [M6.5 regression](../.artifacts/m6-5-1793346363046/report.json)
- [M6.6 regression](../.artifacts/m6-6-1793346263032/report.json)
- [M7 regression](../.artifacts/m7-1793346156246/report.json)
- [M8 native report](../.artifacts/m8-1793346015963/report.json)
- [107 Unplaced Scenes](../.artifacts/m8-1793346015963/unplaced-107-dark.png)
- [Story Section creation](../.artifacts/m8-1793346015963/section-creation-dark.png)
- [Structured Plot / drop result](../.artifacts/m8-1793346015963/structured-plot-dark.png)
- [107-Scene story, dark](../.artifacts/m8-1793346015963/structured-107-dark.png)
- [107-Scene story, light](../.artifacts/m8-1793346015963/structured-107-light.png)
- [Drag state, dark](../.artifacts/m8-1793346015963/drag-state-dark.png)
- [Drag state, light](../.artifacts/m8-1793346015963/drag-state-light.png)
- [Scene actions, light](../.artifacts/m8-1793346015963/scene-menu-light.png)
- [Narrow Plot](../.artifacts/m8-1793346015963/plot-narrow-light.png)
- [Narrow sequence](../.artifacts/m8-1793346015963/plot-narrow-sequence-light.png)

```sh
npm run check
npm run test:obsidian:m8
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

The validation scale is 107 original Scenes plus new creations, not a 500-Scene or large-vault benchmark. In-memory filtering/sorting and the unchanged EntityIndex are retained. A story with many Sections still renders one compact page in each Section; no virtualization or new indexes are introduced. No frame-rate or general performance guarantee is claimed.

Native HTML DnD uses pointer drag and browser scrolling. Native Menu owns arrow selection; a local Escape guard remains through the end of its dismissal event so the same key cannot also activate the editor underneath. The guard is removed when the menu hides. Every move/reorder has a keyboard menu alternative, but keyboard-drag sensors, full assistive-technology certification, touch/mobile, other OSes, older runtimes and third-party themes remain unvalidated. Obsidian's native undo is not presented as Plot-wide transactional undo. Repeated external rank edits may produce safe stale-operation errors requiring review. Malformed containers require native repair. A failed multi-file reorder can remain partially applied and is reported explicitly.

Chapters, nested narrative hierarchy, narrative/chronological Timeline, Plot Thread overlays, Character/Location lanes, arcs, batch selection/movement, global undo, manuscript compilation/statistics, Story schema overrides and AI writing remain deferred. **M9 has not been started.**
