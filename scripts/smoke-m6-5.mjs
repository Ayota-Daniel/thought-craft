import { pinTestRuntime } from './test-runtime.mjs';
// Integration check against a real, isolated Obsidian process (Linux).
// No mock Obsidian runtime; all notes live in a disposable test vault.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = resolve(root, '.artifacts', `m6-5-${Date.now()}`);
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
const node = (id) => board().locator(`.react-flow__node[data-id="${id}"]`);
const idFor = (number) => `00000000-0000-4000-8000-${String(number + 1).padStart(12, '0')}`;
const titleFor = (number) =>
  number < 30
    ? `Idea ${String(number + 1).padStart(2, '0')}`
    : number === 30
      ? 'Mira'
      : `Character ${number}`;
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
  await delay(300);
}
async function restart() {
  await evaluate('app.workspace.requestSaveLayout(); true');
  await delay(1000);
  await stop();
  await launch();
}
async function enterFocus(number) {
  await action(`${plugin}.openEntityFocus('${idFor(number)}')`);
  const focus = page.locator('.tc-focus:visible');
  await focus.getByRole('button', { name: 'Brainstorm around', exact: true }).focus();
  await page.keyboard.press('Enter');
  await board().getByRole('region', { name: 'Focus mode', exact: true }).waitFor();
  await delay(200);
}
async function filter(name, value) {
  const details = inbox().getByRole('dialog', { name: 'Inbox filters', exact: true });
  if (!(await details.isVisible()))
    await inbox()
      .getByRole('button', { name: /^Filters/ })
      .click();
  await details.getByLabel(name, { exact: true }).selectOption(value);
}

