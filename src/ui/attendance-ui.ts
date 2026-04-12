/**
 * Attendance UI: history rows, class roll-call roster (desktop table + mobile cards), live session stats.
 */
import {
  initialsForStudentRoster,
  pickAvatarDiscPalette,
  safeStudentDisplayName,
} from '../core/display-fallbacks';
import { reportClientFault } from '../core/client-errors';
import {
  emptyStateBlockHtml,
  emptyStateTableRowHtml,
  escapeHtmlText as esc,
  renderTemplate,
} from './dom-render';
import type { Attendance, Student } from '../types';

const ROSTER_ROW = 'attendance-roster-row';
const BULK_ROW = ROSTER_ROW;

function statusBadges(): Record<string, string> {
  return {
    present:
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">✓ Present</span>',
    absent:
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">✗ Absent</span>',
    late: '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">⏰ Late</span>',
    excused:
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">📝 Excused</span>',
  };
}

/** Table body row: empty / instructional state with optional CTA (HTML). */
export function attendanceHistoryEmptyRowHtml(message: string, ctaHtml?: string): string {
  const cta = ctaHtml
    ? `<div class="mt-5 flex flex-wrap items-center justify-center gap-3">${ctaHtml}</div>`
    : '';
  return `
    <tr>
      <td colspan="4" class="p-0">
        <div class="text-center py-14 px-4 rounded-xl border border-surface-default bg-surface-container mx-2 my-2">
          <div class="text-4xl mb-3 opacity-30" aria-hidden="true">📋</div>
          <p class="text-on-surface font-semibold">${esc(message)}</p>
          ${cta}
        </div>
      </td>
    </tr>`;
}

function historyRowClasses(status: Attendance['status']): string {
  const dim = status === 'present' || status === 'excused';
  const alert = status === 'absent' || status === 'late';
  const base = 'border-b border-dark-700 transition-colors duration-150 hover:bg-white/5';
  if (dim) return `${base} opacity-70`;
  if (alert && status === 'late') return `${base} opacity-100 border-l-2 border-l-orange-500/45`;
  if (alert) return `${base} opacity-100 border-l-2 border-l-red-500/45`;
  return `${base} opacity-100`;
}

