import { describe, expect, it } from 'vitest';
import { auditProduction, validateReleaseMetadata } from '../scripts/package-candidate.mjs';

const manifest = {
  id: 'thought-craft',
  name: 'Thought Craft',
  author: 'Thought Craft',
  version: '0.1.0',
  minAppVersion: '1.14.5',
  isDesktopOnly: true,
  description: 'Develop ideas and stories.',
};
const packageInfo = { name: 'thought-craft', version: '0.1.0', description: manifest.description };
const versions = { '0.1.0': '1.14.5' };
const notice = 'Thought Craft — bundled runtime dependency notices';
const metafile = {
  inputs: { 'src/main.ts': {}, 'node_modules/react/cjs/react.production.js': {} },
  outputs: { 'main.js': { imports: [{ path: 'obsidian', external: true }] } },
};

describe('local RC1 release validation', () => {
  it('accepts the explicit desktop contract without inventing a public version', () => {
    expect(() => validateReleaseMetadata(manifest, packageInfo, versions)).not.toThrow();
  });
  it.each([
    { id: 'new-id' },
    { version: '1.0.0-rc1' },
    { version: '1.0.0' },
    { minAppVersion: '1.5.0' },
    { isDesktopOnly: false },
    { description: 'Missing period' },
  ])('rejects conflicting release metadata: %j', (change) => {
    expect(() =>
      validateReleaseMetadata({ ...manifest, ...change }, packageInfo, versions),
    ).toThrow();
  });
  it('rejects non-semantic leading-zero versions even when package metadata agrees', () => {
    expect(() =>
      validateReleaseMetadata(
        { ...manifest, version: '01.0.0' },
        { ...packageInfo, version: '01.0.0' },
        { '01.0.0': '1.14.5' },
      ),
    ).toThrow('x.y.z');
  });
  it('rejects a stale versions.json entry', () => {
    expect(() => validateReleaseMetadata(manifest, packageInfo, { '0.1.0': '1.5.0' })).toThrow(
      'versions.json',
    );
  });
  it('accepts bundled runtime libraries and externalizes only Obsidian', () => {
    expect(() => auditProduction(notice, notice, metafile)).not.toThrow();
  });
  it.each([
    'scripts/smoke-m10.mjs',
    'tests/obsidian-adapter-stub.ts',
    'node_modules/react/cjs/react.development.js',
  ])('rejects development input %s', (input) => {
    expect(() =>
      auditProduction(notice, notice, { ...metafile, inputs: { [input]: {} } }),
    ).toThrow();
  });
  it.each([
    '//# sourceMappingURL=local.map',
    '/home/person/Projects/test',
    'window.tcProbe=1',
    'debugger;',
  ])('rejects instrumentation/path marker %s', (marker) => {
    expect(() => auditProduction(notice + marker, notice, metafile)).toThrow();
  });
  it('rejects an unbundled runtime dependency', () => {
    expect(() =>
      auditProduction(notice, notice, {
        ...metafile,
        outputs: { 'main.js': { imports: [{ path: 'react', external: true }] } },
      }),
    ).toThrow('runtime dependency');
  });
  it('rejects assets without bundled notices', () => {
    expect(() => auditProduction('', notice, metafile)).toThrow('attribution');
  });
});
