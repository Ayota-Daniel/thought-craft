import { requireCandidateRuntime } from './test-runtime.mjs';
// The candidate files and old snapshot are explicit inputs to a disposable-vault test.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createCandidate } from './package-candidate.mjs';

requireCandidateRuntime();
const root = resolve('.');
const candidate = await createCandidate(root);
const extraction = join(root, '.artifacts', `m11-upgrade-package-${Date.now()}`);
await mkdir(extraction, { recursive: true });
execFileSync('unzip', ['-q', candidate.archive, '-d', extraction]);
const snapshot = process.env.THOUGHTCRAFT_V8_FIXTURE;
if (!snapshot) throw new Error('Set THOUGHTCRAFT_V8_FIXTURE to a retained pre-M11 M10 test vault.');
for (const kind of ['historical-m7', 'v8']) {
  const child = spawnSync(process.execPath, ['scripts/smoke-m11-upgrade-case.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      THOUGHTCRAFT_DISTRIBUTION_DIR: join(extraction, 'thought-craft'),
      THOUGHTCRAFT_UPGRADE_KIND: kind,
      THOUGHTCRAFT_V8_FIXTURE: resolve(snapshot),
    },
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    process.exitCode = child.status ?? 1;
    break;
  }
}
