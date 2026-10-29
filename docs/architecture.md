# Thought Craft architecture at M6

## Separate responsibilities

| Boundary | Responsibility |
| --- | --- |
| `EntityIndex` | Existing UUID map of Markdown entity instances; Inbox projection and directed relation queries |
| `EntityTypeRegistry` | Global Entity Type definitions and reusable Property Schemas |
| `WorkspaceRegistry` | Workspace definitions, enabled type IDs, custom relation definitions and persisted active context |
| `RelationTypeRegistry` | Resolution and validation of universal and source-Workspace custom relations |
| `WorkspaceBoardStore` | Lazy per-Workspace UUID positions, groups and viewport, with no copied Entity/edge data |
| `ObsidianEntityRepository` | Real Vault/FileManager reads, writes and external synchronization |

These services are injected explicitly. React sends intents to the registries/repository rather than mutating raw settings. No Redux, global singleton, per-domain subclass or specialized Novel/Product engine is introduced. There is no new database, reverse-edge store or path-to-ID map.

## Models and scope

`Entity` remains a UUID-identified instance. Markdown `bs_type` identifies a global Entity Type; `bs_workspace` identifies its Workspace. Unknown safe type IDs and arbitrary readable Workspace references remain indexed. Focus never interprets entity membership using the active UI Workspace.

`EntityTypeDefinition` retains M3 fields: stable ID, editable label/folder, built-in/retired flags and ordered Property Schemas. Properties retain stable snake_case key, immutable type, editable label/default/max/options and retirement state. Five property kinds remain. They are global to this vault/plugin configuration: M4 does not add Workspace-specific variants, overrides or property-schema duplication.

`WorkspaceDefinition` contains stable `id`, label, optional description, built-in/retired flags, `enabledEntityTypeIds` and `relationTypes`. Enabled IDs refer to global definitions. A disabled or globally retired type is excluded from creation; existing entities and values remain readable. New Workspaces start with Idea enabled unless the creation form explicitly changes that selection. No sample entities or templates are created.

`WorkspaceRelationTypeDefinition` contains stable `id`, label, source/target type ID arrays and retirement state. Empty restrictions mean any enabled, globally active Entity Type. Multiple selected types use simple inclusion. No cardinality, automatic inverse edge or inverse-label feature is added. Relation IDs are scoped by their owning source Workspace, so identical IDs may have different definitions in different Workspaces. The five universal IDs are reserved.

## Configuration and migration

`data.json` contains `configVersion: 6`, the existing capture folder/legacy default-workspace setting, global `entityTypes`, `workspaces`, and `activeWorkspaceId`, plus optional lazy `boards` visual state. Entity values/content/relations are never stored there.

Initialization loads global types, then performs the pure Workspace migration, constructs Workspace and relation services, and persists the migrated configuration before registering UI/rebuilding the vault index. M3 custom types/property schemas and unrelated configuration are retained. Missing `default` is seeded once with all types currently active at migration time, preserving prior creation availability. Subsequent global type creation does not automatically enable that type in existing Workspaces.

An explicitly configured pre-M4 capture Workspace other than default is migrated as a definition when its existing ID is safe, preserving that workflow without renaming the ID. No Workspace definitions are inferred from note scans. Otherwise unknown memberships remain unknown and notes stay untouched. The legacy `defaultWorkspace` field is preserved but active context is now controlled by the switcher and `activeWorkspaceId`.

Missing or retired active references fall back to Default; the fallback is saved on initialization. Retiring the current Workspace also saves Default as active in the same configuration operation. Default cannot retire. Workspace creation/update/switching and relation-definition edits are serialized in WorkspaceRegistry. All configuration services use the plugin’s shared merge queue, preserving settings/global schemas/workspaces across independent edits. Changes publish only after persistence succeeds. Individual unreadable definitions are reported and retained for recovery; malformed root containers or future configuration versions block loading instead of overwriting saved data.

## Markdown authority

| Instance data | Markdown location |
| --- | --- |
| Identity/type/workspace/status/timestamps | Existing six `bs_*` fields |
| Local property definitions and values | Unchanged `bs_properties` |
| Explicit reusable values | Unchanged `bs_schema_values` |
| Directed UUID relation instances | Unchanged `bs_relations` |
| Content | Markdown body |

Relation `type` is now an open, syntactically validated stable ID. Unknown definitions still parse. A relation retains its UUID, target UUID and timestamp; no Workspace definition is copied into a note. Incoming edges still derive from owning source notes. Universal and custom instances have exactly the same YAML shape. There is no bulk entity migration or mirrored relation persistence.

