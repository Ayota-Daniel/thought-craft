# M10 validation — Story V1 hardening and release readiness

Date: **30 October 2026**. Baseline: M9, 424 passing tests, configuration v8. The working tree was clean at inspection; no existing user changes were discarded. **M11 has not been started.** No release, tag, version bump, migration, dependency or EntityIndex change is included.

## 1. Focused review and initial risk classification

Reviewed M9 validation, architecture, historical M0–M8 reports/migration descriptions, README, repository metadata queue, EntityIndex synchronization, relation/placement mappers, PlotService/queries, Thread membership, Story creation, Focus/Back, board isolation, Guide and native harnesses. No separate V1 roadmap is present in the repository. The [readiness assessment](story-v1-readiness.md) distinguishes implementation from earlier conceptual ambitions.

| Severity | Finding | Resolution/evidence |
| --- | --- | --- |
| Critical | No additional silent loss/corruption defect demonstrated in reviewed/executed scenarios | Not a proof against arbitrary disk/sync-provider or multi-process faults |
| High | Relation creation trusts indexed target metadata/existence; delayed external changes can accept an invalid endpoint | Four failing reproductions for missing/type/Workspace/UUID-changed target; now fresh target read inside source queue plus file/scope checks |
| High | Metadata write acknowledgement can succeed while post-write read-back fails silently | Two failing reproductions; strict read-back now rejects and preserves original write failure alongside refresh failure |
| High | Membership Add can return a stale “already associated” no-op after an external removal | Failing reproduction; refresh both endpoints before deriving membership/retry/no-op |
| Medium | Partial two-direction removal is safe but message does not explain recovery or distinguish confirmed refresh | Actionable recovery text; native second-write failure, restart and survivor-only retry |
| Medium | Unbroken long Section/Thread titles overflow narrow Plot | Native reproduction failed; scoped wrapping rules and native regression for 120+ character titles |
| Medium | Declared manifest compatibility exceeds tested runtime/platform evidence | Explicit V1 support-contract condition, not an unverified minimum-version change |
| Medium | Application type dependencies and host UI make future Core reuse less direct | Audit/recommendations below; no speculative extraction |
| Low | Repeated Plot/Thread scans might eventually cost time | Measured first; no optimization justified at tested scale |

The first six persistence reproductions failed before implementation. A later stale-no-op regression also failed before its focused fix. Other new cases verify existing safe behavior. Early test-tool diagnostics (Obsidian is a type-only package in Node, then unused script helpers/browser-global lint errors) were corrected; these are not counted as successful validations.

## 2–4. Implemented changes and data integrity

- `src/infrastructure/obsidian-entity-repository.ts`: optional strict `syncFile` mode; public host-neutral `refreshEntity` adapter operation; freshly reads the target inside the existing source write queue before relationship mutation, then rechecks existence/identity/type/Workspace with existing validation. Metadata mutations always attempt strict read-back, including rejected stale mutations. A failed read-back returns an actionable uncertain-result error; if the write also rejected, its reason is retained. Revision supersession safely rejects an obsolete strict refresh instead of publishing old data.
- `src/application/entity-relations.ts`: optional `refreshEntity` contract for storage-backed writers. In-memory writers already expose current state and need no read-back implementation. Existing callers and relation semantics remain compatible.
- `src/application/plot-threads.ts`: refresh both endpoints before deriving an association intent/no-op/retry. Partial-removal error states completed operations with confirmed refresh and directs the user to inspect remaining links in Focus and use Remove again.
- `src/styles.css`: wrap long Section/Thread headings, progression labels, editing labels and contextual Scene buttons within narrow panels; root `styles.css` remains generated.
- `tests/repository-hardening.test.ts`: **15 focused tests**, including target deletion before/during commit, stale target type/Workspace/identity, source type change, write/read-back failures, combined error reasons, duplicate requests, external removal/modification, stale no-op, delayed-read revision ordering, malformed containers and partial retry/preservation.
- `tests/obsidian-adapter-stub.ts`, `vitest.config.ts`: minimal test-only adapter alias for deterministic fault injection. JSON stands in for parsed YAML in these contract tests; it does not emulate native Obsidian, rendering, body serialization or real YAML. Those are verified by native suites.
- `tests/plot-threads.test.ts`, `scripts/smoke-m9.mjs`: update only the expected actionable partial-error text, retaining the baseline behavior assertions.
- `scripts/smoke-m10.mjs`: dedicated fresh-vault journeys, actual FileManager/read-back fault injection, restart/retry and native 500/100 dataset.
- `scripts/measure-story.mjs`: reproducible pure projection benchmarks. `package.json`: `test:obsidian:m10` and `measure:story` commands.
- `docs/m10-validation.md`, `docs/story-v1-readiness.md`: validation and readiness assessment. README/architecture updated only for current status and persistence boundaries.

