import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve('frontend/src/ai');
async function inspect(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, file.name);
    if (file.isDirectory()) { await inspect(location); continue; }
    if (! /\.tsx?$/.test(file.name) || file.name.endsWith('.test.ts')) continue;
    const text = await readFile(location, 'utf8');
    for (const match of text.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(location), specifier);
        assert.ok(target.startsWith(root + path.sep), `${location} imports outside portable AI: ${specifier}`);
      }
      assert.ok(!specifier.startsWith('node:') && (!specifier.startsWith('react') || location.startsWith(path.join(root, 'ui') + path.sep)), `${location} has a host/runtime dependency`);
    }
    assert.ok(!text.includes('import.meta.env'), `${location} reads host environment directly`);
  }
}
await inspect(root);
// Verify portable and project entry points independently for browser compatibility.
await build({
  entryPoints: ['frontend/src/ai/index.ts', 'frontend/src/ai/ui/ChatPanel.tsx', 'frontend/src/features/trip-ai/index.ts'],
  outdir: 'ai-bundle-check', write: false, bundle: true, splitting: true,
  platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent',
});
console.log('AI module boundaries and browser bundles passed.');
