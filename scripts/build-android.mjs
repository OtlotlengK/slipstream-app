import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
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
    if (!relative) return false;
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

const envPath = path.join(output, 'vt-env.js');
const envSource = await readFile(envPath, 'utf8');
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(envPath, `window.VT_ANDROID_BUILD_ENV = ${JSON.stringify(environment)};\\n${envSource}`, 'utf8')
);

console.log(`VynoTap Android web bundle prepared for ${environment} at ${output}`);
