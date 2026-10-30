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
const run = resolve(root, '.artifacts', `m7-${Date.now()}`);
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
const story = () => page.locator('.tc-story:visible');
const focus = () => page.locator('.tc-focus:visible');
const modal = () => page.locator('.tc-story-create-modal');
const screenshots = [];
async function action(expression) {
  await evaluate(
    `window.tcResult='pending'; Promise.resolve(${expression}).then(() => {window.tcResult='done';}, error => {window.tcResult=error.message;}); true`,
  );
  await page.waitForFunction(() => window.tcResult !== 'pending');
  assert.equal(await evaluate('window.tcResult'), 'done');
}
async function openStory(section) {
  await action(`${plugin}.showStory(${section ? JSON.stringify(section) : ''})`);
  await story().getByRole('navigation', { name: 'Story sections', exact: true }).waitFor();
}
async function section(label) {
  await story()
    .getByRole('navigation', { name: 'Story sections', exact: true })
    .getByRole('button', { name: label, exact: true })
    .click();
}
async function shot(name) {
  screenshots.push(name);
  await page.screenshot({ path: join(run, name) });
}
async function theme(name) {
  await evaluate(
    `document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${name}');true`,
  );
}
async function byTitle(title) {
  return evaluate(`${plugin}.entityIndex.getAll().find(e=>e.title===${JSON.stringify(title)})`);
}
async function create(label, title, notes = '') {
  await story()
    .getByRole('button', { name: `+ ${label}`, exact: true })
    .click();
  await modal()
    .getByRole('textbox', { name: label === 'Character' ? 'Name' : 'Title', exact: true })
    .fill(title);
  await modal().getByRole('textbox', { name: 'Initial notes (optional)', exact: true }).fill(notes);
  await modal()
    .getByRole('button', { name: label === 'Scene' ? 'Create & write' : 'Create', exact: true })
    .click();
  await modal().waitFor({ state: 'detached' });
  await page.waitForFunction(
    ({ title }) =>
      window.app.plugins.plugins['thought-craft'].entityIndex
        .getAll()
        .some((e) => e.title === title),
    { title },
  );
  return byTitle(title);
}
async function nativePath(path) {
  await page.waitForFunction(
    (path) => window.app.workspace.getMostRecentLeaf()?.view?.file?.path === path,
    path,
  );
}

