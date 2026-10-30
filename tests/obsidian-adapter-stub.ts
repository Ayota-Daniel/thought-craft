/** Minimal adapter contract for fault-injection tests, not an Obsidian emulator.
 * Real YAML, body preservation, native file APIs and UI are covered by native suites.
 */
export class TFile {
  extension = 'md';
  constructor(public path: string) {}
}
export class TFolder {}
export function getFrontMatterInfo(content: string) {
  return { exists: true, frontmatter: content };
}
export function parseYaml(content: string): unknown {
  return JSON.parse(content);
}
export function normalizePath(path: string): string {
  return path;
}
