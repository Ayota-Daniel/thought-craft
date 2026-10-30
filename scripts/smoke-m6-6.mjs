import { pinTestRuntime } from './test-runtime.mjs';
// Integration check against a real, isolated Obsidian process (Linux).
// No mock Obsidian runtime; all notes live in a disposable test vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = resolve(root, '.artifacts', `m6-6-${Date.now()}`);
const vault = join(run, 'vault');
const profile = join(run, 'profile');
const pluginFolder = join(vault, '.obsidian', 'plugins', 'thought-craft');
await mkdir(pluginFolder, { recursive: true });
await mkdir(profile, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(join(root, file), join(pluginFolder, file));
}
await writeFile(
  join(vault, '.obsidian', 'community-plugins.json'),
  JSON.stringify(['thought-craft']),
);
await writeFile(
  join(vault, '.obsidian', 'core-plugins.json'),
  JSON.stringify(['file-explorer', 'switcher', 'command-palette']),
);
await writeFile(
  join(vault, '.obsidian', 'appearance.json'),
  JSON.stringify({ theme: 'moonstone', accentColor: '#34717d' }),
);
await writeFile(
  join(profile, 'obsidian.json'),
  JSON.stringify({ vaults: { m0test: { path: vault, ts: Date.now(), open: true } } }),
);

let child;
let browser;
let page;
let cdp;
let processLog = '';
const checks = [];
const pluginErrors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  await pinTestRuntime(profile);
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  child = spawn(
    process.env.OBSIDIAN_ELECTRON || '/usr/bin/electron43',
    [
      process.env.OBSIDIAN_APP || '/usr/lib/obsidian/app.asar',
      `--user-data-dir=${profile}`,
      '--no-sandbox',
      `--ozone-platform=${process.env.WAYLAND_DISPLAY ? 'wayland' : 'x11'}`,
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (data) => {
    processLog += data.toString();
  });
  child.stderr.on('data', (data) => {
    processLog += data.toString();
  });
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      endpoint = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (endpoint.webSocketDebuggerUrl) {
        break;
      }
    } catch {
      /* wait for Electron */
    }
    if (child.exitCode !== null) {
      throw new Error(`Obsidian exited (${child.exitCode}). ${processLog}`);
    }
    await delay(200);
  }
  if (!endpoint?.webSocketDebuggerUrl) {
    throw new Error(`Obsidian debugging endpoint did not start. ${processLog}`);
  }
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  for (let attempt = 0; attempt < 50; attempt++) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((p) => !p.url().includes('devtools'));
    if (page) {
      break;
    }
    await delay(200);
  }
  if (!page) {
    throw new Error('No Obsidian window found.');
  }
  page.setDefaultTimeout(8000);
  cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (error) => pluginErrors.push(error.stack ?? error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && entry.text().includes('Thought Craft')) {
      pluginErrors.push(entry.text());
    }
  });
  console.log('Obsidian window:', page.url());
  await page.waitForFunction(
    () =>
      window.app?.plugins?.plugins?.['thought-craft'] ||
      document.body.innerText.includes('Trust author and enable plugins'),
  );
  const trust = page.getByText('Trust author and enable plugins', { exact: true });
  if (await trust.isVisible()) {
    await trust.click();
  }
  await page.waitForFunction(
    () => window.app?.workspace?.layoutReady && window.app?.plugins?.plugins?.['thought-craft'],
    { timeout: 30_000 },
  );
  await evaluate('app.setting?.close?.(); true');
  await page.locator('.modal-container').waitFor({ state: 'detached' });
  // First-vault trust opens a separate Settings window in current Obsidian.
  // Return to the vault before opening commands; Modal uses activeWindow.
  for (const other of browser.contexts().flatMap((context) => context.pages())) {
    if (other !== page && (await other.title()).startsWith('Settings')) {
      await other.close();
    }
  }
  await evaluate(
    "document.body.removeClass('theme-light'); document.body.addClass('theme-dark'); true",
  );
  await page.bringToFront();
  await page.locator('.workspace').click({ position: { x: 10, y: 10 } });
  await delay(250);
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function stop() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = undefined;
  }
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(4000)]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(function () { return eval(${JSON.stringify(expression)}); })()`,
    returnByValue: true,
    awaitPromise: false,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

const plugin = "app.plugins.plugins['thought-craft']";
const inbox = () => page.locator('.tc-inbox:visible');
const board = () => page.locator('.tc-brainstorm:visible');
const paging = () => inbox().getByRole('navigation', { name: 'Inbox pagination', exact: true });
const filters = () => inbox().getByRole('dialog', { name: 'Inbox filters', exact: true });
const idFor = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const titleFor = (n) => (n <= 120 ? `Idea ${String(n).padStart(3, '0')}` : `Character ${n}`);
const node = (id) => board().locator(`.react-flow__node[data-id="${id}"]`);
async function action(expression) {
  await evaluate(
    `window.tcResult='pending'; Promise.resolve(${expression}).then(() => {window.tcResult='done';}, error => {window.tcResult=error.message;}); true`,
  );
  await page.waitForFunction(() => window.tcResult !== 'pending');
  assert.equal(await evaluate('window.tcResult'), 'done');
}
async function saved() {
  return evaluate(`${plugin}.boards.getBoard('default')`);
}
async function openInbox() {
  await action(`${plugin}.showInbox()`);
  await inbox().locator('h1').waitFor();
}
async function openBoard() {
  await action(`${plugin}.showBrainstorm()`);
  await board().locator('.react-flow__pane').waitFor();
}
async function fit() {
  await board().getByRole('button', { name: 'Fit', exact: true }).click();
  await delay(250);
}
async function openFilters() {
  await inbox()
    .getByRole('button', { name: /^Filters/ })
    .focus();
  await page.keyboard.press('Enter');
  await filters().waitFor();
  await delay(80);
  await page.keyboard.press('Tab');
  assert.equal(
    await filters()
      .getByLabel('Entity type', { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
}
async function closeFilters() {
  await filters().getByLabel('Entity type', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await filters().waitFor({ state: 'hidden' });
}
async function rowCount(n) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('.tc-inbox .tc-inbox-row').length === n,
    n,
  );
}
async function theme(name) {
  await evaluate(
    `document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${name}');true`,
  );
}
function inside(bounds, width, height) {
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= width + 1 &&
      bounds.y + bounds.height <= height + 1,
    JSON.stringify(bounds),
  );
}

