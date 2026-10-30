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
const run = resolve(root, '.artifacts', `m8-${Date.now()}`);
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
    if (
      entry.type() === 'error' &&
      /Thought Craft|Encountered two children|unique.*key/.test(entry.text())
    ) {
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
const plot = () => story().getByRole('region', { name: 'Plot Board', exact: true });
const tray = () => plot().getByRole('region', { name: 'Unplaced scenes', exact: true });
const focus = () => page.locator('.tc-focus:visible');
const createDialog = () => page.locator('.tc-story-create-modal');
const idFor = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const titleFor = (number) => `Scene ${String(number).padStart(3, '0')}`;
const card = (id) => plot().locator(`.tc-plot-scene[data-entity-id="${id}"]`);
const section = (id) => plot().locator(`.tc-plot-section[data-section-id="${id}"]`);
const screenshots = [];
async function action(expression) {
  await evaluate(
    `window.tcResult='pending'; Promise.resolve(${expression}).then(() => {window.tcResult='done';}, error => {window.tcResult=error.message;}); true`,
  );
  await page.waitForFunction(() => window.tcResult !== 'pending');
  assert.equal(await evaluate('window.tcResult'), 'done');
}
async function openPlot() {
  await action(`${plugin}.showStory('plot')`);
  await plot().getByRole('heading', { name: 'Plot', exact: true }).waitFor();
}
async function entity(id) {
  return evaluate(`${plugin}.entityIndex.getById('${id}')`);
}
async function placement(id) {
  return (await entity(id))?.story;
}
async function snapshot() {
  return evaluate(`${plugin}.boards.getBoard('default')`);
}
async function shot(name) {
  screenshots.push(name);
  await page.screenshot({ path: join(run, name) });
}
async function search(value) {
  await plot().getByRole('searchbox', { name: 'Search Plot scenes', exact: true }).fill(value);
}
async function theme(name) {
  await evaluate(
    `document.body.removeClass('theme-light','theme-dark'); document.body.addClass('theme-${name}'); true`,
  );
}
async function createSection(title) {
  await plot().getByRole('button', { name: '+ Story Section', exact: true }).click();
  await createDialog().getByRole('textbox', { name: 'Name', exact: true }).fill(title);
  await createDialog()
    .getByRole('textbox', { name: 'Initial notes (optional)', exact: true })
    .fill(`Purpose of ${title}.`);
  if (title === 'Act I') await shot('section-creation-dark.png');
  await createDialog().getByRole('button', { name: 'Create', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  return evaluate(`${plugin}.entityIndex.getAll().find(entity => entity.title === '${title}')`);
}
async function menu(id, label, sectionHeader = false) {
  const container = sectionHeader ? section(id).locator('.tc-plot-section-header') : card(id);
  const trigger = container.getByRole('button', {
    name: sectionHeader ? /^Section actions for/ : /^Actions for/,
  });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.locator('.menu:visible').waitFor();
  await delay(50);
  await page.locator('.menu:visible').getByText(label, { exact: true }).click();
}
async function nativeDrag(sourceLocator, targetLocator, capture) {
  await sourceLocator.scrollIntoViewIfNeeded();
  await targetLocator.scrollIntoViewIfNeeded();
  const source = await sourceLocator.boundingBox();
  const target = await targetLocator.boundingBox();
  await page.mouse.move(source.x + 20, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + source.height / 2 + 6, { steps: 6 });
  await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 20 });
  await page.mouse.move(target.x + 32, target.y + target.height / 2, { steps: 2 });
  if (capture) await shot(capture);
  await page.mouse.up();
}
async function waitPlacement(id, sectionId) {
  await page.waitForFunction(
    ({ id, sectionId }) => {
      const placement = window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.story;
      return (placement?.sectionId ?? null) === sectionId;
    },
    { id, sectionId },
  );
}

try {
  const originals = new Map();
  for (let number = 1; number <= 107; number++) {
    const relationMetadata =
      number === 1
        ? [
            'bs_relations:',
            '  - id: c58c7e2c-1dc6-442e-80bd-40801e231046',
            '    type: related-to',
            `    target_entity_id: ${idFor(2)}`,
            "    created_at: '2026-10-29T00:00:00Z'",
          ]
        : [];
    const markdown = [
      '---',
      `bs_id: ${idFor(number)}`,
      'bs_type: scene',
      'bs_workspace: default',
      'bs_status: exploring',
      "bs_created: '2026-10-29T00:00:00Z'",
      "bs_updated: '2026-10-29T00:00:00Z'",
      'user_flag: keep',
      'bs_schema_values:',
      '  importance: 4',
      'bs_properties:',
      '  note:',
      '    label: Note',
      '    type: text',
      '    value: keep',
      ...relationMetadata,
      '---',
      '',
      `Body ${number}.  `,
      '',
      '---',
      'Preserve exactly.',
      '',
    ].join('\n');
    await writeFile(join(vault, `${titleFor(number)}.md`), markdown);
    originals.set(number, markdown);
  }
  const initialBoard = {
    workspaceId: 'default',
    nodes: { [idFor(1)]: { x: 80, y: 80 }, [idFor(2)]: { x: 400, y: 80 } },
    groups: [
      {
        id: 'group-ca829f16-35b0-4e68-857b-d54cfc73caed',
        label: 'Spatial only',
        x: 48,
        y: 24,
        width: 620,
        height: 240,
        entityIds: [idFor(1), idFor(2)],
      },
    ],
    viewport: { x: 20, y: 10, zoom: 0.8 },
  };
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 7,
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
          enabledExperiences: ['story'],
          enabledEntityTypeIds: ['idea', 'scene', 'character', 'location', 'plot-thread'],
          relationTypes: [],
        },
      ],
    }),
  );
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  await tray().getByText('Showing 1–25 of 107', { exact: true }).waitFor();
  assert.equal(
    await plot().getByRole('button', { name: '+ Story Section', exact: true }).isDisabled(),
    true,
  );
  assert.deepEqual(await snapshot(), initialBoard);
  const migrated = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(migrated.configVersion, 8);
  assert.equal(migrated.entityTypes.filter((type) => type.id === 'story-section').length, 1);
  assert.equal(migrated.workspaces[0].enabledEntityTypeIds.includes('story-section'), false);
  for (const [number, markdown] of originals)
    assert.equal(await readFile(join(vault, `${titleFor(number)}.md`), 'utf8'), markdown);
  await shot('unplaced-107-dark.png');
  await story().getByRole('button', { name: 'Enable Story Section', exact: true }).click();
  await story()
    .getByRole('button', { name: 'Enable Story Section', exact: true })
    .waitFor({ state: 'detached' });
  const actI = await createSection('Act I');
  const actII = await createSection('Act II');
  const actIII = await createSection('Act III');
  assert.equal((await placement(actI.id)).order, 1000);
  assert.equal((await placement(actII.id)).order, 2000);
  assert.equal((await placement(actIII.id)).order, 3000);
  assert.ok(actI.filePath.startsWith('Brainstorm/Story Sections/'));
  checks.push(
    'M7 → v8 preserves 107 exact Scene files, Story configuration, board/groups and enabled types. Story Section seeds once and is enabled explicitly; three real Sections receive sparse Markdown ranks.',
  );

  // Actual HTML pointer drag; capture the write count before release.
  await page.setViewportSize({ width: 1440, height: 1500 });
  await search('Scene 001');
  await evaluate(
    `window.tcPlotWrites=0; window.tcPlotOriginal=${plugin}.repository.setStoryPlacement.bind(${plugin}.repository); ${plugin}.repository.setStoryPlacement=(...args)=>{window.tcPlotWrites++; return window.tcPlotOriginal(...args);}; true`,
  );
  await card(idFor(1)).scrollIntoViewIfNeeded();
  const source = await card(idFor(1)).boundingBox();
  const destination = await section(actI.id).locator('.tc-plot-drop-end').boundingBox();
  await page.mouse.move(source.x + 100, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 120, source.y + source.height / 2 + 10, { steps: 6 });
  await delay(80);
  assert.equal(await evaluate('window.tcPlotWrites'), 0);
  await page.mouse.move(destination.x + 120, destination.y + destination.height / 2, { steps: 15 });
  await delay(80);
  await shot('drag-state-dark.png');
  await page.mouse.up();
  await waitPlacement(idFor(1), actI.id);
  assert.equal(await evaluate('window.tcPlotWrites'), 1);
  const firstRaw = await readFile(join(vault, `${titleFor(1)}.md`), 'utf8');
  assert.ok(firstRaw.includes('section_id: ' + actI.id));
  assert.ok(firstRaw.includes('order: 1000'));
  assert.equal(
    firstRaw.slice(firstRaw.indexOf('\n---\n') + 5),
    originals.get(1).slice(originals.get(1).indexOf('\n---\n') + 5),
  );
  const metadata = await evaluate(
    `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('${titleFor(1)}.md')).frontmatter`,
  );
  assert.equal(metadata.bs_updated, '2026-10-29T00:00:00Z');
  assert.equal(metadata.user_flag, 'keep');
  assert.deepEqual(metadata.bs_schema_values, { importance: 4 });
  assert.equal(metadata.bs_properties.note.value, 'keep');
  assert.equal(metadata.bs_relations[0].target_entity_id, idFor(2));
  assert.deepEqual(await snapshot(), initialBoard);
  for (const number of [2, 3, 4])
    await action(`${plugin}.plot.moveScene('default','${idFor(number)}','${actI.id}')`);
  await search('');
  await nativeDrag(card(idFor(4)), card(idFor(2)));
  await page.waitForFunction(
    ({ id, before }) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id).story.order <
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(before).story.order,
    { id: idFor(4), before: idFor(2) },
  );
  await shot('structured-plot-dark.png');
  const orderBeforeRestart = await evaluate(
    `${plugin}.entityIndex.getAll().filter(e=>e.type==='scene' && e.story?.sectionId==='${actI.id}').map(e=>({id:e.id,order:e.story.order})).sort((a,b)=>a.order-b.order)`,
  );
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  assert.deepEqual(
    await evaluate(
      `${plugin}.entityIndex.getAll().filter(e=>e.type==='scene' && e.story?.sectionId==='${actI.id}').map(e=>({id:e.id,order:e.story.order})).sort((a,b)=>a.order-b.order)`,
    ),
    orderBeforeRestart,
  );
  await search('Scene 001');
  await page.setViewportSize({ width: 1440, height: 1500 });
  await nativeDrag(card(idFor(1)), section(actII.id).locator('.tc-plot-drop-end'));
  await waitPlacement(idFor(1), actII.id);
  await nativeDrag(card(idFor(1)), tray().locator('header'));
  await waitPlacement(idFor(1), null);
  assert.ok(await readFile(join(vault, `${titleFor(1)}.md`), 'utf8'));
  assert.deepEqual(await snapshot(), initialBoard);
  checks.push(
    'Real pointer placement and reorder persist only after drop, with zero writes before release and one normal write. Restart restores ranks; cross-Section drag and return to Unplaced preserve body/properties/schema/user fields, bs_updated and independent Brainstorm layout.',
  );

  await search('');
  await section(actII.id).getByRole('button', { name: '+ Scene in Act II', exact: true }).click();
  await createDialog()
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('The turning point');
  await createDialog().getByRole('button', { name: 'Create & write', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  await page.waitForFunction(
    () => window.app.workspace.getMostRecentLeaf()?.view?.file?.basename === 'The turning point',
  );
  const newScene = await evaluate(
    `${plugin}.entityIndex.getAll().find(e=>e.title==='The turning point')`,
  );
  assert.equal(newScene.story.sectionId, actII.id);
  await action(
    `Promise.resolve(app.workspace.getMostRecentLeaf().view.editor.replaceRange(${JSON.stringify('\nThe choice changes everything.')}, {line:app.workspace.getMostRecentLeaf().view.editor.lastLine()+1,ch:0}))`,
  );
  await page.waitForFunction(
    async (path) =>
      (await window.app.vault.read(window.app.vault.getAbstractFileByPath(path))).includes(
        'choice changes',
      ),
    newScene.filePath,
  );
  await openPlot();
  await plot().getByRole('button', { name: '+ Unplaced Scene', exact: true }).click();
  await createDialog()
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('An uncertain ending');
  await createDialog().getByRole('button', { name: 'Create & write', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  await page.waitForFunction(
    () => window.app.workspace.getMostRecentLeaf()?.view?.file?.basename === 'An uncertain ending',
  );
  const unplaced = await evaluate(
    `${plugin}.entityIndex.getAll().find(e=>e.title==='An uncertain ending')`,
  );
  assert.equal(unplaced.story, undefined);
  await openPlot();
  await search('The turning point');
  await menu(newScene.id, 'Open Focus');
  await focus().getByRole('heading', { name: 'The turning point', exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Back to Story · Plot', exact: true }).click();
  await menu(actI.id, 'Rename', true);
  const dialog = page.locator('.tc-plot-dialog');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('The Setup');
  const sceneBeforeRename = await readFile(join(vault, `${titleFor(2)}.md`), 'utf8');
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await section(actI.id).getByRole('heading', { name: 'The Setup', exact: true }).waitFor();
  assert.equal(await readFile(join(vault, `${titleFor(2)}.md`), 'utf8'), sceneBeforeRename);
  await search('');
  await menu(actI.id, 'Open Section', true);
  await focus().getByRole('heading', { name: 'The Setup', exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    () => window.app.workspace.getMostRecentLeaf()?.view?.file?.basename === 'The Setup',
  );
  await action(
    `Promise.resolve(app.workspace.getMostRecentLeaf().view.editor.replaceRange(${JSON.stringify('\nMajor turning point and open questions.')}, {line:app.workspace.getMostRecentLeaf().view.editor.lastLine()+1,ch:0}))`,
  );
  await page.waitForFunction(async (id) => {
    const entity = window.app.plugins.plugins['thought-craft'].entityIndex.getById(id);
    return (
      await window.app.vault.read(window.app.vault.getAbstractFileByPath(entity.filePath))
    ).includes('Major turning point');
  }, actI.id);
  await openPlot();
  await nativeDrag(
    section(actIII.id).locator('.tc-plot-section-header'),
    section(actI.id).locator('.tc-plot-section-header'),
  );
  await page.waitForFunction(
    ({ first, second }) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(first).story.order <
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(second).story.order,
    { first: actIII.id, second: actI.id },
  );
  await menu(actIII.id, 'Move later', true);
  await menu(actIII.id, 'Move earlier', true);
  await menu(idFor(4), 'Move later');
  await menu(idFor(4), 'Move earlier');
  await menu(idFor(3), 'Move to section…');
  await dialog.getByRole('combobox').selectOption(actII.id);
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await waitPlacement(idFor(3), actII.id);
  await menu(idFor(3), 'Move to Unplaced');
  await waitPlacement(idFor(3), null);
  await action(`${plugin}.openInBrainstorm('${newScene.id}')`);
  const spatialBefore = await snapshot();
  await action(`${plugin}.plot.moveScene('default','${newScene.id}','${actI.id}')`);
  assert.deepEqual(await snapshot(), spatialBefore);
  await openPlot();
  const sectionPath = (await entity(actI.id)).filePath;
  await action(
    `app.vault.trash(app.vault.getAbstractFileByPath(${JSON.stringify(sectionPath)}), false)`,
  );
  await page.waitForFunction(
    (id) => !window.app.plugins.plugins['thought-craft'].entityIndex.getById(id),
    actI.id,
  );
  await search('The turning point');
  await tray()
    .getByText(/Story Section missing/)
    .waitFor();
  assert.equal((await entity(newScene.id)).story.sectionId, actI.id);
  await menu(newScene.id, 'Move to section…');
  await dialog.getByRole('combobox').selectOption(actII.id);
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await waitPlacement(newScene.id, actII.id);
  checks.push(
    'Contextual Scene and unplaced creation open the actual editor; Focus returns to Plot. Section UUID rename leaves Scene bytes intact. Pointer Section reorder and keyboard menus work. Deleted Sections leave safe unresolved Scenes, and explicit reassignment repairs only placement.',
  );

  await action(
    `${plugin}.workspaces.create({id:'other',label:'Other story',enabledEntityTypeIds:['scene','story-section'],enabledExperiences:['story']})`,
  );
  await action(`${plugin}.workspaces.setActive('other')`);
  await openPlot();
  await tray().getByText('No unplaced scenes.', { exact: true }).waitFor();
  assert.equal(await plot().locator('.tc-plot-section').count(), 0);
  await action(`${plugin}.workspaces.setActive('default')`);
  await openPlot();
  await search('Scene 107');
  await card(idFor(107)).waitFor();
  await search('');
  // Distribute the validation scale across Sections using the same public intent.
  await action(`(async () => {
    for (let number = 5; number <= 107; number++) {
      const id = '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
      await ${plugin}.plot.moveScene('default', id, number % 2 ? '${actII.id}' : '${actIII.id}');
    }
  })()`);
  await shot('structured-107-dark.png');
  await theme('light');
  await shot('structured-107-light.png');
  await search('Scene 001');
  await nativeDrag(
    card(idFor(1)),
    section(actII.id).locator('.tc-plot-drop-end'),
    'drag-state-light.png',
  );
  await waitPlacement(idFor(1), actII.id);
  await card(idFor(1))
    .getByRole('button', { name: /^Actions for/ })
    .click();
  await shot('scene-menu-light.png');
  // Screenshot viewport restoration can dismiss native menus asynchronously.
  // Reopen from the keyboard before checking Escape against a live menu.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await delay(300);
  await plot().getByRole('heading', { name: 'Plot', exact: true }).click();
  await page.locator('.menu:visible').waitFor({ state: 'detached' });
  const menuTrigger = card(idFor(1)).getByRole('button', { name: /^Actions for/ });
  await menuTrigger.scrollIntoViewIfNeeded();
  await menuTrigger.focus();
  await page.keyboard.press('Enter');
  await page.locator('.menu:visible').waitFor();
  await delay(100);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.menu:visible .menu-item.selected').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('.menu:visible').waitFor({ state: 'detached' });
  await search('');
  await menu(newScene.id, 'Open Focus');
  await focus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    (path) => window.app.workspace.getMostRecentLeaf()?.view?.file?.path === path,
    newScene.filePath,
  );
  await openPlot();
  await page.setViewportSize({ width: 760, height: 900 });
  await evaluate('app.workspace.leftSplit.expand(); true');
  await plot().getByRole('heading', { name: 'Plot', exact: true }).scrollIntoViewIfNeeded();
  await shot('plot-narrow-light.png');
  await section(actII.id).locator('.tc-plot-section-header').scrollIntoViewIfNeeded();
  await shot('plot-narrow-sequence-light.png');
  assert.equal(await plot().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await plot().getByRole('button', { name: 'Plot guide', exact: true }).click();
  await page
    .locator('.tc-guide-modal')
    .getByRole('heading', { name: 'Plot', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await evaluate('app.workspace.leftSplit.collapse(); true');
  const sectionOrder = await evaluate(
    `${plugin}.entityIndex.getAll().filter(e=>e.type==='story-section' && e.workspaceId==='default').map(e=>({id:e.id,order:e.story.order})).sort((a,b)=>a.order-b.order)`,
  );
  const finalBoard = await snapshot();
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  assert.deepEqual(
    await evaluate(
      `${plugin}.entityIndex.getAll().filter(e=>e.type==='story-section' && e.workspaceId==='default').map(e=>({id:e.id,order:e.story.order})).sort((a,b)=>a.order-b.order)`,
    ),
    sectionOrder,
  );
  assert.deepEqual(await snapshot(), finalBoard);
  assert.equal(
    await evaluate(`${plugin}.registry.getAll().filter(t=>t.id==='story-section').length`),
    1,
  );
  const finalConfig = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(finalConfig.plot, undefined);
  assert.equal(finalConfig.sceneOrder, undefined);
  assert.deepEqual(pluginErrors, []);
  checks.push(
    '107 original Scenes plus new creations remain usable across ordered Sections, with scoped title search, compact paged lists, light/dark/narrow layouts, Guide and keyboard alternatives. Second Workspace is isolated; final restart retains Section/Scene order and independent Brainstorm state without a narrative config store. No renderer errors.',
  );
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
