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
const run = resolve(root, '.artifacts', `m3-${Date.now()}`);
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
  await prompt.fill(
    `Thought Craft: ${id === 'capture-idea' ? 'Capture idea' : id === 'manage-entity-types' ? 'Manage entity types' : 'Open inbox'}`,
  );
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

const manager = () => page.locator('.tc-type-manager');
const detail = () => manager().getByRole('region', { name: 'Type definition' });
const schemaField = (key) => activeFocus().locator(`[data-schema-key="${key}"]`);

async function openManager(id = 'character') {
  await evaluate(
    `app.plugins.plugins['thought-craft'].openTypeManager(${JSON.stringify(id)}); true`,
  );
  await manager().waitFor({ state: 'visible' });
}
async function closeManager() {
  await page.keyboard.press('Escape');
  await manager().waitFor({ state: 'detached' });
}
async function addSchema(label, type, { max, options, defaultValue } = {}) {
  await detail().getByRole('button', { name: '+ Add schema property', exact: true }).click();
  const form = manager().locator('.tc-schema-form');
  await form.getByLabel('Property label', { exact: true }).fill(label);
  await form.getByLabel('Property type', { exact: true }).selectOption(type);
  if (max !== undefined) {
    await form.getByLabel('Rating maximum').fill(String(max));
  }
  if (options) {
    await form.getByLabel('Options (one per line)').fill(options.join('\n'));
  }
  if (defaultValue !== undefined) {
    await form.getByLabel('Use a virtual default').check();
    const input = form.getByLabel('Default value', { exact: true });
    if (type === 'select' || type === 'boolean') {
      await input.selectOption(String(defaultValue));
    } else {
      await input.fill(String(defaultValue));
    }
  }
  await form.getByRole('button', { name: 'Save property', exact: true }).click();
  await form.waitFor({ state: 'detached' });
}
async function editSchema(label, edit) {
  await manager()
    .locator('.tc-schema-list')
    .getByRole('button', { name: label, exact: true })
    .click();
  const form = manager().locator('.tc-schema-form');
  await edit(form);
  await form.getByRole('button', { name: 'Save property', exact: true }).click();
  await form.waitFor({ state: 'detached' });
}
async function setValue(id, key, value, type = 'text') {
  const row = schemaField(key);
  const input = row.locator(type === 'select' ? 'select' : 'input');
  if (type === 'select') {
    await input.selectOption(value);
  } else if (type === 'boolean') {
    await input.setChecked(value);
  } else {
    await input.fill(String(value));
    await input.press('Enter');
  }
  await page.waitForFunction(
    ({ id, key, value }) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.schemaValues?.[key] ===
      value,
    { id, key, value },
  );
}

