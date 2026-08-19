import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const extensionRoot = new URL('../', import.meta.url);
const source = new URL('../../CHANGELOG.md', import.meta.url);
const destination = new URL('CHANGELOG.md', extensionRoot);

await copyFile(source, destination);
console.log(`Copied ${fileURLToPath(source)} to ${fileURLToPath(destination)}.`);
