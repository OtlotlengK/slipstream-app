import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');
const temp = await mkdtemp(path.join(os.tmpdir(), 'vynotap-android-'));
const excluded = new Set([
  '.git', '.github', '.vercel', 'node_modules', 'www', 'android', 'ios',
  'coverage', 'dist', '.next', '.turbo'
]);

try {
  await cp(root, temp, {
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

  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  for (const rule of vercel.rewrites || []) {
    const { source, destination } = rule;
    if (!source?.startsWith('/') || source.includes(':') ||
        !destination?.startsWith('/') || destination.includes('?') ||
        destination.includes(':')) continue;
    const sourcePath = source.replace(/^\/+/, '');
    const destinationPath = path.join(temp, destination.replace(/^\/+/, ''));
    if (!sourcePath) continue;
    try { await stat(destinationPath); } catch { continue; }
    const targetPath = path.join(temp, sourcePath);
    if (path.extname(sourcePath)) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(destinationPath, targetPath);
    } else {
      await rm(targetPath, { recursive: true, force: true });
      await mkdir(targetPath, { recursive: true });
      await cp(destinationPath, path.join(targetPath, 'index.html'));
    }
  }

  await writeFile(path.join(temp, 'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/login.html"><title>VynoTap</title></head><body><script>location.replace("/login.html")</script></body></html>',
    'utf8'
  );

  const envPath = path.join(temp, 'vt-env.js');
  const envSource = await readFile(envPath, 'utf8');
  await writeFile(envPath, 'window.VT_ANDROID_BUILD_ENV = "production";\n' + envSource, 'utf8');

  await rm(output, { recursive: true, force: true });
  await rename(temp, output);
  console.log('VynoTap Android production web bundle prepared at ' + output);
} finally {
  await rm(temp, { recursive: true, force: true });
}