All metadata changes still use Obsidian FileManager APIs. React writes no frontmatter. UUIDs, schemas, source-owned relations, `bs_story` and v8 remain authoritative and unchanged. Generic relation updates retain their existing `bs_updated` behavior. Unknown user fields, properties, unrelated relationships and bodies are preserved; unaffected notes are not rewritten. Native M8 verifies exact bytes of 107 existing notes before/after upgrade and minimal rank writes; M10 verifies that retry leaves the already-successful source byte-identical.

## 5. Partial writes and recovery

Native M10 creates opposite Related to edges between Scene A and Thread B and an unrelated membership. The first removal succeeds through real `processFrontMatter`; the second is deterministically rejected by a wrapper at that API boundary. The UI shows `Removed 1 of 2 related links with confirmed refresh` and recovery instructions; the surviving edge remains membership.

The process is stopped before retry. A real fresh Obsidian process reads the partial state from files. Remove refreshes both endpoints and computes the remaining operation, removing only the survivor. The previously written Scene is byte-identical before/after retry; other membership, body, ranks and board are intact. Explicit Add after completion creates one association, not an automatic opposite link.

Counts are **confirmed operation/read-back acknowledgements**, not an atomic filesystem journal. If a write may have committed but read-back fails, the error explicitly says metadata may have been saved; it does not claim full success or an exact total physically removed. A later fresh read/retry resolves current state. No rollback, transaction engine or cross-note lock is claimed.

## 6. End-to-end journeys and semantics audit

| Journey | Executed evidence |
| --- | --- |
| A — starting freely | New default Workspace without Story; capture an orchard/memory idea, place it freely on Brainstorm; Story not required, no narrative metadata assigned |
| B — structure/write | Explicit Story checkbox and individual type enables, two Section creations, three native Scene creations/body edits, Unplaced, pointer Scene movement/reorder, Section menu reorder, generic Focus/Back, two Threads on a Scene, highlight/filter/progression/reset |
| C — continue | Actual restart, preserved active configuration/ranks/membership/board/custom fields, native Markdown writes and external file move with stable UUID; M7–M9 regressions also verify missing/deleted Entities |
| D — no Threads | Native writing, ordering, Unplaced and Focus completed before any Thread exists; no blocking warning/template requirement. Optional type setup remains non-blocking |
| E — custom organization | Custom Motif type, Meaning schema and Echoes relation coexist with Story; generic Focus reads them; no conversion or unrelated note rewrite |

Same-Workspace Related to in either direction remains the canonical membership convention. Generic Focus can create/remove the same edges, and missing targets stay readable there. Other universal/custom kinds keep their meanings; cross-Workspace generic behavior is unchanged. Duplicate creation is rejected by the mapper, and freshness avoids relying on a stale no-op. A multi-process opposite-edge race is still possible and is handled as two real directed links, not hidden state.

