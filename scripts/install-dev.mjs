import { copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const vaultArg = process.argv[2];
if (!vaultArg) throw new Error('Usage: npm run install:dev -- /absolute/path/to/test-vault');
const source = fileURLToPath(new URL('../', import.meta.url));
const vault = resolve(vaultArg);
if (!(await stat(vault)).isDirectory())
  throw new Error('The test vault must be an existing directory.');
const configFolder = process.argv[3] ?? '.obsidian';
if (!configFolder || /[/\\]/.test(configFolder) || ['.', '..'].includes(configFolder)) {
  throw new Error('Pass the configuration folder name, not a path.');
}
const destination = join(vault, configFolder, 'plugins', 'thought-craft');
await mkdir(destination, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(join(source, file), join(destination, file));
}
console.log(`Installed development plugin in ${destination}`);
console.log('Open the test vault in Obsidian and enable Thought Craft under Community plugins.');
