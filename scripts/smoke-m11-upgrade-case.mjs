import { pinTestRuntime } from './test-runtime.mjs';
// Integration check against a real, isolated Obsidian process (Linux).
// No mock Obsidian runtime; all notes live in a disposable test vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const kind = process.env.THOUGHTCRAFT_UPGRADE_KIND;
const validationLabel = `m11-upgrade-${kind}`;
const distribution = resolve(process.env.THOUGHTCRAFT_DISTRIBUTION_DIR ?? root);
const run = resolve(root, '.artifacts', `${validationLabel}-${Date.now()}`);
const vault = join(run, 'vault');
const profile = join(run, 'profile');
const pluginFolder = join(vault, '.obsidian', 'plugins', 'thought-craft');
await mkdir(pluginFolder, { recursive: true });
await mkdir(profile, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(join(distribution, file), join(pluginFolder, file));
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
const screenshots = [];
async function action(expression) {
  await evaluate(
    `window.tcResult='pending'; Promise.resolve(${expression}).then(()=>window.tcResult='done',error=>window.tcResult=error.message);true`,
  );
  await page.waitForFunction(() => window.tcResult !== 'pending');
  assert.equal(await evaluate('window.tcResult'), 'done');
}
async function notes(folder, relative = '') {
  const result = new Map();
  for (const entry of await readdir(join(folder, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      for (const [name, bytes] of await notes(folder, path)) result.set(name, bytes);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.set(path, await readFile(join(folder, path), 'utf8'));
    }
  }
  return result;
}
async function assertNotesUnchanged(expected) {
  const actual = await notes(vault);
  assert.deepEqual(actual, expected);
}
const oldId = '00000000-0000-4000-8000-000000000011';
const threadId = '00000000-0000-4000-8000-000000000012';
try {
  if (kind === 'historical-m7') {
    // Rebuilt actual M7 source, not a current plugin with a changed version field.
    const historical = resolve('.artifacts/m11-historical-m7/source');
    for (const file of ['main.js', 'manifest.json', 'styles.css'])
      await copyFile(join(historical, file), join(pluginFolder, file));
    await launch();
    await page.waitForFunction(() =>
      window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
    );
    assert.equal(await evaluate(`${plugin}.plot===undefined`), true);
    assert.equal(
      JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8')).configVersion,
      7,
    );
    await action(
      `${plugin}.registry.createCustomType({id:'memory',label:'Memory',folderName:'Memories'})`,
    );
    await action(
      `${plugin}.registry.addProperty('memory',{key:'tone',label:'Tone',type:'text',retired:false,defaultValue:'Quiet'})`,
    );
    await action(
      `${plugin}.workspaces.create({id:'archive',label:'Archive',enabledEntityTypeIds:['idea','memory','scene','plot-thread']})`,
    );
    await action(
      `${plugin}.workspaces.addRelationType('archive',{id:'echoes',label:'Echoes',sourceEntityTypeIds:['memory'],targetEntityTypeIds:['scene']})`,
    );
    for (const [id, type, title] of [
      [oldId, 'scene', 'Legacy scene'],
      [threadId, 'plot-thread', 'Legacy question'],
      ['00000000-0000-4000-8000-000000000013', 'memory', 'Legacy memory'],
    ]) {
      await action(
        `${plugin}.repository.createEntity({id:'${id}',type:'${type}',title:'${title}',content:'Legacy body with **formatting**, unknown fields and a question.',workspaceId:'archive',createdAt:'2026-10-28T00:00:00Z',relations:[]})`,
      );
    }
    await action(
      `${plugin}.repository.addRelation('${oldId}',{type:'related-to',targetEntityId:'${threadId}'})`,
    );
    await action(
      `${plugin}.repository.addProperty('00000000-0000-4000-8000-000000000013',{label:'Weight',type:'number'})`,
    );
    await action(
      `${plugin}.repository.addRelation('00000000-0000-4000-8000-000000000013',{type:'echoes',targetEntityId:'${oldId}'})`,
    );
    await action(`${plugin}.boards.addEntity('archive','${oldId}',{x:110,y:220})`);
    await action(`${plugin}.workspaces.setActive('archive')`);
    const sourcePath = await evaluate(`${plugin}.entityIndex.getById('${oldId}').filePath`);
    await action(
      `app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(sourcePath)}),fm=>{fm.user_field={keep:true};})`,
    );
    await stop();
    const configPath = join(pluginFolder, 'data.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.user_unknown = { retain: 'yes' };
    await writeFile(configPath, JSON.stringify(config, null, 2));
    checks.push(
      'Executed rebuilt M7 source f1bf711 with its real v7 writer/configuration, creating notes, a custom type/schema, custom Workspace relation, stored related-to membership and spatial placement. No historical published binary is available; toolchain uses current installed dependencies.',
    );
  } else if (kind === 'v8') {
    const fixture = process.env.THOUGHTCRAFT_V8_FIXTURE;
    assert.ok(fixture, 'Pass an explicit pre-M11 M10 snapshot.');
    for (const [path, bytes] of await notes(fixture)) {
      await mkdir(join(vault, path, '..'), { recursive: true });
      await writeFile(join(vault, path), bytes);
    }
    await copyFile(
      join(fixture, '.obsidian', 'plugins', 'thought-craft', 'data.json'),
      join(pluginFolder, 'data.json'),
    );
    checks.push(
      `Uses the actual retained pre-M11 M10 native vault snapshot: ${fixture}. It contains 500 Scenes, 100 Threads, bs_story ranks, custom definitions and Brainstorm state; it is a development test snapshot, not a published release.`,
    );
  } else {
    throw new Error('Choose historical-m7 or v8.');
  }
  const before = await notes(vault);
  const previous = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  for (const file of ['main.js', 'manifest.json', 'styles.css'])
    await copyFile(join(distribution, file), join(pluginFolder, file));
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await assertNotesUnchanged(before);
  const loaded = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(loaded.configVersion, 8);
  assert.deepEqual(loaded.workspaces, previous.workspaces);
  assert.deepEqual(loaded.boards, previous.boards);
  assert.equal(loaded.activeWorkspaceId, previous.activeWorkspaceId);
  if (kind === 'historical-m7') {
    assert.deepEqual(loaded.user_unknown, previous.user_unknown);
    assert.deepEqual(loaded.workspaces.find((w) => w.id === 'archive').enabledExperiences, []);
    assert.deepEqual(
      loaded.entityTypes.find((type) => type.id === 'memory'),
      previous.entityTypes.find((type) => type.id === 'memory'),
    );
    assert.equal(loaded.entityTypes.filter((type) => type.id === 'story-section').length, 1);
    assert.equal(
      await evaluate(`${plugin}.entityIndex.getById('${oldId}').relations[0].targetEntityId`),
      threadId,
    );
    await action(`${plugin}.showInbox()`);
    assert.equal(
      await page
        .locator('.tc-inbox:visible')
        .getByRole('tab', { name: 'Story', exact: true })
        .count(),
      0,
    );
  } else {
    assert.deepEqual(loaded, previous);
    await action(`${plugin}.showStory('plot')`);
    await page.locator('.tc-plot').waitFor();
  }
  await page.screenshot({ path: join(run, 'upgraded-state-dark.png') });
  screenshots.push('upgraded-state-dark.png');
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await assertNotesUnchanged(before);
  assert.deepEqual(JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8')), loaded);
  assert.deepEqual(pluginErrors, []);
  checks.push(
    `Candidate install and restart preserve exact bytes of all ${before.size} Markdown files. Configuration migration is idempotent; Workspace definitions, enabled experiences, custom schema, generic relations, unknown fields and board layout stay intact. No note rewrite or automatic Story activation.`,
  );
  const report = {
    result: 'passed',
    kind,
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    distribution,
    screenshots,
    pluginErrors,
  };
  await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Evidence: ' + run);
} catch (error) {
  if (page) await page.screenshot({ path: join(run, 'failure.png') }).catch(() => {});
  await writeFile(join(run, 'failure.log'), String(error) + '\n' + processLog);
  console.error(error);
  console.error('Diagnostics: ' + run);
  process.exitCode = 1;
} finally {
  await stop();
  await writeFile(join(run, 'process.log'), processLog);
}
