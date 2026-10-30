// Reproducible in-process projections, independent of Obsidian and filesystem timing.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const run = resolve('.artifacts', `m10-performance-${Date.now()}`);
await mkdir(run, { recursive: true });
const bundle = await build({
  stdin: {
    contents: [
      "export { EntityIndex } from './src/infrastructure/entity-index';",
      "export { projectPlot } from './src/application/plot-query';",
      "export { projectPlotThreads, threadAssociations } from './src/application/plot-threads';",
      "export { planNarrativeMove } from './src/application/plot-ordering';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { EntityIndex, projectPlot, projectPlotThreads, threadAssociations, planNarrativeMove } =
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
  );
function id(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}
function entity(number, type) {
  return {
    id: id(number),
    type,
    workspaceId: 'default',
    title: `${type} ${number}`,
    filePath: `${number}.md`,
    status: 'exploring',
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
    properties: [],
    propertyIssues: [],
    relations: [],
    relationIssues: [],
    schemaValues: undefined,
  };
}
function dataset(sceneCount, threadCount) {
  const sections = Array.from({ length: 5 }, (_, n) => ({
    ...entity(10000 + n, 'story-section'),
    story: { sectionId: null, order: n * 1000, issues: [], raw: {} },
  }));
  const threads = Array.from({ length: threadCount }, (_, n) => entity(20000 + n, 'plot-thread'));
  const scenes = Array.from({ length: sceneCount }, (_, n) => ({
    ...entity(n + 1, 'scene'),
    story:
      n % 10 ? { sectionId: sections[n % 5].id, order: n * 1000, issues: [], raw: {} } : undefined,
    relations: [0, 1, 2].map((offset) => ({
      id: id(30000 + n * 3 + offset),
      type: 'related-to',
      targetEntityId: threads[(n + offset) % threadCount].id,
      createdAt: '2026-10-30T00:00:00Z',
    })),
  }));
  return { sections, threads, scenes, entities: [...sections, ...scenes, ...threads] };
}
function measure(operation) {
  for (let n = 0; n < 10; n++) operation();
  const times = [];
  for (let n = 0; n < 50; n++) {
    const start = performance.now();
    operation();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    medianMs: +times[25].toFixed(3),
    p95Ms: +times[47].toFixed(3),
    maxMs: +times[49].toFixed(3),
  };
}
const cases = [];
for (const [sceneCount, threadCount] of [
  [20, 5],
  [100, 40],
  [500, 100],
]) {
  const fixture = dataset(sceneCount, threadCount);
  const index = new EntityIndex();
  fixture.entities.forEach((item) => index.upsert(item));
  const metrics = {
    indexLoad: measure(() => {
      const fresh = new EntityIndex();
      fixture.entities.forEach((item) => fresh.upsert(item));
    }),
    plot: measure(() => projectPlot(index, 'default')),
    threads: measure(() => projectPlotThreads(index, 'default')),
    // The current Plot render does both projections plus membership lookups per Scene.
    plotRenderQueries: measure(() => {
      projectPlot(index, 'default');
      const threads = projectPlotThreads(index, 'default');
      fixture.scenes.forEach((scene) => {
        threads.filter(({ entity }) => threadAssociations(scene, entity).length);
        threads.slice(0, 3).some(({ entity }) => threadAssociations(scene, entity).length);
      });
    }),
    relationshipRefreshProjection: measure(() => {
      const changed = { ...fixture.scenes[0], relations: fixture.scenes[0].relations.slice(1) };
      index.upsert(changed);
      projectPlotThreads(index, 'default');
    }),
    searchPage: measure(() =>
      fixture.scenes.filter((scene) => scene.title.includes('1')).slice(0, 50),
    ),
    reorderPlan: measure(() =>
      planNarrativeMove(projectPlot(index, 'default').sections[0].scenes, fixture.scenes[1], null),
    ),
  };
  cases.push({ sceneCount, threadCount, metrics });
}
const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  platform: process.platform,
  method:
    '10 warmups, 50 synchronous samples; synthetic 5 Sections, 10% Unplaced, 3 Related to memberships/Scene. No disk/UI timings.',
  cases,
};
await writeFile(resolve(run, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Evidence: ' + run);
