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
const run = resolve(root, '.artifacts', `m0-${Date.now()}`);
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.setDefaultTimeout(8000);
  cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (error) => pluginErrors.push(error.message));
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
  await prompt.fill(`Thought Craft: ${id === 'capture-idea' ? 'Capture idea' : 'Open inbox'}`);
  await prompt.press('Enter');
}
// Inspect synchronous application state without awaiting command-returned promises.
async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}
async function entityCount(count) {
  await page.waitForFunction(
    (expected) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getInbox().length === expected,
    count,
  );
}
async function capture(content) {
  await command('capture-idea');
  const input = page.locator('.tc-capture-input');
  await input.fill(content);
  await input.press('Enter');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
}

try {
  await launch();
  checks.push('Plugin loads in real Obsidian; Capture idea and Open inbox commands registered.');
  await command('capture-idea');
  const input = page.locator('.tc-capture-input');
  await input.fill('Cancelled idea');
  await input.press('Escape');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
  await entityCount(0);
  checks.push('Escape closes Quick Capture without creating an entity.');

  await command('capture-idea');
  await input.press('Enter');
  assert.equal(await input.isVisible(), true);
  await input.fill('M0: integration / idea?');
  await input.press('Shift+Enter');
  assert.equal(await input.inputValue(), 'M0: integration / idea?\n');
  const content =
    'M0: integration / idea?\nSecond line\n\n---\nbs_id: this is body text\n---\nA final line  ';
  await input.fill(content);
  await input.press('Enter');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
  await entityCount(1);
  const first = await evaluate("app.plugins.plugins['thought-craft'].entityIndex.getInbox()[0]");
  assert.match(first.id, /^[a-f\d-]{36}$/);
  const saved = await readFile(join(vault, first.filePath), 'utf8');
  assert.equal(saved.slice(saved.indexOf('\n---\n') + 5).replace(/^\n/, ''), content + '\n');
  assert.match(saved, /bs_type: idea/);
  assert.match(saved, /bs_status: inbox/);
  assert.match(saved, new RegExp(`bs_id: ["']?${first.id}`));
  assert.match(first.filePath, /M0 integration idea\.md$/);
  checks.push(
    'Enter writes actual Markdown, with intact multiline body, namespaced metadata and UUID; Shift+Enter inserts a newline; blank submissions are blocked.',
  );
  await page.locator('.tc-inbox-row').click();
  await page.locator('.tc-focus-main h1').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    (path) => window.app.workspace.getActiveFile()?.path === path,
    first.filePath,
  );
  checks.push('Inbox opens Focus; Open Markdown note opens the real Markdown file.');

  await capture(content);
  await entityCount(2);
  const duplicate = await evaluate(
    `app.plugins.plugins['thought-craft'].entityIndex.getInbox().find(e => e.id !== ${JSON.stringify(first.id)})`,
  );
  assert.match(duplicate.filePath, / \(2\)\.md$/);
  assert.notEqual(first.id, duplicate.id);
  checks.push('Duplicate capture titles create distinct filenames and UUIDs without overwriting.');

  const moved = 'Renamed from outside.md';
  await rename(join(vault, first.filePath), join(vault, moved));
  await page.waitForFunction(
    ({ id, path }) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.filePath === path,
    { id: first.id, path: moved },
  );
  assert.equal(await readFile(join(vault, moved), 'utf8'), saved);
  checks.push(
    'External rename preserves UUID and body, updates the index and visible title, including outside the capture folder.',
  );

  const movedContent = await readFile(join(vault, moved), 'utf8');
  await writeFile(
    join(vault, moved),
    movedContent.replace('bs_status: inbox', 'bs_status: exploring'),
  );
  await entityCount(1);
  await writeFile(join(vault, moved), movedContent);
  await entityCount(2);
  checks.push('External frontmatter edits remove and restore an entity in the Inbox.');

  const externalId = '06fc0cbc-0100-4b5e-92f4-938b00cb7d08';
  const externalContent = `---\nbs_id: "${externalId}"\nbs_type: idea\nbs_workspace: external\nbs_status: inbox\nbs_created: "2026-10-28T08:00:00.000Z"\nbs_updated: "2026-10-28T08:00:00.000Z"\n---\n\nCreated outside the plugin.\n`;
  await writeFile(join(vault, 'External idea.md'), externalContent);
  await writeFile(join(vault, 'Missing ID.md'), externalContent.replace(/^bs_id:.*\n/m, ''));
  await writeFile(
    join(vault, 'Unsupported.md'),
    externalContent.replace('bs_type: idea', 'bs_type: invalid type!'),
  );
  await writeFile(join(vault, 'Broken YAML.md'), '---\nbs_id: [broken\n---\nKeep this body.\n');
  await entityCount(3);
  await delay(500);
  await entityCount(3);
  checks.push(
    'External creation indexes valid ideas, ignores missing IDs, malformed type identifiers and malformed YAML.',
  );

  await evaluate(
    "void app.plugins.plugins['thought-craft'].updateSettings({ entitiesFolder: 'Custom/Ideas', defaultWorkspace: 'novel' })",
  );
  await page.waitForFunction(
    () => window.app.plugins.plugins['thought-craft'].settings.defaultWorkspace === 'novel',
  );
  await evaluate(
    "window.tcWorkspaceSetup = false; const plugin = app.plugins.plugins['thought-craft']; plugin.workspaces.create({id:'novel', label:'Novel'}).then(() => plugin.workspaces.setActive('novel')).then(() => {window.tcWorkspaceSetup=true;}); true",
  );
  await page.waitForFunction(() => window.tcWorkspaceSetup);
  await capture('A thought in a custom workspace');
  await entityCount(4);
  const settingsData = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(settingsData.entitiesFolder, 'Custom/Ideas');
  assert.equal(settingsData.defaultWorkspace, 'novel');
  assert.equal(settingsData.configVersion, 8);
  assert.equal(settingsData.entityTypes.length, 7);
  assert.equal(settingsData.entities, undefined);
  assert.match(
    await readFile(join(vault, 'Custom/Ideas/A thought in a custom workspace.md'), 'utf8'),
    /bs_workspace: novel/,
  );
  checks.push(
    'Settings persist via plugin data; capture settings and global schema definitions are stored there, while entities remain in Markdown.',
  );

  await evaluate("void app.plugins.plugins['thought-craft'].workspaces.setActive('default'); true");
  await page.waitForFunction(
    () => window.app.plugins.plugins['thought-craft'].workspaces.getActive().id === 'default',
  );
  await unlink(join(vault, duplicate.filePath));
  await entityCount(3);
  checks.push('External deletion removes the entity from the Inbox.');
  await command('open-inbox');
  await page.locator('.tc-inbox').screenshot({ path: join(run, 'inbox.png') });
  await page.screenshot({ path: join(run, 'obsidian-inbox.png') });
  await command('capture-idea');
  await input.fill('The next idea starts here.');
  await page.screenshot({ path: join(run, 'obsidian-capture.png') });
  await input.press('Escape');
  await stop();
  await launch();
  await entityCount(3);
  const restored = await evaluate(
    "({ entities: app.plugins.plugins['thought-craft'].entityIndex.getInbox(), settings: app.plugins.plugins['thought-craft'].settings })",
  );
  assert.equal(restored.entities.find((e) => e.id === first.id)?.filePath, moved);
  assert.equal(restored.entities.find((e) => e.id === externalId)?.workspaceId, 'external');
  assert.deepEqual(restored.settings, {
    entitiesFolder: settingsData.entitiesFolder,
    defaultWorkspace: settingsData.defaultWorkspace,
  });
  checks.push(
    'Restarting the real Obsidian process rebuilds the correct Inbox and restores settings and stable UUIDs.',
  );
  assert.deepEqual(pluginErrors, []);
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: ['obsidian-inbox.png', 'obsidian-capture.png'],
    pluginErrors,
  };
  await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidence: ${run}`);
} catch (error) {
  console.error('Renderer errors:', pluginErrors);
  if (page) {
    await page.screenshot({ path: join(run, 'failure.png') }).catch(() => {});
    console.error('Window title:', await page.title().catch(() => 'unavailable'));
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
  console.error(`Diagnostics: ${run}`);
  process.exitCode = 1;
} finally {
  await stop();
  await writeFile(join(run, 'process.log'), processLog);
}
