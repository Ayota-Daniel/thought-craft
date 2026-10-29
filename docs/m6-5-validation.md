# M6.5 validation — interaction consolidation

Validated **29 October 2026** in real **Obsidian 1.14.5 on Linux**, using isolated profiles and disposable vaults. M6.5 consolidates existing Workspace/Entity/board interactions. **M7 has not been started.**

## Completion report

| Requested area | Delivered result |
| --- | --- |
| 1. Inbox search architecture | Case-insensitive title/type-label scan over existing EntityIndex data, scoped to active Workspace; no body/full-vault index |
| 2. Filter/sort model | Type, on/off board, either-direction relation presence, seven-day updated window; newest/oldest/updated/A–Z/Z–A; temporary local state |
| 3. Selection model | UUID selection, checkboxes, Ctrl/Cmd toggle, Shift-row ranges in display order; hidden selections pruned before batch actions |
| 4. Batch strategy | Reusable application intents; one atomic visual write for bulk board addition; sequential per-note trash with explicit partial results |
| 5. Trash implementation | Confirmation → current UUID/path/identity check in existing metadata queue → native Vault.trash(file, false), recoverable vault .trash |
| 6. Bulk board add | Explicit visible selection only, duplicate membership skipped, nearby clear slots, current Workspace validation, no Markdown/edge writes |
| 7. Add Existing | Searchable multi-checkbox list, type labels, placed-entity exclusion, native keyboard/Space selection, count and Add N action, no UUID text |
| 8. XYFlow selection | Native rectangle on empty drag, Ctrl/Cmd/Shift-click additive selection, Space-drag or middle/right drag pan |
| 9. Multi-node movement | Local preview, settled selection saved atomically; zero writes during pointer movement; group translation remains compatible |
| 10. Focus model | UI-only hidden flags for unrelated cards/edges/groups, with canonical layout retained |
| 11. Multi-root Focus | Union of each root plus direct incoming/outgoing neighbors; independently removable chips, Add focus, Show all; no recursive expansion |
| 12. Groups in Focus | Zone visible if any member is visible; stored bounds/membership unchanged; full board restores on Show all |
| 13. Tabs | Shared compact tablist, roving focus, arrows/Home/End, unique native panel labels and retained Workspace |
| 14. Guide | Small native modal with Getting started, Entities, Properties, Workspaces, Brainstorm and Relations |
| 15. Relation documentation | Five universal meanings, direction and examples; direct help in Focus/board/connected relation pickers; draft preserved |
| 16. EntityIndex | Unchanged single UUID map and scan queries; no extra indexes, database or state framework |
| 17. Tests added | 37 focused unit cases and a native M6.5 suite with 35 entities, trash, pointer selection, restarts and screenshots |
| 18. Total tests | **312 passed**, 275 inherited plus 37 new, in 14 files |
| 19. Build | Strict TypeScript and production esbuild passed |
| 20. Lint | ESLint passed |
| 21. Real Obsidian | Successful M6.5 native journey and regressions listed below |
| 22. Accessibility | Semantic controls, native checkboxes/menus/dialogs, visible focus, keyboard tabs/Focus/Guide; no full canvas AT certification claimed |
| 23. Limitations | Local .trash restoration is manual; no automatic layout restoration after recovery; partial batch completion is explicit; no large-vault/platform certification |
| 24. Deferred to later work | Generic Archive, property query builder, saved searches, semantic/body search, Story experiences, nested groups, auto-layout, Parking Lot and M7 |

## Inbox scope, querying and selection

The original Idea lifecycle is preserved: Ideas appear in Inbox only with status `inbox`. M6.5 also exposes other entity types unless archived, making characters/projects/custom types searchable without changing any status. All candidates must belong to the current Workspace. Unknown/disabled/retired types remain readable and accessible. EntityIndex itself is unchanged.

