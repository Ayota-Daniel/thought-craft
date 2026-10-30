import { pinTestRuntime } from './test-runtime.mjs';
// Integration check against a real, isolated Obsidian process (Linux).
// No mock Obsidian runtime; all notes live in a disposable test vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile, rename, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = resolve(root, '.artifacts', `m5-${Date.now()}`);
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

async function command(id) {
  assert.equal(
    await evaluate(`Boolean(app.commands.commands[${JSON.stringify(`thought-craft:${id}`)}])`),
    true,
  );
  await evaluate("app.commands.executeCommandById('command-palette:open'); true");
  const prompt = page.locator('.prompt-input');
  await prompt.fill(
    `Thought Craft: ${id === 'capture-idea' ? 'Capture idea' : id === 'open-brainstorm' ? 'Open brainstorm' : id === 'manage-workspaces' ? 'Manage workspaces' : 'Open inbox'}`,
  );
  await prompt.press('Enter');
}
// Inspect synchronous application state without awaiting command-returned promises.
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

function activeFocus() {
  return page.locator('.tc-focus:visible');
}

function markdownBody(markdown) {
  return markdown.slice(markdown.indexOf('\n---\n') + 5).replace(/^\n/, '');
}

async function getEntity(entityId) {
  return evaluate(
    "app.plugins.plugins['thought-craft'].entityIndex.getById(" + JSON.stringify(entityId) + ')',
  );
}

async function findEntity(title) {
  await page.waitForFunction((title) => {
    return window.app.plugins.plugins['thought-craft'].entityIndex
      .getAll()
      .some((entity) => entity.title === title);
  }, title);
  return evaluate(
    "app.plugins.plugins['thought-craft'].entityIndex.getAll().find(entity => entity.title === " +
      JSON.stringify(title) +
      ')',
  );
}

async function openFocus(entityId) {
  await evaluate(
    "void app.plugins.plugins['thought-craft'].openEntityFocus(" + JSON.stringify(entityId) + ')',
  );
  await waitForFocus(entityId);
}

async function waitForFocus(entityId) {
  await page.waitForFunction((entityId) => {
    return window.app.workspace.activeLeaf?.view.getState().entityId === entityId;
  }, entityId);
  await activeFocus().locator('.tc-focus-main h1').waitFor({ state: 'visible' });
}

async function waitForRelations(entityId, count) {
  await page.waitForFunction(
    ({ entityId, count }) => {
      return (
        window.app.plugins.plugins['thought-craft'].entityIndex.getById(entityId)?.relations
          .length === count
      );
    },
    { entityId, count },
  );
}

async function createDerived(sourceId, type, title, content) {
  await openFocus(sourceId);
  await activeFocus().getByRole('button', { name: 'Create from…', exact: true }).click();
  const dialog = page.locator('.tc-create-from-modal');
  const supportedTypes = await dialog
    .getByLabel('Entity type')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.ok(supportedTypes.includes(type));
  await dialog.getByLabel('Entity type').selectOption(type);
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByLabel('Initial content (optional)').fill(content);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  const created = await findEntity(title);
  await waitForFocus(created.id);
  return created;
}

async function restartObsidian() {
  await evaluate('app.workspace.requestSaveLayout(); true');
  await delay(1000);
  await stop();
  await launch();
}

const workspaceDialog = () => page.locator('.tc-workspace-manager');
const workspaceDetail = () =>
  workspaceDialog().getByRole('region', { name: 'Workspace definition' });

