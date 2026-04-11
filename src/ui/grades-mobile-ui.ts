/**
 * Mobile gradebook: card layout (< md) with local quick-grade state before Firestore save.
 */
import { finitePctForBar, finiteToFixed, safeAssignmentTitle } from '../core/display-fallbacks';
import { emptyStateBlockHtml, escapeHtmlText as esc, renderTemplate } from './dom-render';
import type { Attendance, Grade } from '../types';

const LETTER_SCORE_RATIO: Record<string, number> = {
  A: 0.95,
  B: 0.85,
  C: 0.75,
  D: 0.65,
  F: 0.55,
};

type PendingMap = Map<string, { score: number; letter: string }>;

let pendingEdits: PendingMap = new Map();
let lastStudentId: string | null = null;
let lastAssignmentFilter = '';

export function clearGradesMobilePending(): void {
  pendingEdits = new Map();
  lastStudentId = null;
  lastAssignmentFilter = '';
}

function letterFromPercentage(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

function relativeActivity(isoDate: string): string {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'JUST NOW';
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return `${d}D AGO`;
}

function progressRingSvg(percent: number): string {
  const p = finitePctForBar(percent);
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;
  return `<div class="relative w-28 h-28 shrink-0">
    <svg class="w-28 h-28 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${r}" fill="none" class="stroke-slate-700" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" class="stroke-cyan-400" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${dash} ${c}"/>
    </svg>
    <div class="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
      <span class="text-2xl font-bold text-white">${p}%</span>
      <span class="text-[10px] text-slate-400 font-semibold tracking-wider">GRADED</span>
    </div>
  </div>`;
}

function gradeCardHtml(g: Grade, canEdit: boolean): string {
  const pending = canEdit && pendingEdits.has(g.id);
  const displayScore = pending ? pendingEdits.get(g.id)!.score : g.score;
  const tp = Number(g.totalPoints);
  const sc = Number(displayScore);
  const displayPct =
    Number.isFinite(tp) && tp > 0 && Number.isFinite(sc) ? (sc / tp) * 100 : 0;
  const pctLabel = Number.isFinite(displayPct) ? finiteToFixed(displayPct, 0, '0') : '0';
  const letter = pending
    ? pendingEdits.get(g.id)!.letter
    : letterFromPercentage(Number.isFinite(displayPct) ? displayPct : 0);
  const badgePending = pending
    ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold border-2 border-cyan-400/80 text-cyan-200">${esc(letter)} (${esc(pctLabel)}%)</span>`
    : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300">${esc(letter)} (${esc(pctLabel)}%)</span>`;

  const letters = ['A', 'B', 'C', 'D', 'F']
    .map(
      (L) =>
        `<button type="button" data-grade-quick="${esc(g.id)}" data-letter="${L}" class="min-w-[48px] min-h-[48px] rounded-xl border-2 border-slate-600 bg-slate-800 text-white font-bold hover:border-cyan-400/50 transition-colors ${pending && pendingEdits.get(g.id)?.letter === L ? 'ring-2 ring-cyan-400 bg-cyan-500/15' : ''}">${esc(L)}</button>`
    )
    .join('');

  const actions = canEdit
    ? `<div class="flex flex-col gap-2 mt-3">
        <div class="flex flex-wrap gap-2">${letters}</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-grade-edit="${esc(g.id)}" class="min-h-[48px] flex-1 rounded-xl bg-slate-800 border border-slate-600 text-cyan-300 text-sm font-semibold hover:bg-slate-700">Edit grade</button>
          <button type="button" data-grade-comment="${esc(g.id)}" class="min-h-[48px] flex-1 rounded-xl bg-slate-800 border border-slate-600 text-slate-300 text-sm font-semibold hover:bg-slate-700">Add comment</button>
        </div>
        <button type="button" data-grade-absent="${esc(g.id)}" class="w-full min-h-[48px] rounded-xl border-2 border-rose-500/50 text-rose-300 text-sm font-semibold hover:bg-rose-500/10">Mark absent (today)</button>
      </div>`
    : '';

  return `<article class="rounded-xl border border-slate-600/80 bg-slate-900/50 p-4 shadow-lg shadow-black/20" data-grade-row="${esc(g.id)}">
    <div class="flex justify-between gap-2 items-start">
      <div class="min-w-0">
        <h4 class="text-white font-bold truncate">${esc(safeAssignmentTitle(g.assignmentName))}</h4>
        <p class="text-slate-500 text-xs mt-1">${esc(g.category)} · ${esc(g.date.slice(0, 10))}</p>
        <p class="text-slate-400 text-[11px] font-semibold tracking-wide mt-2">LAST ACTIVITY <span class="text-slate-300">${relativeActivity(g.date)}</span></p>
      </div>
      ${badgePending}
    </div>
    ${actions}
  </article>`;
}

function buildAssignmentOptions(grades: Grade[]): string {
  const names = [...new Set(grades.map((g) => g.assignmentName))].sort();
  const opts = [`<option value="">All assignments</option>`]
    .concat(names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`))
    .join('');
  return opts;
}

function filterGrades(grades: Grade[], assignmentName: string): Grade[] {
  if (!assignmentName.trim()) return grades;
  return grades.filter((g) => g.assignmentName === assignmentName);
}

export function renderGradesMobile(
  grades: Grade[],
  studentId: string | null,
  role: 'admin' | 'teacher' | 'student' | null
): void {
  const panel = document.getElementById('grades-mobile-panel');
  const cardsRoot = document.getElementById('grades-mobile-cards');
  const selectEl = document.getElementById('grades-mobile-assignment-select') as HTMLSelectElement | null;
  const progressEl = document.getElementById('grades-mobile-progress-inner');
  const saveBtn = document.getElementById('grades-mobile-save-btn');
  if (!panel || !cardsRoot || !progressEl) return;

  const canEdit = role === 'teacher' || role === 'admin';
  if (saveBtn) {
    saveBtn.classList.toggle('hide', !canEdit || !studentId);
  }

  if (studentId !== lastStudentId) {
    pendingEdits = new Map();
    lastStudentId = studentId;
    lastAssignmentFilter = '';
  }

  if (!studentId) {
    const block = emptyStateBlockHtml(
      'Select a student',
      'Choose a learner from the dropdown to see assignments and scores.',
      `<button type="button" id="grades-mobile-empty-focus-select" class="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400 transition-colors">Open student picker</button>`
    );
    renderTemplate(cardsRoot, block);
    document.getElementById('grades-mobile-empty-focus-select')?.addEventListener('click', () => {
      document.getElementById('student-select')?.focus();
    });
    renderTemplate(
      progressEl,
      `<div class="flex items-center gap-4"><div class="text-slate-400 text-sm">No student selected.</div></div>`
    );
    if (selectEl) {
      renderTemplate(selectEl, '<option value="">All assignments</option>');
      selectEl.disabled = true;
    }
    return;
  }

  if (grades.length === 0) {
    const noGradesTitle = role === 'student' ? 'No grades posted yet' : 'No grades recorded yet';
    const noGradesSub =
      role === 'student'
        ? 'Your instructors will post scores here when work is graded.'
        : 'Add a grade from the desktop form or wait for new assessment results.';
    const cta =
      canEdit
        ? `<button type="button" id="grades-mobile-empty-scroll-add" class="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400 transition-colors">Add grade</button>`
        : '';
    renderTemplate(cardsRoot, emptyStateBlockHtml(noGradesTitle, noGradesSub, cta));
    document.getElementById('grades-mobile-empty-scroll-add')?.addEventListener('click', () => {
      document.getElementById('grade-entry-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    renderTemplate(
      progressEl,
      `<div class="flex items-center gap-4"><div class="text-slate-400 text-sm">No assignments to show yet.</div></div>`
    );
    if (selectEl) {
      renderTemplate(selectEl, '<option value="">All assignments</option>');
      selectEl.disabled = true;
    }
    return;
  }

  if (selectEl) {
    const optsHtml = buildAssignmentOptions(grades);
    renderTemplate(selectEl, optsHtml);
    selectEl.disabled = false;
    if (lastAssignmentFilter && grades.some((g) => g.assignmentName === lastAssignmentFilter)) {
      selectEl.value = lastAssignmentFilter;
    } else {
      selectEl.value = '';
      lastAssignmentFilter = '';
    }
  }

  const filterVal = selectEl?.value ?? '';
  lastAssignmentFilter = filterVal;
  const visible = filterGrades(grades, filterVal);

  if (visible.length === 0) {
    renderTemplate(
      progressEl,
      `<div class="flex items-center gap-4"><div class="text-slate-400 text-sm">Adjust the assignment filter to see grading progress for this learner.</div></div>`
    );
    const block = emptyStateBlockHtml(
      'No assignments match this filter',
      'Try another assignment or reset to see the full gradebook.',
      `<button type="button" id="grades-mobile-clear-filter" class="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition-colors">Show all assignments</button>`
    );
    renderTemplate(cardsRoot, block);
    document.getElementById('grades-mobile-clear-filter')?.addEventListener('click', () => {
      if (selectEl) {
        selectEl.value = '';
        lastAssignmentFilter = '';
        renderGradesMobile(grades, studentId, role);
      }
    });
    return;
  }

  const dirty = visible.filter((g) => pendingEdits.has(g.id)).length;
  const total = visible.length;
  const pctGraded = finitePctForBar(((total - dirty) / total) * 100);
  let sumPct = 0;
  visible.forEach((g) => {
    const pend = pendingEdits.get(g.id);
    const score = pend ? pend.score : g.score;
    const tpp = Number(g.totalPoints);
    const scc = Number(score);
    if (Number.isFinite(tpp) && tpp > 0 && Number.isFinite(scc)) {
      sumPct += (scc / tpp) * 100;
    }
  });
  const avgRaw = sumPct / visible.length;
  const avg = Number.isFinite(avgRaw) ? finitePctForBar(avgRaw) : 0;

  renderTemplate(
    progressEl,
    `<div class="flex flex-wrap items-center gap-6">
      ${progressRingSvg(pctGraded)}
      <div class="space-y-1 min-w-0">
        <p class="text-xs font-semibold text-cyan-400/90 tracking-widest">GRADING PROGRESS</p>
        <p class="text-white font-semibold text-sm truncate">${filterVal ? esc(filterVal) : 'All assignments'}</p>
        <p class="text-slate-400 text-sm">Graded <span class="text-white font-bold">${total - dirty}</span> / ${total}</p>
        <p class="text-slate-400 text-sm">Avg score <span class="text-cyan-300 font-bold">${avg}%</span></p>
      </div>
    </div>`
  );

  renderTemplate(
    cardsRoot,
    visible.map((g) => gradeCardHtml(g, canEdit)).join('')
  );
}

export interface InitGradesMobileOptions {
  getStudentId: () => string | null;
  getGrades: () => Grade[];
  updateGrade: (studentId: string, gradeId: string, updates: Partial<Grade>) => Promise<void>;
  markAttendance: (studentId: string, payload: Omit<Attendance, 'id' | 'studentId'>) => Promise<string>;
  showLoading: () => void;
  hideLoading: () => void;
  showToast: (message: string, variant: 'success' | 'error' | 'info') => void;
  formatError: (err: unknown, fallback: string) => string;
  refreshDisplay: () => void;
}

export function initGradesMobileUI(opts: InitGradesMobileOptions): void {
  const panel = document.getElementById('grades-mobile-panel');
  const selectEl = document.getElementById('grades-mobile-assignment-select') as HTMLSelectElement | null;
  const saveBtn = document.getElementById('grades-mobile-save-btn');

  selectEl?.addEventListener('change', () => {
    lastAssignmentFilter = selectEl.value;
    opts.refreshDisplay();
  });

  panel?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const quick = t.closest<HTMLButtonElement>('[data-grade-quick]');
    if (quick && panel.contains(quick)) {
      const gid = quick.dataset.gradeQuick;
      const letter = quick.dataset.letter;
      const studentId = opts.getStudentId();
      if (!gid || !letter || !studentId) return;
      const g = opts.getGrades().find((x) => x.id === gid);
      if (!g) return;
      const ratio = LETTER_SCORE_RATIO[letter] ?? 0.75;
      const tpp = Number(g.totalPoints);
      const score = Number.isFinite(tpp) && tpp > 0 ? Math.round(tpp * ratio * 100) / 100 : 0;
      pendingEdits.set(gid, { score, letter });
      opts.refreshDisplay();
      return;
    }

    const editBtn = t.closest<HTMLButtonElement>('[data-grade-edit]');
    if (editBtn && panel.contains(editBtn)) {
      const gid = editBtn.dataset.gradeEdit;
      const studentId = opts.getStudentId();
      if (!gid || !studentId) return;
      const g = opts.getGrades().find((x) => x.id === gid);
      if (!g) return;
      const raw = window.prompt(`New score for "${g.assignmentName}" (max ${g.totalPoints}):`, String(g.score));
      if (raw === null) return;
      const num = Number.parseFloat(raw);
      if (Number.isNaN(num) || num < 0 || num > g.totalPoints) {
        opts.showToast('Enter a valid score for this assignment.', 'error');
        return;
      }
      const tpp = Number(g.totalPoints);
      const pct = Number.isFinite(tpp) && tpp > 0 ? (num / tpp) * 100 : 0;
      pendingEdits.set(gid, { score: num, letter: letterFromPercentage(Number.isFinite(pct) ? pct : 0) });
      opts.refreshDisplay();
      return;
    }

    const commentBtn = t.closest<HTMLButtonElement>('[data-grade-comment]');
    if (commentBtn && panel.contains(commentBtn)) {
      opts.showToast('Scores only on mobile — use the desktop gradebook for full comments.', 'info');
      return;
    }

    const absBtn = t.closest<HTMLButtonElement>('[data-grade-absent]');
    if (absBtn && panel.contains(absBtn)) {
      const studentId = opts.getStudentId();
      if (!studentId) return;
      const today = new Date().toISOString().slice(0, 10);
      void (async () => {
        try {
          opts.showLoading();
          await opts.markAttendance(studentId, { date: today, status: 'absent', notes: 'Marked from gradebook', markedBy: '' });
          opts.showToast('Attendance marked absent for today.', 'success');
        } catch (err) {
          opts.showToast(opts.formatError(err, 'Could not mark attendance.'), 'error');
        } finally {
          opts.hideLoading();
        }
      })();
    }
  });

  saveBtn?.addEventListener('click', () => {
    const studentId = opts.getStudentId();
    if (!studentId || pendingEdits.size === 0) {
      opts.showToast('No grade changes to save.', 'info');
      return;
    }
    void (async () => {
      if (saveBtn instanceof HTMLButtonElement) {
        saveBtn.disabled = true;
        saveBtn.setAttribute('aria-busy', 'true');
      }
      opts.showLoading();
      let ok = 0;
      try {
        for (const [gradeId, { score }] of pendingEdits) {
          await opts.updateGrade(studentId, gradeId, { score });
          ok++;
        }
        pendingEdits = new Map();
        opts.showToast(`Saved ${ok} grade update${ok !== 1 ? 's' : ''}.`, 'success');
        opts.refreshDisplay();
      } catch (err) {
        opts.showToast(opts.formatError(err, 'Could not save grades.'), 'error');
      } finally {
        opts.hideLoading();
        if (saveBtn instanceof HTMLButtonElement) {
          saveBtn.disabled = false;
          saveBtn.removeAttribute('aria-busy');
        }
      }
    })();
  });
}
