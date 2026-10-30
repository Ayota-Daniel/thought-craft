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
const run = resolve(root, '.artifacts', `m1-${Date.now()}`);
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

function markdownBody(markdown) {
  return markdown.slice(markdown.indexOf('\n---\n') + 5).replace(/^\n/, '');
}

async function addProperty(label, type, options) {
  await page.getByRole('button', { name: '+ Add property', exact: true }).click();
  const dialog = page.locator('.tc-add-property-modal');
  await dialog.getByLabel('Property name').fill(label);
  await dialog.getByLabel('Property type').selectOption(type);

  if (options) {
    await dialog.getByLabel('Options — one per line').fill(options.join('\n'));
  }

  await dialog.getByRole('button', { name: 'Add property', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

async function editInput(label, value) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
  await input.waitFor({ state: 'visible' });
}

async function openFocus(title) {
  await command('open-inbox');
  await page.locator('.tc-inbox-row').filter({ hasText: title }).click();
  await page.locator('.tc-focus-main h1').waitFor({ state: 'visible' });
}

async function waitForValue(entityId, key, value) {
  await page.waitForFunction(
    ({ entityId, key, value }) => {
      const entity = window.app.plugins.plugins['thought-craft'].entityIndex.getById(entityId);
      return entity?.properties.find((property) => property.key === key)?.value === value;
    },
    { entityId, key, value },
  );
}

async function readFrontmatter(filePath) {
  await page.waitForFunction((path) => {
    const file = window.app.vault.getAbstractFileByPath(path);
    return Boolean(file && window.app.metadataCache.getFileCache(file)?.frontmatter);
  }, filePath);

  return evaluate(
    'app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(' +
      JSON.stringify(filePath) +
      ')).frontmatter',
  );
}

try {
  await launch();
  checks.push('Plugin loads in real Obsidian with the M0 commands intact.');

  const originalBody =
    'M1 integration idea\n\nA **thought** worth developing.\n\n---\nbs_id: this stays body text\n---\nTrailing spaces  ';
  await capture(originalBody);
  await entityCount(1);

  const entity = await evaluate("app.plugins.plugins['thought-craft'].entityIndex.getInbox()[0]");
  let notePath = entity.filePath;
  const saved = await readFile(join(vault, notePath), 'utf8');
  assert.equal(markdownBody(saved), originalBody + '\n');

  await page.locator('.tc-inbox-row').click();
  await page.locator('.tc-focus-main h1').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.tc-focus-main h1').innerText(), entity.title);
  assert.equal(await page.locator('.tc-focus-markdown strong').innerText(), 'thought');
  checks.push(
    'Inbox opens UUID-based Focus View; content is rendered by native Obsidian MarkdownRenderer.',
  );

  await page.getByRole('button', { name: '+ Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('Cancelled property');
  await page.getByLabel('Property name').press('Escape');
  await page.locator('.tc-add-property-modal').waitFor({ state: 'detached' });
  checks.push('Escape dismisses the lightweight Add Property dialog without writing.');

  await addProperty('Working note', 'text');
  await addProperty('Effort', 'number');
  await addProperty('Originality', 'rating');
  await addProperty('Ready', 'boolean');
  await addProperty('Tone', 'select', ['dark', 'hopeful', 'melancholic']);
  assert.equal(await page.locator('.tc-property-row').count(), 5);
  checks.push('All five property types can be added through the real inspector.');

  await editInput('Working note', 'Preserve the mystery');
  await waitForValue(entity.id, 'working_note', 'Preserve the mystery');
  await editInput('Effort', 12.5);
  await waitForValue(entity.id, 'effort', 12.5);
  await editInput('Originality', 4);
  await waitForValue(entity.id, 'originality', 4);
  await page.getByLabel('Ready', { exact: true }).check();
  await waitForValue(entity.id, 'ready', true);
  await page.getByLabel('Tone', { exact: true }).selectOption('hopeful');
  await waitForValue(entity.id, 'tone', 'hopeful');
  checks.push(
    'Text, number, rating, boolean and select values persist through their semantic controls.',
  );

  const withProperties = await readFile(join(vault, notePath), 'utf8');
  assert.equal(markdownBody(withProperties), originalBody + '\n');
  const metadata = await readFrontmatter(notePath);
  assert.equal(metadata.bs_properties.originality.max, 5);
  assert.deepEqual(metadata.bs_properties.tone.options, ['dark', 'hopeful', 'melancholic']);
  assert.equal(metadata.bs_properties.ready.value, true);
  assert.equal(metadata.bs_id, entity.id);

  const externalBody = originalBody + '\n\nExternal paragraph.\n';
  const withUserMetadata = withProperties.replace(
    '---\n',
    '---\nuser_flag: keep\nuser_nested:\n  count: 7\nbs_future_flag: keep\n',
  );
  const externalMarkdown =
    withUserMetadata.slice(0, withUserMetadata.indexOf('\n---\n') + 5) + '\n' + externalBody;
  await writeFile(join(vault, notePath), externalMarkdown);
  await page.getByText('External paragraph.', { exact: true }).waitFor({ state: 'visible' });

  await editInput('Working note', 'Second saved value');
  await waitForValue(entity.id, 'working_note', 'Second saved value');
  const updatedMetadata = await readFrontmatter(notePath);
  assert.equal(updatedMetadata.user_flag, 'keep');
  assert.deepEqual(updatedMetadata.user_nested, { count: 7 });
  assert.equal(updatedMetadata.bs_future_flag, 'keep');
  assert.equal(updatedMetadata.bs_id, entity.id);
  assert.equal(markdownBody(await readFile(join(vault, notePath), 'utf8')), externalBody);
  checks.push(
    'Property edits preserve unrelated user frontmatter, unrelated bs_ fields and the exact Markdown body.',
  );

  const currentMarkdown = await readFile(join(vault, notePath), 'utf8');
  const changedExternally = currentMarkdown.replace(
    'value: Second saved value',
    'value: External value',
  );
  assert.notEqual(changedExternally, currentMarkdown);
  await writeFile(join(vault, notePath), changedExternally);
  await waitForValue(entity.id, 'working_note', 'External value');
  await page.waitForFunction(
    () => document.querySelector('#tc-property-working_note')?.value === 'External value',
  );
  checks.push(
    'External property edits and external Markdown body edits refresh Focus without a restart.',
  );

  await page.getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    (path) => window.app.workspace.getActiveFile()?.path === path,
    notePath,
  );
  checks.push('Open Markdown note opens the actual file in the native Markdown editor.');

  await openFocus(entity.title);
  const renamedPath = 'Renamed M1 idea.md';
  await rename(join(vault, notePath), join(vault, renamedPath));
  notePath = renamedPath;
  await page.waitForFunction(
    ({ id, path }) => {
      return window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.filePath === path;
    },
    { id: entity.id, path: notePath },
  );
  await page
    .getByRole('heading', { name: 'Renamed M1 idea', exact: true })
    .waitFor({ state: 'visible' });
  assert.equal((await readFrontmatter(notePath)).bs_id, entity.id);
  checks.push('External rename updates Focus and preserves the UUID and every property.');

  await evaluate("app.workspace.getLeavesOfType('thought-craft-focus')[0].detach(); true");
  await openFocus('Renamed M1 idea');
  assert.equal(
    await page.getByLabel('Working note', { exact: true }).inputValue(),
    'External value',
  );
  assert.equal(await page.getByLabel('Tone', { exact: true }).inputValue(), 'hopeful');
  checks.push('Closing and reopening Focus restores all values from the Markdown-backed index.');

  await page.screenshot({ path: join(run, 'obsidian-focus.png') });
  await page.getByRole('button', { name: '+ Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('Another detail');
  await page.screenshot({ path: join(run, 'obsidian-add-property.png') });
  await page.getByLabel('Property name').press('Escape');

  await evaluate('app.workspace.requestSaveLayout(); true');
  await delay(1000);
  await stop();
  await launch();
  await entityCount(1);
  await page.locator('.tc-focus-main h1').waitFor({ state: 'visible' });
  await waitForValue(entity.id, 'tone', 'hopeful');
  assert.equal(
    await page.getByLabel('Working note', { exact: true }).inputValue(),
    'External value',
  );
  assert.equal(await page.getByLabel('Effort', { exact: true }).inputValue(), '12.5');
  assert.equal(await page.getByLabel('Originality', { exact: true }).inputValue(), '4');
  assert.equal(await page.getByLabel('Ready', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Tone', { exact: true }).inputValue(), 'hopeful');
  checks.push(
    'Restarting real Obsidian restores the Focus tab by UUID and all five property values.',
  );

  await page.getByRole('button', { name: 'Remove Working note', exact: true }).click();
  await page.getByRole('button', { name: 'Remove property', exact: true }).click();
  await page.locator('[data-property-key="working_note"]').waitFor({ state: 'detached' });
  await page.waitForFunction((id) => {
    return (
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.properties.length === 4
    );
  }, entity.id);
  const afterRemoval = await readFrontmatter(notePath);
  assert.equal(afterRemoval.bs_properties.working_note, undefined);
  assert.equal(afterRemoval.bs_properties.effort.value, 12.5);
  assert.equal(afterRemoval.bs_properties.originality.value, 4);
  assert.equal(afterRemoval.bs_properties.ready.value, true);
  assert.equal(afterRemoval.bs_properties.tone.value, 'hopeful');
  assert.equal(afterRemoval.user_flag, 'keep');
  assert.equal(afterRemoval.bs_future_flag, 'keep');
  assert.equal(markdownBody(await readFile(join(vault, notePath), 'utf8')), externalBody);
  checks.push(
    'Removing one property deletes only that definition, preserving other values, unrelated frontmatter and body.',
  );

  await unlink(join(vault, notePath));
  await entityCount(0);
  await page.getByRole('heading', { name: 'Entity unavailable' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.tc-property-row').count(), 0);
  checks.push(
    'External note deletion leaves a clear missing-entity state without a runtime error.',
  );

  assert.deepEqual(pluginErrors, []);
  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: ['obsidian-focus.png', 'obsidian-add-property.png'],
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
