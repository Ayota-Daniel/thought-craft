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
const run = resolve(root, '.artifacts', `m10-${Date.now()}`);
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
const expectedFaultLogs = [];
let faultActive = false;
const timings = {};
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
      (faultActive ? expectedFaultLogs : pluginErrors).push(entry.text());
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
const focus = () => page.locator('.tc-focus:visible');
const createDialog = () => page.locator('.tc-story-create-modal');
const sceneIds = new Map();
const idFor = (number) =>
  sceneIds.get(number) ?? `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const titleFor = (number) =>
  ['The lantern in the rain', 'A promise at the orchard', 'The glass seed'][number - 1] ??
  `Scene ${String(number).padStart(3, '0')}`;
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

const panel = () => plot().locator('.tc-plot-threads');
async function expandThreads() {
  if (!(await panel().evaluate((element) => element.open))) {
    await panel().locator('summary').click();
  }
}
async function createThread(title) {
  await expandThreads();
  await panel().getByRole('button', { name: '+ Plot Thread', exact: true }).click();
  await createDialog().getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await createDialog()
    .getByRole('textbox', { name: 'Initial notes (optional)' })
    .fill('A development to explore.');
  await createDialog().getByRole('button', { name: 'Create', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  await focus().getByRole('heading', { name: title, exact: true }).waitFor();
  const result = await evaluate(
    `${plugin}.entityIndex.getAll().find(e=>e.title===${JSON.stringify(title)})`,
  );
  await focus().getByRole('button', { name: 'Back to Story · Plot', exact: true }).click();
  return result;
}
async function membership(sceneNumber, title, add = true) {
  await search(titleFor(sceneNumber));
  await menu(idFor(sceneNumber), 'Plot Threads…');
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill(title);
  await panel()
    .getByRole('button', {
      name: `${add ? 'Add' : 'Remove'} ${title} ${add ? 'to' : 'from'} ${titleFor(sceneNumber)}`,
      exact: true,
    })
    .click();
  await plot().getByRole('status').filter({ hasText: 'Thread associations saved.' }).waitFor();
  await panel().getByRole('button', { name: 'Done', exact: true }).click();
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill('');
}
async function markdown(number) {
  return readFile(join(vault, (await entity(idFor(number))).filePath), 'utf8');
}
async function rejection(expression, pattern) {
  await evaluate(
    `window.tcConflict='pending'; Promise.resolve(${expression}).then(()=>window.tcConflict='unexpected success',error=>window.tcConflict=error.message); true`,
  );
  await page.waitForFunction(() => window.tcConflict !== 'pending');
  assert.match(await evaluate('window.tcConflict'), pattern);
}
async function createSection(title) {
  await plot().getByRole('button', { name: '+ Story Section', exact: true }).click();
  await createDialog().getByRole('textbox', { name: 'Name', exact: true }).fill(title);
  await createDialog().getByRole('button', { name: 'Create', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  return evaluate(`${plugin}.entityIndex.getAll().find(e=>e.title===${JSON.stringify(title)})`);
}
async function createScene(number) {
  await plot().getByRole('button', { name: '+ Unplaced Scene', exact: true }).click();
  await createDialog().getByRole('textbox', { name: 'Title', exact: true }).fill(titleFor(number));
  await createDialog()
    .getByRole('textbox', { name: 'Initial notes (optional)' })
    .fill('A stolen tree carries the oldest memory of the city.');
  await createDialog().getByRole('button', { name: 'Create & write', exact: true }).click();
  await createDialog().waitFor({ state: 'detached' });
  const result = await evaluate(
    `${plugin}.entityIndex.getAll().find(e=>e.title===${JSON.stringify(titleFor(number))})`,
  );
  sceneIds.set(number, result.id);
  await evaluate(
    "app.workspace.activeEditor.editor.replaceRange(' The keeper follows a trail of glass fruit.', {line:app.workspace.activeEditor.editor.lastLine(),ch:app.workspace.activeEditor.editor.getLine(app.workspace.activeEditor.editor.lastLine()).length}); true",
  );
  await page.waitForFunction(
    (path) =>
      window.app.vault
        .cachedRead(window.app.vault.getAbstractFileByPath(path))
        .then((text) => text.includes('keeper follows')),
    result.filePath,
  );
  await openPlot();
  return result;
}
try {
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 8,
      entitiesFolder: 'Brainstorm/Ideas',
      activeWorkspaceId: 'default',
      user_setting: 'keep',
      workspaces: [
        {
          id: 'default',
          label: 'The Glass Orchard',
          builtIn: true,
          retired: false,
          enabledExperiences: [],
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
  await evaluate("app.commands.executeCommandById('thought-craft:capture-idea'); true");
  await page
    .locator('.tc-capture-input')
    .fill('An orchard grows memories instead of fruit. Someone has stolen the oldest tree.');
  await page.locator('.tc-capture-input').press('Enter');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
  const idea = await evaluate(`${plugin}.entityIndex.getAll().find(e=>e.type==='idea')`);
  assert.equal(idea.relations.length, 0);
  assert.equal(idea.story, undefined);
  await action(`${plugin}.boards.addEntity('default','${idea.id}',{x:700,y:300})`);
  await action(`${plugin}.showBrainstorm()`);
  await shot('free-brainstorm-dark.png');
  const initialBoard = await snapshot();
  await action(`${plugin}.showInbox()`);
  await page
    .locator('.tc-inbox:visible')
    .getByRole('button', { name: 'Manage workspaces', exact: true })
    .click();
  const manager = page.locator('.tc-workspace-manager');
  await manager.getByRole('checkbox', { name: 'Story', exact: true }).check();
  await manager.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].workspaces
      .getActive()
      .enabledExperiences.includes('story'),
  );
  await page.keyboard.press('Escape');
  await openPlot();
  for (const label of ['Scene', 'Character', 'Location', 'Plot Thread', 'Story Section']) {
    await story()
      .getByRole('button', { name: `Enable ${label}`, exact: true })
      .click();
    await story()
      .getByRole('button', { name: `Enable ${label}`, exact: true })
      .waitFor({ state: 'detached' });
  }
  const actI = await createSection('The discovery');
  const actII = await createSection('The pursuit');
  const first = await createScene(1);
  await createScene(2);
  await createScene(3);
  await action(`${plugin}.plot.moveScene('default','${idFor(1)}','${actI.id}')`);
  await action(`${plugin}.plot.moveScene('default','${idFor(2)}','${actI.id}')`);
  await page.setViewportSize({ width: 1440, height: 1500 });
  await nativeDrag(card(idFor(2)), card(idFor(1)));
  await menu(actII.id, 'Move earlier', true);
  await nativeDrag(card(idFor(1)), section(actII.id).locator('.tc-plot-drop-end'));
  await waitPlacement(idFor(1), actII.id);
  await menu(idFor(1), 'Open Focus');
  await focus()
    .getByRole('heading', { name: titleFor(1), exact: true })
    .waitFor();
  await focus().getByRole('button', { name: 'Back to Story · Plot', exact: true }).click();
  await expandThreads();
  await panel()
    .getByText(/No Plot Threads yet/)
    .waitFor();
  await shot('story-without-threads-dark.png');
  checks.push(
    'Journeys A/D: fresh Workspace captures an incomplete idea and explores Brainstorm without Story; explicit Story setup, native Scene writing, Unplaced and Section/Scene reordering work with no Threads or required narrative template.',
  );
  const mystery = await createThread('The stolen memory');
  const relationship = await createThread('The keeper and the thief');
  await membership(1, mystery.title);
  await membership(1, relationship.title);
  await membership(2, mystery.title);
  await search('');
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .check();
  await panel().getByRole('combobox', { name: 'Thread view mode' }).selectOption('filter');
  await card(idFor(3)).waitFor({ state: 'detached' });
  await panel().getByRole('button', { name: 'Show full Plot', exact: true }).click();
  await card(idFor(3)).waitFor();
  checks.push(
    'Journey B: original story develops through native writing, generic Focus/Back, real Section and Scene reorder, multiple Threads, filter/reset and canonical progression.',
  );

  // Fail the actual second Markdown write, then restart before retrying.
  await action(
    `${plugin}.repository.addRelation('${mystery.id}',{type:'related-to',targetEntityId:'${idFor(1)}'})`,
  );
  const firstBefore = await markdown(1);
  await search(titleFor(1));
  await menu(idFor(1), 'Plot Threads…');
  await evaluate(
    `window.tcOriginalFM=app.fileManager.processFrontMatter.bind(app.fileManager);app.fileManager.processFrontMatter=(file,mutate)=>file.path===${JSON.stringify(mystery.filePath)}?Promise.reject(new Error('M10 read-only Thread')):window.tcOriginalFM(file,mutate);true`,
  );
  await panel()
    .getByRole('button', { name: `Remove ${mystery.title} from ${titleFor(1)}`, exact: true })
    .click();
  await plot()
    .getByRole('alert')
    .filter({ hasText: 'Removed 1 of 2 related links with confirmed refresh' })
    .waitFor();
  await shot('partial-removal-recovery-dark.png');
  const partialScene = await markdown(1);
  assert.equal(
    partialScene.split('\n---\n').slice(1).join('\n---\n'),
    firstBefore.split('\n---\n').slice(1).join('\n---\n'),
  );
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  await expandThreads();
  assert.equal(await markdown(1), partialScene);
  assert.equal(
    (await entity(idFor(1))).relations.some((r) => r.targetEntityId === mystery.id),
    false,
  );
  assert.equal(
    (await entity(mystery.id)).relations.some((r) => r.targetEntityId === idFor(1)),
    true,
  );
  await membership(1, mystery.title, false);
  assert.equal(
    (await entity(mystery.id)).relations.some((r) => r.targetEntityId === idFor(1)),
    false,
  );
  assert.equal(await markdown(1), partialScene);
  await membership(1, mystery.title);
  assert.deepEqual(await snapshot(), initialBoard);
  checks.push(
    'Critical recovery: opposite links, first removal committed, second rejected by actual processFrontMatter; actionable partial alert; actual survivor persists across restart; UI retry removes only the survivor, leaves the already-written Scene byte-identical and preserves unrelated membership/body/board.',
  );

  await search(titleFor(3));
  await menu(idFor(3), 'Plot Threads…');
  const third = await entity(idFor(3));
  faultActive = true;
  await evaluate(
    `window.tcCommitted=false;window.tcOriginalFM=app.fileManager.processFrontMatter.bind(app.fileManager);app.fileManager.processFrontMatter=async(file,mutate)=>{const result=await window.tcOriginalFM(file,mutate);window.tcCommitted=true;return result;};window.tcOriginalRead=app.vault.read.bind(app.vault);app.vault.read=file=>window.tcCommitted&&file.path===${JSON.stringify(third.filePath)}?Promise.reject(new Error('M10 read-back failure')):window.tcOriginalRead(file);true`,
  );
  await panel()
    .getByRole('button', { name: `Add ${mystery.title} to ${titleFor(3)}`, exact: true })
    .click();
  await plot()
    .getByRole('alert')
    .filter({ hasText: 'Metadata may have been saved. Could not refresh' })
    .waitFor();
  await evaluate(
    'app.vault.read=window.tcOriginalRead;app.fileManager.processFrontMatter=window.tcOriginalFM;true',
  );
  await action(
    `${plugin}.repository.syncFile(app.vault.getAbstractFileByPath(${JSON.stringify(third.filePath)}))`,
  );
  await delay(200);
  faultActive = false;
  await panel()
    .getByRole('button', { name: `Remove ${mystery.title} from ${titleFor(3)}`, exact: true })
    .waitFor();
  await panel().getByRole('button', { name: 'Done', exact: true }).click();
  await membership(3, mystery.title, false);
  const probeId = idFor(4000);
  await action(
    `${plugin}.repository.createEntity({id:'${probeId}',type:'plot-thread',title:'Commit probe',content:'',workspaceId:'default',createdAt:new Date().toISOString(),relations:[]})`,
  );
  const probe = await entity(probeId);
  const scopedAdd = `${plugin}.repository.addRelation('${idFor(3)}',{type:'related-to',targetEntityId:'${probeId}'},{workspaceId:'default',sourceType:'scene',targetType:'plot-thread'})`;
  for (const changes of [{ bs_type: 'idea' }, { bs_workspace: 'other' }]) {
    await action(
      `app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(probe.filePath)}),fm=>Object.assign(fm,${JSON.stringify(changes)}))`,
    );
    await evaluate(`${plugin}.entityIndex.upsert(${JSON.stringify(probe)});true`);
    await rejection(scopedAdd, /changed type or Workspace/);
    await action(
      `app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(probe.filePath)}),fm=>{fm.bs_type='plot-thread';fm.bs_workspace='default';})`,
    );
    await action(
      `${plugin}.repository.syncFile(app.vault.getAbstractFileByPath(${JSON.stringify(probe.filePath)}))`,
    );
  }
  await action(
    `app.vault.delete(app.vault.getAbstractFileByPath(${JSON.stringify(probe.filePath)}))`,
  );
  await evaluate(`${plugin}.entityIndex.upsert(${JSON.stringify(probe)});true`);
  await rejection(scopedAdd, /target entity is no longer available/);
  assert.equal((await entity(idFor(3))).relations.length, 0);
  checks.push(
    'Native fault cases: successful write + failed read-back reports uncertain persistence; reread restores real membership. Fresh target validation rejects deleted/changed-type/changed-Workspace notes despite deliberately stale index entries.',
  );

  await action(
    `${plugin}.registry.createCustomType({id:'motif',label:'Motif',folderName:'Motifs'})`,
  );
  await action(`${plugin}.workspaces.enableEntityType('default','motif',${plugin}.registry)`);
  await action(
    `${plugin}.registry.addProperty('motif',{key:'meaning',label:'Meaning',type:'text',retired:false,defaultValue:'Memory'})`,
  );
  await action(
    `${plugin}.workspaces.addRelationType('default',{id:'echoes',label:'Echoes',sourceEntityTypeIds:['motif'],targetEntityTypeIds:['scene']})`,
  );
  const motifId = idFor(4500);
  await action(
    `${plugin}.repository.createEntity({id:'${motifId}',type:'motif',title:'Glass fruit',content:'Memory made tangible.',workspaceId:'default',createdAt:new Date().toISOString(),relations:[]})`,
  );
  await action(
    `${plugin}.repository.addRelation('${motifId}',{type:'echoes',targetEntityId:'${idFor(1)}'})`,
  );
  await action(`${plugin}.openEntityFocus('${motifId}')`);
  await focus().getByRole('heading', { name: 'Glass fruit', exact: true }).waitFor();
  await focus().getByText('Meaning', { exact: true }).waitFor();
  const motifBytes = await readFile(join(vault, (await entity(motifId)).filePath), 'utf8');
  await openPlot();
  assert.equal((await entity(motifId)).type, 'motif');
  assert.equal(await readFile(join(vault, (await entity(motifId)).filePath), 'utf8'), motifBytes);
  await expandThreads();
  await search('');
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(
    await panel()
      .getByRole('button', { name: `Open thread ${mystery.title} in Focus`, exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const longTitle = 'TheDiscoveryOfTheMemoryOrchard'.repeat(4);
  await action(`${plugin}.repository.renameEntity('${actI.id}',${JSON.stringify(longTitle)})`);
  await action(
    `${plugin}.repository.renameEntity('${mystery.id}',${JSON.stringify(longTitle + 'Thread')})`,
  );
  await action(
    `${plugin}.repository.renameEntity('${idFor(1)}',${JSON.stringify(longTitle + 'Scene')})`,
  );
  await theme('light');
  await page.setViewportSize({ width: 760, height: 900 });
  await evaluate('app.workspace.leftSplit.expand();true');
  await panel().scrollIntoViewIfNeeded();
  await shot('story-narrow-light.png');
  assert.equal(await plot().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await theme('dark');
  await shot('story-narrow-dark.png');
  await panel().getByRole('button', { name: 'Understanding Plot Threads', exact: true }).click();
  await page
    .locator('.tc-guide-modal')
    .getByRole('heading', { name: 'Plot Threads', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await evaluate('app.workspace.leftSplit.collapse();true');
  await action(`${plugin}.repository.renameEntity('${actI.id}',${JSON.stringify(actI.title)})`);
  await action(
    `${plugin}.repository.renameEntity('${mystery.id}',${JSON.stringify(mystery.title)})`,
  );
  await action(`${plugin}.repository.renameEntity('${idFor(1)}',${JSON.stringify(titleFor(1))})`);
  checks.push(
    'Journey E and accessibility: custom Motif/property/Echoes relation coexist with Story, no conversion or rewrite. Checkbox Space, Tab-to-Focus, contextual Guide, light/dark narrow panels and no horizontal overflow verified.',
  );

  const loadStart = Date.now();
  await action(`(async()=>{
    for(let n=4;n<=500;n++) await ${plugin}.repository.createEntity({id:crypto.randomUUID(),type:'scene',title:'Scale Scene '+String(n).padStart(3,'0'),content:'Synthetic narrative fragment.',workspaceId:'default',createdAt:new Date().toISOString(),relations:[]});
    for(let n=3;n<=100;n++) await ${plugin}.repository.createEntity({id:crypto.randomUUID(),type:'plot-thread',title:'Scale Thread '+String(n).padStart(3,'0'),content:'',workspaceId:'default',createdAt:new Date().toISOString(),relations:[]});
  })()`);
  timings.syntheticFileCreationMs = Date.now() - loadStart;
  const measureUi = async (name, operation) => {
    const start = Date.now();
    await operation();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
        ),
    );
    timings[name] = Date.now() - start;
  };
  await measureUi('titleSearchAndPaintMs', async () => {
    await search('Scale Scene 500');
    await plot().getByRole('button', { name: 'Scale Scene 500', exact: true }).waitFor();
  });
  await search('');
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill(mystery.title);
  await measureUi('threadFilterAndProgressionPaintMs', async () => {
    await panel().getByRole('combobox', { name: 'Thread view mode' }).selectOption('filter');
    await panel()
      .getByRole('region', { name: `Progression of ${mystery.title}`, exact: true })
      .waitFor();
  });
  await shot('large-500-scenes-100-threads-dark.png');
  await measureUi('filterResetPaintMs', async () => {
    await panel().getByRole('button', { name: 'Show full Plot', exact: true }).click();
  });
  const finalRanks = (await entity(idFor(1))).story.raw;
  const finalRelations = (await entity(idFor(1))).relations;
  const reloadStart = Date.now();
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  timings.restartAndStoryVisibleMs = Date.now() - reloadStart;
  assert.equal(
    await evaluate(`${plugin}.entityIndex.getAll().filter(e=>e.type==='scene').length`),
    500,
  );
  assert.equal(
    await evaluate(`${plugin}.entityIndex.getAll().filter(e=>e.type==='plot-thread').length`),
    100,
  );
  assert.deepEqual((await entity(idFor(1))).story.raw, finalRanks);
  assert.deepEqual((await entity(idFor(1))).relations, finalRelations);
  assert.deepEqual(await snapshot(), initialBoard);
  assert.equal(await readFile(join(vault, (await entity(motifId)).filePath), 'utf8'), motifBytes);
  await action(
    `app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(first.filePath)}),'Moved scene.md')`,
  );
  await action(`${plugin}.repository.syncFile(app.vault.getAbstractFileByPath('Moved scene.md'))`);
  assert.equal((await entity(first.id)).filePath, 'Moved scene.md');
  assert.deepEqual((await entity(first.id)).story.raw, finalRanks);
  assert.deepEqual((await entity(first.id)).relations, finalRelations);
  assert.equal(
    JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8')).configVersion,
    8,
  );
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Journey C/scale: real 500-Scene/100-Thread vault, search/filter/progression/reset and restart latencies recorded. Restart preserves configuration v8, ranks, multi-membership, custom properties/relations and independent Brainstorm positions. External move preserves UUID and narrative metadata.',
  );
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots,
    pluginErrors,
    expectedFaultLogs,
    timings,
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