## Active context and views

Inbox subscribes to the existing stable Inbox snapshot and Workspace changes, then filters Ideas by active Workspace ID. This is a scan over the existing projection, not another index. Switching updates the view immediately without plugin reload or closing editors. Empty context offers capture, or explains that Idea is disabled. The compact native select supports keyboard use and excludes retired Workspaces.

Quick Capture snapshots the active Workspace when opened, shows its display label and passes its stable ID into the existing Idea use case. It retains Enter/Shift+Enter/Escape behavior and validates creation through the repository. A Workspace retired/disabled while the dialog is open yields a safe save error. There is no extra capture selector in M4; switch context in Inbox before opening capture.

Focus subscribes to both global schema and Workspace changes. A small context line shows the entity’s real Workspace, including unknown/retired state. Existing Markdown rendering, property editors, UUID tab reuse, native-note access and M3.1 action affordances stay intact.

Create From uses the source entity’s Workspace rather than active UI context. Its picker intersects enabled Workspace IDs with active global types. Application and repository both validate the same rule. New entities retain fresh UUID, source workspace, requested content, configured global folder and universal origin edge. Existing source bytes remain unchanged. Configuration is rechecked at the frontmatter commit after asynchronous file creation; an intervening invalidation cannot commit an invalid entity and leaves the supplied text recoverable in the created note.

## Relation creation and reading

The native Add Relation dialog selects type first, grouping Universal and Workspace definitions. Source restrictions hide impossible custom choices. Targets default to the source Workspace. Universal types permit a simple All Workspaces scope; custom types lock that scope and filter target type membership. The service validates the same restrictions for direct repository calls, inside the source frontmatter transaction. Self/duplicate guards and the per-entity metadata write queue remain unchanged.

Universal links may target another Workspace, including readable unresolved entities. Creating any relation requires a configured active source Workspace; custom links additionally require enabled/active source and target types, both in the defining Workspace. Custom relation retirement excludes new links but preserves its label/schema. Source/target restrictions edited later never rewrite old instances.

Reading remains more permissive. Unknown IDs retain target resolution, a clear unknown label and explicit removal. Manual cross-Workspace or type-incompatible custom edges stay indexed and show compatibility hints. Missing targets remain dangling, UUID-owned and removable. Retired Workspaces/types/relations do not invalidate entity reading. Removal checks the expected stored relation, independent of creation policy, so users can remove unusual links safely.

## Values and write preservation

M3 virtual defaults and explicit/default/missing resolution remain unchanged. Missing fields appear on existing entities through registry subscriptions without note writes. Local and reusable values share one editor. Incompatible legacy values, malformed roots and orphaned data remain preserved.

Property/schema/relation operations share the existing per-entity repository queue. `processFrontMatter()` rechecks current UUID; schema writes also compare expected schema/source/value. Relation creation resolves the current source from frontmatter and current target from the index. Narrow mutations preserve other values, local properties, relation neighbors, user metadata and exact body, updating `bs_updated` only for successful explicit instance writes.

## Complexity and deferred scope

EntityIndex is unchanged. Inbox Workspace filtering is linear in Inbox size; incoming lookup scans indexed entities/edges. Workspace and global-type registries use small maps by ID; relation resolution scans a small definition list. These choices target current personal-vault usage and are not scale benchmarks.

UI-based entity movement is deferred: it needs explicit compatibility handling for custom relations and must never silently delete links or move files. Manual `bs_workspace` edits remain readable and reveal incompatible links when necessary. Workspace templates, specialized Story/Project screens, boards/canvases, timeline/graph views, evaluation profiles, formulas and Workspace property-schema overrides are outside M4. M5 adds the generic Brainstorm Board described below; the specialized views remain deferred.

## M5: Brainstorm as a view

The Brainstorm Board adds `WorkspaceBoardStore`, independent of the entity/schema registries and React Flow. It holds one visual state per touched Workspace: `workspaceId`, `nodes[entityUUID] = {x,y}`, and `viewport = {x,y,zoom}`. Positions and viewport are finite/bounded; zoom is 0.35–1.75. It stores no selection, title, type, content, property values, edges or canvas-library internals. No `bs_board_*` metadata is written.

Configuration now uses version 5. M4 definitions, active context and unknown configuration fields are retained by the existing merge queue. Missing board state is an empty in-memory view, persisted only after an explicit layout/viewport action. Invalid individual layouts remain preserved for recovery; malformed root board configuration blocks loading rather than overwriting data. Board mutations serialize against the latest layout, validate Workspace membership and publish after successful saving. Failure leaves previous durable state intact.

