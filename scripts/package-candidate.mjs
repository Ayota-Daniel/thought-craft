import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const distributionFiles = ['main.js', 'manifest.json', 'styles.css'];
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateReleaseMetadata(manifest, packageInfo, versions) {
  for (const key of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      throw new Error(`Manifest needs a non-empty ${key}.`);
    }
  }
  if (manifest.id !== 'thought-craft' || packageInfo.name !== manifest.id) {
    throw new Error('Preserve the stable thought-craft plugin ID and matching package name.');
  }
  if (!versionPattern.test(manifest.version) || manifest.version !== packageInfo.version) {
    throw new Error('Manifest/package versions must match and use x.y.z, without an RC suffix.');
  }
  if (manifest.minAppVersion !== '1.14.5' || manifest.isDesktopOnly !== true) {
    throw new Error(
      'RC1 targets desktop Obsidian 1.14.5 or later; Linux is the verified platform.',
    );
  }
  if (versions[manifest.version] !== manifest.minAppVersion) {
    throw new Error('versions.json must match this candidate compatibility declaration.');
  }
  if (manifest.description.length > 250 || !manifest.description.endsWith('.')) {
    throw new Error('Use a short manifest description ending with a period.');
  }
  if (packageInfo.description !== manifest.description) {
    throw new Error('Keep package and manifest descriptions consistent.');
  }
}

export function auditProduction(main, styles, metafile) {
  for (const input of Object.keys(metafile.inputs)) {
    if (/(^|\/)(tests|scripts|\.artifacts)\//.test(input) || /\.development\./.test(input)) {
      throw new Error(`Unexpected development/test input in production: ${input}`);
    }
  }
  for (const output of Object.values(metafile.outputs)) {
    for (const dependency of output.imports) {
      if (dependency.external && dependency.path !== 'obsidian') {
        throw new Error(`Unexpected external runtime dependency: ${dependency.path}`);
      }
    }
  }
  for (const text of [main, styles]) {
    if (!text.includes('Thought Craft — bundled runtime dependency notices')) {
      throw new Error('Bundled dependency attribution is missing.');
    }
    if (/sourceMappingURL|\/home\/|\/Users\/|window\.tc|tcOriginal|debugger\s*;/.test(text)) {
      throw new Error('Production output contains a source map, local path or test/debug marker.');
    }
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Package exactly the three host assets. Reports and review notes stay outside the install folder. */
export async function createCandidate(root, outputRoot = join(root, '.artifacts', 'releases')) {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const packageInfo = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const versions = JSON.parse(await readFile(join(root, 'versions.json'), 'utf8'));
  validateReleaseMetadata(manifest, packageInfo, versions);
  const contents = await Promise.all(distributionFiles.map((file) => readFile(join(root, file))));
  const metafile = JSON.parse(
    await readFile(join(root, '.artifacts', 'production-metafile.json'), 'utf8'),
  );
  auditProduction(contents[0].toString(), contents[2].toString(), metafile);
  const files = distributionFiles.map((name, index) => ({
    name,
    bytes: contents[index].length,
    sha256: sha256(contents[index]),
  }));
  const digest = sha256(JSON.stringify(files));
  const destination = join(outputRoot, `story-v1-rc1-${digest.slice(0, 12)}`);
  const pluginDirectory = join(destination, manifest.id);
  await mkdir(pluginDirectory, { recursive: true });
  const normalizedTime = new Date('2000-01-01T00:00:00Z');
  for (let index = 0; index < distributionFiles.length; index++) {
    const path = join(pluginDirectory, distributionFiles[index]);
    await writeFile(path, contents[index]);
    await chmod(path, 0o644);
    await utimes(path, normalizedTime, normalizedTime);
  }
  const archive = join(destination, 'thought-craft-story-v1-rc1-local.zip');
  // -X omits machine-specific extra fields. UTC and fixed mtimes make ZIP metadata stable.
  execFileSync(
    'zip',
    ['-X', '-q', '-FS', archive, ...distributionFiles.map((file) => `${manifest.id}/${file}`)],
    {
      cwd: destination,
      env: { ...process.env, TZ: 'UTC' },
    },
  );
  const archiveSha256 = sha256(await readFile(archive));
  const report = {
    label: 'Story V1 RC1 — local only',
    version: manifest.version,
    minAppVersion: manifest.minAppVersion,
    isDesktopOnly: manifest.isDesktopOnly,
    verifiedPlatform: 'Linux',
    files,
    archiveSha256,
    publication: 'not authorized; final version and project license pending owner decision',
  };
  await writeFile(
    join(destination, 'candidate-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await writeFile(
    join(destination, 'SHA256SUMS'),
    `${archiveSha256}  ${archive.split('/').at(-1)}\n`,
  );
  return { archive, pluginDirectory, report };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await createCandidate(root);
  console.log(JSON.stringify(result, null, 2));
}
