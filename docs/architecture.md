# Thought Craft architecture at M4

## Separate responsibilities

| Boundary | Responsibility |
| --- | --- |
| `EntityIndex` | Existing UUID map of Markdown entity instances; Inbox projection and directed relation queries |
| `EntityTypeRegistry` | Global Entity Type definitions and reusable Property Schemas |
| `WorkspaceRegistry` | Workspace definitions, enabled type IDs, custom relation definitions and persisted active context |
| `RelationTypeRegistry` | Resolution and validation of universal and source-Workspace custom relations |
| `ObsidianEntityRepository` | Real Vault/FileManager reads, writes and external synchronization |

These services are injected explicitly. React sends intents to the registries/repository rather than mutating raw settings. No Redux, global singleton, per-domain subclass or specialized Novel/Product engine is introduced. There is no new database, reverse-edge store or path-to-ID map.

## Models and scope

`Entity` remains a UUID-identified instance. Markdown `bs_type` identifies a global Entity Type; `bs_workspace` identifies its Workspace. Unknown safe type IDs and arbitrary readable Workspace references remain indexed. Focus never interprets entity membership using the active UI Workspace.

`EntityTypeDefinition` retains M3 fields: stable ID, editable label/folder, built-in/retired flags and ordered Property Schemas. Properties retain stable snake_case key, immutable type, editable label/default/max/options and retirement state. Five property kinds remain. They are global to this vault/plugin configuration: M4 does not add Workspace-specific variants, overrides or property-schema duplication.

`WorkspaceDefinition` contains stable `id`, label, optional description, built-in/retired flags, `enabledEntityTypeIds` and `relationTypes`. Enabled IDs refer to global definitions. A disabled or globally retired type is excluded from creation; existing entities and values remain readable. New Workspaces start with Idea enabled unless the creation form explicitly changes that selection. No sample entities or templates are created.

`WorkspaceRelationTypeDefinition` contains stable `id`, label, source/target type ID arrays and retirement state. Empty restrictions mean any enabled, globally active Entity Type. Multiple selected types use simple inclusion. No cardinality, automatic inverse edge or inverse-label feature is added. Relation IDs are scoped by their owning source Workspace, so identical IDs may have different definitions in different Workspaces. The five universal IDs are reserved.

## Configuration and migration

`data.json` contains `configVersion: 4`, the existing capture folder/legacy default-workspace setting, global `entityTypes`, `workspaces`, and `activeWorkspaceId`. Entity values/content/relations are never stored there.

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

UI-based entity movement is deferred: it needs explicit compatibility handling for custom relations and must never silently delete links or move files. Manual `bs_workspace` edits remain readable and reveal incompatible links when necessary. Workspace templates, specialized Story/Project screens, boards/canvases, timeline/graph views, evaluation profiles, formulas and Workspace property-schema overrides are outside M4. **M5 has not been started.**