try {
  const initialNote = `---\nbs_id: ca829f16-35b0-4e68-857b-d54cfc73caed\nbs_type: idea\nbs_workspace: default\nbs_status: inbox\nbs_created: '2026-10-29T00:00:00Z'\nbs_updated: '2026-10-29T00:00:00Z'\nuser_flag: keep\n---\n\nPreserve body.  \n\n---\nExactly.\n`;
  await writeFile(join(vault, 'Existing idea.md'), initialNote);
  const initialBoard = {
    workspaceId: 'default',
    nodes: { 'ca829f16-35b0-4e68-857b-d54cfc73caed': { x: 60, y: 80 } },
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 6,
      entitiesFolder: 'Brainstorm/Ideas',
      activeWorkspaceId: 'default',
      user_setting: 'keep',
      boards: [initialBoard],
      workspaces: [
        {
          id: 'default',
          label: 'The Last Train',
          builtIn: true,
          retired: false,
          enabledEntityTypeIds: ['idea'],
          relationTypes: [],
        },
      ],
    }),
  );
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await action(`${plugin}.showInbox()`);
  assert.equal(
    await page
      .locator('.tc-inbox:visible')
      .getByRole('tab', { name: 'Story', exact: true })
      .count(),
    0,
  );
  const migrated = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(migrated.configVersion, 8);
  assert.deepEqual(migrated.workspaces[0].enabledExperiences, []);
  assert.deepEqual(migrated.workspaces[0].enabledEntityTypeIds, ['idea']);
  assert.deepEqual(migrated.boards, [initialBoard]);
  assert.equal(migrated.user_setting, 'keep');
  assert.equal(await readFile(join(vault, 'Existing idea.md'), 'utf8'), initialNote);
  await shot('story-disabled-dark.png');
  await page
    .locator('.tc-inbox:visible')
    .getByRole('button', { name: 'Manage workspaces', exact: true })
    .click();
  const manager = page.locator('.tc-workspace-manager');
  await manager.getByRole('checkbox', { name: 'Story', exact: true }).check();
  await shot('story-activation-dark.png');
  await manager.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].workspaces
      .getActive()
      .enabledExperiences.includes('story'),
  );
  await page.keyboard.press('Escape');
  await page.locator('.tc-inbox:visible').getByRole('tab', { name: 'Story', exact: true }).click();
  await story().getByText('No scenes yet.', { exact: true }).waitFor();
  assert.equal(
    await story()
      .getByRole('button', { name: 'Create your first scene', exact: true })
      .isDisabled(),
    true,
  );
  await story().getByRole('region', { name: 'Story setup', exact: true }).scrollIntoViewIfNeeded();
  await shot('story-setup-dark.png');
  for (const label of ['Character', 'Scene', 'Location', 'Plot Thread', 'Story Section']) {
    await story()
      .getByRole('button', { name: `Enable ${label}`, exact: true })
      .click();
    await story()
      .getByRole('button', { name: `Enable ${label}`, exact: true })
      .waitFor({ state: 'detached' });
  }
  await story()
    .getByRole('region', { name: 'Story setup', exact: true })
    .waitFor({ state: 'detached' });
  checks.push(
    'M6.6 → v7 preserves exact Markdown, board, enabled types and unrelated settings. Story is opt-in through Workspace Manager; recommended type setup is explicit.',
  );

  await section('Characters');
  await story().getByText('No characters yet.', { exact: true }).waitFor();
  await story().getByRole('button', { name: '+ Character', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await modal()
      .getByRole('textbox', { name: 'Name', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await shot('story-create-character-dark.png');
  await page.keyboard.press('Escape');
  await modal().waitFor({ state: 'detached' });
  assert.equal(
    await story()
      .getByRole('button', { name: '+ Character', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const character = await create('Character', 'Mira', 'A traveller.');
  await focus().getByRole('heading', { name: 'Mira', exact: true }).waitFor();
  assert.equal(character.workspaceId, 'default');
  assert.equal(character.type, 'character');
  assert.ok((await readFile(join(vault, character.filePath), 'utf8')).includes('A traveller.'));
  await action(`${plugin}.repository.addProperty('${character.id}', {label:'Fear',type:'text'})`);
  await action(
    `${plugin}.registry.addProperty('character', {key:'motivation',label:'Motivation',type:'text',retired:false,defaultValue:'Find Noah'})`,
  );
  await focus().getByText('Fear', { exact: true }).waitFor();
  await focus().getByText('Motivation', { exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Back to Story · Characters', exact: true }).click();
  await story().getByRole('heading', { name: 'Characters', exact: true }).waitFor();
  await shot('story-characters-dark.png');
  await section('Locations');
  const location = await create('Location', 'Old Station');
  assert.equal(location.type, 'location');
  await focus().getByRole('button', { name: 'Back to Story · Locations', exact: true }).click();
  await section('Plot Threads');
  const thread = await create('Plot Thread', 'The missing train', 'Who changed the timetable?');
  await focus().getByRole('heading', { name: 'The missing train', exact: true }).waitFor();
  assert.ok(thread.filePath.startsWith('Brainstorm/Plot Threads/'));
  await focus().getByRole('button', { name: 'Back to Story · Plot Threads', exact: true }).click();
  await section('Ideas');
  const idea = await create('Idea', 'A hidden platform');
  assert.equal(idea.type, 'idea');
  await focus().getByRole('button', { name: 'Back to Story · Ideas', exact: true }).click();
  await section('Scenes');
  const firstScene = await create('Scene', 'The forgotten platform', '## Arrival');
  await nativePath(firstScene.filePath);
  // Use Obsidian's real native editor, which modifies the existing Markdown file.
  await action(
    `Promise.resolve(app.workspace.getMostRecentLeaf().view.editor.replaceRange(${JSON.stringify('\nMira waits beneath the clock.')}, {line:app.workspace.getMostRecentLeaf().view.editor.lastLine()+1,ch:0}))`,
  );
  await page.waitForFunction(
    async (path) =>
      (await window.app.vault.read(window.app.vault.getAbstractFileByPath(path))).includes(
        'Mira waits',
      ),
    firstScene.filePath,
  );
  await openStory('overview');
  await story()
    .getByRole('button', { name: 'Continue writing: The forgotten platform', exact: true })
    .waitFor();
  assert.equal((await byTitle('The forgotten platform')).updatedAt, firstScene.updatedAt);
  await shot('story-overview-dark.png');
  await section('Scenes');
  const secondScene = await create('Scene', 'The confrontation', 'A choice.');
  await nativePath(secondScene.filePath);
  await openStory('overview');
  await story()
    .getByRole('button', { name: 'Continue writing: The confrontation', exact: true })
    .waitFor();
  await action(`${plugin}.openMarkdownNote('${firstScene.id}')`);
  await nativePath(firstScene.filePath);
  await action(
    `Promise.resolve(app.workspace.getMostRecentLeaf().view.editor.replaceRange(${JSON.stringify('\nNoah arrives.')}, {line:app.workspace.getMostRecentLeaf().view.editor.lastLine()+1,ch:0}))`,
  );
  await page.waitForFunction(
    async (path) =>
      (await window.app.vault.read(window.app.vault.getAbstractFileByPath(path))).includes(
        'Noah arrives',
      ),
    firstScene.filePath,
  );
  await openStory('overview');
  await story()
    .getByRole('button', { name: 'Continue writing: The forgotten platform', exact: true })
    .waitFor();
  assert.equal((await byTitle('The forgotten platform')).updatedAt, firstScene.updatedAt);
  await shot('story-continue-writing-dark.png');
  await story()
    .getByRole('button', { name: 'Continue writing: The forgotten platform', exact: true })
    .click();
  await nativePath(firstScene.filePath);
  await openStory('scene');
  await story()
    .getByRole('button', { name: /The forgotten platform/ })
    .first()
    .click();
  await focus().getByRole('heading', { name: 'The forgotten platform', exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await nativePath(firstScene.filePath);
  await openStory('scene');
  checks.push(
    'All five generic creation flows write real Markdown. Scene creates and Continue Writing open the native editor; native edits change the latest Scene without rewriting bs_updated. Character schemas/local properties and collection-specific Focus Back work.',
  );

  // More than two pages of real Scene notes, created through the Vault API.
  const sceneNotes = [];
  for (let number = 1; number <= 105; number++) {
    const suffix = String(number).padStart(12, '0');
    const title = `Scene ${String(number).padStart(3, '0')}`;
    const markdown = [
      '---',
      `bs_id: 00000000-0000-4000-8000-${suffix}`,
      'bs_type: scene',
      'bs_workspace: default',
      'bs_status: exploring',
      "bs_created: '2026-10-28T00:00:00Z'",
      "bs_updated: '2026-10-28T00:00:00Z'",
      '---',
      '',
      'Scene body.',
      '',
    ].join('\n');
    sceneNotes.push({ path: `${title}.md`, markdown });
  }
  await action(`(async () => {
    const notes = ${JSON.stringify(sceneNotes)};
    for (const note of notes) {
      await app.vault.create(note.path, note.markdown);
    }
  })()`);
  await page.waitForFunction(
    () =>
      window.app.plugins.plugins['thought-craft'].entityIndex
        .getAll()
        .filter((e) => e.type === 'scene').length === 107,
  );
  await story().getByText('Showing 1–50 of 107', { exact: true }).waitFor();
  await story().getByRole('button', { name: 'Next ›', exact: true }).click();
  await story().getByText('Showing 51–100 of 107', { exact: true }).waitFor();
  await story().getByRole('button', { name: 'Page 3', exact: true }).click();
  await story().getByText('Showing 101–107 of 107', { exact: true }).waitFor();
  const search = story().getByRole('searchbox', { name: 'Search scenes', exact: true });
  await search.fill('Scene 001');
  await story().getByText('Showing 1–1 of 1', { exact: true }).waitFor();
  await search.fill('No matching scene');
  await story().getByText('No scenes match this search.', { exact: true }).waitFor();
  assert.equal(
    await story().getByRole('navigation', { name: 'Scenes pagination', exact: true }).count(),
    0,
  );
  await search.fill('');
  await story().getByLabel('Sort scenes', { exact: true }).selectOption('za');
  await story().getByLabel('Rows per page', { exact: true }).selectOption('25');
  await story().getByText('Showing 1–25 of 107', { exact: true }).waitFor();
  await shot('story-scenes-dark.png');
  await story().getByLabel('Rows per page', { exact: true }).selectOption('100');
  await story().getByText('Showing 1–100 of 107', { exact: true }).waitFor();
  await action(
    `${plugin}.workspaces.addRelationType('default', {id:'appears-in',label:'Appears in',sourceEntityTypeIds:['character'],targetEntityTypeIds:['scene']})`,
  );
  await action(
    `${plugin}.repository.addRelation('${character.id}', {type:'appears-in',targetEntityId:'${firstScene.id}'})`,
  );
  await action(
    `${plugin}.repository.addRelation('${thread.id}', {type:'related-to',targetEntityId:'${firstScene.id}'})`,
  );
  await action(
    `${plugin}.openEntityFocus('${character.id}', {workspaceId:'default',section:'character'})`,
  );
  await focus().getByText('Appears in · Scene', { exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Add to Brainstorm', exact: true }).click();
  await page
    .locator(`.tc-brainstorm:visible .react-flow__node[data-id="${character.id}"]`)
    .waitFor();
  await action(`${plugin}.openInBrainstorm('${firstScene.id}')`);
  await page
    .locator(`.tc-brainstorm:visible .react-flow__node[data-id="${firstScene.id}"]`)
    .waitFor();
  await page
    .locator('.tc-brainstorm:visible')
    .getByRole('tab', { name: 'Brainstorm', exact: true })
    .focus();
  await page.keyboard.press('ArrowRight');
  await story().waitFor();
  await story().getByRole('tab', { name: 'Story', exact: true }).focus();
  await page.keyboard.press('Home');
  await page.locator('.tc-inbox:not(.tc-story):visible').waitFor();
  await page
    .locator('.tc-inbox:not(.tc-story):visible')
    .getByRole('tab', { name: 'Inbox', exact: true })
    .focus();
  await page.keyboard.press('End');
  await story().waitFor();
  await story().getByRole('tab', { name: 'Story', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.locator('.tc-brainstorm:visible').waitFor();
  await openStory('overview');
  checks.push(
    'Shared search/sort/pagination handle 107 Scenes, zero results and 25/50/100 sizes. Story entities use normal relations, generic cards and primary keyboard tabs without changing Workspace.',
  );

  await action(
    `${plugin}.workspaces.create({id:'second',label:'Second story',enabledEntityTypeIds:['scene']})`,
  );
  await action(`${plugin}.workspaces.setActive('second')`);
  await story().getByText('Story is not enabled in Second story.', { exact: true }).waitFor();
  assert.equal(await story().getByRole('tab', { name: 'Story', exact: true }).count(), 0);
  await action(`${plugin}.workspaces.update('second', {enabledExperiences:['story']})`);
  await section('Scenes');
  await story().getByText('No scenes yet.', { exact: true }).waitFor();
  const otherScene = await create('Scene', 'Other story scene');
  assert.equal(otherScene.workspaceId, 'second');
  await nativePath(otherScene.filePath);
  await openStory('overview');
  await story()
    .getByRole('button', { name: 'Continue writing: Other story scene', exact: true })
    .waitFor();
  await action(`${plugin}.workspaces.setActive('default')`);
  await section('Overview');
  assert.equal(await story().getByText('Other story scene', { exact: true }).count(), 0);
  const beforeDisable = await readFile(join(vault, firstScene.filePath), 'utf8');
  await action(`${plugin}.workspaces.update('default', {enabledExperiences:[]})`);
  await story().getByText('Story is not enabled in The Last Train.', { exact: true }).waitFor();
  assert.equal(await story().getByRole('tab', { name: 'Story', exact: true }).count(), 0);
  assert.equal(await readFile(join(vault, firstScene.filePath), 'utf8'), beforeDisable);
  await action(`${plugin}.showInbox()`);
  await page
    .locator('.tc-inbox:not(.tc-story):visible')
    .getByText('The forgotten platform', { exact: true })
    .waitFor();
  await action(`${plugin}.workspaces.update('default', {enabledExperiences:['story']})`);
  await openStory('overview');
  await shot('story-enabled-dark.png');
  await theme('light');
  await shot('story-overview-light.png');
  await section('Scenes');
  await shot('story-scenes-light.png');
  await story().getByRole('button', { name: '+ Scene', exact: true }).click();
  await shot('story-create-scene-light.png');
  await page.keyboard.press('Escape');
  await action(
    `${plugin}.workspaces.update('default', {enabledEntityTypeIds:['scene','character','plot-thread','idea']})`,
  );
  await section('Overview');
  await story().getByRole('region', { name: 'Story setup', exact: true }).scrollIntoViewIfNeeded();
  await shot('story-setup-light.png');
  await page.setViewportSize({ width: 760, height: 900 });
  await evaluate('app.workspace.leftSplit.expand(); true');
  await shot('story-overview-narrow-light.png');
  await section('Scenes');
  await shot('story-scenes-narrow-light.png');
  assert.equal(await story().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await story()
    .getByRole('navigation', { name: 'Story sections', exact: true })
    .getByRole('button', { name: 'Characters', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await story().getByRole('heading', { name: 'Characters', exact: true }).waitFor();
  await story().getByRole('button', { name: 'Guide', exact: true }).click();
  await page
    .locator('.tc-guide-modal')
    .getByRole('heading', { name: 'Story', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await evaluate('app.workspace.leftSplit.collapse(); true');
  await theme('light');
  await section('Characters');
  await shot('story-characters-light.png');
  await story().getByRole('button', { name: '+ Character', exact: true }).click();
  await shot('story-create-character-light.png');
  await page.keyboard.press('Escape');
  const persisted = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.deepEqual(persisted.workspaces[0].enabledExperiences, ['story']);
  assert.equal(persisted.entityTypes.filter((t) => t.id === 'plot-thread').length, 1);
  assert.equal(await readFile(join(vault, 'Existing idea.md'), 'utf8'), initialNote);
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openStory('overview');
  assert.equal(
    await evaluate(`${plugin}.registry.getAll().filter(t=>t.id==='plot-thread').length`),
    1,
  );
  assert.deepEqual(await evaluate(`${plugin}.workspaces.getActive().enabledExperiences`), [
    'story',
  ]);
  assert.equal(await readFile(join(vault, firstScene.filePath), 'utf8'), beforeDisable);
  checks.push(
    'Workspace isolation, disabling/re-enabling without data loss, restart persistence, light/dark/narrow UI, keyboard creation/secondary navigation and Guide Story passed. No renderer errors.',
  );
  assert.deepEqual(pluginErrors, []);
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots,
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
