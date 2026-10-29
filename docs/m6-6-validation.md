# M6.6 validation — floating filters, rows, pages and canvas controls

Validated **29 October 2026** with real Obsidian on Linux, using isolated application profiles and disposable vaults. The first M6.6 journey used **Obsidian 1.14.4**; regression runs reported **1.14.5** in the same executable environment. Individual reports retain the observed version. **M7 has not been started.**

## Completion report

| Requested area | Implementation / result |
| --- | --- |
| 1. Filter popover | Replaced the inline details block with a small native auto popover in the browser top layer |
| 2. Positioning/accessibility | Anchored fixed placement, flip/shift, bounded width/height, external scroll/resize updates, native outside dismissal, labelled dialog and Escape focus return |
| 3. Row surface/interactions | Full li hover/focus/selected surface across checkbox/content/date/menu; sibling controls retain independent handlers |
| 4. Query pipeline | Explicit Workspace candidates → search → filters → sort → page slice |
| 5. Pagination | Temporary in-memory UI pages; bounded direct page buttons/ellipses, Previous/Next, result-range summary, no zero-result navigation |
| 6. Page size | Default 50, fixed 25/50/100 options; no arbitrary size or persistence |
| 7. Selection policy | Visible page only; page/query/sort/size/Workspace changes clear selection and range anchor |
| 8. Select All | Labelled Select this page, using current rendered UUIDs only; no all-results batch selection |
| 9. Canvas help | Controls button opens a concise native modal; permanent bottom instruction paragraph removed |
| 10. Guide | Brainstorm topic reuses the same textual controls and explains placement, selection/movement, groups, Focus and relations |
| 11. Architecture | Small pure pagination/placement helpers and focused UI components; no persisted schema change or dependency added |
| 12. EntityIndex | Unchanged; paging follows the existing in-memory query, not storage/index access |
| 13. Tests added | 23 focused unit cases plus a real-app M6.6 suite with 135 notes and independent row/popover/gesture checks |
| 14. Total tests | **335 passed**, 312 inherited plus 23 new, in 15 files |
| 15. Build | Strict TypeScript / production esbuild passed |
| 16. Lint | ESLint passed |
| 17. Real Obsidian | M6.6 native journey passed; final/regression evidence below |
| 18. Themes/narrow | Light/dark popovers, row states, pagination and help captured; viewport/narrow native pane checks included |
| 19. Accessibility limits | Keyboard forms/pages/help and full-row focus verified; full canvas assistive-technology/mobile certification not claimed |
| 20. Deferred | Virtualization, database pagination, advanced/saved queries, specialized Story experiences and M7 |

## Floating filters

`ui/shared/floating-popover.tsx` uses the native [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using): auto dismissal and top-layer rendering avoid parent overflow clipping without a new UI framework. A native Obsidian Menu is appropriate for row commands, but does not provide this small persistent labelled filter form; the browser layer keeps existing React filter values and native selects intact.

The trigger remains part of the compact search/sort row. The form occupies no layout space, so opening it does not change search-bar height or list coordinates. The invoker has expanded/control/dialog semantics. Tab enters the fields in normal order, Escape closes and returns focus to Filters, and outside click dismisses without stealing focus from the destination. Filter values remain in parent query state when closed.

`popover-placement.ts` computes an intended 280px width bounded to the viewport with an 8px inset. It chooses below when there is sufficient room, otherwise the side with more room, clamps horizontal position and limits height for internal scrolling. It observes the trigger, its control row and the native view-content pane, and repositions on viewport/pane changes and captured external scrolling. Internal form scrolling does not restart placement. Scrolling the anchor outside the viewport closes it. There is no modal focus trap; normal native popover tab behavior is retained.

Labels, vertical spacing and the existing host field styling provide hierarchy without extra per-field containers. The popover uses host background/border/text/focus and small elevation tokens. The implementation relies on native Popover API support in the validated Obsidian runtime; older runtimes without that platform API are not separately validated.

## Full-row states and independent actions

The existing li owns hover, focus-within and selected surfaces. The central Open button stays transparent over that surface. Selection keeps an accent edge without hover; selected+hover uses the host active-hover surface, and keyboard focus outlines the full row. Checkbox and menu remain visible within the same surface.

