import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  await runTests({
    extensionDevelopmentPath: repositoryRoot,
    extensionTestsPath: resolve(repositoryRoot, 'dist/test/suite/index.js'),
    launchArgs: ['--disable-extensions']
  });
} catch (error) {
  console.error('VS Code integration tests failed:', error);
  process.exitCode = 1;
}
