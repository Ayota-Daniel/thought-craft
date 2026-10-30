# M11 validation — Story V1 Release Candidate 1

Date: **30 October 2026**. Baseline M10: 439 tests, configuration v8. Initial working tree clean. User work preserved. **M12 has not been started.** No tag, push, public release, submission or project-license selection.

## 1. Initial release audit

| Area | Finding |
| --- | --- |
| Identity/version | thought-craft / Thought Craft, package+manifest 0.1.0; stable ID preserved |
| Compatibility | minAppVersion 1.5.0 and mobile-enabled exceeded evidence; candidate narrows to 1.14.5 desktop |
| Build | Existing esbuild browser/CJS production build, bundled React/XYFlow, external Obsidian only, minified with no production source map |
| Dependencies | Runtime libraries in dependencies, build/lint/test/native tools in devDependencies. No runtime dependency added |
| Licenses | No project LICENSE. THIRD_PARTY_NOTICES already covers 17 bundled dependency packages and is embedded in JS/CSS |
| Release/CI | No pre-existing GitHub workflow or release automation; no automatic publishing added |
| Generated files | main.js ignored; styles.css generated/tracked; .artifacts ignored. Candidate stays under .artifacts/releases |
| Historical artifacts | Retained development test vaults and Git source revisions available; no historical published release binary |
| Diagnostics | Production console.error calls provide real error reporting. Test globals, source paths and scripts are not production inputs |

Read M9/M10 validation, Story V1 readiness, architecture, README, migrations, manifest/package/versions, build/install scripts and existing native harnesses. Official requirements were checked against current primary documentation; see [submission preparation](community-submission-checklist.md).

## 2–3. Changes and file inventory

- `manifest.json`: desktop-only, minimum 1.14.5, accurate concise description; version 0.1.0 retained.
- `versions.json`: existing 0.1.0 mapping aligned to 1.14.5 for this local candidate; no old published fallback asserted.
- `package.json`: matching description and local package/fresh/upgrade/historical-fixture commands. No dependency/version change.
- `esbuild.config.mjs`: writes ignored production metafile for auditing; production output remains the same runtime code.
- `scripts/package-candidate.mjs`: validates metadata and bundle inputs, makes an allowlisted three-file normalized ZIP, SHA256SUMS and an external candidate report. Local RC1 label only.
- `scripts/install-dev.mjs`: accepts an explicit configuration-folder name, rejects empty/path traversal/separators, preserves existing data.json.
- `scripts/smoke-m10.mjs`: small reusable distribution/fresh-install options; original M10 seeded regression remains. Fresh mode skips seed data, asserts initialized defaults/runtime compatibility, and adds Character/Location/connected-Idea workflow coverage.
- `scripts/test-runtime.mjs` and native M0–M10 harness imports: pin an explicit verified 1.14.5 runtime cache so the system launcher cannot start on 1.14.4 and silently update midway through validation. No plugin/vault settings are seeded by this helper.
- `scripts/smoke-m11-fresh.mjs`: extracts the ZIP, verifies exact entries/hashes and installs extracted assets only.
- `scripts/prepare-m11-historical.mjs`: reproducibly extracts/rebuilds actual M7 commit f1bf711 without altering a branch or checkout; records provenance under artifacts.
- `scripts/smoke-m11-upgrade.mjs`, `scripts/smoke-m11-upgrade-case.mjs`: isolated executed-M7 and retained-v8 upgrade/restart cases using extracted candidate assets.
- `tests/release-package.test.mjs`, `vitest.config.ts`: 19 release-tool checks; keep all 439 inherited tests.
- `README.md`: product vision, manual installation, starting freely, support, Guide, backup and pending publication.
- New docs: this report, `story-v1-rc-readiness.md`, `story-v1-release-notes-draft.md`, `story-v1-manual-acceptance.md`, `backup-and-recovery.md`, `community-submission-checklist.md`.

No domain/application/repository/UI product behavior, EntityIndex, source-owned relation convention, schema or migration is changed in M11. Existing integrated Guide remains; new material is ordinary release/recovery documentation, not an Academy.

## 4. Compatibility inventory and decision

