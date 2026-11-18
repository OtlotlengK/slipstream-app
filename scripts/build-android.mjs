import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.find((value) => value.startsWith('--env='));
const environment = arg?.slice('--env='.length);
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Specify --env=staging or --env=production. Release builds must explicitly select production.');
}

const output = path.join(root, 'www');
const excluded = new Set([
  '.git', '.github', '.vercel', 'node_modules', 'www', 'android', 'ios',
  'coverage', 'dist', '.next', '.turbo'
]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await cp(root, output, {
  recursive: true,
  filter: async (source) => {
    const relative = path.relative(root, source);
    if (!relative) return true;
    const first = relative.split(path.sep)[0];
    if (excluded.has(first)) return false;
    if (relative === 'package.json' || relative === 'package-lock.json' || relative === 'capacitor.config.ts') return false;
    try {
      const info = await stat(source);
      return !info.isSocket() && !info.isFIFO();
    } catch {
      return false;
    }
  }
});

// Vercel performs these aliases on the hosted site. Recreate static aliases in
// the packaged bundle because the Android WebView does not execute vercel.json.
const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
for (const rule of vercel.rewrites || []) {
  const { source, destination } = rule;
  if (!source?.startsWith('/') || source.includes(':') ||
      !destination?.startsWith('/') || destination.includes('?') ||
      destination.includes(':')) continue;
  const sourcePath = source.replace(/^\/+/, '');
  const destinationPath = path.join(output, destination.replace(/^\/+/, ''));
  if (!sourcePath) continue; // The app entry point is handled below.
  try {
    await stat(destinationPath);
  } catch {
    continue;
  }
  const targetPath = path.join(output, sourcePath);
  if (path.extname(sourcePath)) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(destinationPath, targetPath);
  } else {
    await mkdir(targetPath, { recursive: true });
    await cp(destinationPath, path.join(targetPath, 'index.html'));
  }
}

// Capacitor starts at /index.html. The Android app should open the login flow;
// the public marketing landing page remains available at /home.html.
await writeFile(path.join(output, 'index.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/login.html"><title>VynoTap</title></head><body><script>location.replace("/login.html")</script></body></html>',
  'utf8'
);

const envPath = path.join(output, 'vt-env.js');
const envSource = await readFile(envPath, 'utf8');
await writeFile(envPath, `window.VT_ANDROID_BUILD_ENV = ${JSON.stringify(environment)};\n${envSource}`, 'utf8');

console.log(`VynoTap Android web bundle prepared for ${environment} at ${output}`);
