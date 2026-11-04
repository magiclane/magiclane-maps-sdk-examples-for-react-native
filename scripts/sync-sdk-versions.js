// SPDX-FileCopyrightText: 2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0

// Writes the Magic Lane SDK versions from sdk-versions.json into every
// example's package.json.
// Each example keeps a concrete version so that it installs on its own,
// when copied out of this repository.
// Usage: node sync-sdk-versions.js [--check]
//   --check  change nothing; list the examples that differ and fail

import { readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const versions = JSON.parse(await readFile(join(root, 'sdk-versions.json'), 'utf8'));

async function exampleDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'scripts')
    .map((e) => join(dir, e.name))
    .filter((d) => existsSync(join(d, 'package.json')));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const dirs = await exampleDirs(root);
const stale = [];

for (const dir of dirs) {
  const file = join(dir, 'package.json');
  const text = await readFile(file, 'utf8');
  let updated = text;
  for (const [name, version] of Object.entries(versions)) {
    // Edit the text, not the parsed JSON, so the file keeps its formatting.
    updated = updated.replace(new RegExp(`("${escape(name)}"\\s*:\\s*)"[^"]*"`, 'g'), `$1"${version}"`);
  }
  if (updated === text) continue;
  stale.push(relative(root, file));
  if (!check) await writeFile(file, updated);
}

if (check && stale.length) {
  console.error(`These examples do not use the versions in sdk-versions.json:\n  ${stale.join('\n  ')}`);
  console.error('Run `npm run sync-versions` in scripts/.');
  process.exit(1);
}
console.log(check ? `All ${dirs.length} examples match sdk-versions.json.` : `Updated ${stale.length} of ${dirs.length} examples.`);