try {
  // Start from an actual M2-era settings file, with no schema configuration.
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({ entitiesFolder: 'Brainstorm/Ideas', defaultWorkspace: 'novel' }),
  );
  await launch();
  await capture('M3 source idea\n\nPreserve **Markdown**.\n\n---\nBody separator\n');
  const source = await findEntity('M3 source idea');
  const sourceBytes = await readFile(join(vault, source.filePath), 'utf8');
  const character = await createDerived(
    source.id,
    'character',
    'Mira',
    'A traveller.\n\nKeep this body.  \n',
  );
  const characterPath = join(vault, character.filePath);
  const beforeSchema = (await readFile(characterPath, 'utf8')).replace(
    '---\n',
    '---\nuser_flag: keep\nbs_future: keep\nbs_properties:\n  note:\n    label: Local note\n    type: text\n    value: Personal\n',
  );
  await writeFile(characterPath, beforeSchema);
  await page.waitForFunction(
    (id) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.properties.length === 1,
    character.id,
  );
  await command('manage-entity-types');
  await manager()
    .getByRole('navigation')
    .getByRole('button', { name: 'Character', exact: true })
    .click();
  await addSchema('Motivation', 'text');
  await page.screenshot({ path: join(run, 'type-manager.png') });
  await closeManager();
  await schemaField('motivation').getByText('— Missing', { exact: true }).waitFor();
  assert.equal(await readFile(characterPath, 'utf8'), beforeSchema);
  checks.push(
    'M2 settings migrate to seven empty built-ins; Character receives a new reusable field without any Markdown rewrite.',
  );
  await setValue(character.id, 'motivation', 'Find her brother');
  const afterMotivation = await readFile(characterPath, 'utf8');
  assert.match(afterMotivation, /bs_schema_values:\n {2}motivation: Find her brother/);
  assert.equal(markdownBody(afterMotivation), markdownBody(beforeSchema));
  assert.match(afterMotivation, /user_flag: keep/);
  assert.match(afterMotivation, /bs_future: keep/);
  assert.equal((await getEntity(character.id)).properties[0].value, 'Personal');
  assert.equal((await getEntity(character.id)).relations[0].targetEntityId, source.id);
  await restartObsidian();
  await openFocus(character.id);
  assert.equal(await schemaField('motivation').locator('input').inputValue(), 'Find her brother');
  await openManager();
  await editSchema('Motivation', async (form) => {
    assert.equal(await form.getByLabel('Stable key').isDisabled(), true);
    assert.equal(await form.getByLabel('Property type', { exact: true }).isDisabled(), true);
    await form.getByLabel('Property label', { exact: true }).fill('Primary Motivation');
  });
  await addSchema('Importance', 'rating', { max: 5, defaultValue: 3 });
  await addSchema('Role', 'select', { options: ['protagonist', 'antagonist', 'supporting'] });
  await addSchema('Cost', 'number');
  await addSchema('Secret', 'boolean', { defaultValue: false });
  await closeManager();
  assert.equal(
    await schemaField('motivation').getByLabel('Primary Motivation', { exact: true }).inputValue(),
    'Find her brother',
  );
  assert.equal(await schemaField('importance').locator('input').inputValue(), '3');
  assert.equal((await getEntity(character.id)).schemaValues.importance, undefined);
  await setValue(character.id, 'importance', 5);
  await setValue(character.id, 'role', 'protagonist', 'select');
  await setValue(character.id, 'cost', -2.5);
  await setValue(character.id, 'secret', true, 'boolean');
  await page.screenshot({ path: join(run, 'character-type-and-local.png') });
  checks.push(
    'All five reusable editor kinds save explicit values; defaults stay virtual; local properties, relations, user metadata and exact Markdown body survive. Restart and label rename preserve key/value.',
  );

  const beforeConstraints = await readFile(characterPath, 'utf8');
  await openManager();
  await editSchema('Role', (form) =>
    form.getByLabel('Options (one per line)').fill('antagonist\nsupporting'),
  );
  await editSchema('Importance', (form) => form.getByLabel('Rating maximum').fill('3'));
  await closeManager();
  await schemaField('role').getByRole('status').filter({ hasText: 'Incompatible:' }).waitFor();
  await schemaField('importance')
    .getByRole('status')
    .filter({ hasText: 'Incompatible:' })
    .waitFor();
  assert.equal(await readFile(characterPath, 'utf8'), beforeConstraints);
  await page.screenshot({ path: join(run, 'legacy-values.png') });
  await setValue(character.id, 'role', 'supporting', 'select');
  await setValue(character.id, 'importance', 2);
  await schemaField('importance')
    .getByRole('button', { name: 'Reset Importance', exact: true })
    .click();
  await schemaField('importance').getByRole('button', { name: 'Reset value', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.schemaValues
        ?.importance === undefined,
    character.id,
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.tc-focus')]
        .find((element) => element.offsetParent !== null)
        ?.querySelector('#tc-schema-importance')?.value === '3',
  );
  assert.equal(await schemaField('importance').locator('input').inputValue(), '3');
  checks.push(
    'Removing an active select option and lowering rating maximum preserve the exact file and show incompatibilities. Valid replacements and reset to virtual default work.',
  );

  await openManager();
  await manager().getByRole('button', { name: '+ Create type', exact: true }).click();
  await detail().getByLabel('Name', { exact: true }).fill('Quest');
  assert.equal(await detail().getByLabel('ID', { exact: true }).inputValue(), 'quest');
  await detail().getByLabel('Folder', { exact: true }).fill('Quests');
  await detail().getByRole('button', { name: 'Create type', exact: true }).click();
  await detail().getByRole('heading', { name: 'Quest', exact: true }).waitFor();
  await addSchema('Difficulty', 'rating', { max: 5 });
  await addSchema('Status', 'select', { options: ['open', 'complete'] });
  await closeManager();
  await evaluate(
    "window.tcEnableQuest=false; app.plugins.plugins['thought-craft'].workspaces.update('novel',{enabledEntityTypeIds:['idea','character','scene','location','project','quest']}).then(() => {window.tcEnableQuest=true;}); true",
  );
  await page.waitForFunction(() => window.tcEnableQuest);
  const quest = await createDerived(
    source.id,
    'quest',
    'Find the missing traveller',
    'Quest content.',
  );
  assert.equal(quest.filePath, 'Brainstorm/Quests/Find the missing traveller.md');
  assert.equal(quest.workspaceId, 'novel');
  assert.notEqual(quest.id, source.id);
  assert.match(quest.id, /^[a-f\d-]{36}$/);
  assert.equal(quest.relations[0].type, 'originated-from');
  assert.equal(quest.relations[0].targetEntityId, source.id);
  assert.equal(await readFile(join(vault, source.filePath), 'utf8'), sourceBytes);
  await setValue(quest.id, 'difficulty', 4);
  await setValue(quest.id, 'status', 'open', 'select');
  await addRelation(quest, character, 'depends-on');
  await waitForRelations(quest.id, 2);
  const addedRelation = (await getEntity(quest.id)).relations.find(
    (relation) => relation.type === 'depends-on',
  );
  await removeRelation(quest.id, addedRelation.id);
  await addRelation(quest, character, 'depends-on');
  await restartObsidian();
  await openFocus(quest.id);
  assert.equal(await schemaField('difficulty').locator('input').inputValue(), '4');
  assert.equal(await schemaField('status').locator('select').inputValue(), 'open');
  await page.screenshot({ path: join(run, 'custom-quest.png') });
  checks.push(
    'Quest type created through Type Manager; registry-driven Create From uses its folder, UUID, inherited workspace, origin and schema fields. Directed relations to Character work and survive restart.',
  );

  const questPath = join(vault, quest.filePath);
  const questBytes = await readFile(questPath, 'utf8');
  await openManager('quest');
  await detail().getByLabel('Display name', { exact: true }).fill('Mission');
  await detail().getByLabel('Folder', { exact: true }).fill('Missions');
  await detail().getByRole('button', { name: 'Save type', exact: true }).click();
  await detail().getByRole('heading', { name: 'Mission', exact: true }).waitFor();
  await detail().getByRole('button', { name: 'Retire type', exact: true }).click();
  await detail().getByRole('button', { name: 'Restore type', exact: true }).waitFor();
  await closeManager();
  assert.equal(await readFile(questPath, 'utf8'), questBytes);
  await activeFocus()
    .getByText('Retired type · existing notes remain editable.', { exact: true })
    .waitFor();
  await activeFocus().getByRole('button', { name: 'Create from…', exact: true }).click();
  assert.equal(await page.locator('.tc-create-from-modal option[value="quest"]').count(), 0);
  await page.keyboard.press('Escape');
  await openManager('quest');
  await detail().getByRole('button', { name: 'Restore type', exact: true }).click();
  await detail().getByRole('button', { name: 'Retire type', exact: true }).waitFor();
  await editSchema('Difficulty', (form) =>
    form.getByLabel('Retired (stored values remain in notes)').check(),
  );
  await closeManager();
  await activeFocus()
    .getByText('Stored values without an active schema (1)', { exact: true })
    .waitFor();
  assert.equal((await getEntity(quest.id)).schemaValues.difficulty, 4);
  const mission = await createDerived(source.id, 'quest', 'A new mission', 'New destination.');
  assert.equal(mission.filePath, 'Brainstorm/Missions/A new mission.md');
  assert.equal(mission.type, 'quest');
  await openManager('quest');
  await editSchema('Difficulty', (form) =>
    form.getByLabel('Retired (stored values remain in notes)').uncheck(),
  );
  await closeManager();
  checks.push(
    'Type label and folder changes keep bs_type stable and do not move old files. Retired types remain usable and leave creation choices; restoration and safe property retirement preserve stored values.',
  );

  const malformedBytes = (await readFile(questPath, 'utf8')).replace(
    'difficulty: 4',
    'difficulty: legacy',
  );
  await writeFile(questPath, malformedBytes);
  await openFocus(quest.id);
  await schemaField('difficulty')
    .getByRole('status')
    .filter({ hasText: 'Incompatible:' })
    .waitFor();
  await setValue(quest.id, 'difficulty', 3);
  const unknownId = '7631b173-505e-4a2f-b19e-d31e3aab8816';
  const unknownBytes = `---\nbs_id: ${unknownId}\nbs_type: creature\nbs_workspace: novel\nbs_status: exploring\nbs_created: '2026-10-28T09:15:00.000Z'\nbs_updated: '2026-10-28T09:15:00.000Z'\nbs_schema_values:\n  rarity: 4\nbs_properties:\n  note:\n    label: Local creature note\n    type: text\n    value: Preserved\n---\n\nUnknown creature **body**.\n`;
  await writeFile(join(vault, 'Unknown creature.md'), unknownBytes);
  await findEntity('Unknown creature');
  await openFocus(unknownId);
  await activeFocus()
    .getByText(/Unknown Entity Type: creature/)
    .first()
    .waitFor();
  await activeFocus().getByText('Unknown creature body.', { exact: true }).waitFor();
  await activeFocus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  await page.waitForFunction(
    () => window.app.workspace.getActiveFile()?.path === 'Unknown creature.md',
  );
  await openFocus(unknownId);
  await page.screenshot({ path: join(run, 'unknown-type.png') });
  assert.equal(await readFile(join(vault, 'Unknown creature.md'), 'utf8'), unknownBytes);
  checks.push(
    'External incompatible schema values refresh through Vault events and can be corrected. Unknown type retains content, UUID, stored values, local properties and native Markdown access without file rewrites.',
  );

  await openManager('idea');
  await detail().getByLabel('Folder', { exact: true }).fill('Thoughts');
  await detail().getByRole('button', { name: 'Save type', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.app.plugins.plugins['thought-craft'].settings.entitiesFolder === 'Brainstorm/Thoughts',
  );
  await closeManager();
  await capture('A new capture destination');
  const relocatedCapture = await findEntity('A new capture destination');
  assert.equal(relocatedCapture.filePath, 'Brainstorm/Thoughts/A new capture destination.md');
  assert.equal(await readFile(join(vault, source.filePath), 'utf8'), sourceBytes);
  checks.push(
    'Editing the built-in Idea folder through Type Manager synchronizes the existing capture setting; only future captures use the new destination.',
  );

  const configPath = join(pluginFolder, 'data.json');
  const savedConfig = await readFile(configPath, 'utf8');
  const config = JSON.parse(savedConfig);
  assert.equal(config.configVersion, 8);
  assert.equal(config.entityTypes.filter((type) => type.id === 'quest').length, 1);
  assert.equal(config.entities, undefined);
  assert.equal(config.bs_schema_values, undefined);
  const questBeforeConfigLoss = await readFile(questPath, 'utf8');
  await stop();
  delete config.entityTypes;
  await writeFile(configPath, JSON.stringify(config));
  await launch();
  await findEntity(quest.title);
  await openFocus(quest.id);
  await activeFocus()
    .getByText(/Unknown Entity Type: quest/)
    .first()
    .waitFor();
  assert.equal((await getEntity(quest.id)).schemaValues.difficulty, 3);
  assert.equal((await getEntity(quest.id)).relations.length, 2);
  assert.equal(await readFile(questPath, 'utf8'), questBeforeConfigLoss);
  await stop();
  await writeFile(configPath, savedConfig);
  await launch();
  await findEntity(quest.title);
  await openFocus(quest.id);
  assert.equal(await schemaField('difficulty').locator('input').inputValue(), '3');
  assert.equal((await getEntity(quest.id)).type, 'quest');
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Settings-loss restart preserves unknown Quest and its data; restoring data.json recovers its schema and values. No plugin renderer errors across restarts.',
  );

  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'type-manager.png',
      'character-type-and-local.png',
      'legacy-values.png',
      'custom-quest.png',
      'unknown-type.png',
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