`projectBoard()` resolves each placed UUID through EntityIndex, ignoring missing/moved entities, then derives edges solely from actual relations whose source and target are both placed in that Workspace. EntityIndex is unchanged. Projection costs O(placed nodes + their outgoing relations); existing incoming queries retain their scan. There is no reverse relation index, board edge store or speculative EntityIndex redesign.

The main plugin observes index changes for explicit cleanup. It cannot prune while `EntityIndex.isReady()` is false, because startup indexing is incremental. Once ready, deleted/moved entity placements are removed without touching Markdown, unrelated placements or viewports. Retired/disabled/unknown type definitions do not remove existing cards. Workspace retirement preserves layout; the M4 active-context fallback naturally displays Default instead. Restoration reuses the original state.

## M5: UI/library adapter

`@xyflow/react` 12.12.0 handles dragging, pan/zoom, node/edge focus and geometry. Only `ui/brainstorm` imports its types. `domain/board.ts`, BoardStore and projection/action services contain ordinary Thoughtcraft data. No application Redux/Zustand layer is added; any internal state library belongs to React Flow itself. Runtime dependency licenses are recorded in `THIRD_PARTY_NOTICES.txt` and embedded into generated JS/CSS.

`BrainstormView` is an Obsidian ItemView. It mounts after layout-ready to avoid measuring against a window still being restored. `BrainstormApp` reuses WorkspaceSwitcher and a small Inbox/Brainstorm navigation pair. Switching Workspace remounts the canvas adapter with that Workspace’s viewport while preserving the other saved board. `EntityNode` is one generic card using the registry label/native icon and current index Entity. `RelationEdge` uses library geometry and current relation labels; parallel labels receive a small offset. There is no custom pan/zoom engine, force layout or copied entity metadata in persistence.

The adapter keeps ongoing drags, selection, node measurements and pending positions locally. Domain refreshes retain local measurements so restored cards cannot become hidden after metadata updates. Pointer movement never saves configuration; settled drag/arrow-key positions save through BoardStore. Pan/zoom saves at interaction end. Fit/zoom controls use zero-duration viewport changes; only subtle border transitions are enabled when reduced motion is off. Selection is never serialized. Delete/Backspace shortcuts are disabled; removal is an explicit named action.

The existing authored stylesheet moved to `src/styles.css` with all validated Focus/modal rules intact. It imports React Flow base CSS and adds scoped Thoughtcraft board styles. esbuild generates the same root `styles.css` installation file alongside `main.js`, keeping the three-file install contract and avoiding external/CDN assets. Styling uses host variables, restrained surfaces, no node-movement animation, and visible focus states. Native dialogs reuse `.tc-property-form`, including its compact outlines, form inset and scroll clearance.

## M5: intents and Markdown writes

Board `+ Idea` reuses the capture use case/repository, validates the active Workspace/type/initial position, creates a real UUID Markdown entity, then adds that UUID near the initiation point. If layout saving fails afterward, the actual note remains safe and its path is reported for Add existing. There is no board-only idea store or automatic duplicate retry. Other entity types remain accessible through the existing Focus → Create From flow followed by Add to Brainstorm.

Add existing searches only current-Workspace index entities not already placed. It includes readable disabled/unknown types, because availability restricts new creation rather than access. It changes visual membership only. Focus’s contextual Add/Open in Brainstorm uses the entity’s real Workspace and explicitly opens that board; source note bytes remain unchanged. Initial placements use a small nearby slot search and never rearrange existing cards.

Visual connections open a native relation-kind picker. Choices come from the same relation registry/domain duplicate/self/Workspace rules used by the repository. The temporary canvas line is never stored as an edge. Only successful repository writes create a new derived edge. Stale rules show an inline error without phantom edges. The keyboard Connect action reuses the existing relation dialog with targets limited to placed entities and the same authoritative validation. Off-board/cross-Workspace/dangling links remain real Markdown relations but are omitted from the scoped canvas.

Selecting an edge exposes Remove relationship with confirmation, invoking the existing expected-relation removal path. Removing a card invokes only BoardStore.removeEntity: it cannot delete/archive an entity, edit values or remove relations. External rename/body/property/relation/schema changes update projections by UUID; Focus remains the detailed editor/native-note gateway.

M5 is limited to one curated board per Workspace. M5 deferred grouping; M6 adds the visual groups described below. Named/nested boards, auto-layout, Parking Lot, drawing tools, specialized Story/Plot views, timelines, evaluations and formulas remain deferred. Keyboard support provides meaningful alternatives but is not a claim of complete assistive-technology coverage. **M7 has not been started.**