| Surface/API | Finding |
| --- | --- |
| Native Popover | DOM showPopover/hidePopover, :popover-open and popoverTarget; depends on the embedded browser. No older-browser fallback or introduction-version claim |
| Native UI | ItemView/WorkspaceLeaf, Modal, Menu/onHide/showAtPosition, MarkdownRenderer, setIcon and native editor; tested on the candidate runtime |
| Storage | Vault.read/create/trash, FileManager.processFrontMatter/renameFile, MetadataCache events; existing source queue/strict refresh preserved |
| DOM/platform | React portals/events, ResizeObserver, pointer/HTML drag, requestAnimationFrame, crypto.randomUUID; browser APIs, not Node equivalents |
| Node/Electron | No direct imports in production src. Node/process/filesystem/Playwright appear in build/test/install scripts only; external production module is Obsidian |
| Configuration paths | Runtime uses loadData/saveData, not a newly hardcoded .obsidian path. Developer install accepts an explicit folder; test vaults deliberately choose their own .obsidian |

Candidate contract is minimum **1.14.5**, desktop-only, as requested. It is based on actual testing, not a claimed historical API introduction date. Only Linux is verified; the flag cannot restrict Windows/macOS. Mobile remains disabled despite no direct Node imports because native UI/mobile behavior is unverified. Later versions are permitted by the minimum-version mechanism but unverified.

