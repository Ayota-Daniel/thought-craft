# Community submission preparation — no submission performed

Reviewed **30 October 2026** against official documentation. This is a preparation checklist, not directory approval. No account, repository visibility, tag or release was changed.

| Area | RC1 finding / next action |
| --- | --- |
| Manifest identity | Stable `thought-craft` ID and `Thought Craft` display name retained; syntactic naming rules checked. Live directory uniqueness remains owner verification |
| Compatibility | Desktop-only, minimum 1.14.5; Linux verified, Windows/macOS/later runtimes unverified |
| Public version | Current local 0.1.0 preserved. Owner must choose/approve the final version before publication |
| README | Purpose, use, manual install, support and backup links provided |
| Project LICENSE | **Missing: publication blocker.** Dependency notices do not license Thoughtcraft itself; no license chosen automatically |
| Dependency notices | Existing THIRD_PARTY_NOTICES covers bundled runtime libraries; full text embedded in JS/CSS |
| Distribution | Exact main.js, manifest.json, styles.css assets prepared locally; ZIP is for manual installation, not a substitute for future individual release attachments |
| Release process | No workflow existed; no auto-publish workflow added. Owner approval required for repository access, tag/release and upload |
| Debug/source output | Production metadata and asset scans reject test inputs, development React modules, local paths, source maps and test globals; deliberate console.error diagnostics remain |
| Policy disclosures | No plugin network/telemetry/account/payment code found in source review. Ordinary Markdown link opening/native rendering is delegated to Obsidian; no tracking claim for other plugins/host |
| Human acceptance | Manual checklist prepared, not completed by an automated run |

The official [submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) requires a root README, LICENSE and manifest; future individual release assets must match the manifest version/tag. The current guide uses the Community directory account/review workflow. Do not rely on an older PR-only submission recipe.

The [manifest reference](https://docs.obsidian.md/Reference/Manifest) defines x.y.z versions, identifier syntax and desktop flag. RC1 keeps its suffix in documentation/archive naming only. Name/ID syntax does not prove directory uniqueness.

The [plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) call for an appropriate minimum version and concise description, and require desktop-only when Node/Electron APIs are used. Thoughtcraft’s runtime inventory found no direct Node/Electron imports; the conservative desktop restriction here follows the unvalidated mobile UI boundary, rather than a fabricated Node requirement.

The [developer policies](https://docs.obsidian.md/community-directory/developer-policies) require a project license and compliant dependency attribution, prohibit client telemetry/hidden obfuscation/self-updates, and require disclosure of certain external access. Ordinary production minification is documented; audit evidence remains reviewable source plus build metadata, not a claim of automatic policy certification.

The existing [versions.json](../versions.json) is aligned to this local manifest because the minimum version changed. The official [versions reference](https://docs.obsidian.md/Reference/Versions) uses it for compatibility fallback. No older published asset/fallback is asserted to exist.

Owner choices before public distribution: license, final version/author/scope, supported-platform wording, repository accessibility and live uniqueness check, manual acceptance, then explicit publication authorization. **No-Go for public publication until resolved.**
