import { pinTestRuntime } from './test-runtime.mjs';
// Integration check against a real, isolated Obsidian process (Linux).
// No mock Obsidian runtime; all notes live in a disposable test vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = resolve(root, '.artifacts', `m6-${Date.now()}`);
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
  await page.setViewportSize({ width: 1440, height: 1000 });
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
const board = () => page.locator('.tc-brainstorm:visible');
const focus = () => page.locator('.tc-focus:visible');
const node = (id) => board().locator(`.react-flow__node[data-id="${id}"]`);

async function action(expression) {
  await evaluate(
    `window.tcResult='pending'; Promise.resolve(${expression}).then(() => {window.tcResult='done';}, error => {window.tcResult=error.message;}); true`,
  );
  await page.waitForFunction(() => window.tcResult !== 'pending');
  assert.equal(await evaluate('window.tcResult'), 'done');
}
async function saved(workspaceId = 'default') {
  return evaluate(`${plugin}.boards.getBoard(${JSON.stringify(workspaceId)})`);
}
async function openBoard() {
  await action(`${plugin}.showBrainstorm()`);
  await board().locator('.react-flow__pane').waitFor();
  await board().getByRole('button', { name: '+ Add existing', exact: true }).waitFor();
}
async function openFocus(id) {
  await action(`${plugin}.openEntityFocus(${JSON.stringify(id)})`);
  await focus().locator('h1').waitFor();
}
async function around(id) {
  await openFocus(id);
  await focus().getByRole('button', { name: 'Brainstorm around', exact: true }).focus();
  await page.keyboard.press('Enter');
  await board().locator('.tc-board-context').waitFor();
  await node(id).locator('.tc-entity-node').waitFor();
  await delay(250);
}
async function restart() {
  await evaluate('app.workspace.requestSaveLayout(); true');
  await delay(1000);
  await stop();
  await launch();
  await openBoard();
}
async function fit() {
  await board().getByRole('button', { name: 'Fit', exact: true }).click();
  await delay(300);
}
async function connected(title, kind = 'related-to') {
  const existingIds = await evaluate(`${plugin}.entityIndex.getAll().map(entity => entity.id)`);
  await board().getByRole('button', { name: '+ Connected idea', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.tc-connected-idea-modal');
  await dialog
    .getByLabel('Your idea', { exact: true })
    .fill(title + '\n\nReal connected Markdown.');
  assert.equal(await dialog.getByLabel('Connect as', { exact: true }).inputValue(), 'related-to');
  await dialog.getByLabel('Connect as', { exact: true }).selectOption(kind);
  await dialog.getByRole('button', { name: 'Create connected idea', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  const entity = await evaluate(
    `${plugin}.entityIndex.getAll().find(entity => !${JSON.stringify(existingIds)}.includes(entity.id))`,
  );
  assert.ok(entity);
  await node(entity.id).waitFor();
  return entity;
}
async function multiSelect(ids) {
  await fit();
  await node(ids[0]).locator('h3').click();
  for (const id of ids.slice(1)) {
    await node(id)
      .locator('h3')
      .click({ modifiers: ['Control'] });
  }
}
async function makeGroup(ids, label) {
  await multiSelect(ids);
  await board().getByRole('button', { name: 'Group selection', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.tc-group-modal');
  await dialog.getByLabel('Name', { exact: true }).fill(label);
  await dialog.getByRole('button', { name: 'Create group', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  const group = (await saved()).groups.find((group) => group.label === label);
  assert.ok(group);
  await node(group.id).locator('.tc-board-group-title').waitFor();
  return group;
}
async function selectGroup(id) {
  await fit();
  await node(id)
    .locator('.tc-board-group-title')
    .click({ position: { x: 18, y: 16 } });
  await board().getByRole('button', { name: 'Rename group', exact: true }).waitFor();
}
async function memberAction(id, name) {
  await fit();
  await node(id).locator('h3').click();
  await board().getByRole('button', { name, exact: true }).click();
}
async function bytes(entity) {
  return readFile(join(vault, entity.filePath), 'utf8');
}

try {
  const rootId = 'ca829f16-35b0-4e68-857b-d54cfc73caed';
  const outgoingId = '06fc0cbc-0100-4b5e-92f4-938b00cb7d08';
  const incomingId = '7631b173-505e-4a2f-b19e-d31e3aab8816';
  const quietId = '9631b173-505e-4a2f-b19e-d31e3aab8816';
  const offboardId = '8631b173-505e-4a2f-b19e-d31e3aab8816';
  const ids = [rootId, outgoingId, incomingId, quietId, offboardId];
  const titles = ['Mira', 'A secret', 'Station arrival', 'Unrelated thought', 'Not placed yet'];
  const createdAt = '2026-10-29T00:00:00.000Z';
  const originals = new Map();
  for (let i = 0; i < ids.length; i++) {
    const relations =
      i === 0
        ? `bs_relations:\n  - id: e2c1b5b7-8856-42f4-a958-63ac4944b441\n    type: related-to\n    target_entity_id: ${outgoingId}\n    created_at: '${createdAt}'\n`
        : i === 2
          ? `bs_relations:\n  - id: c58c7e2c-1dc6-442e-80bd-40801e231046\n    type: supports\n    target_entity_id: ${rootId}\n    created_at: '${createdAt}'\n`
          : '';
    const markdown = `---\nbs_id: ${ids[i]}\nbs_type: ${i === 0 ? 'character' : 'idea'}\nbs_workspace: default\nbs_status: inbox\nbs_created: '${createdAt}'\nbs_updated: '${createdAt}'\nuser_flag: preserve\n${relations}---\n\nOriginal body ${i}.  \n\n---\nUntouched.\n`;
    await writeFile(join(vault, `${titles[i]}.md`), markdown);
    originals.set(ids[i], markdown);
  }
  const legacy = {
    workspaceId: 'default',
    nodes: {
      [rootId]: { x: 100, y: 180 },
      [outgoingId]: { x: 440, y: 60 },
      [incomingId]: { x: 440, y: 340 },
      [quietId]: { x: 780, y: 560 },
    },
    viewport: { x: 40, y: 25, zoom: 0.65 },
  };
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 5,
      activeWorkspaceId: 'default',
      entitiesFolder: 'Brainstorm/Ideas',
      keep: 'original',
      workspaces: [
        {
          id: 'default',
          label: 'Default',
          builtIn: true,
          retired: false,
          enabledEntityTypeIds: ['idea', 'character', 'scene', 'location', 'project'],
          relationTypes: [
            {
              id: 'questions',
              label: 'Questions',
              sourceEntityTypeIds: ['idea'],
              targetEntityTypeIds: ['character'],
              retired: false,
            },
            {
              id: 'appears-in',
              label: 'Appears in',
              sourceEntityTypeIds: ['character'],
              targetEntityTypeIds: ['scene'],
              retired: false,
            },
          ],
        },
      ],
      boards: [legacy],
    }),
  );
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openBoard();
  assert.deepEqual(await saved(), { ...legacy, groups: [] });
  const config = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(config.configVersion, 8);
  assert.equal(config.keep, 'original');
  assert.deepEqual(config.boards[0], { ...legacy, groups: [] });
  checks.push(
    'M5 configuration upgrades to v6 with positions, viewport, membership, definitions and unrelated settings preserved; groups begin empty and Markdown is untouched.',
  );

  await openFocus(rootId);
  await page.screenshot({ path: join(run, 'focus-actions.png') });
  await around(rootId);
  assert.equal(await node(rootId).evaluate((el) => el.classList.contains('tc-context-root')), true);
  await node(outgoingId).waitFor();
  await node(incomingId).waitFor();
  assert.equal(await node(quietId).count(), 0);
  assert.ok((await saved()).nodes[quietId]);
  const cardBox = await node(rootId).boundingBox();
  const canvasBox = await board().locator('.tc-board-canvas').boundingBox();
  assert.ok(Math.abs(cardBox.x + cardBox.width / 2 - canvasBox.x - canvasBox.width / 2) < 4);
  assert.ok(Math.abs(cardBox.y + cardBox.height / 2 - canvasBox.y - canvasBox.height / 2) < 4);
  assert.deepEqual((await saved()).nodes[rootId], legacy.nodes[rootId]);
  await page.screenshot({ path: join(run, 'context-dark.png') });
  const beforeExit = await saved();
  await board().getByRole('button', { name: 'Show all', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  assert.deepEqual(await saved(), beforeExit);
  await around(offboardId);
  assert.ok((await saved()).nodes[offboardId]);
  await board().getByRole('button', { name: 'Show all', exact: true }).click();
  await around(rootId);
  checks.push(
    'Focus Brainstorm around opens the root Workspace, preserves existing position or explicitly places an absent root, centers measured card geometry and distinguishes incoming/outgoing neighbors from unrelated cards (hidden in M6.5). Exit preserves layout.',
  );

  const rootBytes = originals.get(rootId);
  await board().getByRole('button', { name: '+ Connected idea', exact: true }).click();
  const dialog = page.locator('.tc-connected-idea-modal');
  const kinds = await dialog
    .getByLabel('Connect as', { exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.ok(kinds.includes('related-to') && kinds.includes('questions'));
  assert.ok(!kinds.includes('appears-in'));
  await page.screenshot({ path: join(run, 'connected-idea-dialog.png') });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await board().locator('.tc-board-context').count(), 1);
  const first = await connected('Mira already knows the truth');
  const second = await connected('Why does Mira return?', 'questions');
  assert.equal(first.workspaceId, 'default');
  assert.equal(first.type, 'idea');
  assert.match(first.id, /^[a-f\d-]{36}$/);
  assert.equal(first.relations.length, 1);
  assert.equal(first.relations[0].targetEntityId, rootId);
  assert.equal(first.relations[0].type, 'related-to');
  assert.equal(second.relations[0].type, 'questions');
  assert.match(await bytes(first), /bs_relations:/);
  assert.doesNotMatch(await bytes(first), /bs_context|bs_group|bs_board/);
  assert.equal(await readFile(join(vault, 'Mira.md'), 'utf8'), rootBytes);
  checks.push(
    'Connected Idea dialog explicitly defaults to new Idea → Related to → root. Real UUID Markdown, alternate valid Workspace kind, type restrictions, derived edges and unchanged root bytes verified. Escape dismisses the modal before context.',
  );

  await fit();
  await node(first.id).locator('h3').click();
  await board().getByRole('button', { name: 'Brainstorm around', exact: true }).focus();
  await page.keyboard.press('Enter');
  await board()
    .getByRole('button', { name: `Remove focus ${first.title}`, exact: true })
    .waitFor();
  await node(first.id).focus();
  await page.keyboard.press('Escape');
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  const group = await makeGroup([rootId, first.id], 'Act I');
  await page.screenshot({ path: join(run, 'group-dark.png') });
  const beforeRestart = await saved();
  await restart();
  assert.deepEqual(await saved(), beforeRestart);
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  await selectGroup(group.id);
  await evaluate(
    `window.tcWrites=0; window.tcSave=${plugin}.saveData.bind(${plugin}); ${plugin}.saveData=async function(data){window.tcWrites++; return window.tcSave(data);}; true`,
  );
  const titleBox = await node(group.id).locator('.tc-board-group-title').boundingBox();
  const beforeMove = await saved();
  await page.mouse.move(titleBox.x + 35, titleBox.y + 18);
  await page.mouse.down();
  await page.mouse.move(titleBox.x + 135, titleBox.y + 68, { steps: 12 });
  assert.equal(await evaluate('window.tcWrites'), 0);
  await page.mouse.up();
  await delay(300);
  const afterMove = await saved();
  assert.equal(await evaluate('window.tcWrites'), 1);
  const moved = afterMove.groups.find((item) => item.id === group.id);
  assert.ok(moved.x !== group.x);
  for (const id of group.entityIds) {
    assert.ok(
      Math.abs(afterMove.nodes[id].x - beforeMove.nodes[id].x - (moved.x - group.x)) < 0.01,
    );
    assert.ok(
      Math.abs(afterMove.nodes[id].y - beforeMove.nodes[id].y - (moved.y - group.y)) < 0.01,
    );
  }
  await restart();
  assert.deepEqual(await saved(), afterMove);
  checks.push(
    'Real Ctrl-click multi-selection creates Act I with fitted bounds. Restart retains stable group ID/membership. Dragging its title moves members with stable offsets, with zero writes during motion and one at release; another restart preserves all positions.',
  );

  await selectGroup(group.id);
  const beforeArrow = await saved();
  await node(group.id).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    ({ groupId, oldX }) =>
      window.app.plugins.plugins['thought-craft'].boards
        .getBoard('default')
        .groups.find((group) => group.id === groupId).x !== oldX,
    { groupId: group.id, oldX: beforeArrow.groups[0].x },
  );
  const afterArrow = await saved();
  const arrowDelta = afterArrow.groups[0].x - beforeArrow.groups[0].x;
  assert.ok(arrowDelta > 0);
  for (const id of group.entityIds) {
    assert.equal(afterArrow.nodes[id].x - beforeArrow.nodes[id].x, arrowDelta);
  }
  await board().getByRole('button', { name: 'Rename group', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.tc-group-modal').getByLabel('Name', { exact: true }).fill('Act II');
  await page.locator('.tc-group-modal').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.tc-group-modal').waitFor({ state: 'detached' });
  await node(group.id).getByText('Act II', { exact: true }).waitFor();
  await memberAction(second.id, 'Move to group…');
  await page.locator('.tc-group-modal').getByLabel('Group', { exact: true }).selectOption(group.id);
  await page.locator('.tc-group-modal').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.tc-group-modal').waitFor({ state: 'detached' });
  assert.ok((await saved()).groups[0].entityIds.includes(second.id));
  await memberAction(second.id, 'Remove from group');
  assert.ok(!(await saved()).groups[0].entityIds.includes(second.id));
  assert.ok((await saved()).nodes[second.id]);
  await around(rootId);
  const groupedIdea = await connected('What if the station recognizes Mira?');
  assert.ok((await saved()).groups[0].entityIds.includes(groupedIdea.id));
  const snapshots = new Map();
  for (const entity of [first, second, groupedIdea]) snapshots.set(entity.id, await bytes(entity));
  await selectGroup(group.id);
  const beforeRemove = await saved();
  await board().getByRole('button', { name: 'Remove group', exact: true }).focus();
  await page.keyboard.press('Enter');
  await node(group.id).waitFor({ state: 'detached' });
  assert.deepEqual((await saved()).nodes, beforeRemove.nodes);
  assert.equal(await board().locator('.tc-board-context').count(), 1);
  for (const entity of [first, second, groupedIdea])
    assert.equal(await bytes(entity), snapshots.get(entity.id));
  assert.equal(await readFile(join(vault, 'Mira.md'), 'utf8'), rootBytes);
  checks.push(
    'Keyboard group rename, explicit join/leave and group-inherited connected creation pass. Removing a group leaves context active, every card at its absolute position, and exact Markdown/relations unchanged.',
  );

  await board().getByRole('button', { name: 'Show all', exact: true }).click();
  const nextGroup = await makeGroup([rootId, first.id], 'Consequences');
  await unlink(join(vault, first.filePath));
  await node(first.id).waitFor({ state: 'detached' });
  await page.waitForFunction(
    ({ id }) =>
      !window.app.plugins.plugins['thought-craft'].boards
        .getBoard('default')
        .groups[0].entityIds.includes(id),
    { id: first.id },
  );
  assert.deepEqual((await saved()).groups[0].entityIds, [rootId]);
  await memberAction(rootId, 'Remove from board');
  await node(rootId).waitFor({ state: 'detached' });
  assert.deepEqual((await saved()).groups[0].entityIds, []);
  assert.equal(await readFile(join(vault, 'Mira.md'), 'utf8'), rootBytes);
  await around(rootId);
  assert.ok((await saved()).nodes[rootId]);
  assert.equal((await saved()).groups[0].id, nextGroup.id);
  checks.push(
    'External member deletion prunes only stale placement/membership and preserves the group. Remove from board cleans membership without touching Markdown. Focus can contextually restore the root placement.',
  );

  await action(`${plugin}.workspaces.create({id:'lab',label:'Lab'})`);
  const originalLayout = await saved();
  assert.ok(originalLayout.groups.length > 0);
  await action(`${plugin}.workspaces.setActive('lab')`);
  assert.deepEqual((await saved('lab')).groups, []);
  assert.deepEqual((await saved('lab')).nodes, {});
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  await action(`${plugin}.workspaces.setActive('default')`);
  assert.deepEqual(await saved(), originalLayout);
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  await selectGroup(nextGroup.id);
  await board().getByRole('button', { name: 'Remove group', exact: true }).click();
  await node(nextGroup.id).waitFor({ state: 'detached' });
  const themeGroup = await makeGroup([rootId, second.id], 'Questions');
  await around(rootId);
  await fit();
  await page.screenshot({ path: join(run, 'context-group-dark.png') });
  await evaluate(
    "document.body.removeClass('theme-dark'); document.body.addClass('theme-light'); true",
  );
  await page.screenshot({ path: join(run, 'context-group-light.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await node(rootId).evaluate(
    (element) => window.getComputedStyle(element).transitionDuration,
  );
  assert.equal(duration, '0s');
  await page.setViewportSize({ width: 850, height: 900 });
  await fit();
  await page.screenshot({ path: join(run, 'narrow-context-group.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const finalLayout = await saved();
  await restart();
  assert.deepEqual(await saved(), finalLayout);
  assert.equal(await board().locator('.tc-board-context').count(), 0);
  assert.ok((await saved()).groups.some((group) => group.id === themeGroup.id));
  for (const id of ids) {
    if (
      id === rootId ||
      id === outgoingId ||
      id === incomingId ||
      id === quietId ||
      id === offboardId
    ) {
      assert.equal(
        await readFile(join(vault, `${titles[ids.indexOf(id)]}.md`), 'utf8'),
        originals.get(id),
      );
    }
  }
  const stored = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.doesNotMatch(
    JSON.stringify(stored.boards),
    /contextEntityId|parentId|extent|typeLabel|relations|content/,
  );
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Workspace switching isolates layouts and clears temporary context without resurrecting it on return. Dark/light, narrow width, reduced motion, final restart, Markdown purity and no renderer errors verified.',
  );
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'focus-actions.png',
      'connected-idea-dialog.png',
      'context-dark.png',
      'group-dark.png',
      'context-group-dark.png',
      'context-group-light.png',
      'narrow-context-group.png',
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