Controls are siblings, not nested interactive elements: main content click opens the Entity, checkbox change toggles selection, and the trailing native menu opens row commands. No li click handler delegates actions or accidentally opens notes. Existing Ctrl/Cmd/Shift row selection stays intact. Container queries adapt date/layout when an Obsidian pane is narrow inside a larger desktop window.

## Query pipeline, pagination and selection

`application/inbox-query.ts` now names its Workspace/search/filter/sort stages explicitly. It preserves all M6.5 semantics, including Idea inbox status, accessible non-archived other types, current type labels, board/relation/recent filters and deterministic sort. `application/inbox-pagination.ts` receives the completed result array and slices it; no query stage runs on an incomplete page.

Inbox defaults to page size 50, with only 25/50/100 supported. Page and size are temporary component state. Search/filter/sort/size/Workspace changes consistently reset to page 1 and clear selection/range anchors. External result shrinkage clamps to a valid page, and the reconciled page is retained so an old out-of-range request cannot unexpectedly reappear when results grow. Zero results hide pagination and keep the clear-filter empty state.

Pagination shows Showing first–last of total, labelled size control, Previous/Next disabled at boundaries, and direct page buttons with aria-current. A bounded page window uses ellipses for large page counts; controls wrap at narrow widths rather than displaying dozens of buttons. The title retains the full Workspace candidate count, with a small filtered count near the list when useful.

Selection is current-page only. Select this page selects exactly the rendered UUIDs. Page changes explicitly clear it; the existing synchronous visible-selection intersection also protects batch paths before effects settle. Shift ranges use current-page order. No cross-page invisible selection or Select all filtered results behavior is introduced. Batch Add/Trash still receive only explicit current visible selection and retain M6.5 validation/recovery/partial-failure semantics.

## Actual canvas controls and discoverability

The canvas configuration is unchanged. The toolbar’s **Controls** button opens `CanvasControlsModal` through the existing ItemView dialog ownership; Escape/Close returns to the workflow. The permanent instructional paragraph below the canvas is removed. `guide/canvas-controls.ts` supplies one textual table reused in the compact modal and Guide → Brainstorm:

| Action | Actual supported control |
| --- | --- |
| Select card | Left click |
| Select area | Left drag on empty canvas |
| Modify selection | Ctrl/Cmd + click; Shift + click |
| Pan | Right drag, middle drag, Space + drag |
| Zoom | Scroll or zoom buttons |
| Move selection | Drag any selected card |
| Open Entity | Enter on its focused card, double-click or Open |
| Keyboard positioning | Space selects a focused card; arrow keys move selected cards |

The opening text deliberately says **focused card**, because Enter is handled on the keyboard-focused wrapper; it does not claim that Enter anywhere on the board opens an arbitrary selected card. Existing Focus mode, groups, relationship handles/pickers, keyboard alternatives and saved coordinates remain intact.

## Tests and native journey

The 23 added unit cases cover zero/fewer/exact/multiple page results, first/middle/final slices and summaries, previous/next/direct requests, all three sizes, invalid/shrunken page clamping, bounded ellipses, page-local selection/batch IDs, full Workspace→search→filter→sort→slice ordering and source preservation, below/above/right-edge/narrow/tall popover placement, and actual documented control labels. Browser-native light dismiss and gestures are exercised in Obsidian rather than mocked browser internals.

The M6.6 native suite generates **135 real notes**, of which **130** are initially in the active Workspace, plus an existing version-6 board with groups and source-owned relations. It checks:

1. Upgrade preservation and first 50 rendered rows; next/previous/direct page navigation; 25 and 100 sizes; active/disabled page controls.
2. Search/filter from a later page, reset to valid results, combined filters/sort/counts, and hidden pagination for zero results.
3. Exact search/list bounds before/after popover opening, native keyboard order, preserved values, outside dismissal and Escape focus return.
4. Scroll and narrow viewport placement, above-flipping when vertical space is insufficient, and bounded internal form size.
5. Independent checkbox/menu/main-row actions; full hover coverage and selected/no-hover states in dark/light screenshots.
6. Select this page selects 25, changing pages clears it, batch Add affects only explicit IDs without rewriting source Markdown, and confirmed local trash cleans group membership while preserving dangling incoming links.
7. Narrow native pane pagination wrapping with the Obsidian sidebar expanded, not only a full-width window.
8. Keyboard Controls opening, light/dark help, actual right-drag pan, left rectangle selection and equal movement of selected cards.
9. Existing Focus group visibility, Show all, native tabs and the shared Guide controls.

