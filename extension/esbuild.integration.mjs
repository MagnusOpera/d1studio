import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['test/suite/index.ts'],
  bundle: true,
  outfile: 'dist/test/suite/index.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info'
});
