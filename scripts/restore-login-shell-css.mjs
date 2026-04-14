/**
 * Restores src/assets/styles/login-shell.css from the <style> block in a git revision of index.html.
 * Usage: node scripts/restore-login-shell-css.mjs [rev=rev^]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rev = process.argv[2] ?? 'd657045^';
const spec = `${rev}:index.html`;
const html = execFileSync('git', ['show', spec], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  cwd: root,
});
const open = html.indexOf('<style>');
const close = html.indexOf('</style>', open);
if (open === -1 || close === -1) {
  console.error('Could not find <style>...</style> in index.html at', rev);
  process.exit(1);
}
const inner = html.slice(open + '<style>'.length, close).replace(/^\s*\n/, '');
const out = path.join(root, 'src/assets/styles/login-shell.css');
fs.writeFileSync(out, inner.trimEnd() + '\n', 'utf8');
console.log('Wrote', out, 'bytes=', fs.statSync(out).size, 'from', rev);
