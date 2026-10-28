# M4 validation — Workspaces and scoped relation definitions

Validated on **29 October 2026** in real **Obsidian 1.14.4** on Linux, using isolated profiles and disposable vaults. The implementation retains the M3.1 Focus action affordances. Screenshots were inspected in light/dark themes, including the Workspace Manager, empty Inbox, relation picker and Focus context.

## Architecture and completion report

M4 adds data-driven Workspace configuration around the existing generic entity engine. No Novel/Product subclasses, specialized story UI, extra state-management dependency or database is introduced.

| Area | Delivered behavior |
| --- | --- |
| Workspace model | Stable ID, editable label/description, built-in/retired state, enabled global type IDs and custom relation definitions |
| `WorkspaceRegistry` | Lookup/listing, safe creation/update, retirement/restoration, enabled-type queries, active switching, subscriptions and serialized persistence |
| Active context | `activeWorkspaceId` in plugin configuration; restored on reload; missing/retired references fall back to built-in Default |
| Migration | Configuration version 4; existing global types/schemas/settings retained; Default seeded with pre-existing active types; no note rewrites |
| Enabled types | Global type IDs only; active-and-enabled intersection controls new creation; disabling never changes existing entities |
| Quick Capture | Defaults to active Workspace at opening, shows its label, writes its stable ID; keyboard behavior stays unchanged |
| Inbox | Filters the existing Inbox projection by active Workspace, with compact keyboard switcher, manager entry and scoped empty state |
| Create From | Resolves enabled types in source Workspace, independent of active UI context; preserves inherited workspace, UUID and origin edge |
| Universal relations | Existing five kinds remain reserved, universally defined and cross-Workspace capable; provenance cannot be disabled |
| Custom relation model | Stable ID, label, source/target type ID arrays and retired flag; owned by one Workspace |
| Relation resolution | Separate injected `RelationTypeRegistry`, resolving from source Workspace rather than active context |
| Restrictions | Checked in application/service/repository, not only UI; empty lists mean any enabled, globally active type |
| Cross-Workspace policy | Universal edges allowed; custom edges require both endpoints in the defining Workspace |
| Retirement | Workspaces/custom relation definitions support restore; existing data remains readable; active Workspace retirement atomically saves Default fallback |
| Unknown references | Focus shows unknown Workspace/relation labels, preserves all data/target resolution and allows explicit relation removal |
| Persistence | Configuration in `data.json`; entity membership/values/edges/content stay in Markdown using unchanged formats |
| EntityIndex | Unchanged single UUID map; Workspace Inbox filtering scans the existing Inbox array; incoming relation scans remain |
| Readability | Focused registry/mapper/service boundaries, explicit injection, semantic native controls, formatted readable code/tests and comments for preservation rules |

The two new registries remain separate from `EntityTypeRegistry` and `EntityIndex`. Full boundaries and lifecycle are documented in [architecture.md](architecture.md).

## Models and persistence

```ts
interface WorkspaceDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly builtIn: boolean;
  readonly retired: boolean;
  readonly enabledEntityTypeIds: readonly string[];
  readonly relationTypes: readonly WorkspaceRelationTypeDefinition[];
}

interface WorkspaceRelationTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly sourceEntityTypeIds: readonly string[];
  readonly targetEntityTypeIds: readonly string[];
  readonly retired: boolean;
}
```

Entity Types and Property Schemas remain **global**. Workspaces contain only enabled type IDs; there are no schema copies or overrides. New Workspaces initially enable Idea; users may explicitly uncheck it. They contain no sample entities or opinionated templates. Workspace/relation IDs normalize safely on creation and remain stable after display-label changes. Universal relation IDs cannot be replaced by custom definitions.

`data.json` contains `configVersion: 4`, global `entityTypes`, `workspaces`, `activeWorkspaceId` and retained capture settings. Definitions/context are configuration, not entity data. Existing `defaultWorkspace` is retained as legacy configuration; capture now uses active context. If a pre-M4 setting explicitly named another safe Workspace ID, migration also defines that Workspace with the previous active types and preserves that workflow. No Workspace definitions are inferred from note contents. Missing/retired active references safely fall back to Default. Default cannot retire.

Plugin configuration merges are serialized, preserving independent settings/type/Workspace edits and unrelated fields. Registry state changes publish after successful persistence. Invalid individual definitions remain saved for recovery and are reported; malformed root containers and future configuration versions block loading rather than overwrite configuration.

Markdown formats remain unchanged:

```yaml
bs_workspace: the-last-train
bs_schema_values:
  importance: 4
bs_relations:
  - id: 'e2c1b5b7-8856-42f4-a958-63ac4944b441'
    type: appears-in
    target_entity_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
    created_at: '2026-10-29T00:00:00.000Z'
```

