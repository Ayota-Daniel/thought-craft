// Reconstruct the actual M7 source revision for upgrade testing; this is not a historical release binary.
import { execFileSync } from 'node:child_process';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve('.');
const revision = execFileSync('git', ['rev-parse', 'f1bf711^{commit}'], {
  encoding: 'utf8',
}).trim();
const artifact = join(root, '.artifacts', 'm11-historical-m7');
const source = join(artifact, 'source');
await mkdir(source, { recursive: true });
const archive = join(artifact, 'source.tar');
execFileSync('git', ['archive', revision, `--output=${archive}`]);
execFileSync('tar', ['-xf', archive, '-C', source]);
try {
  await symlink(join(root, 'node_modules'), join(source, 'node_modules'), 'dir');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
execFileSync('npm', ['run', 'build'], { cwd: source, stdio: 'inherit' });
await writeFile(
  join(artifact, 'provenance.json'),
  JSON.stringify(
    {
      revision,
      kind: 'actual M7 source rebuilt with currently installed dependencies',
      publishedBinary: false,
      node: process.version,
    },
    null,
    2,
  ),
);
console.log('Historical test source: ' + source);
