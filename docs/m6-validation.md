# M6 validation — Contextual Brainstorming and visual Groups

Validated on **29 October 2026**, in real **Obsidian 1.14.5 on Linux**, using isolated application profiles and disposable vaults. The environment uses the same Electron/application paths and native Vault/FileManager APIs as previous milestones. No normal user vault was used.

## Completion report

| Area requested | Implementation / evidence |
| --- | --- |
| 1. Architecture | Extended the existing domain board model and BoardStore; added pure group operations, contextual application actions and focused UI hooks/dialogs |
| 2. Context model | One root Entity UUID with a compact indicator, measured centering, direct-neighbor emphasis and quiet unrelated cards |
| 3. Context persistence | Temporary canvas/ItemView state; consumed context requests do not resurrect after switching Workspaces. No context field in Markdown, configuration or restored view state |
| 4. Neighbors | Existing outgoing and incoming EntityIndex queries, filtered naturally by placed cards; no auto-population or separate contextual edges |
| 5. Connected Idea | Native dialog → application validation → existing createEntity with one initial relation → nearby UUID placement and group inheritance |
| 6. Direction | **New Idea → selected kind → context root**. Related to is explicit and selected initially; no mirrored/root note mutation |
| 7. Placement | Existing deterministic nearby free-slot search, beginning 280 board units to the right of the current root; never rearranges existing cards |
| 8. Group model | Stable `group-…` ID, label, absolute x/y/width/height and Entity UUID membership, with no entity metadata or style system |
| 9. Persistence | Groups saved in the owning Workspace board, through serialized configuration merge and publish-after-save behavior |
| 10. Membership | At most one group per Entity. Creation requires ≥2 ungrouped current cards. Explicit transfer/leave; deliberate outward card movement leaves the old group |
| 11. Adapter | Independent top-level XYFlow zone nodes with absolute coordinates; no parent-relative model or persisted library metadata |
| 12. Group move | Title drag or selected-wrapper arrow movement translates zone and members together; one BoardStore commit after settled movement |
| 13. Group removal | Removes boundary only; every Entity remains on board at its current absolute position; notes and relations untouched |
| 14. M5 migration | Configuration v6, exact saved nodes/viewport retained, missing groups normalize to `[]`; no note migration |
| 15. EntityIndex | Unchanged single UUID map and relation scans |
| 16. Performance | Neighbor scans occur on context/domain/layout refresh, not pointer ticks. Native validation saw no concrete performance issue at its small scale; no large-vault benchmark claimed |
| 17. Added tests | 29 focused M6 unit tests plus a real-app M6 suite with restart, pointer, keyboard, filesystem and configuration assertions |
| 18. Total tests | **275 passed**, 246 inherited plus 29 new, across 13 files |
| 19. Build | Strict TypeScript and production esbuild passed |
| 20. Lint | ESLint passed |
| 21. Native validation | M6 passed; regression evidence is listed below |
| 22. Accessibility | Native keyboard buttons/forms/selects, focusable groups/cards, keyboard context actions and group actions, visible focus, Escape priority and reduced motion; full assistive-technology coverage unvalidated |
| 23. Limitations | Fixed/fitted boundaries instead of freeform resizing; explicit group joins; no obstacle routing or large-vault/platform certification |
| 24. Deferred | Related-entity discovery, freeform resize, nested/multiple-semantic groups, color customization, Parking Lot, auto-layout, specialized Story/Plot/timeline views and M7 work |

See [architecture.md](architecture.md) for lifecycle and application/UI boundaries.

## Board state and upgrade

```ts
interface BoardGroup {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entityIds: readonly string[];
}

interface WorkspaceBoardState {
  readonly workspaceId: string;
  readonly nodes: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly groups: readonly BoardGroup[];
}
```

M5 configurations without `groups` receive empty arrays in canonical state. Initialization persists normalized boards only if saved boards already existed, retaining lazy empty-board behavior. Existing UUID membership, positions, viewport, active Workspace, schema/relation definitions and unrelated settings are preserved. Future versions above 6 are rejected. Invalid individual layouts remain preserved for explicit recovery; malformed group data is not silently guessed or discarded.

Groups store no title/type/property/body/relation copies. Group IDs are board identities, not Entity UUIDs. Groups have no note, schema, Focus or connection handles. Context remains temporary; entering it may persist placement and the normal centered viewport, but never the root as durable context. Exit changes no durable state. Workspace switching, root deletion/removal/membership change and restart clear context safely; deleting the root’s group does not.

## Interactions and preservation

