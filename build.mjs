// Build script: bundles server (dist/) and client (public/js/) with esbuild.
//   node build.mjs          → build once
//   node build.mjs --watch  → rebuild on change + auto-restart server (dev)
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';

const watch = process.argv.includes('--watch');

const clientOptions = {
  entryPoints: {
    landing: 'src/client/landing.ts',
    host: 'src/client/host/main.ts',
    player: 'src/client/player/main.ts',
  },
  outdir: 'public/js',
  bundle: true,
  format: 'esm',
  target: ['es2020', 'safari15', 'chrome90'],
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
};

const serverOptions = {
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  sourcemap: watch,
  logLevel: 'info',
};

if (!watch) {
  await Promise.all([esbuild.build(clientOptions), esbuild.build(serverOptions)]);
} else {
  const client = await esbuild.context(clientOptions);
  const server = await esbuild.context(serverOptions);
  await Promise.all([client.rebuild(), server.rebuild()]);
  await Promise.all([client.watch(), server.watch()]);
  spawn(process.execPath, ['--watch', '--disable-warning=ExperimentalWarning', '--enable-source-maps', 'dist/server.js'], {
    stdio: 'inherit',
  });
}
