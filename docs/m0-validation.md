# M0 validation

Validated on **28 October 2026** in a real desktop **Obsidian 1.14.4** instance on Linux. The test used its own application profile and disposable vault; normal user vaults were not used.

## Results

| Requirement | Evidence / result |
| --- | --- |
| TypeScript, esbuild production build | `npm run build` passed; root `main.js` generated |
| Lint | `npm run lint` passed |
| Unit tests | `npm test` passed: **50 tests in 4 files** |
| Full local check | `npm run check` passed |
| Actual plugin load | Real Obsidian loaded `manifest.json`, `main.js`, and `styles.css` |
| Commands | Capture idea and Open inbox registered and invoked through the Command Palette |
| Quick Capture | Native modal opened; workspace shown; empty submission blocked |
| Keyboard behavior | Enter captured, Shift+Enter inserted a newline, Escape closed without creating an idea |
| Real note and metadata | Disk contents verified: six `bs_` fields, UUID, and intact multiline Markdown |
| Body preservation | Preserved blank lines, internal `---`, YAML-looking body text, and trailing spaces |
| Duplicate filenames | Same first line produced a second filename with `(2)` and a separate UUID; original remained intact |
| Immediate Inbox | Capture inserted the entity immediately and a row appeared in the React ItemView |
| Open real note | Clicking the Inbox row activated the corresponding Markdown note |
| External rename | OS-level rename outside the capture folder retained UUID and exact body, and updated path and title |
| External modify | Changing `bs_status` to `exploring` removed the row; restoring `inbox` restored it |
| External create | A valid root-level idea was indexed; missing ID, unsupported type and malformed YAML were ignored |
| External delete | OS-level deletion removed the entry |
| Settings persistence | `data.json` contained exactly `entitiesFolder` and `defaultWorkspace`; custom capture destination/workspace worked |
| Restart | A second actual Obsidian process rebuilt the expected three-entry Inbox from Markdown, retaining IDs and settings |
| Runtime errors | No plugin renderer errors during the successful integration run |

The test uses real Vault and FileManager APIs inside Obsidian. There is no test double of the Obsidian UI or storage runtime.

## Evidence

Successful integration run:

- [Machine-readable report](../.artifacts/m0-1793143897905/report.json)
- [Inbox screenshot](../.artifacts/m0-1793143897905/obsidian-inbox.png)
- [Quick Capture screenshot](../.artifacts/m0-1793143897905/obsidian-capture.png)

Evidence is generated locally under ignored `.artifacts/`. To create new evidence:

```sh
npm run test:obsidian
```

The test closes the first-vault trust/settings UI before invoking commands. Obsidian's `activeWindow` can otherwise point at the settings window instead of the vault. The test's temporary profile trusts only the plugin just built from this directory.

Two integration issues were corrected before the passing run:

- An Inbox constructor callback named `open` shadowed an internal View lifecycle method. It is now named `openIdea`, so the ItemView mounts and unmounts React normally.
- External rename notifications can arrive as create(new) followed by delete(old). UUID upserts follow the new path immediately, while deletion removes by the old path; this order is also covered in the EntityIndex unit test.

## Manual development-vault checklist

For other Obsidian versions or platforms:

1. Build and install the three plugin files using the README instructions. Enable Thought Craft.
2. Open the Command Palette, run Capture idea, enter a multiline idea, press Enter.
3. Confirm the file exists, its body is unchanged, and its six `bs_` fields contain a UUID and ISO date strings.
4. Confirm a row appears in Inbox and opens that same note.
5. Capture the same first line again and confirm a second file is created.
6. Rename, edit the status of, then delete a note using a file manager or another editor; confirm the Inbox follows the changes.
7. Restart Obsidian and compare Inbox to the actual valid inbox notes in the vault.
8. Assign Capture idea a shortcut in Obsidian's Hotkeys settings and invoke it.
9. Change the two plugin settings, save, capture another idea, and confirm the new location/workspace and settings after restart.

The automated run covers the current Linux desktop host. Older supported Obsidian releases and mobile platforms have not been separately exercised. M0 includes no M1 features.
