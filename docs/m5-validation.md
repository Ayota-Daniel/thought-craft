# M5 validation — Brainstorm Board

Validated on **29 October 2026** in real **Obsidian 1.14.4** on Linux, with isolated profiles and disposable vaults. The board is a curated view of existing Thoughtcraft data. No Entity title, content, type, property value or relation instance is copied into its configuration.

## Architecture and completion report

| Area | Delivered result |
| --- | --- |
| Architecture | Added a board-only state model, store, projection and actions beside the existing registries/index/repository |
| Board model | One `WorkspaceBoardState` per touched Workspace: UUID-to-position nodes and pan/zoom viewport |
| Persistence | Version 5 configuration; lazy board state, serialized changes, no Markdown coordinates or copied metadata |
| Canvas decision | `@xyflow/react` 12.12.0 for drag, pan/zoom, geometry and keyboard support; library types remain in UI |
| View structure | Native ItemView, Workspace switcher, Inbox/Brainstorm navigation, small toolbar and canvas adapter |
| EntityCard | One generic renderer using the current index Entity, registry label, native icon and title |
| Creation | Existing capture/repository creates a real Idea first; only then its UUID is placed |
| Add existing | Native keyboard-accessible title/type search in current Workspace, excluding already placed entities |
| Edges | Derived solely from actual indexed relations with both endpoints placed in that Workspace |
| Visual connection | Drag handles → native valid-kind picker → existing repository; no optimistic edge persistence |
| Remove membership | Explicit Remove from board edits only visual layout; Delete/Backspace shortcuts are disabled |
| Remove relation | Explicit Remove relationship with confirmation invokes the existing expected-relation Markdown mutation |
| Workspace switching | Canvas remounts with that Workspace’s saved viewport; layouts remain isolated and retained across retirement/restoration |
| External updates | UUID rename, domain data, relation/type labels and relation edits refresh the view; stale placements clean only after index readiness |
| EntityIndex | Unchanged single UUID map; no speculative path/reverse-edge indexes |
| Dependencies | One direct runtime addition: `@xyflow/react`; no new icon library, Redux or application Zustand store |
| Accessibility | Native toolbar/dialogs, focusable cards/edges, Enter/open, Space/select, arrow movement, keyboard Connect alternative and visible focus |

Full architecture is documented in [architecture.md](architecture.md).

## Visual state and configuration migration

```ts
interface WorkspaceBoardState {
  readonly workspaceId: string;
  readonly nodes: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
}
```

The existing `data.json` gains optional `boards` and uses `configVersion: 5`. Missing layout is an empty cached view and is not saved merely by opening a board. M4 Workspace/type/property/relation definitions, active Workspace, capture settings and unrelated keys survive the merge. There is no Entity note migration. Layout entries contain no selection, node dimensions, copied Entity data or edges; coordinates never enter frontmatter.

`WorkspaceBoardStore` validates finite positions/viewport and a 0.35–1.75 zoom range. It serializes writes against current state and publishes only after saving succeeds. Duplicate placement is rejected. Add existing checks UUID presence and actual Workspace membership; readable disabled/unknown types can still be placed. Unknown/retired Workspaces do not accept normal mutations, but their saved layout is retained for restoration. Invalid individual layouts remain in configuration for recovery with a notice; a malformed root container blocks loading rather than overwriting user configuration.

Drag motion is local React state. Settled drag release and arrow-key changes save through the store; viewport saves at interaction end. A real-app counter confirmed **zero configuration writes during pointer movement and one at release**. No Markdown writes occur for layout, viewport, selection, Add existing or Remove from board.

## Canvas/library boundary and build