`application/inbox-query.ts` implements pure scans. Search uses trimmed case-insensitive title or current type label. Has relations means incoming or outgoing, including a stored outgoing link with a missing target; it does not mean only board-visible edges. Recently updated means the last seven days. Filters combine with AND. Sorting is deterministic using current timestamps/title plus an internal UUID tie-breaker; UUIDs are never normal row content.

Search/filter/sort state is local and not persisted. A change of results or Workspace clears selected IDs that are no longer visible. The action bar also intersects selection with current visible IDs synchronously, so an invisible row cannot remain eligible for batch trash while React effects settle. Ctrl/Cmd-click toggles; Shift-click a row adds the displayed range from the last anchor, falling back safely when that anchor is no longer visible. Checkbox selection remains available by keyboard. Clear selection never changes data.

Rows remain compact, with title, type/Workspace and current updated timestamp. A subtle native ⋯ menu contains Open, Add to Brainstorm and Move to trash. The batch bar appears only for selection and stays visible during scrolling. Empty results explain the problem and offer Clear filters. Archive is deliberately deferred: the shared status format exists, but per-type archive workflows are not being invented in this consolidation milestone.

## Batches, trash and recovery

`application/entity-batch.ts` is the explicit boundary between UI intents and repositories/store. React does not implement destructive repository loops.

`WorkspaceBoardStore.addEntities()` validates every UUID against the actual Workspace inside its serialized update, skips already-placed IDs, chooses deterministic clear slots progressively against the new layout, and persists once. If a selected entity moved/missing, the operation rejects before publishing any partial layout. No entity content/property/relation is copied or written.

Single/batch trash always opens a native confirmation listing the exact selected titles and explaining recovery and dangling links. Cancel is the initial focus. During processing, repeat submission/closing is prevented; after failures, results remain visible with Close and no accidental automatic retry. Each unique entity is re-resolved and Workspace-checked by the application. The repository waits for that UUID’s existing metadata queue, reads actual current identity and calls Obsidian’s public `Vault.trash(file, false)` API. Using local `.trash` deliberately guarantees a recovery location independent of a permanent-deletion preference elsewhere. No irreversible-delete API is used.

After trash succeeds, the existing index removes that path; readiness-gated cleanup removes stale board placement and group membership. Other group members, viewports and unrelated notes survive. Incoming source-owned relations remain unchanged and become unavailable-target links. No cascade deletion or mirrored relation cleanup occurs.

Batches report per-item successes and failures. A separate `cleanupWarning` preserves truthful trash success counts if configuration saving fails afterward; the UI does not pretend that failed cleanup means no notes were moved. Missing cards remain hidden from projection even if cleanup persistence fails. Recovery consists of moving the original note from `.trash` back into the vault, then explicitly adding it to Brainstorm if desired. No trash database, hidden archive state or automatic old-layout restoration is introduced.

## Multi-select picker and board movement

Add Existing is a searchable custom list built from semantic native checkbox labels, not a large native select. It shows title/type only, counts selection and offers Add N. Already-placed entities are excluded. Search/index changes prune hidden picker selections rather than retain invisible picks. Source Workspace is captured at dialog opening and validated at commit. The same picker, limited to placed non-root IDs, supports Add focus.

