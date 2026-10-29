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
const run = resolve(root, '.artifacts', `m4-${Date.now()}`);
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
  await prompt.fill(
    `Thought Craft: ${id === 'capture-idea' ? 'Capture idea' : id === 'manage-workspaces' ? 'Manage workspaces' : 'Open inbox'}`,
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
  await dialog.getByLabel('Relation type', { exact: true }).selectOption(type);
  if (source.workspaceId !== target.workspaceId) {
    await dialog.getByLabel('Search scope', { exact: true }).selectOption('all');
  }
  await dialog.getByLabel('Search entities').fill(target.title);
  await dialog.getByLabel('Target entity', { exact: true }).selectOption(target.id);
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
async function switchWorkspace(id, keyboard = false) {
  await command('open-inbox');
  const select = page.getByLabel('Active workspace', { exact: true });
  if (keyboard) {
    await select.focus();
    await select.press('End');
    await select.press('Enter');
  } else {
    await select.selectOption(id);
  }
  await page.waitForFunction(
    (id) => window.app.plugins.plugins['thought-craft'].workspaces.getActive().id === id,
    id,
  );
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

try {
  const oldId = 'ca829f16-35b0-4e68-857b-d54cfc73caed';
  const oldBytes = `---\nbs_id: ${oldId}\nbs_type: idea\nbs_workspace: default\nbs_status: inbox\nbs_created: '2026-10-28T09:15:00.000Z'\nbs_updated: '2026-10-28T09:15:00.000Z'\nbs_properties:\n  note:\n    label: Note\n    type: text\n    value: Keep local\nbs_schema_values:\n  importance: 4\nuser_flag: keep\nbs_future_flag: keep\n---\n\nOld M3 idea.\n\n---\nKeep exact body.  \n`;
  await writeFile(join(vault, 'Old M3 idea.md'), oldBytes);
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 3,
      entitiesFolder: 'Brainstorm/Ideas',
      defaultWorkspace: 'default',
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
      user_setting: 'keep',
    }),
  );
  await launch();
  await findEntity('Old M3 idea');
  await command('open-inbox');
  await page.locator('.tc-inbox-row').getByText('Old M3 idea', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Active workspace', { exact: true }).inputValue(), 'default');
  assert.equal(await readFile(join(vault, 'Old M3 idea.md'), 'utf8'), oldBytes);
  assert.ok((await creationChoices(oldId)).includes('quest'));
  const migrated = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(migrated.configVersion, 6);
  assert.equal(migrated.workspaces.filter((workspace) => workspace.id === 'default').length, 1);
  assert.equal(
    migrated.entityTypes.find((type) => type.id === 'quest').properties[0].key,
    'difficulty',
  );
  assert.equal(migrated.user_setting, 'keep');
  checks.push(
    'Real M3 configuration upgrades without note writes; Default keeps all previous types, custom schemas and unrelated settings. Existing M3 notes remain in Default Inbox.',
  );

  await createWorkspace('The Last Train', ['Character', 'Scene', 'Location', 'Project']);
  await switchWorkspace('the-last-train', true);
  await page
    .getByRole('heading', { name: 'No ideas in The Last Train yet.', exact: true })
    .waitFor();
  await page.screenshot({ path: join(run, 'workspace-empty.png') });
  await capture('The conductor knows Mira\n\nNew workspace content.');
  const idea = await findEntity('The conductor knows Mira');
  assert.equal(idea.workspaceId, 'the-last-train');
  assert.match(await readFile(join(vault, idea.filePath), 'utf8'), /bs_workspace: the-last-train/);
  assert.equal(await page.locator('.tc-inbox-row').count(), 1);
  const character = await createDerived(idea.id, 'character', 'Mira', 'A traveller.');
  const scene = await createDerived(idea.id, 'scene', 'Station arrival', 'The first meeting.');
  const location = await createDerived(idea.id, 'location', 'Old Station', 'A forgotten station.');
  const project = await createDerived(
    idea.id,
    'project',
    'Novel draft',
    'Existing Project stays accessible.',
  );
  assert.equal(character.workspaceId, idea.workspaceId);
  const projectBytes = await readFile(join(vault, project.filePath), 'utf8');
  await openWorkspaceManager('The Last Train');
  await workspaceDetail()
    .getByRole('group', { name: 'Enabled entity types' })
    .getByRole('checkbox', { name: 'Project', exact: true })
    .uncheck();
  await workspaceDetail().getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.waitForFunction(
    () =>
      !window.app.plugins.plugins['thought-craft'].workspaces
        .get('the-last-train')
        .enabledEntityTypeIds.includes('project'),
  );
  await page.screenshot({ path: join(run, 'workspace-manager.png') });
  await closeWorkspaceManager();
  assert.equal((await creationChoices(idea.id)).includes('project'), false);
  await openFocus(project.id);
  await activeFocus().getByRole('heading', { name: project.title, exact: true }).waitFor();
  assert.equal(await readFile(join(vault, project.filePath), 'utf8'), projectBytes);
  checks.push(
    'Keyboard workspace switching updates Inbox; Quick Capture uses active Workspace; Create From inherits it. Disabling Project excludes new creation without changing an existing Project.',
  );

  await evaluate(
    "window.tcPlotReady=false; app.plugins.plugins['thought-craft'].registry.createCustomType({id:'plot-thread',label:'Plot Thread',folderName:'Plot Threads'}).then(() => {window.tcPlotReady=true;}); true",
  );
  await page.waitForFunction(() => window.tcPlotReady);
  await openWorkspaceManager('The Last Train');
  await workspaceDetail()
    .getByRole('group', { name: 'Enabled entity types' })
    .getByRole('checkbox', { name: 'Plot Thread', exact: true })
    .check();
  await workspaceDetail().getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].workspaces
      .get('the-last-train')
      .enabledEntityTypeIds.includes('plot-thread'),
  );
  await closeWorkspaceManager();
  assert.ok((await creationChoices(idea.id)).includes('plot-thread'));
  await switchWorkspace('default');
  assert.equal((await creationChoices(oldId)).includes('plot-thread'), false);
  await openFocus(character.id);
  await activeFocus().getByText('Workspace · The Last Train', { exact: true }).waitFor();
  await switchWorkspace('the-last-train');
  checks.push(
    'Global custom Plot Thread is enabled only through Workspace Manager; creation choices are scoped to source Workspace, even after the active context changes. Open Focus remains tied to its actual entity.',
  );

  await openWorkspaceManager('The Last Train');
  await workspaceDetail().getByRole('button', { name: '+ Add relation type', exact: true }).click();
  const relationForm = workspaceDialog().locator('.tc-schema-form');
  await relationForm.getByLabel('Relation name', { exact: true }).fill('Appears in');
  assert.equal(
    await relationForm.getByLabel('Relation ID', { exact: true }).inputValue(),
    'appears-in',
  );
  await relationForm
    .getByRole('group', { name: 'From types' })
    .getByRole('checkbox', { name: 'Character', exact: true })
    .check();
  await relationForm
    .getByRole('group', { name: 'To types' })
    .getByRole('checkbox', { name: 'Scene', exact: true })
    .check();
  await relationForm.getByRole('button', { name: 'Create relation type', exact: true }).click();
  await relationForm.waitFor({ state: 'detached' });
  await page.screenshot({ path: join(run, 'relation-definition.png') });
  await closeWorkspaceManager();
  await openFocus(character.id);
  await activeFocus().getByRole('button', { name: '+ Add relation', exact: true }).click();
  const picker = page.locator('.tc-add-relation-modal');
  const relationSelect = picker.getByLabel('Relation type', { exact: true });
  await relationSelect.focus();
  await relationSelect.press('End');
  await relationSelect.press('Tab');
  assert.equal(await relationSelect.inputValue(), 'appears-in');
  assert.equal(await picker.getByLabel('Search scope', { exact: true }).isDisabled(), true);
  const targets = picker.getByLabel('Target entity', { exact: true });
  assert.equal(await targets.locator(`option[value="${character.id}"]`).count(), 0);
  assert.equal(await targets.locator(`option[value="${location.id}"]`).count(), 0);
  await targets.focus();
  await targets.press('End');
  assert.equal(await targets.inputValue(), scene.id);
  await targets.press('Tab');
  await page.screenshot({ path: join(run, 'custom-relation-picker.png') });
  await picker.getByRole('button', { name: 'Add relation', exact: true }).focus();
  await page.keyboard.press('Enter');
  await picker.waitFor({ state: 'detached' });
  await waitForRelations(character.id, 2);
  const customEdge = (await getEntity(character.id)).relations.find(
    (relation) => relation.type === 'appears-in',
  );
  await openFocus(scene.id);
  await activeFocus()
    .locator('.tc-incoming-relations')
    .getByRole('button', { name: character.title, exact: true })
    .waitFor();
  await restartObsidian();
  await openFocus(character.id);
  assert.equal(
    (await getEntity(character.id)).relations.find((relation) => relation.type === 'appears-in').id,
    customEdge.id,
  );
  assert.equal(
    await evaluate("app.plugins.plugins['thought-craft'].workspaces.getActive().id"),
    'the-last-train',
  );
  checks.push(
    'Workspace relation Appears in is configured in the manager, created by keyboard with source/target filtering, stored in the existing YAML shape and resolved in outgoing/incoming after restart.',
  );

  await openWorkspaceManager('The Last Train');
  await workspaceDetail().getByRole('button', { name: 'Appears in', exact: true }).click();
  await workspaceDialog()
    .locator('.tc-schema-form')
    .getByLabel('Relation name', { exact: true })
    .fill('Present in scene');
  await workspaceDialog()
    .locator('.tc-schema-form')
    .getByRole('button', { name: 'Save relation type', exact: true })
    .click();
  await workspaceDialog().locator('.tc-schema-form').waitFor({ state: 'detached' });
  await closeWorkspaceManager();
  await activeFocus().getByText('Present in scene · Scene', { exact: true }).waitFor();
  const characterBytes = await readFile(join(vault, character.filePath), 'utf8');
  await rejectedRelation(location.id, scene.id, 'appears-in', /unavailable/);
  await rejectedRelation(character.id, location.id, 'appears-in', /target/);
  assert.equal(await readFile(join(vault, character.filePath), 'utf8'), characterBytes);
  await createWorkspace('Product Lab', ['Scene']);
  await switchWorkspace('product-lab');
  await capture('A product question');
  const productIdea = await findEntity('A product question');
  const productScene = await createDerived(
    productIdea.id,
    'scene',
    'Product scenario',
    'A target in another workspace.',
  );
  await rejectedRelation(character.id, productScene.id, 'appears-in', /same workspace/);
  await addRelation(character, productScene, 'related-to');
  await waitForRelations(character.id, 3);
  const universal = (await getEntity(character.id)).relations.find(
    (relation) => relation.type === 'related-to',
  );
  await rename(join(vault, productScene.filePath), join(vault, 'Renamed product scenario.md'));
  await page.waitForFunction(
    (id) =>
      window.app.plugins.plugins['thought-craft'].entityIndex.getById(id)?.title ===
      'Renamed product scenario',
    productScene.id,
  );
  await activeFocus()
    .getByRole('button', { name: 'Renamed product scenario', exact: true })
    .waitFor();
  await unlink(join(vault, 'Renamed product scenario.md'));
  await activeFocus().getByText('Unavailable target', { exact: true }).waitFor();
  await removeRelation(character.id, universal.id);
  checks.push(
    'Label rename preserves relation type ID. Invalid source, target and cross-workspace custom links are rejected by repository calls without writes. Universal cross-workspace links survive target rename/delete and can be explicitly removed.',
  );

  await openWorkspaceManager('The Last Train');
  await workspaceDetail().getByRole('button', { name: 'Present in scene', exact: true }).click();
  await workspaceDialog()
    .locator('.tc-schema-form')
    .getByLabel('Retired (existing links remain)', { exact: true })
    .check();
  await workspaceDialog()
    .locator('.tc-schema-form')
    .getByRole('button', { name: 'Save relation type', exact: true })
    .click();
  await workspaceDialog().locator('.tc-schema-form').waitFor({ state: 'detached' });
  await closeWorkspaceManager();
  await openFocus(character.id);
  await activeFocus().getByText('Retired relation type', { exact: true }).waitFor();
  await activeFocus().getByRole('button', { name: '+ Add relation', exact: true }).click();
  assert.equal(await page.locator('.tc-add-relation-modal option[value="appears-in"]').count(), 0);
  await page.keyboard.press('Escape');

  const manualEdgeId = 'c58c7e2c-1dc6-442e-80bd-40801e231046';
  const characterPath = join(vault, character.filePath);
  const beforeManualEdge = await readFile(characterPath, 'utf8');
  await writeFile(
    characterPath,
    beforeManualEdge.replace(
      'bs_relations:\n',
      `bs_relations:\n  - id: ${manualEdgeId}\n    type: appears-in\n    target_entity_id: ${productIdea.id}\n    created_at: '2026-10-29T00:00:00.000Z'\n`,
    ),
  );
  await activeFocus()
    .getByText('Custom relations require the same workspace.', { exact: true })
    .waitFor();
  assert.equal((await getEntity(character.id)).relations.length, 3);
  await removeRelation(character.id, manualEdgeId);
  assert.equal(markdownBody(await readFile(characterPath, 'utf8')), markdownBody(beforeManualEdge));
  checks.push(
    'An externally inserted cross-workspace custom edge stays indexed, resolves its target, shows an incompatibility and can be explicitly removed without changing the body.',
  );

  const unknownId = '7631b173-505e-4a2f-b19e-d31e3aab8816';
  const unknownEdgeId = 'e2c1b5b7-8856-42f4-a958-63ac4944b441';
  const unknownBytes = `---\nbs_id: ${unknownId}\nbs_type: character\nbs_workspace: lost-project\nbs_status: exploring\nbs_created: '2026-10-28T09:15:00.000Z'\nbs_updated: '2026-10-28T09:15:00.000Z'\nbs_relations:\n  - id: ${unknownEdgeId}\n    type: betrayed-by\n    target_entity_id: ${scene.id}\n    created_at: '2026-10-28T09:15:00.000Z'\n---\n\nUnknown context body.\n`;
  await writeFile(join(vault, 'Unknown workspace.md'), unknownBytes);
  await findEntity('Unknown workspace');
  await openFocus(unknownId);
  await activeFocus()
    .getByText('Workspace · Unknown Workspace: lost-project', { exact: true })
    .waitFor();
  await activeFocus().getByText('Unknown relation: betrayed-by · Scene', { exact: true }).waitFor();
  assert.equal(await readFile(join(vault, 'Unknown workspace.md'), 'utf8'), unknownBytes);
  await page.screenshot({ path: join(run, 'unknown-context.png') });
  await removeRelation(unknownId, unknownEdgeId);
  assert.match(await readFile(join(vault, 'Unknown workspace.md'), 'utf8'), /Unknown context body/);
  checks.push(
    'Retired custom relation stays readable and leaves new choices. Unknown Workspace and relation remain usable and preserved with resolved UUID target; explicit removal works.',
  );

  await openWorkspaceManager('Product Lab');
  await workspaceDetail().getByRole('button', { name: 'Retire workspace', exact: true }).click();
  await page.waitForFunction(
    () => window.app.plugins.plugins['thought-craft'].workspaces.getActive().id === 'default',
  );
  await closeWorkspaceManager();
  await switchWorkspace('default');
  assert.equal(
    await page.locator('select[aria-label="Active workspace"] option[value="product-lab"]').count(),
    0,
  );
  await openFocus(productIdea.id);
  await activeFocus().getByText('Workspace · Product Lab · Retired', { exact: true }).waitFor();
  await openWorkspaceManager('The Last Train');
  await workspaceDetail().getByLabel('Name', { exact: true }).fill('The Last Train — Novel');
  await workspaceDetail().getByRole('button', { name: 'Save workspace', exact: true }).click();
  await workspaceDetail()
    .getByRole('heading', { name: 'The Last Train — Novel', exact: true })
    .waitFor();
  await closeWorkspaceManager();
  await switchWorkspace('the-last-train');
  await restartObsidian();
  await command('open-inbox');
  assert.equal(
    await page.getByLabel('Active workspace', { exact: true }).inputValue(),
    'the-last-train',
  );
  const saved = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(saved.activeWorkspaceId, 'the-last-train');
  assert.equal(
    saved.workspaces.find((workspace) => workspace.id === 'the-last-train').label,
    'The Last Train — Novel',
  );
  assert.equal(
    saved.workspaces.find((workspace) => workspace.id === 'the-last-train').relationTypes[0].id,
    'appears-in',
  );
  assert.equal(saved.workspaces.find((workspace) => workspace.id === 'product-lab').retired, true);
  assert.equal(saved.entities, undefined);
  assert.equal(await readFile(join(vault, 'Old M3 idea.md'), 'utf8'), oldBytes);
  assert.equal(
    markdownBody(await readFile(join(vault, project.filePath), 'utf8')),
    markdownBody(projectBytes),
  );
  await page.screenshot({ path: join(run, 'workspace-inbox-light.png') });
  await page.evaluate(() => {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  });
  await delay(250);
  await page.screenshot({ path: join(run, 'workspace-inbox-dark.png') });
  await openFocus(character.id);
  await page.screenshot({ path: join(run, 'workspace-focus-dark.png') });
  assert.deepEqual(pluginErrors, []);
  await openWorkspaceManager('The Last Train — Novel');
  await page.screenshot({ path: join(run, 'workspace-manager-dark.png') });
  await closeWorkspaceManager();
  checks.push(
    'Active workspace retirement falls back persistently to Default; existing retired-workspace entities remain readable. Workspace label rename keeps its ID. Final restart restores context, memberships and retired relation definitions; old notes retain exact bytes. Light/dark hierarchy and Focus action affordances remain intact.',
  );

  const report = {
    result: 'passed',
    checks,
    appVersion: (await page.title()).match(/Obsidian ([\d.]+)/)?.[1],
    vault,
    screenshots: [
      'workspace-empty.png',
      'workspace-manager.png',
      'relation-definition.png',
      'custom-relation-picker.png',
      'unknown-context.png',
      'workspace-inbox-light.png',
      'workspace-inbox-dark.png',
      'workspace-focus-dark.png',
      'workspace-manager-dark.png',
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