React Flow provides the documented [node/viewport interaction API](https://reactflow.dev/api-reference/react-flow) and [keyboard/accessibility primitives](https://reactflow.dev/learn/advanced-use/accessibility), avoiding a custom pan/zoom engine. Domain/application modules contain no library types. React Flow’s internal dependencies, including its own state mechanism, stay behind the UI adapter; Thoughtcraft uses its existing subscriptions and localized React state.

The UI is split across `brainstorm-view`, `brainstorm-app`, `brainstorm-canvas`, `brainstorm-toolbar`, generic `entity-node`, `relation-edge`, `flow-adapter`, subscriptions and focused native dialogs. There is no 700-line board component. Position/projection/validation helpers stay outside JSX. The native Add Relation dialog gains only an optional target predicate for the keyboard board alternative; its default M4 behavior is unchanged.

The authored stylesheet moved to **`src/styles.css`**, preserving the validated Focus actions and shared modal focus/inset/scroll-clearance rules. It imports the library base CSS, then applies restrained host-token board styling. esbuild now generates both root `main.js` and root `styles.css`; the install contract remains those files plus `manifest.json`. No CDN, browser download or extra runtime file is required. `THIRD_PARTY_NOTICES.txt` records bundled runtime licenses and is embedded in the generated files. Production build and real Obsidian confirm React 19/CJS/style compatibility.

Restoration testing found two integration details that were corrected: the native ItemView mounts after layout-ready so measurement does not race Obsidian’s window setup, and domain refreshes preserve React Flow’s local node measurements. These measurements never enter configuration. Pending local positions are retained until their writes settle, so index/schema refreshes do not overwrite a drag.

## Product flows and preservation

The active Workspace remains visible in Brainstorm, alongside small Inbox/Brainstorm navigation. An empty board offers Create an idea and Add existing. Existing Workspace entities are not auto-populated. New cards use a nearby clear initial slot without rearranging other cards. The canvas supports free drag, empty-canvas pan, scroll/pinch zoom and Fit/zoom buttons.

`+ Idea` reuses Quick Capture and the existing application/repository. It creates a real Markdown Entity with UUID, Idea type, active Workspace, normal folder/status and supplied body, then places its UUID near the initiation point. Invalid initial coordinates/type availability are rejected before creation. If layout persistence fails after the note succeeds, the actual note remains safe and the error gives its path and Add existing recovery. No board-only temporary ideas or automatic duplicate retry exist. For other enabled types, the existing Focus → Create From → Add to Brainstorm path remains available.

Double-click, Enter or explicit Open uses the existing Focus View, which retains native Markdown editing. Focus offers Add to Brainstorm / Open in Brainstorm for the entity’s actual Workspace; this explicit action opens/switches to that context when necessary. Retired or unknown Workspace references disable this action safely.

Remove from board changes only the membership/position map. It cannot delete or archive the note, edit properties or remove relationships. Delete/Backspace does not remove either notes or board placements. Remove relationship instead selects a real edge, confirms the action, and calls the existing source-owned relation removal path, preserving neighbors and exact body.

## Relationships

`projectBoard()` resolves placed UUIDs through EntityIndex, then derives only actual outgoing edges whose target is also placed in the same Workspace. Off-board/cross-Workspace/dangling relations are omitted, not deleted. `originated-from` renders normally. Labels and compatibility come from RelationTypeRegistry using the source Workspace. Retired/unknown custom relation definitions remain readable through existing resolution behavior.

Dragging from a source handle to a target opens a compact native picker. Valid choices use existing Workspace/source/target/self/duplicate validation in application/domain services. The existing repository validates again at commit. The temporary drawn line is never added to a board edge store, so cancellation/failure leaves no phantom edge. A real-app race test retired a definition after picker validation but before the real repository write: the dialog showed an inline unavailable error, source bytes stayed identical, and the visible edge count stayed unchanged.

A keyboard alternative selects a source card and uses Connect…, reusing the native relation dialog with targets limited to placed entities. Selection is temporary. Edges remain directional and understated, with textual labels and native focus behavior. Parallel labels have small offsets; no obstacle-routing or automatic layout is introduced.

## Workspace/external synchronization

Switching active Workspace changes the visible board and restores its saved viewport without reload, preserving the previous Workspace’s state. Retired Workspace layout is retained; M4’s normal active fallback controls which board remains usable. Existing cards survive disabled/retired/unknown type definitions.

Projection reads current EntityIndex objects. Filename/title changes refresh cards by stable UUID while positions stay intact. Body/property changes remain available when opening Focus; cards intentionally display type/title rather than embedding those fields. Relation edits and schema/type label changes refresh actual labels/edges. Deleted or moved Entities disappear from the rendered board immediately, and only their stale placement is removed from saved visual state. The source Markdown relation remains intact when its target disappears.

Cleanup is explicit and cannot run during incremental startup indexing. It starts pruning only once the index reports ready. Neither cleanup nor Workspace/type retirement changes unrelated nodes, viewport state or note files. EntityIndex itself is unchanged. Projection scans curated IDs and their outgoing relations; this is suitable for the current personal-vault scale and is not a scale benchmark.

## Test results

| Check | Result |
| --- | --- |
| Strict TypeScript / production esbuild | Passed |
| ESLint | Passed |
| Unit tests | **246 passed**: 218 inherited plus 28 M5 tests |
| Real Obsidian M5 | Passed, including repeated actual restarts and a stale relation-definition race |
| Real M4 regression | Passed: Workspaces, enabled types, restrictions, cross-Workspace policy, unknown data, retirement and restart |
| Real M3 regression | Passed: reusable schemas, custom types, defaults, retirement, unknown data and restart |
| Real M2 regression | Passed: relations, Create From, generic entities, UUID renames and dangling targets |
| Real M1 regression | Passed: Focus, all five property controls, preservation, external synchronization and restart |
| Real M0 regression | Passed: capture, Inbox, settings, external changes and restart |
| Renderer errors | None in the successful M0–M5 runs |

The 28 added tests cover empty/lazy state, UUID positions/viewport reload, remove-only semantics, duplicate/cross-Workspace rejection, independent layouts, retirement/restoration, existing disabled/retired/unknown types, serialized updates, no-op writes, failed persistence, safe coordinates/zoom, invalid-layout recovery, simple initial offsets/collision fallback, readiness-gated stale cleanup, UUID rename/data/relation projection, omitted off-board/missing/moved endpoints, real-writer creation, disabled/invalid creation, placement recovery, valid relation choices and v4-to-v5 compatibility.

These tests focus on Thoughtcraft’s store/actions/projection, not canvas-library internals. The existing Workspace future-version fixture now rejects version 6. Legacy integration checks accept configuration version 5 while retaining their original behavior/preservation assertions. The board dependency is bundled and exercised in the real application rather than a mock storage/UI runtime.

## Real Obsidian scenario performed

1. Started from an M4 configuration containing custom global schemas, Workspace relation definitions, active context and unrelated settings, plus a real existing note with local/schema/user metadata and detailed Markdown body.
2. Confirmed v5 migration retained those definitions and exact note bytes. Existing Create From generated Character and Scene through the unchanged M4 path.
3. Opened Default Brainstorm and confirmed an intentional empty board, no automatic placements and no eager layout configuration.
4. Created an Idea using keyboard toolbar/capture actions; inspected real UUID, type, Workspace and Markdown, with no `bs_board_*` fields.
5. Dragged a card while instrumenting actual configuration writes: none during movement, one after release; note bytes stayed unchanged.
6. Restarted Obsidian and checked saved position. Selected the card and moved with ArrowRight; verified persistence and that Delete changed neither note nor placement.
7. Zoomed with a button, panned with the pointer, restarted again, and checked restored viewport/zoom.
8. Added an existing Entity using keyboard search/selection, with exact source bytes unchanged. Opened Focus using Enter and opened the actual native Markdown note.
9. Returned through Open in Brainstorm; removed only the placement, verified the note remained, and added it again. The picker excluded already placed UUIDs.
10. Drew a source-to-target connection and cancelled; no relation or edge existed. Drew again, selected related-to and confirmed real Markdown persistence and a derived edge.
11. Restarted and confirmed the edge reconstructed from the source note.
12. Added existing Character/Scene; their real origin relations appeared automatically when both endpoints were placed.
13. Created appears-in visually and verified the existing directed Markdown shape, real edge and type label.
14. Retired another chosen definition between UI validation and repository mutation. Verified an inline rejection, identical source bytes and no phantom edge.
15. Tried duplicate/custom-invalid source connections: the kind was absent from valid choices, and direct repository calls rejected the same operations independently.
16. Selected the universal edge and confirmed Remove relationship. Only that source relation disappeared; body and other relations remained intact.
17. Externally edited a relation kind and restored it; edge labels updated. Renamed the Workspace definition label and confirmed no source rewrite.
18. Renamed the Character file; card title changed while UUID/position/relation IDs remained stable. Externally edited its body and confirmed the native Focus preview refreshed.
19. Deleted the Scene externally; only that card/placement and its visible edges disappeared. The Character’s dangling relation remained in Markdown, with exact source bytes unchanged.
20. Created/switched to Product Lab, verified an independent empty board, created/moved an Idea there, then returned and verified both layouts remained distinct.
21. Used M3 custom Quest via existing Create From and Focus Add to Brainstorm; confirmed the same generic card. Retired/disabled its type and confirmed the existing card remained openable.
22. Manually changed that type to unknown creature; fallback rendering stayed safe, with placement retained.
23. Inspected light/dark screenshots and selected-card affordance. Emulated reduced motion and verified no card transition duration.
24. Inspected saved JSON: only Workspace ID, UUID positions and viewport were present. Original M4 note bytes stayed exact. Restarted once more and confirmed unknown-type rendering, deleted-node cleanup and other-Workspace layout persistence.

These grouped checks cover the requested 55-step M5 journey plus startup readiness, actual write frequency, failure preservation, keyboard movement and stale-schema connection failure. Workspace layout restoration after retirement is additionally covered by unit tests; the actual Workspace management behavior is covered by the M4 regression suite.

## Evidence and reproduction

- [M5 report](../.artifacts/m5-1793231450087/report.json)
- [Empty board](../.artifacts/m5-1793231450087/empty-board.png)
- [Real relations, light](../.artifacts/m5-1793231450087/relationships-board-light.png)
- [Real relations, dark](../.artifacts/m5-1793231450087/relationships-board-dark.png)
- [Rejected connection without phantom edge](../.artifacts/m5-1793231450087/rejected-connection.png)
- [External/unknown-type state, light](../.artifacts/m5-1793231450087/brainstorm-light.png)
- [External/unknown-type state, dark](../.artifacts/m5-1793231450087/brainstorm-dark.png)
- [Selected card](../.artifacts/m5-1793231450087/selected-card-dark.png)
- [M4 regression](../.artifacts/m4-1793230952080/report.json)
- [M3 regression](../.artifacts/m3-1793231608173/report.json)
- [M2 regression](../.artifacts/m2-1793231751129/report.json)
- [M1 regression](../.artifacts/m1-1793231877781/report.json)
- [M0 regression](../.artifacts/m0-1793231894057/report.json)

Evidence is local under ignored `.artifacts/`. Suites open and close their own real Obsidian process and never access normal user vaults.

```sh
npm run check
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
npm run test:obsidian:m3
npm run test:obsidian:m4
npm run test:obsidian:m5
```

## Accessibility and known limitations

Toolbar/native dialogs are keyboard accessible; cards and edges are focusable with visible accent feedback. Enter opens a card; Space selects it; arrow keys move selected cards. Connect… provides a keyboard alternative to pointer handles. Relationship labels are textual, and relationship removal has explicit confirmation. Delete/Backspace shortcuts are deliberately disabled. Zoom/Fit are buttons and do not animate viewport movement; card border transitions respect reduced motion.

This is meaningful keyboard coverage, not a claim of complete spatial/screen-reader accessibility or certification. Full assistive-technology review, touch/mobile behavior, other OSes, older Obsidian versions and third-party themes remain unvalidated. The current run uses Linux Obsidian 1.14.4.

One board exists per Workspace. Cards deliberately display type/title only, with detailed content/properties in Focus. Generic non-Idea creation uses Focus/Create From rather than an additional board creation palette. Parallel labels are offset, but edges are not routed around cards and can overlap when users arrange them that way. There is no canvas-wide undo history or automatic layout. Layout and Markdown commits are separate; a successful note followed by failed placement remains recoverable through Add existing, with an explicit path.

Workspace/schema configuration loss does not erase Markdown. Invalid root configuration needs manual repair; individual unreadable layouts are retained for recovery. External edits to `data.json` take effect after plugin reload. Existing UUID-copy semantics and scan-based entity/relationship queries remain.

Named/multiple/nested boards, board templates/folders, grouping/swimlanes, auto-layout/clustering, full Parking Lot, drawing tools, specialized Story/Plot boards, timelines/world maps, evaluations, formulas and Workspace-specific PropertySchema variants remain deliberately deferred. **M6 has not been started.**
