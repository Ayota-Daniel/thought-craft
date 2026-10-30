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
const run = resolve(root, '.artifacts', `m9-${Date.now()}`);
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

const firstSection = idFor(1001);
const secondSection = idFor(1002);
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
  return readFile(join(vault, `${titleFor(number)}.md`), 'utf8');
}
try {
  const originals = new Map();
  for (let number = 1; number <= 107; number++) {
    const placement =
      number <= 104
        ? `bs_story:\n  section_id: ${number <= 70 ? firstSection : secondSection}\n  order: ${number * 1000}\n  user_order: keep\n`
        : '';
    const existingRelation =
      number === 1
        ? `bs_relations:\n  - id: c58c7e2c-1dc6-442e-80bd-40801e231046\n    type: related-to\n    target_entity_id: ${idFor(2)}\n    created_at: '2026-10-29T00:00:00Z'\n`
        : '';
    const content = `---\nbs_id: ${idFor(number)}\nbs_type: scene\nbs_workspace: default\nbs_status: exploring\nbs_created: '2026-10-29T00:00:00Z'\nbs_updated: '2026-10-29T00:00:00Z'\nuser_flag: keep\nbs_properties:\n  note:\n    label: Note\n    type: text\n    value: keep\nbs_schema_values:\n  importance: 4\n${placement}${existingRelation}---\n\nBody ${number}.  \n\n---\nPreserve exactly.\n`;
    await writeFile(join(vault, `${titleFor(number)}.md`), content);
    originals.set(number, content);
  }
  for (const [id, title, order] of [
    [firstSection, 'Act I', 1000],
    [secondSection, 'Act II', 2000],
  ]) {
    await writeFile(
      join(vault, `${title}.md`),
      `---\nbs_id: ${id}\nbs_type: story-section\nbs_workspace: default\nbs_status: exploring\nbs_created: '2026-10-29T00:00:00Z'\nbs_updated: '2026-10-29T00:00:00Z'\nbs_story:\n  order: ${order}\n---\n\nSection notes.\n`,
    );
  }
  const initialBoard = {
    workspaceId: 'default',
    nodes: { [idFor(1)]: { x: 80, y: 80 }, [idFor(2)]: { x: 400, y: 80 } },
    groups: [],
    viewport: { x: 20, y: 10, zoom: 0.8 },
  };
  await writeFile(
    join(pluginFolder, 'data.json'),
    JSON.stringify({
      configVersion: 8,
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
          enabledEntityTypeIds: [
            'idea',
            'scene',
            'character',
            'location',
            'plot-thread',
            'story-section',
          ],
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
  await expandThreads();
  await panel()
    .getByText(/No Plot Threads yet/)
    .waitFor();
  await shot('threads-empty-dark.png');
  for (let number = 1; number <= 107; number++)
    assert.equal(await markdown(number), originals.get(number));
  assert.equal(
    JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8')).configVersion,
    8,
  );
  checks.push(
    'Existing v8 Story opens with 107 Scenes and unchanged exact Markdown. No migration, mandatory threads or auto-structure. Empty feature does not block Plot.',
  );

  const mystery = await createThread('The Missing Artifact');
  const relationship = await createThread('Maya and Eli');
  const conspiracy = await createThread('The Royal Conspiracy');
  assert.equal(mystery.type, 'plot-thread');
  assert.equal(mystery.story, undefined);
  assert.ok(mystery.filePath.includes('Plot Threads'));
  await membership(1, mystery.title);
  await membership(1, relationship.title);
  assert.equal((await entity(idFor(1))).relations.length, 3);
  const rankedBefore = (await entity(idFor(1))).story.raw;
  assert.deepEqual(rankedBefore, { section_id: firstSection, order: 1000, user_order: 'keep' });
  const firstBody = originals.get(1).split('\n---\n').slice(1).join('\n---\n');
  assert.equal((await markdown(1)).split('\n---\n').slice(1).join('\n---\n'), firstBody);
  assert.equal((await entity(idFor(1))).properties[0].value, 'keep');
  assert.deepEqual(await snapshot(), initialBoard);
  const metadata = await evaluate(
    `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('${titleFor(1)}.md')).frontmatter`,
  );
  assert.equal(metadata.user_flag, 'keep');
  assert.deepEqual(metadata.bs_schema_values, { importance: 4 });
  assert.equal(metadata.bs_relations[0].target_entity_id, idFor(2));
  assert.equal(metadata.bs_story.user_order, 'keep');
  await card(idFor(1))
    .locator('.tc-scene-threads')
    .getByText(mystery.title, { exact: true })
    .waitFor();
  await card(idFor(1))
    .locator('.tc-scene-threads')
    .getByText(relationship.title, { exact: true })
    .waitFor();
  await shot('multi-thread-scene-dark.png');
  await membership(1, conspiracy.title);
  await card(idFor(1)).locator('.tc-scene-threads').getByText('+1', { exact: true }).waitFor();
  assert.match(
    await card(idFor(1)).locator('.tc-scene-threads').getAttribute('title'),
    /The Royal Conspiracy/,
  );
  await membership(1, conspiracy.title, false);
  await membership(1, relationship.title, false);
  assert.equal((await entity(idFor(1))).relations.length, 2);
  await membership(1, relationship.title);
  // Existing incoming generic edges count too, with no reverse duplicate on Add.
  await action(
    `${plugin}.repository.addRelation('${mystery.id}',{type:'related-to',targetEntityId:'${idFor(72)}'})`,
  );
  await membership(107, mystery.title);
  await membership(2, conspiracy.title);
  await search('');
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .check();
  const progression = panel().getByRole('region', {
    name: `Progression of ${mystery.title}`,
    exact: true,
  });
  assert.deepEqual(
    await progression.locator('ol button').filter({ hasNotText: 'Write' }).allTextContents(),
    [titleFor(1), titleFor(72)],
  );
  await progression
    .getByRole('heading', { name: 'Unplaced · no narrative position', exact: true })
    .waitFor();
  await progression.getByRole('button', { name: titleFor(107), exact: true }).waitFor();
  assert.equal(
    await card(idFor(1)).evaluate((el) => el.classList.contains('is-thread-highlighted')),
    true,
  );
  assert.equal(await card(idFor(2)).isVisible(), true);
  await panel().getByRole('combobox', { name: 'Thread view mode' }).selectOption('filter');
  await card(idFor(2)).waitFor({ state: 'detached' });
  await plot()
    .getByText(/Filtering: non-matching scenes are hidden/)
    .waitFor();
  const conspiracyCheckbox = panel().getByRole('checkbox', {
    name: `Select thread ${conspiracy.title}`,
    exact: true,
  });
  await conspiracyCheckbox.focus();
  await page.keyboard.press('Space');
  await card(idFor(2)).waitFor();
  assert.equal(await conspiracyCheckbox.isChecked(), true);
  assert.equal(await conspiracyCheckbox.evaluate((el) => el === document.activeElement), true);
  await shot('threads-filter-dark.png');
  await panel().getByRole('button', { name: 'Show full Plot', exact: true }).click();
  await card(idFor(3)).waitFor();
  assert.equal(await panel().getByRole('checkbox', { checked: true }).count(), 0);
  checks.push(
    'Native creation uses generic Focus with Back to Plot. One Scene gains two memberships; removal preserves the other and all unrelated content. Incoming edges work. Highlight, filter, multi-selection, keyboard Space, reset and cross-Section/Unplaced progression are verified.',
  );

  // Add failure must leave the actual UI and Markdown unchanged.
  await search(titleFor(3));
  await menu(idFor(3), 'Plot Threads…');
  await evaluate(
    `window.tcOriginalAdd=${plugin}.repository.addRelation.bind(${plugin}.repository); ${plugin}.repository.addRelation=()=>new Promise((resolve,reject)=>{window.tcRejectAdd=reject;}); true`,
  );
  await panel()
    .getByRole('button', { name: `Add ${mystery.title} to ${titleFor(3)}`, exact: true })
    .click();
  assert.equal(
    await panel()
      .getByRole('button', { name: `Add ${mystery.title} to ${titleFor(3)}`, exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await plot().getAttribute('aria-busy'), 'true');
  await evaluate("window.tcRejectAdd(new Error('M9 simulated write failure')); true");
  await plot().getByRole('alert').filter({ hasText: 'M9 simulated write failure' }).waitFor();
  assert.equal((await entity(idFor(3))).relations.length, 0);
  assert.equal(await markdown(3), originals.get(3));
  await evaluate(`${plugin}.repository.addRelation=window.tcOriginalAdd; true`);
  await panel().getByRole('button', { name: 'Done', exact: true }).click();
  await membership(3, mystery.title);
  await membership(3, mystery.title, false);
  // Direct generic repository duplicate prevention remains authoritative at commit.
  await evaluate(
    `window.tcDuplicate='pending'; ${plugin}.repository.addRelation('${idFor(1)}',{type:'related-to',targetEntityId:'${mystery.id}'}).then(()=>window.tcDuplicate='unexpected',error=>window.tcDuplicate=error.message); true`,
  );
  await page.waitForFunction(() => window.tcDuplicate !== 'pending');
  assert.match(await evaluate('window.tcDuplicate'), /already exists/);
  // Add the opposite direction, then simulate the second of two removals failing.
  await action(
    `${plugin}.repository.addRelation('${mystery.id}',{type:'related-to',targetEntityId:'${idFor(1)}'})`,
  );
  await search(titleFor(1));
  await menu(idFor(1), 'Plot Threads…');
  await evaluate(
    `window.tcOriginalRemove=${plugin}.repository.removeRelation.bind(${plugin}.repository); window.tcRemoveCount=0; ${plugin}.repository.removeRelation=(...args)=>++window.tcRemoveCount===2?Promise.reject(new Error('M9 second write failed')):window.tcOriginalRemove(...args); true`,
  );
  await panel()
    .getByRole('button', { name: `Remove ${mystery.title} from ${titleFor(1)}`, exact: true })
    .click();
  await plot()
    .getByRole('alert')
    .filter({
      hasText: 'Removed 1 of 2 related links with confirmed refresh. M9 second write failed',
    })
    .waitFor();
  assert.equal(
    (await entity(idFor(1))).relations.some((r) => r.targetEntityId === mystery.id),
    false,
  );
  assert.equal(
    (await entity(mystery.id)).relations.some((r) => r.targetEntityId === idFor(1)),
    true,
  );
  await evaluate(`${plugin}.repository.removeRelation=window.tcOriginalRemove; true`);
  await panel()
    .getByRole('button', { name: `Remove ${mystery.title} from ${titleFor(1)}`, exact: true })
    .click();
  await plot().getByRole('status').filter({ hasText: 'Thread associations saved.' }).waitFor();
  await panel()
    .getByRole('button', { name: `Add ${mystery.title} to ${titleFor(1)}`, exact: true })
    .click();
  await plot().getByRole('status').filter({ hasText: 'Thread associations saved.' }).waitFor();
  await panel().getByRole('button', { name: 'Done', exact: true }).click();
  checks.push(
    'Write rejection yields an explicit alert and no false membership/success. A two-direction removal failing on its second write reports 1 of 2, retains actual remaining membership, and supports explicit retry. Duplicate requests are rejected by the existing mapper.',
  );

  // Filtered movement still uses full M8 sequences; membership and spatial board are untouched.
  await search('');
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .check();
  await panel().getByRole('combobox', { name: 'Thread view mode' }).selectOption('filter');
  await panel().locator('summary').click();
  const relationsBeforeMove = (await entity(idFor(1))).relations;
  await page.setViewportSize({ width: 1440, height: 1500 });
  await nativeDrag(card(idFor(1)), section(secondSection).locator('.tc-plot-drop-end'));
  await waitPlacement(idFor(1), secondSection);
  assert.deepEqual((await entity(idFor(1))).relations, relationsBeforeMove);
  assert.deepEqual(await snapshot(), initialBoard);
  await menu(idFor(1), 'Move earlier');
  await expandThreads();
  assert.deepEqual(
    await progression.locator('ol button').filter({ hasNotText: 'Write' }).allTextContents(),
    [titleFor(72), titleFor(1)],
  );
  // Native Write and generic Focus use the same underlying Scene.
  await progression.getByRole('button', { name: titleFor(1), exact: true }).click();
  await focus()
    .getByRole('heading', { name: titleFor(1), exact: true })
    .waitFor();
  await focus().getByRole('button', { name: 'Back to Story · Plot', exact: true }).click();
  await panel()
    .getByRole('button', { name: `Open thread ${mystery.title} in Focus`, exact: true })
    .click();
  await focus().getByRole('heading', { name: mystery.title, exact: true }).waitFor();
  await focus().getByRole('button', { name: 'Open Markdown note', exact: true }).click();
  assert.equal(await evaluate('app.workspace.activeEditor?.file?.basename'), mystery.title);
  await openPlot();
  await expandThreads();
  await panel().getByRole('button', { name: 'Show full Plot', exact: true }).click();
  checks.push(
    'Actual pointer movement under a thread filter and native earlier action preserve relationships and independent Brainstorm coordinates. Progression follows the new canonical order. Thread/Scene Focus, Back and native Markdown editing reuse existing navigation.',
  );

  // External Markdown edits update the index; missing links remain recoverable in Focus.
  const externalEdge = [
    'bs_relations:',
    `  - id: ${idFor(3000)}`,
    '    type: related-to',
    `    target_entity_id: ${mystery.id}`,
    '    created_at: "2026-10-30T00:00:00Z"',
    '',
  ].join('\n');
  await action(`(async()=>{
    const file=app.vault.getAbstractFileByPath('${titleFor(5)}.md');
    const text=await app.vault.read(file);
    await app.vault.modify(file,text.replace(${JSON.stringify('\n---\n')},${JSON.stringify('\n' + externalEdge + '---\n')}));
  })()`);
  await card(idFor(5))
    .locator('.tc-scene-threads')
    .getByText(mystery.title, { exact: true })
    .waitFor();
  await panel()
    .getByRole('checkbox', { name: `Select thread ${relationship.title}`, exact: true })
    .check();
  await action(`${plugin}.repository.trashEntity('${relationship.id}')`);
  await card(idFor(1))
    .getByText('Unavailable or invalid related links · inspect in Focus', { exact: true })
    .waitFor();
  await card(idFor(2)).waitFor();
  assert.equal(await panel().getByRole('checkbox', { checked: true }).count(), 0);
  assert.equal(
    (await entity(idFor(1))).relations.some((r) => r.targetEntityId === relationship.id),
    true,
  );
  await action(
    `${plugin}.repository.addRelation('${mystery.id}',{type:'related-to',targetEntityId:'${idFor(4)}'})`,
  );
  await action(`${plugin}.repository.trashEntity('${idFor(4)}')`);
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .check();
  await progression.getByText(/Unavailable or invalid related links/).waitFor();

  // Many ordinary Plot Thread entities, not a new membership store.
  await action(
    `(async()=>{for(let n=1;n<=37;n++) await ${plugin}.repository.createEntity({id:crypto.randomUUID(),type:'plot-thread',title:'Thread '+String(n).padStart(2,'0'),content:'',workspaceId:'default',createdAt:new Date().toISOString(),relations:[]});})()`,
  );
  await panel().getByText('Showing 1–25 of 39', { exact: true }).waitFor();
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill('Thread 37');
  await panel().getByRole('checkbox', { name: 'Select thread Thread 37', exact: true }).waitFor();
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill('No such thread');
  await panel().getByText('No matching threads.', { exact: true }).waitFor();
  await panel().getByRole('searchbox', { name: 'Search Plot Threads' }).fill('');
  await shot('threads-progression-dark.png');
  await theme('light');
  await shot('threads-progression-light.png');
  await page.setViewportSize({ width: 760, height: 900 });
  await evaluate('app.workspace.leftSplit.expand(); true');
  await panel().scrollIntoViewIfNeeded();
  await theme('dark');
  await shot('threads-narrow-dark.png');
  await theme('light');
  await shot('threads-narrow-light.png');
  assert.equal(await plot().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await panel().getByRole('button', { name: 'Understanding Plot Threads', exact: true }).click();
  const guide = page.locator('.tc-guide-modal');
  await guide.getByRole('heading', { name: 'Plot Threads', exact: true }).waitFor();
  await guide
    .getByRole('heading', { name: 'One scene, several developments', exact: true })
    .waitFor();
  await guide.getByText(/Maya finds a clue/).waitFor();
  await shot('threads-guide-light.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await evaluate('app.workspace.leftSplit.collapse(); true');
  checks.push(
    'Missing/deleted references remain visible as unavailable links without deleting surviving relations. A 39-Thread dataset uses search and paging; initial 107 Scenes remain usable. Light/dark/narrow screenshots, no horizontal clipping, and the concept-first contextual Guide are verified.',
  );

  // Isolate a second Workspace and exercise commit-time contextual scope.
  await action(`${plugin}.workspaces.create({id:'other',label:'Other Story'})`);
  const other = await evaluate(`${plugin}.workspaces.getAll().find(w=>w.label==='Other Story')`);
  await action(
    `${plugin}.workspaces.update('${other.id}',{enabledExperiences:['story'],enabledEntityTypeIds:['idea','scene','plot-thread','story-section']})`,
  );
  await action(
    `${plugin}.repository.createEntity({id:'${idFor(2000)}',type:'plot-thread',title:'Foreign thread',content:'',workspaceId:'${other.id}',createdAt:new Date().toISOString(),relations:[]})`,
  );
  await evaluate(
    `window.tcScope='pending'; ${plugin}.repository.addRelation('${idFor(1)}',{type:'related-to',targetEntityId:'${idFor(2000)}'},{workspaceId:'default',sourceType:'scene',targetType:'plot-thread'}).then(()=>window.tcScope='unexpected',error=>window.tcScope=error.message); true`,
  );
  await page.waitForFunction(() => window.tcScope !== 'pending');
  assert.match(await evaluate('window.tcScope'), /changed type or Workspace/);
  await action(`${plugin}.workspaces.setActive('${other.id}')`);
  await openPlot();
  await expandThreads();
  await panel()
    .getByRole('checkbox', { name: 'Select thread Foreign thread', exact: true })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
      .count(),
    0,
  );
  assert.equal(await plot().locator('.tc-plot-scene').count(), 0);
  await action(`${plugin}.workspaces.setActive('default')`);
  await openPlot();
  await expandThreads();
  const finalRelations = (await entity(idFor(1))).relations;
  const finalPlacement = (await entity(idFor(1))).story.raw;
  const finalBoard = await snapshot();
  const unchanged = await markdown(10);
  assert.equal(unchanged, originals.get(10));
  await stop();
  await launch();
  await page.waitForFunction(() =>
    window.app.plugins.plugins['thought-craft'].entityIndex.isReady(),
  );
  await openPlot();
  await expandThreads();
  assert.deepEqual((await entity(idFor(1))).relations, finalRelations);
  assert.deepEqual((await entity(idFor(1))).story.raw, finalPlacement);
  assert.deepEqual(await snapshot(), finalBoard);
  assert.equal(await markdown(10), unchanged);
  const config = JSON.parse(await readFile(join(pluginFolder, 'data.json'), 'utf8'));
  assert.equal(config.configVersion, 8);
  assert.equal(config.user_setting, 'keep');
  assert.equal(config.plotThreads, undefined);
  assert.equal(config.threadMembership, undefined);
  await panel()
    .getByRole('checkbox', { name: `Select thread ${mystery.title}`, exact: true })
    .check();
  await panel()
    .getByRole('region', { name: `Progression of ${mystery.title}` })
    .getByRole('button', { name: titleFor(1), exact: true })
    .waitFor();
  assert.deepEqual(pluginErrors, []);
  checks.push(
    'Workspace discovery and writes are isolated, including commit-time rejection of a cross-Workspace association. Restart restores generic associations, bs_story ranks, unknown fields and Brainstorm state; untouched notes remain byte-identical. Configuration stays v8 with no membership JSON or renderer errors.',
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