Local `bs_properties`, explicit schema values, six identity/context fields, user frontmatter and Markdown bodies remain authoritative. Neither migration nor schema changes perform bulk note writes. Custom links remain directed and source-owned; incoming appearance is derived. No inverse edge is persisted.

## Creation and permissive reading

Creation intersects Workspace-enabled IDs with active global types. The application checks Create From before calling the writer, and the repository validates all generic creation, including direct calls. After asynchronous note creation it rechecks configuration inside the frontmatter commit before writing metadata; failure preserves text and reports a recovery path. Default global folder resolution is unchanged; Workspace selection never moves files.

Add Relation selects kind first, grouped into Universal and Workspace definitions. Source restrictions hide impossible custom kinds. Target search starts in the source Workspace, with All Workspaces available only for universal kinds. Custom targets must have an allowed enabled/global-active type in the same Workspace. Repository relation writes validate these conditions against the current source frontmatter and indexed target inside the existing metadata queue. Duplicate/self protections remain.

Reading accepts unknown safe relation IDs independently of definitions. Unknown kinds retain target navigation and explicit removal. Externally inserted links violating current Workspace/type restrictions stay indexed and show an incompatibility rather than being deleted. Missing targets retain the existing dangling behavior. Retired definitions preserve their labels/schema for old edges and are excluded from new choices. Restriction edits do not migrate values.

Focus displays the entity’s actual Workspace with a small context line. Switching active context does not reinterpret membership or close existing tabs. Unknown/retired Workspace entities, disabled/unknown entity types, local properties and schema values remain usable. Removal is deliberately independent of creation policy so unusual edges can still be removed safely.

## Automated results

| Check | Result |
| --- | --- |
| Strict TypeScript and production bundle | Passed |
| ESLint | Passed |
| Vitest | **218 passed**: 190 inherited plus 28 M4 tests |
| Real Obsidian M4 | Passed, including two restarts, keyboard switching/custom relation creation and light/dark checks |
| M0 regression | Passed: capture, Inbox, native editing, synchronization, settings and restart |
| M1 regression | Passed: five local property editors, body/metadata preservation, native editing, external events and restart |
| M2 regression | Passed: directed/incoming relations, generic creation, preservation, external rename/delete and restart |
| M3 regression | Passed: global schemas, all reusable kinds, legacy values, retirement, custom types, configuration loss/restoration and restart |
| Plugin renderer errors | None in successful runs |

The 28 focused tests cover Default seeding/idempotence, preserving M3 custom schemas/settings, legacy capture migration, missing active fallback, normalized stable IDs, rename/description, default Idea membership, active persistence, retirement/restoration, built-in protection, duplicate IDs/keys, invalid configuration recovery, serialized writes and persistence failures. They also cover enabled/disabled/global-retired types, scoped Create From and inherited context, Inbox filtering with stable UUID index, universal reserved definitions, scoped custom lookup, stable labels/IDs, source/target restrictions, empty-list semantics, retirement, cross-Workspace policy, unknown/manual edges, existing YAML structure, duplicate/self guards, metadata preservation and UUID resolution after rename/delete.

The existing 190 tests remain passing. Tests now inject Workspace configuration explicitly into Create From. The old unsupported-relation fixture uses a syntactically invalid type ID, because valid unknown IDs must now remain visible. Real-app regressions explicitly configure formerly free-form Workspace IDs and enable newly created types before creation; they retain their preservation and interaction assertions. M0’s old global Inbox index checks remain valid: the index is still global while the UI filters by context.

## Real Obsidian scenarios performed

