#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

async function loadHost(spec) {
  if (!spec.includes(':')) {
    console.error('usage: sveda-describe module.js:host');
    process.exit(1);
  }

  const [modulePath, exportName] = spec.split(':');
  const resolved = pathToFileURL(modulePath.startsWith('/') ? modulePath : `${process.cwd()}/${modulePath}`).href;
  const module = await import(resolved);
  const host = module[exportName];
  if (!host || typeof host.describe !== 'function') {
    console.error(`${spec} has no describe() method`);
    process.exit(1);
  }

  return host;
}

const spec = process.argv[2];
if (!spec) {
  console.error('usage: sveda-describe module.js:host');
  process.exit(1);
}

const host = await loadHost(spec);
console.log(JSON.stringify(host.describe(), null, 2));
