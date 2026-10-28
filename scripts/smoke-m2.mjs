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
const run = resolve(root, '.artifacts', `m2-${Date.now()}`);
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
async function capture(content) {
  await command('capture-idea');
  const input = page.locator('.tc-capture-input');
  await input.fill(content);
  await input.press('Enter');
  await page.locator('.thought-craft-capture').waitFor({ state: 'detached' });
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

async function addRelation(source, target, type) {
  await openFocus(source.id);
  await activeFocus().getByRole('button', { name: '+ Add relation', exact: true }).click();
  const dialog = page.locator('.tc-add-relation-modal');
  await dialog.getByLabel('Search entities').fill(target.title);
  await dialog.getByLabel('Target entity', { exact: true }).selectOption(target.id);
  await dialog.getByLabel('Relation type', { exact: true }).selectOption(type);
  await dialog.getByRole('button', { name: 'Add relation', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

async function removeRelation(entityId, relationId) {
  await openFocus(entityId);
  const row = activeFocus().locator('[data-relation-id="' + relationId + '"]');
  await row.getByRole('button', { name: /^Remove relation to / }).click();
  await row.getByRole('button', { name: 'Remove relation', exact: true }).click();
  await row.waitFor({ state: 'detached' });
}

async function createDerived(sourceId, type, title, content) {
  await openFocus(sourceId);
  await activeFocus().getByRole('button', { name: 'Create from…', exact: true }).click();
  const dialog = page.locator('.tc-create-from-modal');
  const supportedTypes = await dialog
    .getByLabel('Entity type')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.deepEqual(supportedTypes, ['idea', 'character', 'scene', 'location', 'project']);
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

try {
  await launch();
  await capture(
    'M2 source idea\n\nKeep the source **body** intact.\n\n---\nNot frontmatter\n---\n',
  );
  const source = await findEntity('M2 source idea');
  await capture('M2 target idea\n\nKeep the target body intact.');
  const target = await findEntity('M2 target idea');
  const targetBefore = await readFile(join(vault, target.filePath), 'utf8');
  const capturedSource = await readFile(join(vault, source.filePath), 'utf8');
  const sourceWithProperties = capturedSource.replace(
    '---\n',
    '---\nuser_flag: keep\nbs_future_flag: keep\nbs_properties:\n  tone:\n    label: Tone\n    type: text\n    value: Preserve me\n',
  );
  await writeFile(join(vault, source.filePath), sourceWithProperties);
  await page.waitForFunction((id) => {
    return (
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.properties.length === 1
    );
  }, source.id);

  await addRelation(source, target, 'related-to');
  await waitForRelations(source.id, 1);
  const firstRelation = (await getEntity(source.id)).relations[0];
  assert.equal(firstRelation.targetEntityId, target.id);
  assert.match(firstRelation.id, /^[a-f\d-]{36}$/);
  assert.equal(await activeFocus().locator('.tc-outgoing-relations .tc-relation-row').count(), 1);
  assert.equal(await readFile(join(vault, target.filePath), 'utf8'), targetBefore);
  await activeFocus()
    .locator('.tc-outgoing-relations')
    .getByRole('button', { name: target.title, exact: true })
    .click();
  await waitForFocus(target.id);
  assert.equal(
    await activeFocus()
      .locator('.tc-incoming-relations')
      .getByRole('button', { name: source.title, exact: true })
      .count(),
    1,
  );
  checks.push(
    'Idea-to-Idea relation is stored only on the source; outgoing and incoming navigation use Focus.',
  );

  await restartObsidian();
  await openFocus(source.id);
  await waitForRelations(source.id, 1);
  assert.equal((await getEntity(source.id)).relations[0].id, firstRelation.id);
  checks.push('Restart reconstructs the relation with its stable relation ID and target UUID.');

  const renamedTargetPath = 'Renamed M2 target.md';
  await rename(join(vault, target.filePath), join(vault, renamedTargetPath));
  await page.waitForFunction(
    ({ id, path }) => {
      return window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.filePath === path;
    },
    { id: target.id, path: renamedTargetPath },
  );
  target.filePath = renamedTargetPath;
  target.title = 'Renamed M2 target';
  await activeFocus()
    .locator('.tc-outgoing-relations')
    .getByRole('button', { name: target.title, exact: true })
    .waitFor({ state: 'visible' });

  const renamedSourcePath = 'Renamed M2 source.md';
  await rename(join(vault, source.filePath), join(vault, renamedSourcePath));
  await page.waitForFunction(
    ({ id, path }) => {
      return window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.filePath === path;
    },
    { id: source.id, path: renamedSourcePath },
  );
  source.filePath = renamedSourcePath;
  source.title = 'Renamed M2 source';
  await activeFocus()
    .getByRole('heading', { name: source.title, exact: true })
    .waitFor({ state: 'visible' });
  assert.equal((await getEntity(source.id)).relations[0].targetEntityId, target.id);
  checks.push(
    'External source and target renames preserve relation identity and refresh displayed titles.',
  );

  await addRelation(source, target, 'depends-on');
  await waitForRelations(source.id, 2);
  const beforeDuplicate = await readFile(join(vault, source.filePath), 'utf8');
  await activeFocus().getByRole('button', { name: '+ Add relation', exact: true }).click();
  const duplicateDialog = page.locator('.tc-add-relation-modal');
  const targetSelect = duplicateDialog.getByLabel('Target entity', { exact: true });
  assert.equal(await targetSelect.locator('option[value="' + source.id + '"]').count(), 0);
  await duplicateDialog.getByLabel('Search entities').fill(target.title);
  await targetSelect.selectOption(target.id);
  await duplicateDialog.getByLabel('Relation type', { exact: true }).selectOption('related-to');
  await duplicateDialog.getByRole('button', { name: 'Add relation', exact: true }).click();
  await duplicateDialog
    .getByRole('alert')
    .getByText(/already exists/)
    .waitFor({ state: 'visible' });
  assert.equal(await readFile(join(vault, source.filePath), 'utf8'), beforeDuplicate);
  await duplicateDialog.getByLabel('Search entities').press('Escape');
  await duplicateDialog.waitFor({ state: 'detached' });

  await evaluate(
    "window.tcSelfResult = 'pending'; app.plugins.plugins['thought-craft'].repository.addRelation(" +
      JSON.stringify(source.id) +
      ", {type:'related-to', targetEntityId:" +
      JSON.stringify(source.id) +
      "}).then(() => {window.tcSelfResult='accepted';}, error => {window.tcSelfResult=error.message;}); true",
  );
  await page.waitForFunction(() => window.tcSelfResult !== 'pending');
  assert.match(await evaluate('window.tcSelfResult'), /itself/);
  assert.equal(await readFile(join(vault, source.filePath), 'utf8'), beforeDuplicate);
  checks.push(
    'Different relation types to the same target work; exact duplicates and self-relations are rejected by the repository/domain without changing files.',
  );

  await removeRelation(source.id, firstRelation.id);
  await waitForRelations(source.id, 1);
  const sourceAfterRemoval = await readFile(join(vault, source.filePath), 'utf8');
  assert.equal(markdownBody(sourceAfterRemoval), markdownBody(sourceWithProperties));
  assert.match(sourceAfterRemoval, /user_flag: keep/);
  assert.match(sourceAfterRemoval, /bs_future_flag: keep/);
  assert.match(sourceAfterRemoval, /value: Preserve me/);
  assert.equal((await getEntity(source.id)).properties[0].value, 'Preserve me');
  checks.push(
    'Relation removal deletes only the selected edge and preserves custom properties, other bs_ fields, user frontmatter and exact Markdown body.',
  );

  await capture('Noah already knows the conductor\n\nAn idea that becomes a character.');
  const origin = await findEntity('Noah already knows the conductor');
  const originMarkdown = (await readFile(join(vault, origin.filePath), 'utf8')).replace(
    'bs_workspace: default',
    'bs_workspace: novel',
  );
  await writeFile(join(vault, origin.filePath), originMarkdown);
  await page.waitForFunction((id) => {
    return (
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.workspaceId === 'novel'
    );
  }, origin.id);

  const character = await createDerived(
    origin.id,
    'character',
    'The Conductor',
    'An old acquaintance.\n\nKeep this character body.',
  );
  assert.notEqual(character.id, origin.id);
  assert.equal(character.type, 'character');
  assert.equal(character.workspaceId, 'novel');
  assert.equal(character.status, 'exploring');
  assert.equal(character.filePath, 'Brainstorm/Characters/The Conductor.md');
  assert.equal(character.relations[0].type, 'originated-from');
  assert.equal(character.relations[0].targetEntityId, origin.id);
  assert.equal(await readFile(join(vault, origin.filePath), 'utf8'), originMarkdown);
  assert.match(await activeFocus().locator('.tc-eyebrow').innerText(), /character/i);
  await page.screenshot({ path: join(run, 'character-origin.png') });

  await activeFocus()
    .locator('.tc-outgoing-relations')
    .getByRole('button', { name: origin.title, exact: true })
    .click();
  await waitForFocus(origin.id);
  await activeFocus()
    .locator('.tc-incoming-relations')
    .getByRole('button', { name: character.title, exact: true })
    .click();
  await waitForFocus(character.id);
  const characterViews = await evaluate(
    "app.workspace.getLeavesOfType('thought-craft-focus').filter(leaf => leaf.view.getState().entityId === " +
      JSON.stringify(character.id) +
      ').length',
  );
  assert.equal(characterViews, 1);
  checks.push(
    'Create From creates Character with a new UUID, inherited workspace and one originated-from edge; the source bytes stay unchanged, incoming is derived, and navigation reuses the existing Focus tab.',
  );

  await activeFocus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    (path) => window.app.workspace.getActiveFile()?.path === path,
    character.filePath,
  );
  await openFocus(character.id);
  await unlink(join(vault, origin.filePath));
  await page.waitForFunction(
    (id) => !window.app.plugins.plugins['thought-craft'].entityIndex.getById(id),
    origin.id,
  );
  await activeFocus()
    .getByText('Unavailable target', { exact: true })
    .waitFor({ state: 'visible' });
  assert.equal((await getEntity(character.id)).relations.length, 1);
  assert.match(await readFile(join(vault, character.filePath), 'utf8'), new RegExp(origin.id));
  await page.screenshot({ path: join(run, 'dangling-relation.png') });
  await removeRelation(character.id, character.relations[0].id);
  await waitForRelations(character.id, 0);
  checks.push(
    'Deleting the origin leaves a persisted dangling edge, Focus stays usable, and the user can explicitly remove it.',
  );

  const characterBeforeDerivations = await readFile(join(vault, character.filePath), 'utf8');
  const derivedEntities = [];
  const requests = [
    ['scene', 'Station arrival', 'Brainstorm/Scenes/Station arrival.md'],
    ['location', 'Central station', 'Brainstorm/Locations/Central station.md'],
    ['project', 'Thoughtcraft project', 'Brainstorm/Projects/Thoughtcraft project.md'],
  ];
  for (const [type, title, expectedPath] of requests) {
    const created = await createDerived(character.id, type, title, 'Initial content for ' + type);
    assert.equal(created.type, type);
    assert.equal(created.filePath, expectedPath);
    assert.equal(created.workspaceId, 'novel');
    assert.equal(created.relations[0].targetEntityId, character.id);
    derivedEntities.push(created);
  }
  assert.equal(await readFile(join(vault, character.filePath), 'utf8'), characterBeforeDerivations);
  checks.push(
    'Scene, Location and Project use the same Create From and Focus flow, inherit the workspace and use sibling folders without mutating their source.',
  );

  const currentSource = await readFile(join(vault, source.filePath), 'utf8');
  const changedTarget = currentSource.replace(target.id, character.id);
  assert.notEqual(changedTarget, currentSource);
  const withMalformedEntry = changedTarget.replace(
    'bs_relations:\n',
    'bs_relations:\n  - malformed: preserve-this-entry\n',
  );
  assert.notEqual(withMalformedEntry, changedTarget);
  await writeFile(join(vault, source.filePath), withMalformedEntry);
  await page.waitForFunction(
    ({ sourceId, targetId }) => {
      const entity = window.app.plugins.plugins['thought-craft'].entityIndex.getById(sourceId);
      return (
        entity?.relations[0]?.targetEntityId === targetId && entity.relationIssues.length === 1
      );
    },
    { sourceId: source.id, targetId: character.id },
  );
  assert.equal((await getEntity(source.id)).relations.length, 1);
  await openFocus(character.id);
  await activeFocus()
    .locator('.tc-incoming-relations')
    .getByRole('button', { name: source.title, exact: true })
    .waitFor({ state: 'visible' });
  await activeFocus().getByRole('button', { name: '+ Add relation', exact: true }).click();
  const searchDialog = page.locator('.tc-add-relation-modal');
  await searchDialog.getByLabel('Search entities').fill('station');
  await page.screenshot({ path: join(run, 'add-relation-search.png') });
  await searchDialog.getByLabel('Search entities').press('Escape');
  checks.push(
    'Manual target UUID edits update incoming relations; malformed neighbors are reported and retained without hiding valid edges.',
  );

  await unlink(join(vault, source.filePath));
  await page.waitForFunction(
    ({ targetId, sourceId }) => {
      return !window.app.plugins.plugins['thought-craft'].entityIndex
        .getIncomingRelations(targetId)
        .some((edge) => edge.source.id === sourceId);
    },
    { targetId: character.id, sourceId: source.id },
  );
  assert.equal(await readFile(join(vault, target.filePath), 'utf8'), targetBefore);
  const settingsPath = join(pluginFolder, 'data.json');
  let settingsData;
  try {
    settingsData = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    settingsData = {};
  }
  assert.equal(settingsData.bs_relations, undefined);
  assert.equal(settingsData.entities, undefined);

  await page.screenshot({ path: join(run, 'incoming-relations.png') });
  await restartObsidian();
  await openFocus(character.id);
  await waitForRelations(character.id, 0);
  for (const created of derivedEntities) {
    const restored = await getEntity(created.id);
    assert.equal(restored.type, created.type);
    assert.equal(restored.relations[0].targetEntityId, character.id);
    assert.equal(restored.relations[0].id, created.relations[0].id);
  }
  const incomingCount = await evaluate(
    "app.plugins.plugins['thought-craft'].entityIndex.getIncomingRelations(" +
      JSON.stringify(character.id) +
      ').length',
  );
  assert.equal(incomingCount, 3);
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Source deletion refreshes incoming edges; final restart restores all generic entities and relationships with no mirrored or dangling-state resurrection.',
  );

  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'character-origin.png',
      'dangling-relation.png',
      'add-relation-search.png',
      'incoming-relations.png',
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
