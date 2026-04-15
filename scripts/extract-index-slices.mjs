/**
 * Extracts inline `<style>` from `index.html` into `src/assets/styles/login-shell.css`.
 * Validates that deferred shell templates in `src/ui/templates.part.ts` are non-empty.
 *
 * Template HTML (registration tabs, modals) lives in `templates.part.ts` and is injected
 * at runtime — it is not re-generated from `index.html` line ranges (those broke when
 * `index.html` shrank). Do not run a diet patch on `index.html` without keeping
 * `templates.part.ts` populated.
 *
 * Run from repo root: node scripts/extract-index-slices.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const indexPath = path.join(root, 'index.html');
const indexRaw = fs.readFileSync(indexPath, 'utf8');

const styleOpen = indexRaw.indexOf('<style>');
const styleClose = indexRaw.indexOf('</style>', styleOpen);
if (styleOpen !== -1 && styleClose !== -1) {
  const css = indexRaw.slice(styleOpen + '<style>'.length, styleClose).replace(/^\s*\n/, '');
  fs.writeFileSync(
    path.join(root, 'src/assets/styles/login-shell.css'),
    css.trimEnd() + '\n',
    'utf8'
  );
  console.log('Wrote src/assets/styles/login-shell.css from index.html <style> block.');
} else {
  console.warn(
    'index.html has no inline <style> block — skipped CSS extract (edit src/assets/styles/login-shell.css directly).'
  );
}

const templatesPath = path.join(root, 'src/ui/templates.part.ts');
const templatesRaw = fs.readFileSync(templatesPath, 'utf8');

/** `export const NAME = \`...\`;` — capture template literal bodies */
const exportRe = /export const (TEMPLATE_[A-Z0-9_]+)\s*=\s*`([\s\S]*?)`(?:\s*;)?/gm;
let m;
const names = [];
const minLen = 80;
let failed = false;
while ((m = exportRe.exec(templatesRaw)) !== null) {
  const name = m[1];
  const body = m[2];
  names.push(name);
  if (body.trim().length < minLen) {
    console.error(
      `extract-index-slices: ${name} in templates.part.ts is empty or too short (< ${minLen} chars). ` +
        'Restore markup from git or edit manually — do not clear deferred templates.'
    );
    failed = true;
  }
}

const expected = [
  'TEMPLATE_REGISTRATION_STUDENT_INNER',
  'TEMPLATE_REGISTRATION_TEACHER_INNER',
  'TEMPLATE_AI_MODAL',
  'TEMPLATE_LEGAL_MODAL',
  'TEMPLATE_EDIT_STUDENT_MODAL',
  'TEMPLATE_CHANGE_ROLE_MODAL',
];
for (const exp of expected) {
  if (!names.includes(exp)) {
    console.error(`extract-index-slices: missing export ${exp} in templates.part.ts`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Validated template exports in src/ui/templates.part.ts');
