// Assemble the deployable directory: dist/{index.html, site/, src/, data/}.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const dir of ['site', 'src', 'data']) cpSync(new URL(`${dir}/`, root), new URL(`${dir}/`, dist), { recursive: true });
writeFileSync(new URL('index.html', dist), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=site/"><a href="site/">Mymba Porã</a>\n');
console.error('wrote dist/');