## M6: temporary contextual brainstorming

`application/contextual-brainstorm.ts` prepares a root using its actual Workspace: validate availability, place UUID if needed, preserve existing coordinates, set active Workspace, then open the native board. The ItemView sends a transient context request to the canvas. Requests are consumed once, so switching away/back does not resurrect an old context. `brainstorm-context.tsx` keeps `rootId` and pending centering locally; nothing enters plugin configuration, Markdown or Obsidian’s restored view state. Deleted/moved/off-board roots clear context after index readiness. Removing a group does not clear it.

The context hook centers using measured card dimensions after node initialization and after the context row’s ResizeObserver has settled. Centering is instantaneous, respects reduced motion and saves only the resulting normal viewport. Direct neighbors use existing outgoing and incoming queries. The adapter marks root, neighbor and unrelated cards; no entities are automatically placed and no second relation model exists. Exit/Escape leaves durable layout alone; modal Escape has priority. Focus and the selected-card toolbar expose the action through native buttons.

`connectedIdeaRelations()` validates a prospective Idea source against the real root using RelationTypeRegistry/domain rules. `createConnectedIdea()` generates actual entity/relation UUIDs, validates creation and new→root direction, then calls `createEntity()` with one initial relation. The existing repository independently rechecks current definitions/targets at its normal creation commit. No mirrored/root mutation occurs. The explicit dialog defaults to related-to, filters incompatible kinds and rechecks stale options at submission. New placement uses the existing deterministic nearby slot search relative to the current root and inherits its current group. Membership/position/group are saved in one board update. A layout failure after successful Markdown creation has a typed recovery error; the dialog prevents repeat creation and provides the real file path.

## M6: independent group state and adapter

`BoardGroup` stores `id`, `label`, `x/y`, `width/height`, and `entityIds`. IDs have a `group-` namespace separate from entity identity. Groups are visual zones only: no entity type, note, schema, relation or Focus. `WorkspaceBoardState.groups` is always present in canonical state. Parsing supplies an empty list for M5; v6 initialization persists that normalized visual state only when saved boards already exist. UUID positions/viewport, definitions and unrelated configuration are preserved with no Markdown migration. Malformed group data retains its entire raw layout for recovery rather than guessing membership.

Pure group operations live in `application/board-groups.ts` and geometry in `domain/board-group.ts`. Creation requires at least two current ungrouped entities. An entity belongs to at most one group. Explicit transfer removes its former membership, then expands the destination boundary to include members without moving/rescaling cards. Moving a card clearly outside its group removes membership; visual overlap never creates membership. Empty groups persist. Removal/deletion/membership changes prune only stale UUID membership, after existing readiness guards. Removing a group preserves all absolute card positions, Markdown and relations.

The UI deliberately uses independent top-level XYFlow zone nodes instead of parented children. Both zones and entities therefore use the same absolute board coordinates, with no absolute/relative conversions or persisted `parentId`/`extent`. `group-adapter.ts` maps zones and previews translation; the title is the only pointer drag surface. Groups have no handles; connections remain entity-only. `use-board-nodes.ts` retains measurements, local drags and pending positions while subscriptions refresh domain data. A group move previews members once even if the selection includes both group and children, then BoardStore commits boundary plus member positions atomically after release/settled keyboard motion. Failure restores saved positions. No persistence during mousemove.

Selected group actions use small native forms and buttons: rename, fit bounds to current members, remove boundary. Freeform resizing is deferred to avoid introducing resize chrome and conflicting membership semantics; Fit provides predictable bounds without scaling entities. Ctrl/Cmd multi-selection and Shift selection use XYFlow; group creation is not offered for already grouped selections. Group, context and form styling reuse host tokens and visible focus; opacity transitions disable under reduced motion.

EntityIndex, WorkspaceRegistry, EntityTypeRegistry and RelationTypeRegistry are unchanged in M6. Incoming context lookup remains a scan; neighbors resolve once per board/domain/context refresh, not on drag ticks. No concrete issue appeared at validation scale; no large-vault benchmark or reverse-index optimization is claimed. Groups are isolated per Workspace and preserved through retirement. Full assistive-technology/mobile/other-platform coverage remains unvalidated. Related-entity discovery, arbitrary group styling, nested groups, dedicated Parking Lot, freeform resizing, auto-layout, specialized Story/Plot views and all M7 work remain deferred.
