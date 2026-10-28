# M2 validation — Entities, properties and relations

Validated on **28 October 2026** in real **Obsidian 1.14.4** on Linux, using disposable vaults and isolated application profiles. Screenshots were inspected for content hierarchy, compact relationship rows and the native target picker. Existing M0/M1 behavior was exercised separately with the M2 bundle.

## Delivered behavior

Five built-in types share the existing generic Focus View: Idea, Character, Scene, Location and Project. Each has a small presentation descriptor (label, native icon and folder name), without per-type classes, schema editors or specialized screens.

Relations are directed, UUID-based and stored only on their source entity. Focus shows outgoing and incoming sections. Outgoing rows open the target and offer explicit removal; incoming rows open their owning source. A missing target remains represented as **Unavailable target** until the user removes the relation or restores that UUID.

Create From supplies a type, title and optional initial content. It creates a new Markdown note with a new entity UUID, inherits the source workspace, writes one `originated-from` edge targeting the source UUID, updates the index, and opens the new Focus View. The source file is not rewritten. Existing Focus tabs are reused by UUID.

## Relation model and storage

```ts
interface EntityRelation {
  readonly id: string;
  readonly type: RelationType;
  readonly targetEntityId: string;
  readonly createdAt: string;
}
```

Supported types are `related-to`, `supports`, `alternative-to`, `depends-on` and `originated-from`. The persisted structure matches the requested format:

```yaml
bs_relations:
  - id: 'e2c1b5b7-8856-42f4-a958-63ac4944b441'
    type: originated-from
    target_entity_id: '06fc0cbc-0100-4b5e-92f4-938b00cb7d08'
    created_at: '2026-10-28T09:15:00.000Z'
```

The target is an entity UUID, never a filename or path. Directionality is retained even for `related-to`. Storing a mirrored edge in the target would introduce two competing records, so incoming relations are derived rather than persisted.

## Architecture and file changes

| Responsibility                                     | Files                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permanent readability expectations                 | Added `AGENTS.md`                                                                                                                                               |
| Built-in types and directed edges                  | Updated `src/domain/entity-type.ts`, `src/domain/entity.ts`; added `src/domain/entity-relation.ts`                                                              |
| Generic creation and Create From                   | Added `src/application/create-entity.ts`; migrated `capture-idea.ts` to the generic writer                                                                      |
| Relation write contract                            | Added `src/application/entity-relations.ts`                                                                                                                     |
| UUID/timestamp validation and sibling destinations | Added `src/shared/metadata-validation.ts`, `src/shared/entity-path.ts`                                                                                          |
| Parsing and narrow list mutations                  | Added `src/infrastructure/relation-mapper.ts`; extended `frontmatter-mapper.ts`                                                                                 |
| Actual Markdown writes                             | Updated `obsidian-entity-repository.ts` to `createEntity()` and a shared metadata-write queue                                                                   |
| Incoming/outgoing queries                          | Extended `entity-index.ts` with direct UUID resolution and incoming scans                                                                                       |
| Secondary relation UI and creation dialogs         | Added `relationships.tsx`, `add-relation-modal.ts`, `create-from-modal.ts`; extended `focus-view.tsx` and inspector composition                                 |
| Generic navigation                                 | Updated `src/main.ts`; retained native-note access and existing Focus reuse                                                                                     |
| Styles and documentation                           | Updated scoped `styles.css`, README and package scripts; added this document                                                                                    |
| Tests                                              | Added relation, relation-index and Create From suites, a shared test fixture, and `scripts/smoke-m2.mjs`; migrated M0 fixtures to the generic creation contract |

There is no new database or entity JSON store. The existing repository uses `FileManager.processFrontMatter()` for relations as well as properties. Operations check the source UUID inside the frontmatter transaction. Duplicate/self-edge validation runs there against current data, including when the UI is bypassed. Failed operations leave the file unchanged.

Adding/removing relations preserves neighboring entries, local properties, built-in metadata, unrelated `bs_*` fields, user frontmatter and the exact Markdown body; successful mutations update `bs_updated`. Malformed entries remain in YAML but produce readable issues instead of hiding the whole entity. A malformed list root is never overwritten silently. Removal checks the relation ID and expected definition so stale actions cannot erase an externally changed relation.

## EntityIndex and performance

The existing UUID map remains the entity index. `getOutgoingRelations(id)` resolves current targets by UUID. `getIncomingRelations(id)` scans indexed entities and their outgoing edges, returning source entities with the matching relation. All current Focus views receive index notifications, so target renames/deletions and source edits refresh relevant rows.

Incoming lookup is linear in the indexed entity/edge count. This is a deliberate early personal-vault assumption; no scale benchmark is claimed, and no reverse-edge database or dual entity/path map has been added.

## Folder and status strategy

No settings migration is needed. `entitiesFolder` retains its original meaning as the capture/Idea destination. New non-Idea entities use sibling folders beneath its parent:

```text
Brainstorm/
  Ideas/
  Characters/
  Scenes/
  Locations/
  Projects/
```

For `Custom/Captures`, new Scenes go into `Custom/Scenes`. For a root-level `Ideas` folder, new Projects go into root-level `Projects`. One helper resolves these paths; existing files are not moved, and indexing is independent of destination. Unit tests cover defaults, custom folders, root-level paths and invalid traversal input.

