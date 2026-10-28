# M1 validation — Entity Focus and local properties

Validated on **28 October 2026**, in a real **Obsidian 1.14.4** desktop instance on Linux. Validation used disposable vaults and isolated application profiles. The screenshots were also inspected visually: the Markdown content occupies the main column and the property inspector remains secondary.

## Architecture delivered

- `Entity` includes typed local `properties` and readable `propertyIssues`.
- `domain/custom-property.ts` defines exactly Text, Number, Rating, Boolean and Select, with machine-key generation and value validation.
- `infrastructure/property-mapper.ts` parses definitions and performs narrow add/update/remove operations. Unknown or malformed definitions survive writes to neighboring properties.
- `application/entity-properties.ts` exposes a small property-write interface. The existing repository implements it using `FileManager.processFrontMatter()`.
- The repository serializes local property writes per entity, resolves the current file by UUID, checks identity inside the frontmatter transaction, and refreshes the existing index after each operation.
- `EntityIndex` remains a simple UUID map. It announces initial readiness and publishes mapped entity changes; there is no path-to-ID map or new state-management framework.
- `ui/focus/focus-view.tsx` is a persistent Obsidian `ItemView`, storing only the entity UUID in the workspace layout. Markdown is read from the real note and rendered with native `MarkdownRenderer`; React handles only the inspector and temporary value drafts.
- `Open Markdown note` opens the actual file in Obsidian's native Markdown editor. Focus updates when that file is edited.

## Storage

The requested nested structure is retained without changes:

```yaml
bs_properties:
  originality:
    label: Originality
    type: rating
    value: 4
    max: 5
  tone:
    label: Tone
    type: select
    value: hopeful
    options:
      - dark
      - hopeful
      - melancholic
```

Text, Number and Boolean store `label`, `type`, and `value`. Rating also stores `max`; Select also stores `options`. Changes affect the selected definition and `bs_updated` only. Entity data is never saved to plugin `data.json`.

## Automated checks

| Check                                    | Result                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| TypeScript and production esbuild bundle | Passed                                                                      |
| ESLint                                   | Passed                                                                      |
| Vitest                                   | **93 tests passed**, including the 50 M0 tests and 43 new property tests    |
| Real Obsidian M1 integration             | Passed, no plugin renderer errors                                           |
| Real Obsidian M0 regression              | Passed, including capture, native-note access, external changes and restart |

The added unit tests cover absent/multiple properties, malformed containers/definitions, unsupported types, strict value validation, stable keys, collisions, rating bounds, select consistency, serialization, add/update/remove, preserving other `bs_*` and user fields, unknown nested fields, and rejection of stale edits/removals. The real-app test verifies exact Markdown body preservation using actual Obsidian APIs rather than a mocked storage runtime.

Evidence:

- [M1 machine-readable report](../.artifacts/m1-1793190629747/report.json)
- [Focus screenshot](../.artifacts/m1-1793190629747/obsidian-focus.png)
- [Add Property screenshot](../.artifacts/m1-1793190629747/obsidian-add-property.png)
- [M0 regression report](../.artifacts/m0-1793190690326/report.json)

Evidence is local and ignored by version control. Reproduce it with:

```sh
npm run check
npm run test:obsidian
npm run test:obsidian:m1
```

The real-app scripts launch and close their own test instance. They require a Linux desktop session and the executable paths described in the README. The first-vault trust/settings window is closed before driving the vault UI, so commands open in the intended window.

## Real Obsidian validation performed

The M1 integration test exercised the requested manual scenario against the real application:

1. Created an idea through Quick Capture and verified its saved body and UUID.
2. Clicked Inbox and verified the Focus heading and native Markdown rendering.
3. Opened and dismissed Add Property with Escape without writing.
4. Added a Text property, then changed its value.
5. Added a Number property, then saved a decimal value.
6. Added a Rating property, confirmed the default maximum of 5, then saved a rating of 4.
7. Added a Boolean property and checked it.
8. Added a Select property with three options and changed the selected option.
9. Inspected actual frontmatter through Obsidian's metadata cache and the real Markdown file on disk.
10. Compared the exact Markdown body, including blank lines, internal `---`, YAML-looking body text and trailing spaces.
11. Added unrelated user frontmatter, a nested user mapping and an unrelated `bs_*` field externally.
12. Edited a property again through Focus.
13. Confirmed that unrelated frontmatter and exact body contents remained intact.
14. Edited a property and the Markdown body externally and verified that Focus refreshed.
15. Opened the actual note with the native Markdown editor.
16. Renamed the file externally and verified that the same UUID and all properties remained in Focus.
17. Closed and reopened Focus, verifying saved values.
18. Restarted Obsidian and verified the restored Focus tab and all five property values.
19. Removed one property and verified that only that definition disappeared.
20. Deleted the note externally and verified the missing-entity state with no property controls or runtime errors.

For manual testing on another platform, repeat these steps in a separate development vault after installing the root `main.js`, `manifest.json` and `styles.css` files.

## Interaction and safety decisions

- Text, Number and Rating commit on Enter or blur. Escape discards their draft. Number/rating inputs validate before committing. Boolean and Select give immediate control feedback while persistence completes.
- Add Property is a small native dialog. Rating starts at 0/5; Select starts at its first option. Duplicate names receive distinct keys rather than overwriting existing definitions.
- Removing a property uses a small inline confirmation. Escape or Cancel dismisses it.
- Current property definitions are compared with the editor's original definition inside the frontmatter transaction. A conflicting external edit is rejected and reported inline, leaving the latest file data intact.
- Invalid custom properties do not hide the entity. Focus reports them, preserves them, and renders any valid neighbors. A malformed `bs_properties` root requires repair in the native note before editing.
- Native form controls and labels support keyboard use. Focus states use the host accent; short property-appearance and hover transitions respect reduced-motion preferences.

## Limitations and deferred scope

- Focus previews content; native Markdown editing opens in a regular Obsidian tab.
- Property labels, types, maxima, option definitions and ordering are configured at creation or changed directly in Markdown. M1 adds value editors and removal, not a schema editor.
- Text uses a single-line inspector input. Unsupported definitions remain preserved but are not editable there.
- Properties are local to the current entity. Only Idea is implemented.
- Older Obsidian versions, mobile devices, third-party themes and assistive-technology combinations were not separately tested in this run.
- Additional entity types, reusable schemas, relations, formulas, evaluations, boards and project management remain future milestone work. No M2 functionality has been started.