XYFlow’s [native selection and pan options](https://reactflow.dev/api-reference/react-flow) supply rectangle selection and multi-drag; no custom selection geometry was added. Empty-canvas drag selects. Space-drag or middle/right drag pans; Ctrl/Cmd/Shift-click adds/toggles cards. Delete/Backspace still does not delete notes. Group selection remains an explicit persisted organization action, distinct from temporary selection.

`use-board-nodes.ts` keeps drag motion and pending positions local, then collects settled node/group positions into `moveSelection()`. A complete multi-card gesture saves once and preserves group membership, including when the selection crosses a boundary. A deliberate single-card outward move retains M6’s existing leave semantics. Moving a group moves all of its members exactly once, including members hidden by Focus; Focus does not redefine group ownership. Failed persistence restores saved positions. Card movement, selection and group gestures never write Markdown.

## Strong Focus and connected creation

`application/board-focus.ts` derives valid roots and one-hop visible UUIDs using existing relation queries. The UI renders roots plus direct incoming/outgoing neighbors already on the board; unrelated nodes are hidden, not dimmed, and their DOM wrappers disappear. Off-board neighbors are not auto-added. Multiple roots produce a union; neighbors of neighbors are not recursively expanded.

The root chips are independently removable. Removing the last root, Show all, Escape when no modal has priority, Workspace switching or restart exits Focus. Root deletion/membership changes prune invalid roots. Nothing stores Focus roots in Markdown, board configuration or restored native view state. Brainstorm around still places a missing root and centers it, saving only normal board membership/viewport as before.

A group zone is rendered only if at least one visible member remains. Its full stored bounds/membership are preserved; hidden member positions are untouched merely by entering/exiting Focus. Edges are hidden when either endpoint is hidden. Hidden node/edge/group selections are cleared and excluded from action controls immediately. Show all restores the complete layout.

Connected Idea retains real Markdown creation, explicit **new Idea → selected kind → root** direction, authoritative validation, nearby placement and root-group inheritance. With multiple roots, the dialog defaults to the first and offers an explicit root selector, preserving content/kind drafts as the target changes. The new card becomes visible because it is a direct neighbor, without becoming another root.

## Tabs and documentation

Inbox and Brainstorm share a restrained segmented tab component instead of CTA-like buttons. It supplies tab/tablist/tabpanel relationships, unique labels across native ItemViews, roving tab stops, arrow/Home/End activation and focus transfer to the revealed panel. Navigation reuses native leaves, preserves active Workspace, and keeps temporary Inbox state in its mounted view. The component’s view list can be extended later; Story is not added now.

Guide entry points are Inbox Guide, the Open Thoughtcraft Guide command and What do these relations mean? in all relation-selection dialogs. The native modal has short topics and five textual universal definitions:

- Related to: meaningful connection before a stronger kind applies.
- Supports: A strengthens/enables/justifies/contributes to B.
- Alternative to: competing or substitutable directions, stored once.
- Depends on: A requires B to function/exist/remain coherent.
- Originated from: A was created from B; Create From records it automatically.

Examples explicitly show direction. Custom kinds remain user-defined through existing registries. Help opens above the workflow and returns to the intact draft. Explicit HTML button attributes prevent help from submitting the underlying form; native validation found and verified this correction. No documentation website or new relation schema is introduced.

## Automated and native validation

| Check | Result |
| --- | --- |
| Build / strict TypeScript | Passed |
| ESLint | Passed |
| Unit tests | 312 passed; 37 new |
| Native M6.5 | Passed; final evidence below |
| Native M6 | Passed, with the explicitly requested strong-Focus labels/visibility expectations |
| Native M5 | Passed, with multi-checkbox Add Existing and Space-pan interactions |
| Native M4 | Passed |
| Native M3 | Passed |
| Native M2 | Passed |
| Native M1 | Passed |
| Native M0 | Passed |
| Renderer errors | None in successful M0–M6.5 runs |

Earlier diagnostic runs also encountered an intermittent host-only Obsidian `app.js` window-zoom bridge error during application restoration. The same complete final journey was rerun successfully with no renderer errors; final evidence links refer to that clean run. No application error was filtered out of the assertions.

The 37 new tests cover title/type/case/Workspace search, original status lifecycle, all filters and combinations, five sort modes, visible/toggle/range selection, hidden-selection safety, atomic bulk add/duplicate skips/Workspace failure, trash/group cleanup/no cascade/partial failures/separate cleanup failure, settled multi-node membership/invalid positions, single/multi-root one-hop visibility/root removal/Show all/group preservation/new connected visibility, and universal Guide content. Existing 275 tests remain passing. Tests target Thoughtcraft behavior, not native trash/XYFlow internals.

The native suite uses 35 real notes and existing M6 board/groups. Its grouped scenarios cover the requested 57-step journey:

1. Open M6 configuration; compare exact saved board before interactions. Search title/type, combine filters, check recent window, empty results, sorting and hidden-selection pruning.
2. Select several explicit visible rows, add them to Brainstorm and compare exact Markdown bytes. Confirm only their UUID placements changed.
3. Cancel batch trash, then confirm it. Verify original bytes in local .trash, index/board/group cleanup and untouched source notes with dangling links.
4. Switch native views by arrow-key tabs, verify Workspace, search/select several Add Existing checkboxes by keyboard and confirm no UUID text.
5. Draw an actual rectangle around two cards, drag one, check both deltas, instrument zero writes during pointer movement and one at release, restart and compare saved positions.
6. Focus a grouped root; check incoming/outgoing visible, unrelated DOM nodes absent, relevant zones shown and canonical nodes/groups unchanged.
7. Add another root, verify union/group visibility, choose another connected target without losing the draft, remove one chip and Show all, compare layout again.
8. Open relation help from connected creation, read all five kinds, close with Escape, verify intact draft, then create a real connected neighbor with group inheritance and no new Focus root.
9. Exercise the row action menu’s single-trash confirmation/Cancel, full Guide topics, reverse keyboard tabs, dark/light/narrow screenshots, reduced motion and restart with no persisted Focus.

Evidence remains local under ignored `.artifacts/`, using separate profiles/vaults only.

- [M6.5 native report](../.artifacts/m6-5-1793305064012/report.json)
- [Inbox, dark](../.artifacts/m6-5-1793305064012/inbox-dark.png)
- [Sticky batch selection](../.artifacts/m6-5-1793305064012/inbox-batch.png)
- [Trash confirmation](../.artifacts/m6-5-1793305064012/trash-confirmation.png)
- [Multi-select Add Existing](../.artifacts/m6-5-1793305064012/add-existing-multiple.png)
- [Multi-root Focus, dark](../.artifacts/m6-5-1793305064012/focus-multiple-dark.png)
- [Relation Guide](../.artifacts/m6-5-1793305064012/relation-guide.png)
- [Inbox, light](../.artifacts/m6-5-1793305064012/inbox-light.png)
- [Inbox, narrow](../.artifacts/m6-5-1793305064012/inbox-narrow.png)
- [Focus, light](../.artifacts/m6-5-1793305064012/focus-light.png)
- [M6 regression](../.artifacts/m6-1793304544000/report.json)
- [M5 regression](../.artifacts/m5-1793304609541/report.json)
- [M4 regression](../.artifacts/m4-1793304727711/report.json)
- [M3 regression](../.artifacts/m3-1793304766346/report.json)
- [M2 regression](../.artifacts/m2-1793304881247/report.json)
- [M1 regression](../.artifacts/m1-1793304940208/report.json)
- [M0 regression](../.artifacts/m0-1793304979169/report.json)

```sh
npm run check
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

Configuration stays version 6: M6.5 adds no persisted schema. Search/filter/sort/selection/Focus roots are temporary. EntityIndex, type/Workspace/relation registries, Markdown schemas and the library boundary remain intact; no new dependency was added. Native validation covers the current Linux Obsidian release and a 35-entity scenario, not a large-vault benchmark. No visible performance issue was observed at that scale; no speculative extra index was introduced.

Keyboard controls cover forms, checkboxes, row/native menus, batch confirmation, tabs, Focus chips and Guide. Native XYFlow focus/arrow alternatives remain, but spatial navigation is not full assistive-technology certification. Mobile, other OSes/older versions and third-party themes remain unvalidated. Rectangle/pan conventions changed deliberately as requested and are documented in-product.

Trash is intentionally local .trash, with manual restoration and explicit board re-add. Partial destructive batches cannot be rolled back automatically; failures are named. Generic Archive, advanced property filters, saved searches/presets/query language, semantic/AI/body search, multiple named boards, group resizing/colors/nesting, dedicated Parking Lot, auto-layout and specialized Story/Plot/timeline experiences remain deferred. **M7 has not been started.**