Ideas start at `inbox`; other new entities use the existing `exploring` status. This is a compatible generic default, without new per-type workflows. Inbox continues to list Ideas at `inbox`. Other types are reached through relation search and generic Focus links.

## Results

| Check                         | Result                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| TypeScript / production build | Passed                                                                                |
| ESLint                        | Passed                                                                                |
| Unit tests                    | **140 passed**: 93 inherited tests plus 47 M2 tests                                   |
| Real Obsidian M2 flow         | Passed, including two restarts; no plugin renderer errors                             |
| Real Obsidian M1 regression   | Passed; five property types, preservation, external changes and restart               |
| Real Obsidian M0 regression   | Passed; capture, actual notes, Inbox, native-note access, synchronization and restart |

The M0 unsupported-type fixture now uses `quest`, because `scene` is supported in M2. Its unsupported-type assertion is retained. Existing fixtures also include the new empty relation fields. The capture use-case tests now use `createEntity()` rather than the removed Idea-specific repository method.

The 47 added tests cover relation parsing/validation/serialization, malformed neighbors, exact duplicates, differing edge types, self-relations, stale removal, metadata preservation, UUID resolution, incoming/outgoing queries, target/source rename and deletion, external edge replacement, generic creation across all five types, new IDs, inherited workspace, origin direction, unchanged source objects and sibling paths. Actual Markdown body preservation is verified in the real application, not a mocked Obsidian runtime.

## Evidence

- [M2 report](../.artifacts/m2-1793208363415/report.json)
- [Character with outgoing origin](../.artifacts/m2-1793208363415/character-origin.png)
- [Dangling relation](../.artifacts/m2-1793208363415/dangling-relation.png)
- [Searchable target picker](../.artifacts/m2-1793208363415/add-relation-search.png)
- [Derived incoming relations](../.artifacts/m2-1793208363415/incoming-relations.png)
- [M1 regression report](../.artifacts/m1-1793208505860/report.json)
- [M0 regression report](../.artifacts/m0-1793208594363/report.json)

Evidence is local under ignored `.artifacts/`. Reproduce it with:

```sh
npm run check
npm run test:obsidian
npm run test:obsidian:m1
npm run test:obsidian:m2
```

Each real-app script launches and closes its own Obsidian process and test vault. Executable overrides and installation instructions are in the README.

## Real Obsidian scenarios performed

1. Created two Ideas through Quick Capture and seeded a local property plus user-owned metadata on the source.
2. Added `related-to` in the native dialog and verified the target file's exact bytes were unchanged.
3. Opened the target through Outgoing and found the source in Incoming.
4. Restarted Obsidian and verified the same relation ID and target UUID.
5. Renamed both target and source externally and verified titles refreshed without changing the relationship.
6. Added `depends-on` between the same entities; both types remained available.
7. Attempted the same `related-to` edge again; the dialog reported the duplicate and the source file remained byte-for-byte unchanged.
8. Verified the source was excluded from the picker and tested self-edge rejection through the repository as well; the file remained unchanged.
9. Removed one edge and compared retained properties, user metadata, other `bs_*` fields and the exact Markdown body.
10. Captured “Noah already knows the conductor” and gave it workspace `novel` while the default workspace remained `default`.
11. Used Create From → Character → “The Conductor” with optional body text.
12. Verified a new UUID, type `character`, inherited workspace, `exploring` status, sibling destination and one `originated-from` edge targeting the original Idea UUID.
13. Compared the original Idea's exact file bytes before/after creation, proving no mirrored relation or timestamp edit.
14. Navigated Character → origin Idea → incoming Character and verified a single reused Focus tab for the Character.
15. Opened the actual Character Markdown file in the native editor.
16. Deleted the origin Idea externally, verified the Character remained usable and the relation remained persisted as an unavailable target.
17. Removed that dangling edge explicitly.
18. Created Scene, Location and Project from the Character through the same dialog; checked type, UUID-based origin, workspace and destination for each. The source Character file remained unchanged.
19. Edited an existing target UUID in Markdown and added a malformed neighboring relation; incoming displays refreshed while the valid edge stayed available and the issue was reported.
20. Deleted that source externally and verified the incoming appearance disappeared without modifying target notes.
21. Restarted again and verified all remaining generic entities, relation IDs and incoming edges reconstructed correctly, with no resurrection of removed edges.

For another platform/version, repeat these scenarios in a separate development vault. Use Tab and arrow keys in the native target/type selects; Enter submits forms and Escape closes temporary dialogs. Incoming relation rows only open their source; removing them requires navigating to that source's outgoing list.

## Readability and scope

`AGENTS.md` permanently records the project's human-first coding rules. Touched modules use descriptive names, short domain helpers, separated operations, readable JSX and consistent formatting. No repository-wide refactor or new generic framework was introduced.

M2 supports only the five built-in types and five relation types, all through generic UI. It does not provide specialized character/scene/project workflows, a relation-type editor, global duplicate-UUID repair, schemas or high-scale indexing. Incoming lookup uses a scan; unsupported external definitions require repair in Markdown. Earlier M1 limitations around changing property configuration remain.

Story Workspace, Brainstorm/Story/Plot Boards, graph/canvas visualization, timeline, worldbuilding, reusable schemas, formulas, evaluations and project management are deferred to future milestones. **M3 has not been started.**
