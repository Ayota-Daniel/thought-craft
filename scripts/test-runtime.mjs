import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Seed only the app runtime cache, never vault settings or plugin data.
 * The system launcher embeds 1.14.4; an unseeded profile otherwise updates midway
 * through a scenario, making its final window title misleading as coverage evidence.
 */
export async function pinTestRuntime(profile) {
  const source = process.env.THOUGHTCRAFT_TEST_RUNTIME_ASAR;
  if (!source) return;
  await mkdir(profile, { recursive: true });
  await copyFile(resolve(source), join(profile, 'obsidian-1.14.5.asar'));
}

export function requireCandidateRuntime() {
  if (!process.env.THOUGHTCRAFT_TEST_RUNTIME_ASAR) {
    throw new Error(
      'Set THOUGHTCRAFT_TEST_RUNTIME_ASAR to the verified Obsidian 1.14.5 runtime ASAR before RC1 native tests.',
    );
  }
}