/** Renders attendance history rows (Date, Student, Status, Notes). */
export function renderAttendanceHistoryRows(
  attendance: Attendance[],
  resolveStudentName: (studentId: string) => string
): string {
  const badges = statusBadges();
  return attendance
    .map((record) => {
      const date = new Date(record.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const studentName = resolveStudentName(record.studentId);
      return `
      <tr class="${historyRowClasses(record.status)}">
        <td class="py-3 px-4 text-white">${esc(date)}</td>
        <td class="py-3 px-4 text-dark-300">${esc(studentName)}</td>
        <td class="py-3 px-4 text-center">${badges[record.status] || ''}</td>
        <td class="py-3 px-4 text-dark-400 text-sm">${esc(record.notes || '-')}</td>
      </tr>`;
    })
    .join('');
}

function statusPill(status: Attendance['status']): string {
  const map: Record<Attendance['status'], { cls: string; label: string }> = {
    present: { cls: 'bg-cyan-500 text-slate-950', label: '✓ PRESENT' },
    absent: { cls: 'bg-rose-500 text-white', label: '✗ ABSENT' },
    late: { cls: 'bg-amber-500 text-slate-950', label: '⏱ LATE' },
    excused: { cls: 'bg-slate-500 text-white', label: '📄 EXCUSED' },
  };
  const m = map[status];
  return `<span class="roll-status-pill inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${m.cls}">${m.label}</span>`;
}

function pickButton(st: Attendance['status'], letter: string): string {
  return `<button type="button" data-roll-pick="${st}" aria-pressed="false" aria-label="Mark ${st}"
    class="min-w-[48px] min-h-[48px] w-12 h-12 shrink-0 rounded-xl border-2 border-slate-600 bg-slate-800/90 text-white text-sm font-bold hover:border-cyan-400/60 hover:bg-slate-700/90 active:scale-[0.97] transition-all">${letter}</button>`;
}

function rosterAvatarCell(student: Student): string {
  const { bg, ring } = pickAvatarDiscPalette(student.id);
  const ini = esc(initialsForStudentRoster(student.name));
  return `<div class="flex w-12 h-12 min-w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full ${bg} ring-2 ${ring} text-sm font-bold text-white" aria-hidden="true">${ini}</div>`;
}

function rosterTableRowHtml(student: Student): string {
  const displayName = safeStudentDisplayName(student.name);
  const id = esc(student.id);
  const name = esc(displayName);
  const sid = esc(student.memberId || student.id);
  return `<tr class="${ROSTER_ROW} border-b border-slate-700/70 hover:bg-white/[0.04] transition-colors" data-student-id="${id}" data-status="present">
    <td class="py-3 px-3 align-middle">
      <div class="flex items-center gap-3 min-w-0">
        ${rosterAvatarCell(student)}
        <span class="text-white font-semibold truncate">${name}</span>
      </div>
    </td>
    <td class="py-3 px-3 align-middle text-slate-300 text-sm font-mono">${sid}</td>
    <td class="py-3 px-2 align-middle">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Attendance status">
          ${pickButton('present', 'P')}
          ${pickButton('absent', 'A')}
          ${pickButton('late', 'L')}
          ${pickButton('excused', 'E')}
        </div>
        <span class="roll-pill-slot">${statusPill('present')}</span>
      </div>
    </td>
    <td class="py-3 px-2 align-middle text-right">
      <button type="button" data-roll-reset class="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" aria-label="Reset row to present" title="Reset to present">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      </button>
    </td>
  </tr>`;
}

function rosterCardHtml(student: Student): string {
  const displayName = safeStudentDisplayName(student.name);
  const id = esc(student.id);
  const name = esc(displayName);
  const sid = esc(student.memberId || student.id);
  return `<div class="${ROSTER_ROW} rounded-xl border border-slate-600/80 bg-slate-900/50 p-4 space-y-3 shadow-lg shadow-black/20" data-student-id="${id}" data-status="present">
    <div class="flex items-start gap-3">
      ${rosterAvatarCell(student)}
      <div class="min-w-0 flex-1">
        <p class="text-white font-bold truncate">${name}</p>
        <p class="text-slate-400 text-xs font-mono mt-0.5">${sid}</p>
        <div class="mt-2"><span class="roll-pill-slot">${statusPill('present')}</span></div>
      </div>
    </div>
    <div class="flex flex-wrap gap-1.5 justify-between" role="group" aria-label="Attendance status">
      ${pickButton('present', 'P')}
      ${pickButton('absent', 'A')}
      ${pickButton('late', 'L')}
      ${pickButton('excused', 'E')}
    </div>
    <button type="button" data-roll-reset class="w-full min-h-[48px] rounded-xl border border-slate-600 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors">Reset to present</button>
  </div>`;
}

function setRosterRowStatus(row: HTMLElement, status: Attendance['status']): void {
  row.dataset.status = status;
  row.querySelectorAll<HTMLButtonElement>('[data-roll-pick]').forEach((btn) => {
    const v = btn.dataset.rollPick as Attendance['status'];
    const on = v === status;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('ring-2', on);
    btn.classList.toggle('ring-cyan-400', on && status === 'present');
    btn.classList.toggle('ring-rose-400', on && status === 'absent');
    btn.classList.toggle('ring-amber-400', on && status === 'late');
    btn.classList.toggle('ring-slate-300', on && status === 'excused');
    btn.classList.toggle('bg-cyan-500/20', on && status === 'present');
    btn.classList.toggle('bg-rose-500/20', on && status === 'absent');
    btn.classList.toggle('bg-amber-500/20', on && status === 'late');
    btn.classList.toggle('bg-slate-600/40', on && status === 'excused');
  });
  const slot = row.querySelector('.roll-pill-slot');
  if (slot) renderTemplate(slot as HTMLElement, statusPill(status));
}

function applyRollCallSearchAndFilter(root: HTMLElement, mode: 'all' | Attendance['status']): void {
  const searchEl = document.getElementById('roll-call-student-search') as HTMLInputElement | null;
  const q = (searchEl?.value ?? '').trim().toLowerCase();
  const byId = new Map<string, HTMLElement[]>();
  root.querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`).forEach((row) => {
    const sid = row.dataset.studentId;
    if (!sid) return;
    const list = byId.get(sid) ?? [];
    list.push(row);
    byId.set(sid, list);
  });
  let visibleCount = 0;
  const totalStudents = byId.size;
  for (const [sid, rows] of byId) {
    const sample = rows[0];
    const name =
      sample.querySelector('.font-semibold.truncate')?.textContent?.trim().toLowerCase() ??
      sample.querySelector('.font-bold.truncate')?.textContent?.trim().toLowerCase() ??
      '';
    const idText = sample.querySelector('.font-mono')?.textContent?.trim().toLowerCase() ?? '';
    const matchSearch =
      !q || name.includes(q) || idText.includes(q) || sid.toLowerCase().includes(q);
    const st = sample.dataset.status as Attendance['status'];
    const matchFilter = mode === 'all' || st === mode;
    const hide = !(matchSearch && matchFilter);
    rows.forEach((r) => r.classList.toggle('hidden', hide));
    if (!hide) visibleCount++;
  }
  const mount = document.getElementById('roll-call-filter-empty-mount');
  if (mount) {
    if (totalStudents > 0 && visibleCount === 0) {
      mount.classList.remove('hidden');
      renderTemplate(
        mount,
        emptyStateBlockHtml(
          'No roster matches this filter',
          'DSKM filters are working—try different search words, choose All, or clear the search box to see every enrolled learner.'
        )
      );
    } else {
      mount.classList.add('hidden');
      renderTemplate(mount, '');
    }
  }
}

function syncRollCallSessionStats(root: HTMLElement): void {
  const seen = new Set<string>();
  let present = 0;
  let absent = 0;
  let late = 0;
  let total = 0;
  root.querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`).forEach((row) => {
    const sid = row.dataset.studentId;
    if (!sid || seen.has(sid)) return;
    seen.add(sid);
    total++;
    const st = row.dataset.status as Attendance['status'];
    if (st === 'present') present++;
    else if (st === 'absent') absent++;
    else if (st === 'late') late++;
  });
  const set = (id: string, v: string | number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  set('roll-call-stat-total', total);
  set('roll-call-stat-present', present);
  set('roll-call-stat-absent', absent);
  set('roll-call-stat-late', late);
}

export function renderBulkAttendanceRoster(students: Student[]): void {
  const tableBody = document.getElementById('attendance-roster-table-body');
  const cardsRoot = document.getElementById('attendance-roster-cards');
  const legacyRoot = document.getElementById('bulk-attendance-roster');
  const root = document.getElementById('attendance-roll-call-root');

  if (tableBody && cardsRoot) {
    if (students.length === 0) {
      renderTemplate(
        tableBody,
        emptyStateTableRowHtml(
          4,
          'No learners detected on this roster',
          'Choose a different class or enroll students in this course to open roll call.'
        )
      );
      renderTemplate(
        cardsRoot,
        emptyStateBlockHtml(
          'No learners detected on this roster',
          'Choose a different class or enroll students in this course to open roll call.'
        )
      );
    } else {
      renderTemplate(tableBody, students.map((s) => rosterTableRowHtml(s)).join(''));
      renderTemplate(cardsRoot, students.map((s) => rosterCardHtml(s)).join(''));
      tableBody
        .querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`)
        .forEach((row) => setRosterRowStatus(row, 'present'));
      cardsRoot
        .querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`)
        .forEach((row) => setRosterRowStatus(row, 'present'));
    }
    if (root) {
      applyRollCallSearchAndFilter(root, rollCallFilterMode);
      syncRollCallSessionStats(root);
    }
    return;
  }

  if (!legacyRoot) return;
  if (students.length === 0) {
    renderTemplate(
      legacyRoot,
      emptyStateBlockHtml(
        'No learners detected on this roster',
        'Register students or select a class with enrollments to use bulk attendance.'
      )
    );
    return;
  }
  renderTemplate(legacyRoot, students.map((s) => rosterCardHtml(s)).join(''));
  legacyRoot
    .querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`)
    .forEach((row) => setRosterRowStatus(row, 'present'));
}

export interface InitAttendanceBulkOptions {
  getStudents: () => Student[];
  markOne: (studentId: string, payload: Omit<Attendance, 'id' | 'studentId'>) => Promise<string>;
  showLoading: () => void;
  hideLoading: () => void;
  showToast: (message: string, variant: 'success' | 'error') => void;
  formatError: (err: unknown, fallback: string) => string;
  onBulkSaved?: () => void | Promise<void>;
}

let bulkOptions: InitAttendanceBulkOptions | null = null;
let rollCallFilterMode: 'all' | Attendance['status'] = 'all';

function syncTwinRosterRows(
  container: HTMLElement,
  studentId: string,
  source: HTMLElement,
  status: Attendance['status']
): void {
  container.querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`).forEach((r) => {
    if (r !== source && r.dataset.studentId === studentId) setRosterRowStatus(r, status);
  });
}