There is a conceptual limit: a generic Related to reference to a Thread necessarily counts as membership, while a custom “appears-in” edge does not. This is explicit in the Guide and retained for compatibility. If a future product needs both “mentions this Thread” and “participates in this Thread”, introduce an explicit membership kind only with an approved migration: inventory both directions, ask how ambiguous existing Related to edges should be classified, preserve source IDs/unknown metadata and generic edges, and migrate idempotently with recovery evidence. M10 does not implement or silently apply that speculative change.

Keyboard native Space/Tab, visible focus, Guide access, light/dark/narrow layouts and wrapping were tested, including 120+ character unbroken Section/Thread/Scene titles; no animation or design system changes were introduced. The extreme-title native check initially failed before the targeted CSS fix. Focus origin stays in session memory; after restart an ordinary Focus entry can return to Inbox. Quick Capture remains Idea-specific and subject to Workspace enabling. Neither is represented as a new universal capture/navigation engine.

## 7. Performance method and measurements

`npm run measure:story`: Node 26.8.2, Linux, AMD Ryzen 5 5600G. Esbuild bundles existing pure application modules into an in-memory ESM module. Five Sections, 10% Unplaced, three memberships per Scene. Ten warmups and fifty synchronous samples per operation; output reports median/p95/max. Index load is an **in-memory projection load**, not a disk/vault load. No test assertion uses arbitrary timing thresholds.

| Scenes / Threads | Index load | Plot | Threads | Render queries | Relationship refresh + projection | Search/page | Reorder plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 / 5 | 0.030 / 0.078 | 0.022 / 0.039 | 0.027 / 0.045 | 0.051 / 0.129 | 0.026 / 0.048 | 0.001 / 0.001 | 0.012 / 0.018 |
| 100 / 40 | 0.215 / 0.497 | 0.040 / 0.063 | 0.442 / 0.629 | 0.470 / 1.487 | 0.235 / 0.379 | 0.002 / 0.002 | 0.041 / 0.057 |
| 500 / 100 | 1.819 / 3.335 | 0.204 / 0.335 | 3.115 / 3.371 | 5.875 / 8.358 | 3.387 / 4.422 | 0.009 / 0.026 | 0.177 / 0.310 |

Values are **median / p95 milliseconds**. Maxima and exact method are in the [benchmark JSON](../.artifacts/m10-performance-1793375055158/report.json).

Final native M10 observed wall-clock timings:

| Operation | Milliseconds |
| --- | --- |
| syntheticFileCreationMs | 5002 |
| titleSearchAndPaintMs | 43 |
| threadFilterAndProgressionPaintMs | 56 |
| filterResetPaintMs | 93 |
| restartAndStoryVisibleMs | 1616 |

The render-query proxy intentionally includes duplicate Plot projection and per-Scene membership/highlight lookups found in the current UI. Measurements show repeated scans but no demonstrated reason to add an index, cache or virtualization at this scale. Native samples include Playwright actionability, process startup/stop and two animation frames; they are one-run end-to-end observations, not statistical CPU or input-latency benchmarks. The 500/100 native vault is sparse apart from its original story associations; the pure benchmark exercises denser three-membership data. Neither demonstrates arbitrary-vault/500 densely connected UI scalability.

## 8–11. Compatibility, checks and native evidence

Strict build/typecheck and ESLint passed. **439 tests passed, 0 failed, 19 files: 424 inherited + 15 new.** Unit contract tests are complemented by real Obsidian native tests in disposable vaults/profiles. The test-only alias never enters production builds. No new runtime dependency or schema migration.

| Suite | Executed result |
| --- | --- |
| Native M10 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m10-1793375325375/report.json) |
| Native M9 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m9-1793375345670/report.json) |
| Native M8 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m8-1793375360644/report.json) |
| Native M7 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m7-1793374956163/report.json) |
| Native M6-6 | Passed, Obsidian 1.14.4, no unexpected renderer errors — [report](../.artifacts/m6-6-1793374971022/report.json) |
| Native M6-5 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m6-5-1793374983817/report.json) |
| Native M6 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m6-1793374999741/report.json) |
| Native M5 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m5-1793375020535/report.json) |
| Native M4 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m4-1793375042063/report.json) |
| Native M3 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m3-1793375057339/report.json) |
| Native M2 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m2-1793375072528/report.json) |
| Native M1 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m1-1793375084492/report.json) |
| Native M0 | Passed, Obsidian 1.14.5, no unexpected renderer errors — [report](../.artifacts/m0-1793375093583/report.json) |

