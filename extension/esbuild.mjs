import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const contexts = await Promise.all([
  esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: !production,
    minify: production,
    logLevel: 'info'
  }),
  esbuild.context({
    entryPoints: ['src/notebookRenderer.ts'],
    bundle: true,
    outfile: 'dist/notebookRenderer.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !production,
    minify: production,
    logLevel: 'info'
  })
]);

if (watch) {
  await Promise.all(contexts.map(context => context.watch()));
} else {
  await Promise.all(contexts.map(context => context.rebuild()));
  await Promise.all(contexts.map(context => context.dispose()));
}