Focus retains its back navigation, Create from and native Markdown controls, along with Add/Open in Brainstorm. The new **Brainstorm around** button opens the root’s actual Workspace and centers it without moving it. The selected-card toolbar exposes the same context action. A small row shows root name/type and Exit context. Both incoming and outgoing neighbors already placed on the board stay prominent; unrelated cards remain visible and become clearer on hover/focus/selection.

Connected Idea defaults explicitly to **Related to** with new→root direction. Options use RelationTypeRegistry’s current source/target/Workspace rules. The application validates generated UUIDs/relationship policy; the existing repository validates again during actual Markdown creation. The note and one source-owned relationship are created together, not through a later best-effort edge mutation. A fresh Entity source means separate new Ideas are valid distinct links; duplicate/self protections remain in the authoritative shared relation rules and inherited tests/native regressions.

The root note remains byte-identical. The real new Idea uses its Workspace and normal folder/status/content. After Markdown succeeds, placement uses the current root position and current group. A failed board save reports the saved path; the dialog disables repeat creation, preventing a duplicate retry. Recover through Add existing.

Ctrl/Cmd-click or Shift selection supports multi-card grouping. Group selection is offered only for at least two ungrouped cards; regrouping never silently steals membership. Name creation/rename and explicit Move to group use small native forms. Joining can expand bounds but never rescale or move cards. Minimum bounds are 300×220 with header/card padding; Fit group to members recalculates bounds without moving cards.

Dragging a group title previews translation of all members. On release, zone and member positions commit together. A native counter verified **zero writes during pointer movement and one after release**. Moving a member’s center outside its boundary removes membership; merely overlapping another zone never joins it. Explicit transfer removes the old membership first. Removing a group leaves all absolute positions, Entity files, properties and relations unchanged. Empty groups persist intentionally.

External deletion/remove-from-board clean only the relevant UUID membership, preserving the group/other members. Startup cleanup still waits for the complete index. Workspace retirement preserves groups under existing M4 semantics. Switching Workspaces loads isolated board/group/viewport data with no plugin reload.

## XYFlow and code organization