M6.6 reports the observed 1.14.4 version; the other runs report 1.14.5. This does not certify the entire declared compatibility range.

M10 screenshots (visually inspected):

- [free-brainstorm-dark.png](../.artifacts/m10-1793375325375/free-brainstorm-dark.png)
- [story-without-threads-dark.png](../.artifacts/m10-1793375325375/story-without-threads-dark.png)
- [partial-removal-recovery-dark.png](../.artifacts/m10-1793375325375/partial-removal-recovery-dark.png)
- [story-narrow-light.png](../.artifacts/m10-1793375325375/story-narrow-light.png)
- [story-narrow-dark.png](../.artifacts/m10-1793375325375/story-narrow-dark.png)
- [large-500-scenes-100-threads-dark.png](../.artifacts/m10-1793375325375/large-500-scenes-100-threads-dark.png)

Commands executed:

```sh
npm run check
npm run measure:story
node scripts/smoke-m10.mjs
node scripts/smoke-m9.mjs
node scripts/smoke-m8.mjs
node scripts/smoke-m7.mjs
node scripts/smoke-m6-6.mjs
node scripts/smoke-m6-5.mjs
node scripts/smoke-m6.mjs
node scripts/smoke-m5.mjs
node scripts/smoke-m4.mjs
node scripts/smoke-m3.mjs
node scripts/smoke-m2.mjs
node scripts/smoke-m1.mjs
node scripts/smoke-obsidian.mjs
```

Only isolated disposable profiles/vaults under ignored `.artifacts/` were used. Deliberate fault rejections are asserted in the scenario; unexpected renderer errors must be empty. An earlier M10 diagnostic run recorded one expected background read-error log during the injected fault; the final successful run recorded no unexpected errors. No normal user vault was accessed for destructive testing.

## 12–13. Remaining limits and portability

Configuration remains v8. Manifest remains 0.1.0, `minAppVersion: 1.5.0`, `isDesktopOnly: false`; this is an **unverified support range**, not a claim established by current testing. Inbox uses native Popover APIs. Validate the declared matrix or explicitly narrow it before broad publication. Full assistive-technology certification, other OSes/mobile, older runtime combinations, third-party themes, network/sync-provider conflicts and long-running stress tests remain unverified.

Background sync still logs read failures instead of crashing the plugin; explicit metadata mutations and membership refreshes use strict read-back. A persistent read failure leaves the result uncertain and requires inspecting/reopening the native note; there is no automatic rollback/retry loop. Cross-file races cannot be eliminated by a source-owned queue. Duplicated Entity UUIDs, malformed root containers and external conflicting identities need manual repair. No ordering or membership is inferred from Brainstorm coordinates.

Domain/application code has no runtime Obsidian imports. Reusable pure validation, ranking, queries, membership and registry operations already have independent tests. Obsidian repository/lifecycle, settings normalization, native UI/editor/Markdown rendering remain host-specific. Concrete EntityIndex/registry type dependencies and multi-note storage semantics need deliberate contracts for a second host, not a general rewrite now. Detailed extraction recommendations and the **Conditionally Ready** V1 verdict are in [Story V1 readiness](story-v1-readiness.md).

No template engine, new Story model, package extraction, transaction framework, full undo/history, AI, timeline/calendar, redesign or M11 feature was added. No V1 publication was performed.

The late CSS wrapping fix is additionally rechecked by the final M8–M10 native suites. The earlier M0–M7 runs validate the same persistence implementation; their unrelated workflows were not changed by the scoped Plot CSS patch.
