# Thoughtcraft Story V1 readiness — M10

Assessment date: **30 October 2026**. Recommendation: **Conditionally Ready** for a bounded Linux desktop Story V1. This is an engineering assessment, not permission to publish. No release, tag, version bump or M11 work is performed.

## Basis and scope

The repository was reviewed against its README, architecture and M0–M9 validation reports. No separate approved V1 roadmap or contractual feature checklist exists in the repository, including hidden Markdown files outside generated artifacts/dependencies. Earlier conceptual ambitions are not treated as delivered features. This assessment covers the actual generic engine plus the current Story specialization, not a standalone creative suite.

Primary journeys were executed in a new disposable Workspace developing **The Glass Orchard**: free idea capture/Brainstorm, explicit Story enabling, native Scene creation/writing, Unplaced/Sections, movement/reordering, generic Focus/Back, optional multiple Threads, filter/progression, restart, custom Motif/property/Echoes relation and external file move. Long unbroken Section/Thread/Scene titles are covered by the narrow-panel regression after a targeted wrapping fix. M10 also injects failures in native persistence, and runs a 500-Scene/100-Thread vault. See [M10 validation](m10-validation.md) for exact commands, results, measurements, screenshots and limits.

## Completed capabilities within this scope

| Capability | Evidence / actual boundary |
| --- | --- |
| Generic creation/management | Idea capture, generic Entity creation/Create From, Focus, native Markdown and trash; no universal arbitrary-type capture form |
| Custom types/properties | Global type registry, reusable schemas, five supported property kinds, local properties and retirement; no formula or evaluation-profile engine |
| Relations | Source-owned generic/custom relations, incoming projections, duplicate/stale checks, unavailable references; universal cross-Workspace behavior retained |
| Workspace isolation | Explicit enabled types/Story experience, active Workspace persistence, scoped Story/board; no UI entity-transfer workflow |
| Brainstorm | Curated spatial placement, relations, groups and contextual exploration, independent of Plot |
| Story collections | Scenes, Characters, Locations, Plot Threads, Ideas; search, sorting, pagination and native creation |
| Narrative structure | One-level Story Sections, ordered Scenes, Unplaced, sparse ranks and targeted normalization in Markdown |
| Plot Threads | Optional same-Workspace Related to membership in either direction, multiple memberships, indicators, highlight/filter and canonical progression |
| Writing/Focus | Obsidian native editor; generic properties/relations and contextual Back during the current session |
| Guide | Existing integrated topics plus conceptual Thread tutorial and example; not a writing course |
| Markdown authority | Stable UUIDs, preserved user fields/body, external synchronization, explicit stale rejection and recoverable partial writes |
| Templates | No existing general template engine, sample template library or automatic Story scaffolding; type schemas and Workspace enabling are configuration, not templates |

## Critical blockers and high-priority defects

No unresolved Critical or High implementation defect was found **within the executed scenarios**. This is not proof of absence under arbitrary disk failures, external concurrent editors or other hosts.

M10 addressed three concrete High findings: accepting stale target metadata/deletion, reporting success after a failed metadata read-back, and a stale membership snapshot turning Add into a false no-op. Regression tests reproduced the old behavior before the fixes. Failed writes never trigger a compensating rewrite of unrelated data. A partial two-note removal remains explicitly non-atomic and recoverable from current state after restart.

## Conditions before declaring/publishing V1

1. **Support contract — V1 scope decision required.** Native evidence is Linux Obsidian 1.14.5, plus the M6.6 harness’s observed 1.14.4. The existing manifest still declares `minAppVersion: 1.5.0` and `isDesktopOnly: false`. Older-runtime, mobile and other-OS support has not been established. The Inbox uses native Popover APIs without a legacy fallback. Before a general release, validate the declared range/platforms or deliberately narrow the support declaration. M10 does not silently select a new minimum version or claim mobile compatibility.
2. **Feature contract — V1 scope decision required.** Confirm that Story V1 means the capabilities in the table. Earlier ambitions around evaluation profiles/formulas, scenario branching, Lore-specific tooling, advanced timelines and templates are absent. If any is essential to the owner’s V1 promise, that is a scope blocker requiring a separate milestone, not an implicit M10 deliverable.
3. **Release process — explicit action still required.** Package/manifest remain 0.1.0 and package remains private. No V1 artifact publication or tagging has occurred. A production release needs its own authorization and packaging/support checklist; passing tests alone does not perform a release.

These are conditions for broad public V1 readiness. They do not prevent a bounded, supervised desktop preview using the tested feature set.

## Data-integrity confidence and residual risks

Confidence is supported by source-level tests, real Vault/FileManager fault injection, byte-preservation checks, native restart/retry and M0–M9 regression scenarios. Configuration stays v8; EntityIndex and schemas are unchanged. Successful background synchronization and explicit write acknowledgements are distinguished: an uncertain read-back rejects the action and tells the user to review the note. Retry refreshes both membership endpoints before a no-op or batch is calculated.

Multiple source notes cannot be atomically committed. If an adapter rejects after a write or a subsequent read fails, the error reports uncertainty; confirmed-removal counts are acknowledgements, not a filesystem transaction log. No guaranteed rollback, global undo or lock against another editor/process exists. The target is freshly read before the queued source commit, but another process can still change it after that read. Commit-time identity/scope/file checks and refresh reduce these races; they do not create cross-file atomicity.

Malformed containers require explicit Markdown repair, duplicate entity UUIDs need manual resolution, and unavailable references are not automatically deleted or reassigned. Back up both Markdown and plugin configuration: schemas, Workspace definitions and Brainstorm layouts live in configuration, not in note bodies.

## Deferred medium/low work

- Medium: independent validation of Windows/macOS/mobile/older runtimes, third-party themes, full assistive-technology behavior and disk/sync-provider fault matrices.
- Medium: explicit Workspace transfer compatibility workflow; richer recovery UI for persistent filesystem read failure; retained focus/navigation origins across restart if later desired.
- Medium: larger/dense real UI datasets and repeated latency measurements. The 500/100 native case contains a few richly connected story notes and many sparse synthetic notes; pure benchmarks cover three associations per Scene. Neither proves arbitrary-vault scalability.
- Low/post-V1: nested chapters, timeline/calendar, manuscript tools, dedicated Character Arcs, thread-specific stages, named boards, template engine, formulas/evaluations, AI, graph canvas and standalone application. They remain separate product decisions, not hidden V1 implementations.

## Portability assessment

The generic domain modules and application operations are already independent of runtime Obsidian imports: entity/type/relation/property/Workspace definitions, validation, create/capture intents, queries, ranking, Thread membership and board calculations. Unit tests run them without Obsidian. Registries use injected persistence callbacks and the writers expose host-neutral intents; the new optional refresh operation is one narrow storage consistency capability, not a general storage framework.

ObsidianEntityRepository, settings/path normalization, native Modal/Menu/ItemView, Markdown preview/editor and plugin lifecycle remain host-bound. React is the existing UI choice, XYFlow the Brainstorm adapter. Application helpers currently type-reference the concrete EntityIndex and registries; they are reusable implementations, not a polished public Core API. Source-owned relations and multi-note partial writes are storage semantics that another host must consciously preserve or migrate.

Worthwhile future extraction: define a small index/read contract only when a second host needs it; isolate Markdown serialization from the host’s FileManager while retaining preservation tests; map writer errors/refresh outcomes consistently for that host; then extract proven domain/application code. Defer packages, universal repositories, generalized transactions, template engines and a routing framework until a real consumer justifies them.
