import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const p = path.join(root, 'index.html');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

function findLine(pred) {
  const i = lines.findIndex(pred);
  if (i === -1) throw new Error('marker not found');
  return i;
}

function blockStart(idSub) {
  const iId = findLine((l) => l.includes(idSub));
  let s = iId;
  while (s > 0 && !lines[s].trim().startsWith('<div')) s -= 1;
  return s;
}

const iModalStart = (() => {
  const i = findLine((l) => l.includes('id="ai-modal"'));
  let s = i;
  while (s > 0 && !lines[s].trim().startsWith('<div')) s -= 1;
  return s;
})();

const iScript = findLine((l, i) => i > iModalStart && l.trim() === '<script>');

const iTeacher = blockStart('id="teacher-registration-content"');
const iProfile = findLine((l, i) => i > iTeacher && l.includes('id="student-profile-content"'));

const iStudent = blockStart('id="registration-content"');

const iStyleOpen = findLine((l) => l.trim() === '<style>');
const iStyleClose = findLine((l, i) => i > iStyleOpen && l.trim() === '</style>');

function splice(arr, start, end) {
  return [...arr.slice(0, start), ...arr.slice(end)];
}

let L = lines;
const cuts = [
  [iModalStart, iScript],
  [iTeacher, iProfile],
  [iStudent, iTeacher],
  [iStyleOpen, iStyleClose + 1],
].sort((a, b) => b[0] - a[0]);

for (const [a, b] of cuts) {
  L = splice(L, a, b);
}

const idxMobileComment = L.findIndex((l) => l.includes('// Mobile Menu Functionality'));
if (idxMobileComment < 0) throw new Error('mobile menu script not found');
let insertAt = idxMobileComment;
while (insertAt > 0 && L[insertAt].trim() !== '<script>') insertAt -= 1;

const frag = [
  '',
  '',
  '    <div id="lms-deferred-modals-root" data-lms-shell-host="modals" aria-hidden="true"></div>',
  '',
];
L = [...L.slice(0, insertAt), ...frag, ...L.slice(insertAt)];

fs.writeFileSync(p, L.join('\n'), 'utf8');
console.log('patched index.html OK, bytes=', Buffer.byteLength(L.join('\n'), 'utf8'));