1. Opened an M3-format configuration with a custom Quest schema and unrelated settings, alongside an existing Idea with local/schema/user metadata and a deliberately detailed Markdown body.
2. Confirmed Default migration included all previously active types, including Quest; old note bytes stayed exactly unchanged and the Idea appeared in Default Inbox.
3. Opened Workspace Manager through the command palette and created The Last Train with stable ID, description and enabled Idea/Character/Scene/Location/Project.
4. Switched Workspace using native keyboard controls; verified a calm empty Inbox and captured an Idea with `bs_workspace: the-last-train`.
5. Created Character, Scene, Location and Project from that Idea; confirmed inherited Workspace and generic creation behavior.
6. Disabled Project through Workspace Manager, confirmed it disappeared from Create From, and reopened its existing note without modification.
7. Created global Plot Thread, enabled it only in The Last Train, and confirmed different source-Workspace creation choices. Changing the active context did not change an open Character’s context.
8. Defined Appears in with Character source and Scene target using simple checkbox restrictions.
9. Used keyboard relation-kind selection, target selection and submit; confirmed only a compatible Scene was offered, custom search scope was locked, and outgoing/incoming appeared.
10. Restarted Obsidian and confirmed active context, stable relation UUID/type ID and the existing single-source edge survived.
11. Renamed Appears in to Present in scene without changing stored `appears-in`; existing UI labels refreshed.
12. Called the real repository directly with an invalid Location source and invalid target type; verified rejection and unchanged source bytes.
13. Created Product Lab and an entity there; verified a custom cross-Workspace call was rejected.
14. Added universal related-to across Workspaces through All Workspaces scope. Renamed the target, verified UUID resolution, deleted it, verified dangling state, and explicitly removed the edge.
15. Retired the custom relation definition; confirmed its existing label/edge remained while its creation option disappeared.
16. Inserted a cross-Workspace custom edge externally, confirmed it remained indexed with target resolution and compatibility feedback, then removed it without changing the Markdown body.
17. Created an unknown Workspace note with an unknown relation kind, confirmed readable Focus/native data and target label, unchanged note bytes, and explicit relation removal.
18. Retired the active Product Lab Workspace; verified persisted Default fallback and exclusion from normal switching. Its existing Idea remained readable with retired context.
19. Renamed The Last Train display label, retaining its ID; switched to it and restarted again.
20. Confirmed active context, type membership, relation definition/retirement, global schemas and unrelated settings survived. Existing M3 note bytes and existing disabled Project body remained intact.
21. Inspected new surfaces in light/dark themes and confirmed the polished Focus actions remain recognizable.

These grouped scenarios cover the requested 55-step journey, plus migration preservation, manual incompatible data and active retirement fallback. Restoration behavior is covered by unit tests; the real journey exercises retirement and subsequent reading. The M0–M3 suites run separately against the M4 implementation.

## Evidence and reproduction

- [M4 report](../.artifacts/m4-1793226628417/report.json)
- [Empty Workspace](../.artifacts/m4-1793226628417/workspace-empty.png)
- [Workspace Manager, light](../.artifacts/m4-1793226628417/workspace-manager.png)
- [Workspace Manager, dark](../.artifacts/m4-1793226628417/workspace-manager-dark.png)
- [Relation definition](../.artifacts/m4-1793226628417/relation-definition.png)
- [Keyboard custom relation picker](../.artifacts/m4-1793226628417/custom-relation-picker.png)
- [Unknown context](../.artifacts/m4-1793226628417/unknown-context.png)
- [Scoped Inbox, light](../.artifacts/m4-1793226628417/workspace-inbox-light.png)
- [Scoped Inbox, dark](../.artifacts/m4-1793226628417/workspace-inbox-dark.png)
- [Focus context and retired relation](../.artifacts/m4-1793226628417/workspace-focus-dark.png)
- [M0 regression](../.artifacts/m0-1793226566771/report.json)
- [M1 regression](../.artifacts/m1-1793226660984/report.json)
- [M2 regression](../.artifacts/m2-1793226780379/report.json)
- [M3 regression](../.artifacts/m3-1793226404192/report.json)

Evidence is local and ignored under `.artifacts/`. Each integration suite launches/closes its own real application/profile/vault; normal user vaults are not accessed.

```sh
npm run check
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
npm run test:obsidian:m3
npm run test:obsidian:m4
```

## Limitations and deliberately deferred scope

- UI-based entity movement is deferred. It needs an explicit custom-relation compatibility workflow; silently dropping links or moving files is not acceptable. Manual membership changes remain readable with compatibility feedback.
- Global Property Schemas have no Workspace variants/overrides. New global types must be enabled deliberately in existing Workspaces.
- Quick Capture has no additional Workspace selector: it snapshots active context when opened. Switch context in Inbox first. Unknown/retired Workspaces cannot accept normal creation, but existing notes remain accessible.
- Malformed root containers require Markdown/configuration repair. External edits to plugin configuration take effect after reload. Unreadable individual definitions are preserved for recovery. Orphan schema values remain read-only in Focus and editable in Markdown.
- Existing duplicate-UUID semantics remain. Workspace Inbox filtering and incoming relations use scans, suitable for current personal-vault scale; no scale benchmark is claimed.
- Validation covers Linux Obsidian 1.14.4. Other platforms, mobile, third-party themes and older versions require separate testing.

Workspace templates, specialized Story/Project dashboards, Character/Scene screens, Story/Plot/Brainstorm boards, timeline/graph/world-map views, evaluation profiles, formulas, inverse/cardinality semantics and Workspace-specific property variants remain outside M4. **M5 has not been started.**