No new dependency was added. The existing `@xyflow/react` remains UI-only. Its [node grouping API](https://reactflow.dev/learn/layouting/sub-flows) permits parent-relative models, but M6 deliberately uses independent top-level zones: this keeps Thoughtcraft absolute coordinates and translation simple. No `parentId`, `extent`, group node type or selection metadata enters persisted Thoughtcraft state. Meaningful adapter tests cover preview translation and center geometry rather than XYFlow internals.

New application/domain files:

- `domain/board-group.ts`: group model, bounds/containment validation and geometry.
- `application/board-groups.ts`: pure create/rename/transfer/move/remove/cleanup operations.
- `application/board-group-config.ts`: strict group parsing and M5 defaulting.
- `application/contextual-brainstorm.ts`: context preparation, neighbor resolution, valid connected kinds and real connected creation.

`WorkspaceBoardStore` exposes the small group operations through its existing serialized boundary. UI responsibilities stay separate: context hook/indicator, node reconciliation/movement hook, zone adapter/renderer, native connected/group dialogs, selection toolbar and existing ItemView. Focus and main integrate only navigation/actions. Authored styling stays in `src/styles.css`; the three generated/install files remain unchanged in purpose. Existing Focus/modal affordance rules remain intact.

## Tests and real-app scenarios

The 29 new unit cases cover root placement/preservation/workspace/errors, incoming/outgoing neighbor resolution, center geometry, real-writer connected creation, explicit direction/alternate kinds, stale/disabled/invalid choices, placement recovery, inherited group expansion, group identity/bounds/reload/purity, grouped-selection rejection, atomic translation, unsafe coordinate rejection, rename, one-group membership/transfer, outward movement, remove-only preservation, cleanup/readiness/empty groups, Workspace isolation, M5 upgrade, malformed/dual/stale membership recovery, fitted bounds and adapter preview translation.

`scripts/smoke-m6.mjs` exercises grouped scenarios covering the requested journey:

1. Starts a real vault with M5 board state, known absolute positions and viewport, custom relation restrictions, unrelated settings and detailed source bodies. Confirms v6 adds only empty groups and rewrites no notes.
2. Launches context from Focus using keyboard, checks actual Workspace, exact existing position, measured card centering, root emphasis, incoming/outgoing neighbors and unrelated quiet styling. Exit leaves layout unchanged. A formerly off-board root is explicitly placed.
3. Inspects connected-kind choices, dismisses a modal with Escape while context stays active, then creates real Ideas with default Related to and alternate Questions. Verifies UUID/type/Workspace/source-owned relation/body, no board/context metadata and unchanged root bytes.
4. Launches context from a board card and exits with Escape.
5. Multi-selects real cards and creates Act I through the keyboard form. Checks fitted boundary/members and restart restoration. Context does not restore.
6. Drags the actual group title while counting configuration writes; verifies member offsets and one settled save. Restarts again and checks all positions, then verifies arrow-key group movement translates members equally.
7. Renames through keyboard, explicitly joins/leaves a member, then contextually creates around a grouped root and checks inherited membership.
8. Removes a group through keyboard. Checks all positions, exact Markdown/relations and active context remain.
9. Creates another group, deletes a member through the filesystem, verifies stale-node/membership cleanup, removes its remaining member from board, preserves the empty zone and source bytes, and restores root placement through Focus.
10. Switches Workspaces and compares separate layouts/group state; no prior context resurrects on return.
11. Captures dark/light and narrow-width states, checks reduced-motion transitions, restarts once more, verifies retained groups/layout and absence of persistent context/library/Entity data.

A centering issue found during native testing was corrected: the context indicator changes canvas height, so centering waits for node measurement and two animation frames to let its ResizeObserver settle. Initial test diagnostics also exposed the normal filename sanitation of question marks; the test identifies newly created UUIDs rather than assuming raw input equals a filename. Final evidence uses the successful run, not diagnostic attempts.

## Results and evidence

| Check | Result |
| --- | --- |
| Build / strict TypeScript | Passed |
| ESLint | Passed |
| Unit tests | 275 passed |
| Native M6 | Passed |
| Native M5 | Passed |
| Native M4 | Passed |
| Native M3 | Passed |
| Native M2 | Passed |
| Native M1 | Passed |
| Native M0 | Passed |
| Renderer errors | None in successful M0–M6 runs |

Evidence is local under ignored `.artifacts/`; each suite opens/closes its own real Obsidian process.

- [M6 report](../.artifacts/m6-1793263407352/report.json)
- [Focus action hierarchy](../.artifacts/m6-1793263407352/focus-actions.png)
- [Connected Idea dialog](../.artifacts/m6-1793263407352/connected-idea-dialog.png)
- [Context](../.artifacts/m6-1793263407352/context-dark.png)
- [Group](../.artifacts/m6-1793263407352/group-dark.png)
- [Context + group, dark](../.artifacts/m6-1793263407352/context-group-dark.png)
- [Context + group, light](../.artifacts/m6-1793263407352/context-group-light.png)
- [Narrow layout](../.artifacts/m6-1793263407352/narrow-context-group.png)
- [M5 regression](../.artifacts/m5-1793263036301/report.json)
- [M4 regression](../.artifacts/m4-1793263076748/report.json)
- [M3 regression](../.artifacts/m3-1793263127941/report.json)
- [M2 regression](../.artifacts/m2-1793263264749/report.json)
- [M1 regression](../.artifacts/m1-1793263314629/report.json)
- [M0 regression](../.artifacts/m0-1793263369823/report.json)

```sh
npm run check
npm run test:obsidian:m6
npm run test:obsidian:m5
npm run test:obsidian:m4
npm run test:obsidian:m3
npm run test:obsidian:m2
npm run test:obsidian:m1
npm run test:obsidian
```

## Accessibility, limits and deferred work

Native context/creation/group buttons, labels, inputs, selects and dialogs have keyboard actions and visible host-accent focus. Card/group wrappers are focusable, existing arrow positioning remains, textual labels do not rely on color, and toolbar actions adapt to selection. Escape dismisses the native modal first, then exits context when focus is inside the board. Zero-duration centering/zoom and reduced-motion CSS prevent excessive canvas animation. Native validation uses pointer multi-selection followed by keyboard group creation/rename/removal; this is not full screen-reader or spatial accessibility certification.

Group joins use explicit actions rather than implicit overlap. A member may leave by deliberate outward movement or explicit removal. Boundaries may overlap nonmembers/other zones; membership remains explicit and single. Headers stay keyboard focusable if another card visually overlaps them. Freeform boundary resizing is deliberately deferred; expansion on join and Fit group to members keep bounds usable without distorting cards. No automatic collision solving or edge obstacle routing is introduced.

Related-entity discovery is deferred to keep M6 focused; users can choose existing entities explicitly. Context is not restorable. Plugin configuration edited outside the UI still requires reload; malformed layout roots require repair and individual invalid layouts remain preserved. Markdown and board persistence are separate stages, with explicit saved-note recovery. No large-vault benchmark, assistive-technology review, third-party-theme certification, mobile/other-OS/older-version validation is claimed.

Nested groups, semantic multi-membership, group-specific schemas, arbitrary colors/icons, dedicated Parking Lot, auto-layout, drawing/media/shapes/presentation/collaboration, multiple named boards, specialized Story/Plot/timeline views and future M7 work remain deliberately deferred. **M7 has not been started.**