The official [manifest reference](https://docs.obsidian.md/Reference/Manifest) and [versions reference](https://docs.obsidian.md/Reference/Versions) informed metadata checks. Existing versions.json is retained/aligned because the minimum changed. The final public version remains an owner decision.

## 5. Fresh installation / candidate loading

The dedicated fresh wrapper checks ZIP entries and SHA-256 hashes, extracts the candidate into an independent artifact directory, and passes only those files into a new isolated profile/vault. No source tree, node_modules or pre-existing plugin data is installed. Before launch, data.json must be absent.

Observed initialization: Default Workspace, seven built-in types, configuration v8 and Story disabled. Candidate manifest loads, capture/Focus/Brainstorm work, Story is explicitly enabled, and the native creation/writing/Plot/Thread/Guide journey passes across restart. The desktop runtime version is independently checked through the host IPC used to initialize Obsidian’s API version, in addition to window-title reporting. This test-only Electron call is not bundled into the plugin. The application enables the plugin via the existing isolated trust workflow. The profile has a pinned application runtime cache only; it starts without plugin settings or user notes.

## 6–7. Upgrade and preservation

- **Executed M7 revision:** reconstructs genuine f1bf711 source and runs its actual v7 writer/configuration, creating Scene/Thread/custom Memory notes, a Workspace/schema/custom relation, source-owned membership and spatial placement. RC1 adds the M8 Section definition while preserving custom definitions, enabled experiences and unknown configuration. Three Markdown files remain byte-identical through install and restart; Story stays off.
- **Retained M10 v8 snapshot:** uses the pre-M11 M10 native vault, with 500 Scenes/100 Threads and existing ranks, custom data, unknown fields and Brainstorm layout. All **604 Markdown files** remain byte-identical. Parsed configuration is deeply identical before/after install and restart.

The M7 build uses current installed dependencies; no authentic historical public binary exists. These are documented source-revision/development-state upgrades, not a fake downgrade made by editing a version number. M0–M10 regressions separately exercise their authentic legacy format fixtures. No M11 migration or automatic Story activation is added.

## 8. Creative workflow and usability

The fresh candidate develops The Glass Orchard from an incomplete captured idea through connected fragments/Brainstorm, Character, Location, native-written Scenes, ordered and Unplaced material, Sections, multiple Thread memberships and a custom Motif/Echoes relation. Focus/Back, native editing, filter reset, progression, optional writing without Threads, keyboard Space/Tab, Guide entry, long unbroken titles, light/dark/narrow layouts and restart are checked.

These are automated approximations of discoverability and actionability. They do not establish comprehension by a novice or human author approval. The [manual acceptance checklist](story-v1-manual-acceptance.md) is intentionally unchecked. No speculative usability redesign was made.

## 9. Performance

Reuses M10's measurement script, machine and native 500/100 scenario. CPU: AMD Ryzen 5 5600G, Linux, Node 26.8.2. Pure probes use 10 warmups/50 samples, five Sections, 10% Unplaced and three memberships per Scene; they do not measure filesystem or DOM performance. Native timings include Playwright actionability/two frames/process restart and are single-run observations.

| Scenes / Threads | Plot median / p95 ms | Threads median / p95 ms | Render-query proxy median / p95 ms | Reorder median / p95 ms |
| --- | --- | --- | --- | --- |
| 20 / 5 | 0.021 / 0.042 | 0.030 / 0.049 | 0.086 / 0.181 | 0.022 / 0.032 |
| 100 / 40 | 0.040 / 0.078 | 0.484 / 1.095 | 0.522 / 1.380 | 0.043 / 0.101 |
| 500 / 100 | 0.199 / 0.368 | 3.389 / 4.814 | 7.532 / 10.245 | 0.190 / 0.297 |

[Full probe output](../.artifacts/m10-performance-1793384912444/report.json), including index load, searching/paging and relation-refresh projection. M10’s 500/100 render-query median/p95 was 5.875/8.358 ms; this run was 7.532/10.245 ms. These uncontrolled one-run differences do not isolate a packaging effect; production business logic is unchanged.

Candidate-native wall-clock observations (includes automation/paint):

| Operation | Milliseconds |
| --- | --- |
| syntheticFileCreationMs | 5049 |
| titleSearchAndPaintMs | 64 |
| threadFilterAndProgressionPaintMs | 56 |
| filterResetPaintMs | 117 |
| restartAndStoryVisibleMs | 1507 |

M10 observed search/filter/reset/restart of 43/56/93/1616 ms; the candidate observed 64/56/117/1507 ms. No statistical regression guarantee is claimed.

No demonstrated packaging regression justified cache/index/virtualization work. Native dataset remains sparse apart from original story links; pure probes cover denser memberships. General vault scalability, other machines and statistical UI latency are unverified.

## 10–12. Checks, reproducibility and evidence

Strict TypeScript, production build and ESLint pass. **458 unit tests pass, 0 failed, 20 files**: 439 inherited + 19 release-tool tests. Production audit verifies metadata consistency, no prerelease suffix, allowed runtime inputs/imports, embedded notices, no inline source maps, local home paths, development React modules or test globals.

[RC1 ZIP](../.artifacts/releases/story-v1-rc1-a54fe35d4ae1/thought-craft-story-v1-rc1-local.zip) · [candidate report](../.artifacts/releases/story-v1-rc1-a54fe35d4ae1/candidate-report.json) · [SHA256SUMS](../.artifacts/releases/story-v1-rc1-a54fe35d4ae1/SHA256SUMS) · [two-build reproducibility proof](../.artifacts/rc1-reproducibility.json)

Archive SHA-256: `84678ba17935b6c7b43dab849093c21d1f38368babca50344628faa946e541ce`.

| Asset | Bytes | SHA-256 |
| --- | --- | --- |
| main.js | 621097 | `f304a97c579d92bd3309153793014f0687cabcc9b39184a3bba9dc4abd57752a` |
| manifest.json | 273 | `2ee6fe576f5ae36571f9259301ada8d96adea07bc0c4d5964f1719372205064a` |
| styles.css | 62435 | `69b1599a58807120d89795f1b668a39a40759379b34e753db3dd805d85682cf8` |

ZIP contents are exactly `thought-craft/main.js`, `thought-craft/manifest.json`, `thought-craft/styles.css`. Normalized mtime is 2000-01-01 UTC; file order is fixed. Tested toolchain: Node 26.8.2, locked esbuild, Info-ZIP ZIP/UnZip on Linux.

Test runtime cache SHA-256: `3a349274f789b62c5b35ad19de10311909a94e8783033569c2210a4bac491780`. The final fresh test reports desktopRuntimeVersion 1.14.5 and its [process log](../.artifacts/m11-fresh-1793385881992/process.log) loads the pinned updated ASAR on the first boot. Rebuilt M7 [provenance](../.artifacts/m11-historical-m7/provenance.json) identifies the actual source commit and current dependency toolchain.

Reproducibility is bounded to this checked lockfile/toolchain and Linux ZIP environment, not guaranteed across arbitrary compressors/OSes. Artifacts retain fixed timestamps and explicit file order; no user data, source, tests or dependencies are in the ZIP. The three host assets are retained individually next to it. The future Community release requires individual attachments, not merely the ZIP.

| Executed native suite | Result / evidence |
| --- | --- |
| m11-fresh | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m11-fresh-1793385881992/report.json) |
| m11-upgrade-historical-m7 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m11-upgrade-historical-m7-1793385607201/report.json) |
| m11-upgrade-v8 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m11-upgrade-v8-1793385615271/report.json) |
| m10 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m10-1793385623198/report.json) |
| m9 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m9-1793385643925/report.json) |
| m8 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m8-1793385659237/report.json) |
| m7 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m7-1793385675219/report.json) |
| m6-6 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m6-6-1793385689347/report.json) |
| m6-5 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m6-5-1793385702231/report.json) |
| m6 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m6-1793385718216/report.json) |
| m5 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m5-1793385739101/report.json) |
| m4 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m4-1793385760686/report.json) |
| m3 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m3-1793385775927/report.json) |
| m2 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m2-1793385791080/report.json) |
| m1 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m1-1793385803124/report.json) |
| m0 | Passed on pinned 1.14.5, no unexpected renderer errors — [report](../.artifacts/m0-1793385812503/report.json) |