export function initAttendanceBulkUI(opts: InitAttendanceBulkOptions): void {
  bulkOptions = opts;
  const root = document.getElementById('attendance-roll-call-root');
  const legacyRoster = document.getElementById('bulk-attendance-roster');
  const markAllBtn = document.getElementById('mark-all-present-btn') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('save-bulk-attendance-btn') as HTMLButtonElement | null;

  const rosterMount = root ?? legacyRoster;
  if (!rosterMount || !markAllBtn || !saveBtn) return;

  const handlePick = (e: Event): void => {
    const t = (e.target as HTMLElement).closest('[data-roll-pick]') as HTMLButtonElement | null;
    if (!t || !rosterMount.contains(t)) return;
    const row = t.closest(`.${ROSTER_ROW}`) as HTMLElement | null;
    if (!row) return;
    const st = t.dataset.rollPick as Attendance['status'];
    setRosterRowStatus(row, st);
    const twinId = row.dataset.studentId;
    if (twinId && root) syncTwinRosterRows(root, twinId, row, st);
    if (root) {
      syncRollCallSessionStats(root);
      applyRollCallSearchAndFilter(root, rollCallFilterMode);
    }
  };

  rosterMount.addEventListener('click', handlePick);

  rosterMount.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-roll-reset]') as HTMLButtonElement | null;
    if (!t || !rosterMount.contains(t)) return;
    const row = t.closest(`.${ROSTER_ROW}`) as HTMLElement | null;
    if (!row) return;
    const twinId = row.dataset.studentId;
    setRosterRowStatus(row, 'present');
    if (twinId && root) syncTwinRosterRows(root, twinId, row, 'present');
    if (root) {
      syncRollCallSessionStats(root);
      applyRollCallSearchAndFilter(root, rollCallFilterMode);
    }
  });

  markAllBtn.addEventListener('click', () => {
    rosterMount
      .querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`)
      .forEach((row) => setRosterRowStatus(row, 'present'));
    if (root) {
      syncRollCallSessionStats(root);
      applyRollCallSearchAndFilter(root, rollCallFilterMode);
    }
    opts.showToast('All students set to Present. Save attendance when ready.', 'success');
  });

  const searchEl = document.getElementById('roll-call-student-search') as HTMLInputElement | null;
  searchEl?.addEventListener('input', () => {
    if (root) applyRollCallSearchAndFilter(root, rollCallFilterMode);
  });

  if (root) {
    root.querySelectorAll<HTMLButtonElement>('[data-roll-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.rollFilter;
        rollCallFilterMode =
          f === 'all' || f === 'present' || f === 'absent' || f === 'late' || f === 'excused'
            ? (f as typeof rollCallFilterMode)
            : 'all';
        root.querySelectorAll<HTMLButtonElement>('[data-roll-filter]').forEach((b) => {
          b.classList.remove('ring-2', 'ring-cyan-400/60', 'bg-cyan-500/20', 'text-cyan-200');
          b.classList.add('border-slate-600', 'text-slate-300');
        });
        btn.classList.add('ring-2', 'ring-cyan-400/60', 'bg-cyan-500/20', 'text-cyan-200');
        btn.classList.remove('border-slate-600', 'text-slate-300');
        applyRollCallSearchAndFilter(root, rollCallFilterMode);
      });
    });
    const firstFilter = root.querySelector<HTMLButtonElement>('[data-roll-filter="all"]');
    if (firstFilter) {
      root.querySelectorAll<HTMLButtonElement>('[data-roll-filter]').forEach((b) => {
        b.classList.remove('ring-2', 'ring-cyan-400/60', 'bg-cyan-500/20', 'text-cyan-200');
        b.classList.add('border-slate-600', 'text-slate-300');
      });
      firstFilter.classList.add('ring-2', 'ring-cyan-400/60', 'bg-cyan-500/20', 'text-cyan-200');
      firstFilter.classList.remove('border-slate-600', 'text-slate-300');
    }
  }

  renderBulkAttendanceRoster(opts.getStudents());

  saveBtn.addEventListener('click', async () => {
    const dateInput = document.getElementById('attendance-date') as HTMLInputElement | null;
    const date = dateInput?.value?.trim();
    if (!date) {
      opts.showToast('Choose a date in the form above first.', 'error');
      return;
    }
    const rows = rosterMount.querySelectorAll<HTMLElement>(`.${ROSTER_ROW}`);
    if (rows.length === 0) return;
    saveBtn.disabled = true;
    try {
      opts.showLoading();
      let ok = 0;
      let fail = 0;
      const seen = new Set<string>();
      for (const row of rows) {
        const sid = row.dataset.studentId;
        const status = row.dataset.status as Attendance['status'] | undefined;
        if (!sid || !status || seen.has(sid)) continue;
        seen.add(sid);
        try {
          await opts.markOne(sid, { date, status, notes: '', markedBy: '' });
          ok++;
        } catch (err) {
          fail++;
          const msg = opts.formatError(err, 'Could not save.');
          if (fail === 1) opts.showToast(msg, 'error');
        }
      }
      if (ok > 0)
        opts.showToast(`Saved attendance for ${ok} student${ok !== 1 ? 's' : ''}.`, 'success');
      await opts.onBulkSaved?.();
    } catch (err) {
      reportClientFault(err);
      opts.showToast(opts.formatError(err, 'Attendance save did not complete.'), 'error');
    } finally {
      opts.hideLoading();
      saveBtn.disabled = false;
    }
  });
}

/** Call when the student list changes (e.g. after dashboard load). */
export function refreshAttendanceBulkRoster(): void {
  if (!bulkOptions) return;
  if (
    !document.getElementById('bulk-attendance-roster') &&
    !document.getElementById('attendance-roll-call-root')
  )
    return;
  renderBulkAttendanceRoster(bulkOptions.getStudents());
}

export { BULK_ROW, ROSTER_ROW };
