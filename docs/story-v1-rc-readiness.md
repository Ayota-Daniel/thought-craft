# Thoughtcraft Story V1 RC1 — readiness decision

Assessment: **30 October 2026**. **Go for local RC1 testing; No-Go for public publication/submission.** M11 prepares an installable candidate; it does not authorize a release or establish human acceptance. **M12 has not been started.**

## Candidate identity

- Stable plugin ID: `thought-craft`; display name remains Thought Craft.
- Manifest/package version: **0.1.0**, unchanged. “Story V1 RC1” is a local archive/documentation label, not a manifest prerelease suffix or a chosen final public version.
- Compatibility: desktop Obsidian **1.14.5+**. Linux 1.14.5 is verified. Windows/macOS and later runtimes are unverified. Mobile is disabled. `isDesktopOnly` cannot enforce Linux-only installation.
- Configuration v8, entity schemas, UUIDs, source-owned relations, EntityIndex and production domain/application behavior are unchanged.

## Engineering evidence

The candidate is installed from an extracted ZIP containing only main.js, manifest.json and styles.css. The fresh test begins without plugin configuration, initializes Default/seven built-ins with Story disabled, then develops The Glass Orchard using free capture, connected ideas, Character, Location, Scenes, Sections, two Threads and a custom Motif relation. It checks restart, recovery, keyboard focus, long titles and 500 Scenes/100 Threads.

Upgrade tests execute rebuilt M7 source before installing RC1, and separately install RC1 over an actual retained M10 v8 test snapshot. They compare all Markdown bytes and retained configuration, then repeat after restart. There is no authentic old published binary; the M7 source is genuine but rebuilt with current dependencies. This is source-revision and development-snapshot compatibility evidence, not certification of every historical release.

Production builds are audited with esbuild metadata; dependency notices are embedded, source maps/debug harnesses/local paths are excluded, and the only external runtime import is Obsidian. The archive has normalized timestamps and SHA-256 evidence from repeated builds. Unit/native counts, artifact hashes, performance and screenshot links are in [M11 validation](m11-validation.md).

## Conditions blocking public publication

| Condition | Status |
| --- | --- |
| Project license | **Missing.** Owner must select and authorize a LICENSE. Third-party notices do not license Thoughtcraft itself |
| Final public version and author/release identity | **Pending owner decision**; no automatic 1.0.0 or RC suffix |
| Human acceptance | **Pending**; [manual checklist](story-v1-manual-acceptance.md) intentionally remains unsigned |
| Repository/directory decisions | Owner must approve repository access/visibility, confirm live name/ID uniqueness and separately authorize any tag, release upload or submission |
| Platform support wording | Candidate is deliberately desktop-only with Linux verification; broader claims require testing |
| Intermittent M5 render check | One run timed out waiting for a derived edge after restart; relation/layout files were intact and an unchanged rerun passed. Root cause is not isolated. Include Brainstorm restart rendering in manual acceptance before public sign-off |

No demonstrated unresolved persistence corruption remains in the executed candidate cases. The intermittent render check is recorded, not dismissed as a proven harmless test flake. No runtime/UI redesign was made to hide the failure. General-public Go is withheld while these conditions remain.

## Known boundaries retained from M10

Partial cross-note edits are not atomic, uncertain read-back requires review, and there is no rollback/global undo. Malformed metadata/duplicate UUIDs require explicit repair. External concurrent edits can still race across notes. Backup both Markdown and configuration using [the recovery guide](backup-and-recovery.md).

The native large dataset is sparse except for its original story associations; the pure benchmark covers three memberships per Scene. These measurements do not prove arbitrary-vault scalability. No cache/index/virtualization changes were introduced.

Templates, an independent desktop host, advanced timeline/nesting, formulas/evaluation profiles, AI and a universal workflow engine remain future initiatives. The current Guide supports optional personal writing methods; it does not impose a fixed story structure.

The [official submission checklist](community-submission-checklist.md), [draft notes](story-v1-release-notes-draft.md) and [manual acceptance](story-v1-manual-acceptance.md) are ready for owner review. Nothing was published, tagged, pushed or submitted; no license or repository visibility was changed.