M6.5’s existing native filter helper is adapted to the new floating dialog/button; no query, selection, trash, connected creation, persistence or preservation assertion is removed. Other milestone unit/native behaviors remain unchanged.

## Results and evidence

| Check | Result |
| --- | --- |
| Build / strict TypeScript | Passed |
| ESLint | Passed |
| Unit tests | 335 passed |
| Native M6.6 | Passed; final evidence below |
| Native M6.5 | Passed |
| Native M6 | Passed |
| Native M5 | Passed |
| Native M4 | Passed |
| Native M3 | Passed |
| Native M2 | Passed |
| Native M1 | Passed |
| Native M0 | Passed |

Evidence is local under ignored `.artifacts/`, using isolated vaults/profiles and closing only the test processes.

- [M6.6 report](../.artifacts/m6-6-1793308418418/report.json)
- [Closed filters](../.artifacts/m6-6-1793308418418/filters-closed-dark.png)
- [Floating filters, dark](../.artifacts/m6-6-1793308418418/filters-open-dark.png)
- [Narrow filters](../.artifacts/m6-6-1793308418418/filters-narrow-dark.png)
- [Above-flipped filters](../.artifacts/m6-6-1793308418418/filters-flipped-dark.png)
- [Full-row hover, dark](../.artifacts/m6-6-1793308418418/row-hover-dark.png)
- [Selected row, dark](../.artifacts/m6-6-1793308418418/row-selected-dark.png)
- [Hover, light](../.artifacts/m6-6-1793308418418/row-hover-light.png)
- [Selected row, light](../.artifacts/m6-6-1793308418418/row-selected-light.png)
- [Filters, light](../.artifacts/m6-6-1793308418418/filters-open-light.png)
- [Pagination](../.artifacts/m6-6-1793308418418/pagination-light.png)
- [Narrow pane pagination](../.artifacts/m6-6-1793308418418/pagination-narrow.png)
- [Canvas Controls, light](../.artifacts/m6-6-1793308418418/canvas-controls-light.png)
- [Canvas Controls, dark](../.artifacts/m6-6-1793308418418/canvas-controls-dark.png)
- [M6.5 regression](../.artifacts/m6-5-1793307767214/report.json)
- [M6 regression](../.artifacts/m6-1793307862023/report.json)
- [M5 regression](../.artifacts/m5-1793307994465/report.json)
- [M4 regression](../.artifacts/m4-1793308095419/report.json)
- [M3 regression](../.artifacts/m3-1793308175806/report.json)
- [M2 regression](../.artifacts/m2-1793308234832/report.json)
- [M1 regression](../.artifacts/m1-1793308294022/report.json)
- [M0 regression](../.artifacts/m0-1793308341728/report.json)

```sh
npm run check
npm run test:obsidian:m6-6
npm run test:obsidian:m6-5
npm run test:obsidian:m6
npm run test:obsidian:m5
npm run test:obsidian:m4
npm run test:obsidian:m3
npm run test:obsidian:m2
npm run test:obsidian:m1
npm run test:obsidian
```

## Limits and deliberately deferred work

Configuration remains version 6 and Markdown schemas/data are unchanged. EntityIndex has no new map or paging abstraction. No new dependency, virtualization, database paging or state framework is added. At most 100 rows render per page; the native test exercises 130 active results, not a general large-vault benchmark.

Keyboard controls, native focus/outside/Escape behavior and textual help are covered. Full screen-reader/spatial canvas certification, mobile, third-party themes and older Obsidian runtime support remain unvalidated. The popover is nonmodal and uses the runtime’s native platform support. Selection intentionally does not persist across pages or query changes.

Advanced/saved searches, generic Archive, automatic cross-page selection, virtualization, new schemas/registries, group nesting/auto-layout, dedicated Parking Lot and specialized Story work remain deferred. **M7 has not been started.**