Final fresh candidate screenshots, visually inspected:

- [free-brainstorm-dark.png](../.artifacts/m11-fresh-1793385881992/free-brainstorm-dark.png)
- [glass-orchard-connected-ideas-dark.png](../.artifacts/m11-fresh-1793385881992/glass-orchard-connected-ideas-dark.png)
- [story-without-threads-dark.png](../.artifacts/m11-fresh-1793385881992/story-without-threads-dark.png)
- [partial-removal-recovery-dark.png](../.artifacts/m11-fresh-1793385881992/partial-removal-recovery-dark.png)
- [story-narrow-light.png](../.artifacts/m11-fresh-1793385881992/story-narrow-light.png)
- [story-narrow-dark.png](../.artifacts/m11-fresh-1793385881992/story-narrow-dark.png)
- [large-500-scenes-100-threads-dark.png](../.artifacts/m11-fresh-1793385881992/large-500-scenes-100-threads-dark.png)
- [m11-upgrade-historical-m7 screenshot](../.artifacts/m11-upgrade-historical-m7-1793385607201/upgraded-state-dark.png)
- [m11-upgrade-v8 screenshot](../.artifacts/m11-upgrade-v8-1793385615271/upgraded-state-dark.png)

Reproduction commands (Linux desktop, only disposable profiles/vaults):

```sh
npm ci
npm run check
npm run package:candidate
npm run prepare:m11:historical
export THOUGHTCRAFT_TEST_RUNTIME_ASAR=/path/to/verified/obsidian-1.14.5.asar
export THOUGHTCRAFT_V8_FIXTURE=/path/to/retained/pre-m11-m10-test-vault
node scripts/smoke-m11-fresh.mjs
node scripts/smoke-m11-upgrade.mjs
npm run measure:story
```

All M0–M10 native scripts were then executed sequentially with the same pinned runtime environment. The historical fixture is created by executing old source; the v8 fixture is an actual retained test snapshot. Neither changes a current plugin version field to pretend an older binary exists.

Diagnostics/limits: one M5 run timed out waiting for a derived React Flow edge after restart. Persisted relation and board files were inspected and remained intact; the unchanged rerun passed. No root cause was established, so the report does not label it a proven harmless test flake. The exact failure artifacts remain in `.artifacts/m5-1793385106090/`; Brainstorm restart rendering is included in human acceptance. A fresh-test diagnostic also showed that the system launcher begins in 1.14.4 before downloading 1.14.5. Final RC1 and regression evidence is rerun with an explicit verified runtime cache pinned from the first launch. A test-only attempt to import obsidian directly from the console was replaced with host IPC version checking because Obsidian exposes that module only through its plugin loader. Initial sandbox rejection of the zip subprocess was resolved through the normal execution permission path. No approval rejection remains.

## 13–14. Remaining risks and owner decisions

**Go for local RC1 testing, No-Go for public publication.** Missing project LICENSE, final public version/identity/scope, human acceptance, live directory name/ID uniqueness and repository/publication authorization remain owner decisions. Existing dependency notices are preserved but do not license the project itself. No license selected, repository visibility changed or upload performed.

Windows/macOS/mobile/older/later runtimes, third-party themes, full accessibility certification and arbitrary external sync-provider races remain unverified. Non-atomic cross-note edits, uncertain read-back, duplicate UUIDs and malformed metadata retain documented M10 recovery limits. See [backup/recovery](backup-and-recovery.md), [candidate readiness](story-v1-rc-readiness.md), [submission preparation](community-submission-checklist.md), [draft notes](story-v1-release-notes-draft.md) and [manual acceptance](story-v1-manual-acceptance.md).
