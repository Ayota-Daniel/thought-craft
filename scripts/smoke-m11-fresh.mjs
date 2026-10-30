import { requireCandidateRuntime } from './test-runtime.mjs';
// Installs only files extracted from the local candidate ZIP, never source files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createCandidate, distributionFiles } from './package-candidate.mjs';

requireCandidateRuntime();
const root = resolve('.');
const candidate = await createCandidate(root);
const extraction = join(root, '.artifacts', `m11-package-install-${Date.now()}`);
await mkdir(extraction, { recursive: true });
const archiveEntries = execFileSync('unzip', ['-Z1', candidate.archive], { encoding: 'utf8' })
  .trim()
  .split('\n');
assert.deepEqual(
  archiveEntries.sort(),
  distributionFiles.map((file) => `thought-craft/${file}`).sort(),
);
execFileSync('unzip', ['-q', candidate.archive, '-d', extraction]);
const distribution = join(extraction, 'thought-craft');
assert.deepEqual((await readdir(distribution)).sort(), [...distributionFiles].sort());
for (const file of candidate.report.files) {
  const bytes = await readFile(join(distribution, file.name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
await writeFile(
  join(extraction, 'package-proof.json'),
  JSON.stringify(
    {
      archive: candidate.archive,
      sha256: candidate.report.archiveSha256,
      entries: archiveEntries,
      verifiedExtraction: true,
    },
    null,
    2,
  ),
);
const child = spawnSync(process.execPath, ['scripts/smoke-m10.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    THOUGHTCRAFT_DISTRIBUTION_DIR: distribution,
    THOUGHTCRAFT_FRESH_INSTALL: '1',
    THOUGHTCRAFT_VALIDATION_LABEL: 'm11-fresh',
  },
  stdio: 'inherit',
});
if (child.error) throw child.error;
if (child.status !== 0) process.exitCode = child.status ?? 1;