async function openWorkspaceManager(label) {
  await command('manage-workspaces');
  if (label) {
    await workspaceDialog()
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('button', { name: label, exact: true })
      .click();
  }
}
async function closeWorkspaceManager() {
  await page.keyboard.press('Escape');
  await workspaceDialog().waitFor({ state: 'detached' });
}
async function createWorkspace(label, enabledTypes) {
  await openWorkspaceManager();
  await workspaceDialog().getByRole('button', { name: '+ Create workspace', exact: true }).click();
  await workspaceDetail().getByLabel('Name', { exact: true }).fill(label);
  await workspaceDetail().getByLabel('Description', { exact: true }).fill('A focused workspace');
  const types = workspaceDetail().getByRole('group', { name: 'Enabled entity types' });
  for (const name of enabledTypes) {
    await types.getByRole('checkbox', { name, exact: true }).check();
  }
  await workspaceDetail().getByRole('button', { name: 'Create workspace', exact: true }).click();
  await workspaceDetail().getByRole('heading', { name: label, exact: true }).waitFor();
  await closeWorkspaceManager();
}
async function creationChoices(sourceId) {
  await openFocus(sourceId);
  await activeFocus().getByRole('button', { name: 'Create from…', exact: true }).click();
  const choices = await page
    .locator('.tc-create-from-modal')
    .getByLabel('Entity type', { exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  await page.keyboard.press('Escape');
  return choices;
}
async function rejectedRelation(sourceId, targetId, type, pattern) {
  await evaluate(
    `window.tcRejection='pending'; app.plugins.plugins['thought-craft'].repository.addRelation(${JSON.stringify(sourceId)}, ${JSON.stringify({ targetEntityId: targetId, type })}).then(() => {window.tcRejection='accepted';}, error => {window.tcRejection=error.message;}); true`,
  );
  await page.waitForFunction(() => window.tcRejection !== 'pending');
  assert.match(await evaluate('window.tcRejection'), pattern);
}

const activeBoard = () => page.locator('.tc-brainstorm:visible');
const nodeFor = (id) => activeBoard().locator(`.react-flow__node[data-id="${id}"]`);

async function openBoard() {
  await command('open-brainstorm');
  await activeBoard().locator('.react-flow__pane').waitFor();
}
async function savedBoard(workspaceId = 'default') {
  return evaluate(
    `app.plugins.plugins['thought-craft'].boards.getBoard(${JSON.stringify(workspaceId)})`,
  );
}
async function createIdeaOnBoard(title) {
  await activeBoard().getByRole('button', { name: '+ Idea', exact: true }).focus();
  await page.keyboard.press('Enter');
  const input = page.locator('.tc-capture-input');
  await input.fill(title + '\n\nA real Markdown thought.');
  await input.press('Enter');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
  const entity = await findEntity(title);
  await nodeFor(entity.id).waitFor();
  return entity;
}
async function addExisting(entity) {
  await activeBoard().getByRole('button', { name: '+ Add existing', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.tc-board-add-modal');
  await dialog.getByLabel('Search entities').fill(entity.title);
  const checkbox = dialog.getByRole('checkbox', { name: `Select ${entity.title}`, exact: true });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await dialog.getByRole('button', { name: 'Add 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  await nodeFor(entity.id).waitFor();
}
async function dragNode(entityId, deltaX, deltaY) {
  const node = nodeFor(entityId);
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds.x + 100, bounds.y + 42);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100 + deltaX, bounds.y + 42 + deltaY, { steps: 12 });
  await page.mouse.up();
  await delay(200);
}
async function placeForTest(entityId, position) {
  await evaluate(
    `window.tcPlacementReady=false; app.plugins.plugins['thought-craft'].boards.moveEntity('default',${JSON.stringify(entityId)},${JSON.stringify(position)}).then(() => {window.tcPlacementReady=true;}); true`,
  );
  await page.waitForFunction(() => window.tcPlacementReady);
}
async function drawConnection(sourceId, targetId) {
  await delay(250);
  const source = await nodeFor(sourceId).locator('.react-flow__handle.source').boundingBox();
  const target = await nodeFor(targetId).locator('.react-flow__handle.target').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.locator('.tc-board-relation-modal').waitFor();
}
async function confirmConnection(type) {
  const dialog = page.locator('.tc-board-relation-modal');
  await dialog.getByLabel('Relationship', { exact: true }).selectOption(type);
  await dialog.getByRole('button', { name: 'Create relationship', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
}
function edgeFor(sourceId, relationId) {
  return activeBoard().locator(`.react-flow__edge[data-id="${sourceId}:${relationId}"]`);
}
async function clickEdge(sourceId, relationId) {
  const path = edgeFor(sourceId, relationId).locator('.react-flow__edge-path');
  const point = await path.evaluate((element) => {
    const local = element.getPointAtLength(element.getTotalLength() / 2);
    const point = new window.DOMPoint(local.x, local.y).matrixTransform(element.getScreenCTM());
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(point.x, point.y);
}

try {
  // Upgrade actual M4 definitions and a real M3/M4-format note; no board data exists yet.
  const oldId = 'ca829f16-35b0-4e68-857b-d54cfc73caed';
  const oldBytes = `---\nbs_id: ${oldId}\nbs_type: idea\nbs_workspace: default\nbs_status: inbox\nbs_created: '2026-10-28T09:15:00.000Z'\nbs_updated: '2026-10-28T09:15:00.000Z'\nbs_properties:\n  note:\n    label: Note\n    type: text\n    value: Preserve local\nbs_schema_values:\n  importance: 4\nuser_flag: keep\n---\n\nExisting M4 thought.\n\n---\nExact body with trailing spaces.  \n`;
  await writeFile(join(vault, 'Existing M4 thought.md'), oldBytes);
  const enabled = ['idea', 'character', 'scene', 'location', 'project', 'quest'];
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 4,
      entitiesFolder: 'Brainstorm/Ideas',
      defaultWorkspace: 'default',
      activeWorkspaceId: 'default',
      user_setting: 'keep',
      entityTypes: [
        {
          id: 'quest',
          label: 'Quest',
          folderName: 'Quests',
          builtIn: false,
          retired: false,
          properties: [
            { key: 'difficulty', label: 'Difficulty', type: 'rating', max: 5, retired: false },
          ],
        },
      ],
      workspaces: [
        {
          id: 'default',
          label: 'Default',
          builtIn: true,
          retired: false,
          enabledEntityTypeIds: enabled,
          relationTypes: [
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
    }),
  );
  await launch();
  const oldIdea = await findEntity('Existing M4 thought');
  const character = await createDerived(oldId, 'character', 'Mira', 'A traveller.');
  const scene = await createDerived(oldId, 'scene', 'Station arrival', 'A first meeting.');
  await openBoard();
  await activeBoard().getByRole('heading', { name: 'This board is empty.', exact: true }).waitFor();
  assert.equal(await activeBoard().locator('.react-flow__node').count(), 0);
  const migrated = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(migrated.configVersion, 8);
  assert.equal(migrated.activeWorkspaceId, 'default');
  assert.equal(
    migrated.entityTypes.find((type) => type.id === 'quest').properties[0].key,
    'difficulty',
  );
  assert.equal(migrated.workspaces[0].relationTypes[0].id, 'appears-in');
  assert.equal(migrated.boards, undefined);
  assert.equal(migrated.user_setting, 'keep');
  assert.equal(await readFile(join(vault, oldIdea.filePath), 'utf8'), oldBytes);
  await page.screenshot({ path: join(run, 'empty-board.png') });
  checks.push(
    'M4 configuration upgrades to the current configuration version without note/schema/Workspace/relation changes. Opening a curated empty board does not auto-place entities or eagerly persist layout.',
  );

  const thought = await createIdeaOnBoard('The train has been here before');
  assert.match(thought.id, /^[a-f\d-]{36}$/);
  assert.equal(thought.type, 'idea');
  assert.equal(thought.workspaceId, 'default');
  const thoughtPath = join(vault, thought.filePath);
  const thoughtBytes = await readFile(thoughtPath, 'utf8');
  assert.match(thoughtBytes, /bs_workspace: default/);
  assert.doesNotMatch(thoughtBytes, /bs_board_/);
  const beforeDrag = (await savedBoard()).nodes[thought.id];
  await evaluate(
    "window.tcBoardSaves=0; window.tcOriginalSave=app.plugins.plugins['thought-craft'].saveData.bind(app.plugins.plugins['thought-craft']); app.plugins.plugins['thought-craft'].saveData=async(data)=>{window.tcBoardSaves++; return window.tcOriginalSave(data);}; true",
  );
  const bounds = await nodeFor(thought.id).boundingBox();
  await page.mouse.move(bounds.x + 100, bounds.y + 42);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 250, bounds.y + 132, { steps: 16 });
  await delay(150);
  assert.equal(await evaluate('window.tcBoardSaves'), 0);
  await page.mouse.up();
  await page.waitForFunction(() => window.tcBoardSaves > 0);
  assert.equal(await evaluate('window.tcBoardSaves'), 1);
  const dragged = (await savedBoard()).nodes[thought.id];
  assert.notEqual(dragged.x, beforeDrag.x);
  assert.equal(await readFile(thoughtPath, 'utf8'), thoughtBytes);
  await restartObsidian();
  await openBoard();
  await nodeFor(thought.id).waitFor();
  assert.deepEqual((await savedBoard()).nodes[thought.id], dragged);
  await nodeFor(thought.id).click();
  await nodeFor(thought.id).press('ArrowRight');
  await page.waitForFunction(
    ({ id, x }) =>
      window.app.plugins.plugins['thought-craft'].boards.getBoard('default').nodes[id]?.x !== x,
    { id: thought.id, x: dragged.x },
  );
  const keyboardPosition = (await savedBoard()).nodes[thought.id];
  await nodeFor(thought.id).press('Delete');
  assert.deepEqual((await savedBoard()).nodes[thought.id], keyboardPosition);
  assert.equal(await readFile(thoughtPath, 'utf8'), thoughtBytes);
  checks.push(
    'Board-created Idea is a real UUID Markdown entity. Dragging writes no layout during pointer movement and saves once on release, without Markdown changes. Restart restores position; arrow-key movement persists and Delete does not delete the note or placement.',
  );

  await activeBoard().getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForFunction(
    () => window.app.plugins.plugins['thought-craft'].boards.getBoard('default').viewport.zoom > 1,
  );
  const pane = await activeBoard().locator('.react-flow__pane').boundingBox();
  await page.keyboard.down('Space');
  await page.mouse.move(pane.x + 40, pane.y + 40);
  await page.mouse.down();
  await page.mouse.move(pane.x + 120, pane.y + 95, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await delay(250);
  const panned = (await savedBoard()).viewport;
  await restartObsidian();
  await openBoard();
  await nodeFor(thought.id).waitFor();
  assert.deepEqual((await savedBoard()).viewport, panned);
  assert.equal(
    await activeBoard().getByLabel('Zoom level', { exact: true }).innerText(),
    `${Math.round(panned.zoom * 100)}%`,
  );
  checks.push('Pan and button zoom persist per Workspace and restore after restart.');

  await addExisting(oldIdea);
  assert.equal(await readFile(join(vault, oldIdea.filePath), 'utf8'), oldBytes);
  await nodeFor(oldId).focus();
  await nodeFor(oldId).press('Enter');
  await waitForFocus(oldId);
  await activeFocus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    (path) => window.app.workspace.getActiveFile()?.path === path,
    oldIdea.filePath,
  );
  await openFocus(oldId);
  await activeFocus().getByRole('button', { name: 'Open in Brainstorm', exact: true }).click();
  await nodeFor(oldId).waitFor();
  await nodeFor(oldId).click();
  await activeBoard().getByRole('button', { name: 'Remove from board', exact: true }).click();
  await nodeFor(oldId).waitFor({ state: 'detached' });
  assert.equal(await readFile(join(vault, oldIdea.filePath), 'utf8'), oldBytes);
  await addExisting(oldIdea);
  await activeBoard().getByRole('button', { name: '+ Add existing', exact: true }).click();
  assert.equal(
    await page.locator('.tc-board-add-modal input[data-entity-id="' + oldId + '"]').count(),
    0,
  );
  await page.keyboard.press('Escape');
  checks.push(
    'Keyboard Add existing searches only unplaced Workspace entities and does not rewrite them. Enter opens Focus/native Markdown; Open in Brainstorm returns. Remove from board preserves the real note and allows re-adding; duplicates are excluded.',
  );

  await placeForTest(thought.id, { x: 100, y: 100 });
  await placeForTest(oldId, { x: 550, y: 100 });
  await activeBoard().getByRole('button', { name: 'Fit', exact: true }).click();
  await drawConnection(thought.id, oldId);
  await page.keyboard.press('Escape');
  assert.equal((await getEntity(thought.id)).relations.length, 0);
  assert.equal(await activeBoard().locator('.react-flow__edge').count(), 0);
  await drawConnection(thought.id, oldId);
  await confirmConnection('related-to');
  await waitForRelations(thought.id, 1);
  const universal = (await getEntity(thought.id)).relations[0];
  await edgeFor(thought.id, universal.id).waitFor();
  assert.match(await readFile(thoughtPath, 'utf8'), /type: related-to/);
  assert.match(await readFile(thoughtPath, 'utf8'), new RegExp(oldId));
  await restartObsidian();
  await openBoard();
  await edgeFor(thought.id, universal.id).waitFor();
  checks.push(
    'Dragging source/target handles opens a real relation-kind picker. Cancelling creates no phantom edge; confirmed universal relation persists in Markdown and is re-derived after restart.',
  );

  const characterBytes = await readFile(join(vault, character.filePath), 'utf8');
  const sceneBytes = await readFile(join(vault, scene.filePath), 'utf8');
  await addExisting(character);
  await addExisting(scene);
  assert.equal(await readFile(join(vault, character.filePath), 'utf8'), characterBytes);
  assert.equal(await readFile(join(vault, scene.filePath), 'utf8'), sceneBytes);
  await placeForTest(character.id, { x: 100, y: 400 });
  await placeForTest(scene.id, { x: 550, y: 400 });
  await activeBoard().getByRole('button', { name: 'Fit', exact: true }).click();
  assert.equal(await activeBoard().locator('.react-flow__edge').count(), 3);
  await drawConnection(character.id, scene.id);
  await confirmConnection('appears-in');
  await waitForRelations(character.id, 2);
  const custom = (await getEntity(character.id)).relations.find(
    (relation) => relation.type === 'appears-in',
  );
  await edgeFor(character.id, custom.id).waitFor();
  await page.screenshot({ path: join(run, 'relationships-board-light.png') });
  await page.evaluate(() => {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  });
  await delay(200);
  await page.screenshot({ path: join(run, 'relationships-board-dark.png') });
  await page.evaluate(() => {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  });

  await evaluate(
    "window.tcRaceReady=false; const plugin=app.plugins.plugins['thought-craft']; plugin.workspaces.addRelationType('default',{id:'foreshadows',label:'Foreshadows',sourceEntityTypeIds:['character'],targetEntityTypeIds:['scene']}).then(() => {window.tcOriginalAddRelation=plugin.repository.addRelation.bind(plugin.repository); plugin.repository.addRelation=async(source,input)=>{await plugin.workspaces.updateRelationType('default','foreshadows',{retired:true}); return window.tcOriginalAddRelation(source,input);}; window.tcRaceReady=true;}); true",
  );
  await page.waitForFunction(() => window.tcRaceReady);
  const beforeRace = await readFile(join(vault, character.filePath), 'utf8');
  await drawConnection(character.id, scene.id);
  const raceDialog = page.locator('.tc-board-relation-modal');
  await raceDialog.getByLabel('Relationship', { exact: true }).selectOption('foreshadows');
  await raceDialog.getByRole('button', { name: 'Create relationship', exact: true }).click();
  await raceDialog
    .getByRole('alert')
    .getByText(/unavailable/)
    .waitFor();
  assert.equal(await readFile(join(vault, character.filePath), 'utf8'), beforeRace);
  assert.equal(await activeBoard().locator('.react-flow__edge').count(), 4);
  await page.screenshot({ path: join(run, 'rejected-connection.png') });
  await page.keyboard.press('Escape');
  await evaluate(
    "app.plugins.plugins['thought-craft'].repository.addRelation=window.tcOriginalAddRelation; true",
  );
  checks.push(
    'A relation definition retired between picker validation and the real repository write produces an inline error, no Markdown change and no phantom edge.',
  );

  await drawConnection(character.id, scene.id);
  assert.equal(
    await page.locator('.tc-board-relation-modal option[value="appears-in"]').count(),
    0,
  );
  await page.keyboard.press('Escape');
  await drawConnection(thought.id, scene.id);
  assert.equal(
    await page.locator('.tc-board-relation-modal option[value="appears-in"]').count(),
    0,
  );
  await page.keyboard.press('Escape');
  await rejectedRelation(character.id, scene.id, 'appears-in', /already exists/);
  await rejectedRelation(thought.id, scene.id, 'appears-in', /unavailable/);
  checks.push(
    'Real originated-from edges appear automatically when both endpoints are placed. A valid Workspace custom relation persists. Duplicate and invalid-source custom kinds are omitted by the picker and independently rejected by the repository.',
  );

  await clickEdge(thought.id, universal.id);
  await activeBoard().getByRole('button', { name: 'Remove relationship', exact: true }).click();
  await page
    .locator('.tc-board-remove-relation-modal')
    .getByRole('button', { name: 'Remove relationship', exact: true })
    .click();
  await page.locator('.tc-board-remove-relation-modal').waitFor({ state: 'detached' });
  await waitForRelations(thought.id, 0);
  await edgeFor(thought.id, universal.id).waitFor({ state: 'detached' });
  assert.equal(markdownBody(await readFile(thoughtPath, 'utf8')), markdownBody(thoughtBytes));
  assert.equal(
    (await getEntity(character.id)).relations.find((relation) => relation.id === custom.id).type,
    'appears-in',
  );
  checks.push(
    'Selecting an edge and confirming Remove relationship changes only the actual source relation, leaving other edges and exact body intact.',
  );

  const characterPath = join(vault, character.filePath);
  const beforeExternal = await readFile(characterPath, 'utf8');
  await writeFile(characterPath, beforeExternal.replace('type: appears-in', 'type: supports'));
  await edgeFor(character.id, custom.id)
    .locator('text')
    .getByText('Supports', { exact: true })
    .waitFor();
  await writeFile(characterPath, beforeExternal);
  await edgeFor(character.id, custom.id)
    .locator('text')
    .getByText('Appears in', { exact: true })
    .waitFor();
  await evaluate(
    "window.tcRelabel=false; app.plugins.plugins['thought-craft'].workspaces.updateRelationType('default','appears-in',{label:'Present in scene'}).then(() => {window.tcRelabel=true;}); true",
  );
  await page.waitForFunction(() => window.tcRelabel);
  await edgeFor(character.id, custom.id)
    .locator('text')
    .getByText('Present in scene', { exact: true })
    .waitFor();
  assert.equal(await readFile(characterPath, 'utf8'), beforeExternal);
  const positionBeforeRename = (await savedBoard()).nodes[character.id];
  await rename(characterPath, join(vault, 'Renamed Mira.md'));
  await nodeFor(character.id).getByRole('heading', { name: 'Renamed Mira', exact: true }).waitFor();
  assert.deepEqual((await savedBoard()).nodes[character.id], positionBeforeRename);
  character.filePath = 'Renamed Mira.md';
  character.title = 'Renamed Mira';
  const renamedBytes = await readFile(join(vault, character.filePath), 'utf8');
  await writeFile(join(vault, character.filePath), renamedBytes + '\nExternal body edit.\n');
  await openFocus(character.id);
  await activeFocus().getByText('External body edit.', { exact: true }).waitFor();
  await activeFocus().getByRole('button', { name: 'Open in Brainstorm', exact: true }).click();
  const beforeDelete = await readFile(join(vault, character.filePath), 'utf8');
  await unlink(join(vault, scene.filePath));
  await nodeFor(scene.id).waitFor({ state: 'detached' });
  await page.waitForFunction(
    (id) => !window.app.plugins.plugins['thought-craft'].boards.getBoard('default').nodes[id],
    scene.id,
  );
  await edgeFor(character.id, custom.id).waitFor({ state: 'detached' });
  assert.equal(
    (await getEntity(character.id)).relations.find((relation) => relation.id === custom.id)
      .targetEntityId,
    scene.id,
  );
  assert.equal(await readFile(join(vault, character.filePath), 'utf8'), beforeDelete);
  checks.push(
    'External relation edits and definition-label changes refresh edges without copied edge state. Rename preserves UUID position; body edits remain available in Focus. External target deletion prunes only its layout membership and visible edges, leaving dangling Markdown relations intact.',
  );

  await createWorkspace('Product Lab', []);
  await openBoard();
  const defaultLayout = await savedBoard();
  await activeBoard().getByLabel('Active workspace', { exact: true }).selectOption('product-lab');
  await activeBoard().getByRole('heading', { name: 'This board is empty.', exact: true }).waitFor();
  const labIdea = await createIdeaOnBoard('Product Lab thought');
  assert.equal(labIdea.workspaceId, 'product-lab');
  await dragNode(labIdea.id, 50, 30);
  const labLayout = await savedBoard('product-lab');
  await activeBoard().getByLabel('Active workspace', { exact: true }).selectOption('default');
  await nodeFor(oldId).waitFor();
  assert.deepEqual((await savedBoard()).nodes, defaultLayout.nodes);
  assert.equal(await nodeFor(labIdea.id).count(), 0);
  assert.deepEqual((await savedBoard('product-lab')).nodes, labLayout.nodes);
  checks.push(
    'Workspace switching replaces the board immediately, preserves each layout independently and does not leak cards or coordinates. New Idea in Product Lab uses its own membership.',
  );

  const quest = await createDerived(oldId, 'quest', 'Find the conductor', 'A custom entity.');
  await activeFocus().getByRole('button', { name: 'Add to Brainstorm', exact: true }).click();
  await nodeFor(quest.id).getByText('Quest', { exact: true }).waitFor();
  await evaluate(
    "window.tcRetireType=false; const plugin=app.plugins.plugins['thought-craft']; plugin.registry.updateType('quest',{retired:true}).then(() => plugin.workspaces.update('default',{enabledEntityTypeIds:['idea','character','scene','location','project']})).then(() => {window.tcRetireType=true;}); true",
  );
  await page.waitForFunction(() => window.tcRetireType);
  await nodeFor(quest.id).getByRole('button', { name: 'Open', exact: true }).click();
  await waitForFocus(quest.id);
  assert.equal((await creationChoices(oldId)).includes('quest'), false);
  await openBoard();
  await nodeFor(quest.id).waitFor();
  const questPath = join(vault, quest.filePath);
  await writeFile(
    questPath,
    (await readFile(questPath, 'utf8')).replace('bs_type: quest', 'bs_type: creature'),
  );
  await nodeFor(quest.id).getByText('Unknown Entity Type: creature', { exact: true }).waitFor();
  await activeBoard().getByRole('button', { name: 'Fit', exact: true }).click();
  await page.screenshot({ path: join(run, 'brainstorm-light.png') });
  await page.evaluate(() => {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  });
  await delay(250);
  await page.screenshot({ path: join(run, 'brainstorm-dark.png') });
  await nodeFor(character.id).click();
  await page.screenshot({ path: join(run, 'selected-card-dark.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await nodeFor(character.id)
      .locator('.tc-entity-node')
      .evaluate((element) => window.getComputedStyle(element).transitionDuration),
    '0s',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const finalBoards = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8')).boards;
  for (const board of finalBoards) {
    assert.deepEqual(Object.keys(board).sort(), ['groups', 'nodes', 'viewport', 'workspaceId']);
    for (const point of Object.values(board.nodes)) {
      assert.deepEqual(Object.keys(point).sort(), ['x', 'y']);
    }
  }
  assert.equal(await readFile(join(vault, oldIdea.filePath), 'utf8'), oldBytes);
  await restartObsidian();
  await openBoard();
  await nodeFor(quest.id).getByText('Unknown Entity Type: creature', { exact: true }).waitFor();
  assert.deepEqual((await savedBoard('product-lab')).nodes, labLayout.nodes);
  assert.equal((await savedBoard()).nodes[scene.id], undefined);
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'M3 custom types render through the generic card; retired/disabled types stay openable. Unknown type falls back safely. Light/dark, keyboard dialogs/cards, reduced motion and final restart pass; layout JSON contains only UUID positions, empty groups and viewport.',
  );

  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'empty-board.png',
      'relationships-board-light.png',
      'relationships-board-dark.png',
      'rejected-connection.png',
      'brainstorm-light.png',
      'brainstorm-dark.png',
      'selected-card-dark.png',
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