try {
  const originals = new Map();
  for (let n = 1; n <= 135; n++) {
    const incoming =
      n === 3
        ? `bs_relations:\n  - id: e2c1b5b7-8856-42f4-a958-63ac4944b441\n    type: related-to\n    target_entity_id: ${idFor(1)}\n    created_at: '2026-10-29T00:00:00.000Z'\n`
        : '';
    const text = `---\nbs_id: ${idFor(n)}\nbs_type: ${n <= 120 ? 'idea' : 'character'}\nbs_workspace: ${n <= 130 ? 'default' : 'other'}\nbs_status: ${n <= 120 ? 'inbox' : 'exploring'}\nbs_created: '2026-10-29T00:00:00.000Z'\nbs_updated: '2026-10-29T00:00:00.000Z'\nuser_flag: preserve\n${incoming}---\n\nBody ${n}.  \n\n---\nKeep exactly.\n`;
    await writeFile(join(vault, `${titleFor(n)}.md`), text);
    originals.set(n, text);
  }
  const initial = {
    workspaceId: 'default',
    nodes: {
      [idFor(1)]: { x: 80, y: 80 },
      [idFor(2)]: { x: 400, y: 80 },
      [idFor(3)]: { x: 80, y: 300 },
      [idFor(4)]: { x: 400, y: 300 },
    },
    groups: [
      {
        id: 'group-ca829f16-35b0-4e68-857b-d54cfc73caed',
        label: 'First',
        x: 48,
        y: 24,
        width: 620,
        height: 240,
        entityIds: [idFor(1), idFor(2)],
      },
      {
        id: 'group-06fc0cbc-0100-4b5e-92f4-938b00cb7d08',
        label: 'Second',
        x: 48,
        y: 244,
        width: 620,
        height: 240,
        entityIds: [idFor(3), idFor(4)],
      },
    ],
    viewport: { x: 20, y: 10, zoom: 0.8 },
  };
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 6,
      entitiesFolder: 'Brainstorm/Ideas',
      activeWorkspaceId: 'default',
      boards: [initial],
      user_setting: 'keep',
    }),
  );
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openInbox();
  assert.deepEqual(await saved(), initial);
  await rowCount(50);
  await paging().getByText('Showing 1–50 of 130', { exact: true }).waitFor();
  assert.equal(
    await paging().getByRole('button', { name: '‹ Previous', exact: true }).isDisabled(),
    true,
  );
  await paging().getByRole('button', { name: 'Next ›', exact: true }).click();
  await paging().getByText('Showing 51–100 of 130', { exact: true }).waitFor();
  await paging().getByRole('button', { name: '‹ Previous', exact: true }).click();
  await paging().getByRole('button', { name: 'Page 3', exact: true }).click();
  await rowCount(30);
  assert.equal(
    await paging()
      .getByRole('button', { name: 'Page 3', exact: true })
      .getAttribute('aria-current'),
    'page',
  );
  assert.equal(
    await paging().getByRole('button', { name: 'Next ›', exact: true }).isDisabled(),
    true,
  );
  await paging().getByLabel('Rows per page', { exact: true }).selectOption('25');
  await rowCount(25);
  await paging().getByRole('button', { name: 'Page 4', exact: true }).click();
  await paging().getByLabel('Rows per page', { exact: true }).selectOption('100');
  await rowCount(100);
  await paging().getByRole('button', { name: 'Next ›', exact: true }).click();
  await rowCount(30);
  const search = inbox().getByRole('searchbox', { name: 'Search ideas and entities', exact: true });
  await search.fill('Idea 001');
  await rowCount(1);
  await paging().getByText('Showing 1–1 of 1', { exact: true }).waitFor();
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await paging().getByRole('button', { name: 'Next ›', exact: true }).click();
  await openFilters();
  await filters().getByLabel('Entity type', { exact: true }).selectOption('character');
  await rowCount(10);
  await closeFilters();
  assert.equal(
    await inbox()
      .getByRole('button', { name: /^Filters/ })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await inbox().getByLabel('Sort entities', { exact: true }).selectOption('az');
  await search.fill('Idea 0');
  await openFilters();
  await filters().getByLabel('On Brainstorm', { exact: true }).selectOption('off');
  await closeFilters();
  await paging().getByText('Showing 1–95 of 95', { exact: true }).waitFor();
  await search.fill('no matches');
  await rowCount(0);
  assert.equal(await paging().count(), 0);
  await inbox()
    .getByRole('heading', { name: 'No entities match these filters.', exact: true })
    .waitFor();
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await inbox().getByLabel('Sort entities', { exact: true }).selectOption('newest');
  await paging().getByLabel('Rows per page', { exact: true }).selectOption('25');
  checks.push(
    'M6.5 layout/configuration remain intact. 130 current-Workspace results paginate to 50 by default; Previous/Next/direct pages and 25/100 sizes work. Search/filter/sort reset safely before slicing, combinations/counts and zero-result pagination work.',
  );

  // Popover dimensions must never displace the search row or results.
  const beforeSearch = await search.boundingBox();
  const beforeResults = await inbox().locator('.tc-inbox-list').boundingBox();
  await page.screenshot({ path: join(run, 'filters-closed-dark.png') });
  await openFilters();
  assert.deepEqual(await search.boundingBox(), beforeSearch);
  assert.deepEqual(await inbox().locator('.tc-inbox-list').boundingBox(), beforeResults);
  inside(await filters().boundingBox(), 1440, 1000);
  await page.screenshot({ path: join(run, 'filters-open-dark.png') });
  await evaluate('app.workspace.leftSplit.expand();true');
  await delay(200);
  const shiftedTrigger = await inbox()
    .getByRole('button', { name: /^Filters/ })
    .boundingBox();
  const shiftedPanel = await filters().boundingBox();
  assert.ok(
    Math.abs(
      shiftedPanel.x - Math.max(8, Math.min(shiftedTrigger.x, 1440 - shiftedPanel.width - 8)),
    ) < 2,
  );
  await evaluate('app.workspace.leftSplit.collapse();true');
  await delay(150);

  await filters().getByLabel('Relations', { exact: true }).selectOption('none');
  await closeFilters();
  await openFilters();
  assert.equal(await filters().getByLabel('Relations', { exact: true }).inputValue(), 'none');
  await search.click();
  await filters().waitFor({ state: 'hidden' });
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await openFilters();
  await search.evaluate((el) => el.closest('.view-content').scrollBy(0, 30));
  await delay(100);
  if (await filters().isVisible()) inside(await filters().boundingBox(), 1440, 1000);
  await page.setViewportSize({ width: 850, height: 900 });
  await delay(100);
  if (!(await filters().isVisible())) await openFilters();
  inside(await filters().boundingBox(), 850, 900);
  await page.screenshot({ path: join(run, 'filters-narrow-dark.png') });
  await page.setViewportSize({ width: 850, height: 500 });
  await delay(100);
  inside(await filters().boundingBox(), 850, 500);
  const flipped = await filters().boundingBox();
  const triggerBounds = await inbox()
    .getByRole('button', { name: /^Filters/ })
    .boundingBox();
  assert.ok(flipped.y + flipped.height <= triggerBounds.y + 1);
  await page.screenshot({ path: join(run, 'filters-flipped-dark.png') });
  await closeFilters();
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push(
    'Native top-layer Filters opens from keyboard, does not move the search/results layout, preserves filter values, closes on outside click and Escape, returns Escape focus to its trigger and stays inside the viewport during scrolling/narrow resizing.',
  );

  const row = inbox().locator('.tc-inbox-item').filter({ hasText: 'Idea 001' });
  const activeBefore = await evaluate('app.workspace.activeLeaf.view.getViewType()');
  await row.getByRole('checkbox').check();
  assert.equal(await evaluate('app.workspace.activeLeaf.view.getViewType()'), activeBefore);
  await row.getByRole('button', { name: 'Actions for Idea 001', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.menu:visible').waitFor();
  assert.equal(await evaluate('app.workspace.activeLeaf.view.getViewType()'), activeBefore);
  await page.keyboard.press('Escape');
  await row.getByRole('checkbox').uncheck();
  await row.hover();
  const colors = await row.evaluate((el) => ({
    row: window.getComputedStyle(el).backgroundColor,
    main: window.getComputedStyle(el.querySelector('.tc-inbox-row')).backgroundColor,
  }));
  assert.notEqual(colors.row, 'rgba(0, 0, 0, 0)');
  assert.equal(colors.main, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: join(run, 'row-hover-dark.png') });
  await row.getByRole('checkbox').check();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: join(run, 'row-selected-dark.png') });
  await inbox().getByRole('button', { name: 'Clear selection', exact: true }).click();
  await row.locator('.tc-inbox-row').click();
  await page.locator('.tc-focus:visible h1').getByText('Idea 001', { exact: true }).waitFor();
  await openInbox();
  await inbox().getByRole('checkbox', { name: 'Select this page', exact: true }).check();
  assert.equal(
    await inbox()
      .getByRole('region', { name: 'Selected entity actions' })
      .getByText('25 selected', { exact: true })
      .count(),
    1,
  );
  await paging().getByRole('button', { name: 'Next ›', exact: true }).click();
  assert.equal(await inbox().getByRole('region', { name: 'Selected entity actions' }).count(), 0);
  await paging().getByRole('button', { name: '‹ Previous', exact: true }).click();
  await inbox().getByRole('checkbox', { name: 'Select this page', exact: true }).check();
  await inbox()
    .getByRole('region', { name: 'Selected entity actions' })
    .getByRole('button', { name: 'Add to Brainstorm', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      Object.keys(window.app.plugins.plugins['thought-craft'].boards.getBoard('default').nodes)
        .length === 25,
  );
  for (let n = 1; n <= 25; n++)
    assert.equal(await readFile(join(vault, `${titleFor(n)}.md`), 'utf8'), originals.get(n));
  for (const n of [1, 2])
    await inbox()
      .getByRole('checkbox', { name: `Select ${titleFor(n)}`, exact: true })
      .check();
  await inbox()
    .getByRole('region', { name: 'Selected entity actions' })
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page
    .locator('.tc-trash-modal')
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page.locator('.tc-trash-modal').waitFor({ state: 'detached' });
  for (const n of [1, 2])
    assert.equal(
      await readFile(join(vault, '.trash', `${titleFor(n)}.md`), 'utf8'),
      originals.get(n),
    );
  assert.equal(await readFile(join(vault, 'Idea 003.md'), 'utf8'), originals.get(3));
  assert.deepEqual((await saved()).groups[0].entityIds, []);
  checks.push(
    'Checkbox and native row menu do not open an Entity; main content does. Hover covers the whole row, with independent selected/focus states. Select this page selects 25 only; page navigation clears hidden selection. Batch Add and recoverable trash preserve source Markdown and dangling links.',
  );

  await theme('light');
  await inbox().locator('.tc-inbox-row').first().hover();
  await page.screenshot({ path: join(run, 'row-hover-light.png') });
  await inbox().getByRole('checkbox', { name: 'Select Idea 003', exact: true }).check();
  await page.screenshot({ path: join(run, 'row-selected-light.png') });
  await inbox().getByRole('button', { name: 'Clear selection', exact: true }).click();
  await openFilters();
  await page.screenshot({ path: join(run, 'filters-open-light.png') });
  await closeFilters();
  await paging().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(run, 'pagination-light.png') });
  await page.setViewportSize({ width: 850, height: 900 });
  await evaluate('app.workspace.leftSplit.expand();true');
  await delay(150);
  await paging().scrollIntoViewIfNeeded();
  assert.equal(await paging().evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: join(run, 'pagination-narrow.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBoard();
  await board().getByRole('button', { name: 'Controls', exact: true }).focus();
  await page.keyboard.press('Enter');
  const help = page.locator('.tc-canvas-controls-modal');
  await help.getByText('Right drag · Middle drag · Space + drag', { exact: true }).waitFor();
  await page.screenshot({ path: join(run, 'canvas-controls-light.png') });
  await page.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  await theme('dark');
  await board().getByRole('button', { name: 'Controls', exact: true }).click();
  await page.screenshot({ path: join(run, 'canvas-controls-dark.png') });
  await page.keyboard.press('Escape');
  // Actual right-button pan and rectangle/multi-drag, using two clear ungrouped cards.
  await action(
    `${plugin}.boards.moveSelection('default',{'${idFor(24)}':{x:700,y:1100},'${idFor(25)}':{x:1020,y:1100}})`,
  );
  await fit();
  const beforePan = (await saved()).viewport;
  const pane = await board().locator('.react-flow__pane').boundingBox();
  await page.mouse.move(pane.x + 30, pane.y + 30);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(pane.x + 110, pane.y + 70, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await delay(150);
  const afterPan = (await saved()).viewport;
  assert.ok(beforePan.x !== afterPan.x || beforePan.y !== afterPan.y);
  await fit();
  const a = await node(idFor(24)).boundingBox(),
    b = await node(idFor(25)).boundingBox();
  await page.mouse.move(a.x - 10, a.y - 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 10, b.y + b.height + 10, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.tc-brainstorm .react-flow__node-entity.selected').length === 2,
  );
  const beforeMove = await saved();
  await page.mouse.move(a.x + 20, a.y + 25);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 45, { steps: 10 });
  await page.mouse.up();
  await delay(150);
  const moved = await saved();
  assert.ok(moved.nodes[idFor(24)].x !== beforeMove.nodes[idFor(24)].x);
  assert.ok(
    Math.abs(
      moved.nodes[idFor(24)].x -
        beforeMove.nodes[idFor(24)].x -
        (moved.nodes[idFor(25)].x - beforeMove.nodes[idFor(25)].x),
    ) < 0.01,
  );
  await action(`${plugin}.openEntityFocus('${idFor(4)}')`);
  await page
    .locator('.tc-focus:visible')
    .getByRole('button', { name: 'Brainstorm around', exact: true })
    .click();
  await board().getByRole('region', { name: 'Focus mode', exact: true }).waitFor();
  await node(idFor(4)).waitFor();
  assert.equal(await node(idFor(24)).count(), 0);
  await node(initial.groups[1].id).waitFor();
  await board().getByRole('button', { name: 'Show all', exact: true }).click();
  await node(idFor(24)).waitFor();
  await board().getByRole('tab', { name: 'Brainstorm', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await inbox().locator('h1').waitFor();
  await inbox().getByRole('button', { name: 'Guide', exact: true }).click();
  const guide = page.locator('.tc-guide-modal');
  await guide.getByRole('button', { name: 'Brainstorm', exact: true }).click();
  await guide.getByRole('heading', { name: 'Canvas controls', exact: true }).waitFor();
  await guide.getByText('Left drag on empty canvas', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  checks.push(
    'Light/dark/narrow popover, row states, pagination and Controls were inspected. Controls opens by keyboard and matches actual right-drag pan, left rectangle and multi-card movement. Full Guide includes the same concise controls; Focus, Groups and tabs remain functional.',
  );
  assert.deepEqual(pluginErrors, []);
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'filters-closed-dark.png',
      'filters-open-dark.png',
      'filters-narrow-dark.png',
      'filters-flipped-dark.png',
      'row-hover-dark.png',
      'row-selected-dark.png',
      'row-hover-light.png',
      'row-selected-light.png',
      'filters-open-light.png',
      'pagination-light.png',
      'pagination-narrow.png',
      'canvas-controls-light.png',
      'canvas-controls-dark.png',
    ],
    pluginErrors,
  };
  await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Evidence: ' + run);
} catch (error) {
  console.error('Renderer errors:', pluginErrors);
  if (page) {
    await page.screenshot({ path: join(run, 'failure.png') }).catch(() => {});
    console.error(
      'Visible text:',
      await page
        .locator('body')
        .innerText()
        .catch(() => 'unavailable'),
    );
  }
  await writeFile(join(run, 'failure.log'), String(error) + '\n' + processLog);
  console.error(error);
  console.error('Diagnostics: ' + run);
  process.exitCode = 1;
} finally {
  await stop();
  await writeFile(join(run, 'process.log'), processLog);
}