try {
  const initialNodes = Object.fromEntries(
    Array.from({ length: 8 }, (_, n) => [
      idFor(n),
      { x: 80 + (n % 4) * 320, y: 80 + Math.floor(n / 4) * 220 },
    ]),
  );
  const groups = [
    {
      id: 'group-ca829f16-35b0-4e68-857b-d54cfc73caed',
      label: 'Act I',
      x: 48,
      y: 24,
      width: 620,
      height: 240,
      entityIds: [idFor(0), idFor(1)],
    },
    {
      id: 'group-06fc0cbc-0100-4b5e-92f4-938b00cb7d08',
      label: 'Other context',
      x: 48,
      y: 244,
      width: 1250,
      height: 250,
      entityIds: [idFor(3), idFor(4)],
    },
  ];
  const layout = {
    workspaceId: 'default',
    nodes: initialNodes,
    groups,
    viewport: { x: 20, y: 10, zoom: 0.7 },
  };
  const originalBytes = new Map();
  for (let n = 0; n < 35; n++) {
    const targets = n === 0 ? [1, 6] : n === 2 ? [0] : n === 4 ? [5] : [];
    const relationText = targets.length
      ? 'bs_relations:\n' +
        targets
          .map(
            (target) =>
              `  - id: ${randomUUID()}\n    type: related-to\n    target_entity_id: ${idFor(target)}\n    created_at: '2026-10-29T00:00:00.000Z'\n`,
          )
          .join('')
      : '';
    const content = `---\nbs_id: ${idFor(n)}\nbs_type: ${n < 30 ? 'idea' : 'character'}\nbs_workspace: default\nbs_status: ${n < 30 ? 'inbox' : 'exploring'}\nbs_created: '2026-10-${String(1 + (n % 28)).padStart(2, '0')}T00:00:00.000Z'\nbs_updated: '2026-10-${n % 2 ? '28' : '01'}T00:00:00.000Z'\nuser_flag: keep\n${relationText}---\n\nBody ${n}.  \n\n---\nUntouched Markdown.\n`;
    await writeFile(join(vault, `${titleFor(n)}.md`), content);
    originalBytes.set(n, content);
  }
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 6,
      entitiesFolder: 'Brainstorm/Ideas',
      activeWorkspaceId: 'default',
      keep: 'unchanged',
      boards: [layout],
    }),
  );
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openInbox();
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 35);
  assert.deepEqual(await saved(), layout);
  const search = inbox().getByRole('searchbox', { name: 'Search ideas and entities', exact: true });
  await search.fill('MIRA');
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 1);
  await search.fill('character');
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 5);
  await inbox().getByRole('checkbox', { name: 'Select Mira', exact: true }).check();
  await search.fill('Idea 11');
  assert.equal(await inbox().getByRole('region', { name: 'Selected entity actions' }).count(), 0);
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await filter('On Brainstorm', 'off');
  await filter('Relations', 'none');
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 27);
  await filter('Entity type', 'character');
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 5);
  await inbox()
    .getByRole('dialog', { name: 'Inbox filters', exact: true })
    .getByRole('checkbox', { name: 'Updated in the last 7 days', exact: true })
    .check();
  assert.equal(await inbox().locator('.tc-inbox-row').count(), 2);
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await inbox().getByLabel('Sort entities', { exact: true }).selectOption('az');
  assert.equal(await inbox().locator('.tc-row-title').first().innerText(), 'Character 31');
  await inbox().getByLabel('Sort entities', { exact: true }).selectOption('updated');
  await search.fill('nothing matches');
  await inbox()
    .getByRole('heading', { name: 'No entities match these filters.', exact: true })
    .waitFor();
  await inbox().getByRole('button', { name: 'Clear filters', exact: true }).click();
  await inbox()
    .getByRole('button', { name: /^Filters/ })
    .click();
  await page.screenshot({ path: join(run, 'inbox-dark.png') });
  checks.push(
    'Upgraded M6 layout is unchanged. A 35-entity Inbox searches titles/type labels case-insensitively, filters board/relation/type/recent state in combination, sorts and explains empty results. Hidden-by-search selections clear before batch actions.',
  );

  for (const n of [10, 11, 12])
    await inbox()
      .getByRole('checkbox', { name: `Select ${titleFor(n)}`, exact: true })
      .check();
  await page.screenshot({ path: join(run, 'inbox-batch.png') });
  await inbox()
    .getByRole('region', { name: 'Selected entity actions' })
    .getByRole('button', { name: 'Add to Brainstorm', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    Boolean(
      window.app.plugins.plugins['thought-craft'].boards.getBoard('default').nodes[
        '00000000-0000-4000-8000-000000000013'
      ],
    ),
  );
  for (const n of [10, 11, 12]) {
    assert.ok((await saved()).nodes[idFor(n)]);
    assert.equal(await readFile(join(vault, `${titleFor(n)}.md`), 'utf8'), originalBytes.get(n));
  }
  await inbox().getByRole('checkbox', { name: 'Select Idea 02', exact: true }).check();
  await inbox().getByRole('checkbox', { name: 'Select Idea 04', exact: true }).check();
  await inbox()
    .getByRole('region', { name: 'Selected entity actions' })
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page
    .locator('.tc-trash-modal')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  assert.equal(await readFile(join(vault, 'Idea 02.md'), 'utf8'), originalBytes.get(1));
  await inbox()
    .getByRole('region', { name: 'Selected entity actions' })
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page.screenshot({ path: join(run, 'trash-confirmation.png') });
  await page
    .locator('.tc-trash-modal')
    .getByRole('button', { name: 'Move to trash', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.locator('.tc-trash-modal').waitFor({ state: 'detached' });
  for (const n of [1, 3]) {
    assert.equal(
      await readFile(join(vault, '.trash', `${titleFor(n)}.md`), 'utf8'),
      originalBytes.get(n),
    );
    assert.equal((await saved()).nodes[idFor(n)], undefined);
    assert.ok((await saved()).groups.every((group) => !group.entityIds.includes(idFor(n))));
  }
  assert.equal(await readFile(join(vault, 'Idea 01.md'), 'utf8'), originalBytes.get(0));
  assert.equal(await evaluate(`${plugin}.entityIndex.getById('${idFor(0)}').relations.length`), 2);
  checks.push(
    'Explicit visible selection bulk-adds without Markdown changes. Batch trash requires confirmation, Cancel preserves notes, confirmed notes are byte-identical in recoverable .trash. Board/group membership cleans while incoming source relations remain dangling and untouched.',
  );

  await inbox().getByRole('tab', { name: 'Inbox', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await board().getByRole('tab', { name: 'Brainstorm', exact: true }).waitFor();
  assert.equal(
    await board()
      .getByRole('tab', { name: 'Brainstorm', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  assert.equal(await evaluate(`${plugin}.workspaces.getActive().id`), 'default');
  await board().getByRole('button', { name: '+ Add existing', exact: true }).click();
  const picker = page.locator('.tc-board-add-modal');
  await picker.getByLabel('Search entities').fill('Idea 2');
  assert.equal(
    await picker.getByRole('checkbox', { name: 'Select Idea 01', exact: true }).count(),
    0,
  );
  for (const n of [20, 21, 22]) {
    await picker.getByRole('checkbox', { name: `Select ${titleFor(n)}`, exact: true }).focus();
    await page.keyboard.press('Space');
  }
  const checkboxBounds = await picker
    .getByRole('checkbox', { name: 'Select Idea 21', exact: true })
    .boundingBox();
  assert.ok(checkboxBounds.width >= 14 && checkboxBounds.height >= 14);
  await page.screenshot({ path: join(run, 'add-existing-multiple.png') });
  assert.doesNotMatch(await picker.innerText(), /00000000-0000/);
  await picker.getByRole('button', { name: 'Add 3', exact: true }).click();
  await picker.waitFor({ state: 'detached' });
  for (const n of [20, 21, 22]) assert.ok((await saved()).nodes[idFor(n)]);
  checks.push(
    'Keyboard tabs switch native views while retaining Workspace. Add Existing provides a searchable custom checkbox list, supports multiple keyboard selections, excludes placed entities and shows no UUID text.',
  );

  // Isolate two ungrouped cards for a real empty-canvas rectangle and selected-card drag.
  await action(
    `${plugin}.boards.moveSelection('default', {'${idFor(6)}':{x:700,y:800},'${idFor(7)}':{x:1020,y:800}})`,
  );
  await fit();
  const a = await node(idFor(6)).boundingBox();
  const b = await node(idFor(7)).boundingBox();
  const left = a.x - 12;
  const top = a.y - 12;
  const right = b.x + b.width + 12;
  const bottom = Math.max(a.y + a.height, b.y + b.height) + 12;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.tc-brainstorm .react-flow__node-entity.selected').length === 2,
  );
  const beforeMove = await saved();
  await evaluate(
    `window.tcWrites=0;window.tcSave=${plugin}.saveData.bind(${plugin});${plugin}.saveData=async function(data){window.tcWrites++;return window.tcSave(data);};true`,
  );
  await page.mouse.move(a.x + 30, a.y + 35);
  await page.mouse.down();
  await page.mouse.move(a.x + 90, a.y + 65, { steps: 12 });
  assert.equal(await evaluate('window.tcWrites'), 0);
  await page.mouse.up();
  await delay(250);
  const moved = await saved();
  assert.equal(await evaluate('window.tcWrites'), 1);
  const deltaX = moved.nodes[idFor(6)].x - beforeMove.nodes[idFor(6)].x;
  const deltaY = moved.nodes[idFor(6)].y - beforeMove.nodes[idFor(6)].y;
  assert.ok(deltaX > 0);
  assert.ok(Math.abs(moved.nodes[idFor(7)].x - beforeMove.nodes[idFor(7)].x - deltaX) < 0.01);
  assert.ok(Math.abs(moved.nodes[idFor(7)].y - beforeMove.nodes[idFor(7)].y - deltaY) < 0.01);
  await restart();
  await openBoard();
  assert.deepEqual((await saved()).nodes, moved.nodes);
  checks.push(
    'Native XYFlow rectangle selects two cards without a modifier. Dragging one moves the full selection, with zero writes during movement and one settled save. Restart restores both positions.',
  );

  const full = await saved();
  await enterFocus(0);
  await node(idFor(0)).waitFor();
  await node(idFor(2)).waitFor();
  await node(idFor(6)).waitFor();
  assert.equal(await node(idFor(7)).count(), 0);
  assert.equal(await node(groups[1].id).count(), 0);
  assert.equal(await node(groups[0].id).count(), 1);
  assert.deepEqual((await saved()).nodes, full.nodes);
  assert.deepEqual((await saved()).groups, full.groups);
  await board().getByRole('button', { name: '+ Add focus', exact: true }).focus();
  await page.keyboard.press('Enter');
  const focusPicker = page.locator('.tc-board-add-modal');
  await focusPicker.getByLabel('Search entities').fill('Idea 05');
  await focusPicker.getByRole('checkbox', { name: 'Select Idea 05', exact: true }).check();
  await focusPicker.getByRole('button', { name: 'Add 1', exact: true }).click();
  await focusPicker.waitFor({ state: 'detached' });
  await node(idFor(4)).waitFor();
  await node(idFor(5)).waitFor();
  await node(groups[1].id).waitFor();
  await fit();
  await page.screenshot({ path: join(run, 'focus-multiple-dark.png') });
  await board().getByRole('button', { name: '+ Connected idea', exact: true }).click();
  const rootChoice = page.locator('.tc-connected-idea-modal');
  await rootChoice
    .getByLabel('Your idea', { exact: true })
    .fill('Keep this draft when changing roots');
  await rootChoice.getByLabel('Connect new idea to', { exact: true }).selectOption(idFor(4));
  assert.equal(
    await rootChoice.getByLabel('Your idea', { exact: true }).inputValue(),
    'Keep this draft when changing roots',
  );
  await page.keyboard.press('Escape');
  await rootChoice.waitFor({ state: 'detached' });

  await board().getByRole('button', { name: 'Remove focus Idea 01', exact: true }).click();
  assert.equal(await node(idFor(0)).count(), 0);
  assert.equal(await node(groups[0].id).count(), 0);
  await board().getByRole('button', { name: 'Show all', exact: true }).click();
  assert.deepEqual((await saved()).nodes, full.nodes);
  assert.deepEqual((await saved()).groups, full.groups);
  await node(idFor(7)).waitFor();
  await enterFocus(0);
  await board().getByRole('button', { name: '+ Connected idea', exact: true }).click();
  const connected = page.locator('.tc-connected-idea-modal');
  await connected.getByLabel('Your idea', { exact: true }).fill('A connected thought in Focus');
  await connected
    .getByRole('button', { name: 'What do these relations mean?', exact: true })
    .click();
  const guide = page.locator('.tc-guide-modal');
  for (const meaning of [
    'Related to',
    'Supports',
    'Alternative to',
    'Depends on',
    'Originated from',
  ])
    await guide.getByRole('heading', { name: meaning, exact: true }).waitFor();
  await page.screenshot({ path: join(run, 'relation-guide.png') });
  await page.keyboard.press('Escape');
  await guide.waitFor({ state: 'detached' });
  assert.equal(
    await connected.getByLabel('Your idea', { exact: true }).inputValue(),
    'A connected thought in Focus',
  );
  await connected.getByRole('button', { name: 'Create connected idea', exact: true }).click();
  await connected.waitFor({ state: 'detached' });
  const created = await evaluate(
    `${plugin}.entityIndex.getAll().find(entity => entity.title === 'A connected thought in Focus')`,
  );
  assert.equal(created.relations[0].targetEntityId, idFor(0));
  await node(created.id).waitFor();
  assert.ok((await saved()).groups[0].entityIds.includes(created.id));
  assert.equal(
    await board()
      .getByRole('button', { name: `Remove focus ${created.title}`, exact: true })
      .count(),
    0,
  );
  checks.push(
    'Focus renders only roots plus one-hop incoming/outgoing neighbors and relevant groups. Multi-root union, independent root removal and Show all preserve hidden nodes/groups exactly. Connected Idea becomes visible as a neighbor, inherits its root group and is not promoted to a root. Relation guide opens above the picker and returns to its intact draft.',
  );

  await board().getByRole('button', { name: 'Show all', exact: true }).click();
  await board().getByRole('tab', { name: 'Brainstorm', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await inbox().locator('h1').waitFor();
  await inbox().getByRole('button', { name: 'Actions for Mira', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.menu:visible').getByText('Move to trash', { exact: true }).click();
  await page
    .locator('.tc-trash-modal')
    .getByText('Move 1 entity to trash?', { exact: true })
    .waitFor();
  await page
    .locator('.tc-trash-modal')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await inbox().getByRole('button', { name: 'Guide', exact: true }).click();
  await page
    .locator('.tc-guide-modal')
    .getByRole('button', { name: 'Entities', exact: true })
    .click();
  await page
    .locator('.tc-guide-modal')
    .getByRole('heading', { name: 'Entities', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await evaluate(
    "document.body.removeClass('theme-dark');document.body.addClass('theme-light');true",
  );
  await page.screenshot({ path: join(run, 'inbox-light.png') });
  await page.setViewportSize({ width: 850, height: 900 });
  await page.screenshot({ path: join(run, 'inbox-narrow.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFocus(0);
  await fit();
  await page.screenshot({ path: join(run, 'focus-light.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await node(idFor(0)).evaluate((element) => window.getComputedStyle(element).transitionDuration),
    '0s',
  );
  await restart();
  await openBoard();
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Full Guide, both directions of keyboard tab navigation, retained Workspace, dark/light/narrow layout, reduced motion and temporary Focus after restart pass with no renderer errors.',
  );
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'inbox-dark.png',
      'inbox-batch.png',
      'trash-confirmation.png',
      'add-existing-multiple.png',
      'focus-multiple-dark.png',
      'relation-guide.png',
      'inbox-light.png',
      'inbox-narrow.png',
      'focus-light.png',
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
