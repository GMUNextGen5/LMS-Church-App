/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI TOOLS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mounts a compact, minimalist "AI Tools" grid inside the AI Agent tab (right
 * above the existing conversation welcome card) and wires each tile to the
 * matching callable on the AI client facade.
 *
 * Design direction: balanced hybrid — minimal monochrome base with expressive
 * micro-interactions at key AI moments (card hover pulse, result reveal).
 *
 * Every tool opens the shared AI modal (#ai-modal) with a sanitized HTML form
 * body, submits to the facade, and renders the generated HTML (or falls back
 * to a friendly error state).
 */
import {
  AI,
  AI_TOOLS,
  isAiClientError,
  type AiToolDescriptor,
  type AiEarlyWarningAlert,
  type AiExamScanResult,
  type AiDifficulty,
  type AiEmailType,
} from '../core/ai-client';
import { showModal, showAppToast, sanitizeHTML } from './ui';
import { reportClientFault } from '../core/client-errors';
import { collection, getDocs, db } from '../core/firebase';
import { UserRole } from '../types';

const PANEL_ID = 'ai-tools-panel';

type ToolRole = 'admin' | 'teacher' | 'student' | 'parent';

interface StudentPick {
  id: string;
  name: string;
}

// ==================== MINIMAL ICON MAP ====================

const ICONS: Record<AiToolDescriptor['icon'], string> = {
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
  document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  clipboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></svg>',
  camera:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 4 4 5-7"/></svg>',
};

function roleMatches(roles: ToolRole[], role: UserRole | null): boolean {
  if (!role) return false;
  const str = role.toLowerCase() as ToolRole;
  return roles.includes(str);
}

// ==================== STUDENT PICKER CACHE ====================

let studentsCache: StudentPick[] | null = null;

async function fetchStudentPicks(): Promise<StudentPick[]> {
  if (studentsCache) return studentsCache;
  try {
    const snap = await getDocs(collection(db, 'students'));
    const picks: StudentPick[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as { name?: string } | undefined;
      if (data?.name) {
        picks.push({ id: docSnap.id, name: String(data.name) });
      }
    });
    picks.sort((a, b) => a.name.localeCompare(b.name));
    studentsCache = picks;
    return picks;
  } catch (err) {
    reportClientFault(err);
    return [];
  }
}

// ==================== PANEL RENDER ====================

/**
 * Inserts the AI Tools palette into the AI Agent welcome area.
 * Safe to call multiple times — the panel is only mounted once per DOM.
 */
export function mountAiToolsPanel(role: UserRole | null): void {
  if (!role || !roleMatches(['admin', 'teacher'], role)) return;
  const welcomeRoot = document.querySelector<HTMLElement>('[data-lms-ai-welcome-root]');
  if (!welcomeRoot) return;
  const bubble = welcomeRoot.querySelector<HTMLElement>('.glass-effect');
  if (!bubble) return;
  if (document.getElementById(PANEL_ID)) return;

  const tools = AI_TOOLS.filter((t) => roleMatches(t.roles, role));
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'ai-tools-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'AI tools');
  panel.innerHTML = `
    <div class="ai-tools-panel__header">
      <h4 class="ai-tools-panel__title">AI Tools</h4>
      <p class="ai-tools-panel__hint">Launch a task-specific AI workflow.</p>
    </div>
    <div class="ai-tools-panel__grid">
      ${tools.map((t) => renderToolCard(t)).join('')}
    </div>
  `;
  bubble.appendChild(panel);
  injectPanelStyles();
  wireDelegation(panel);
}

function renderToolCard(tool: AiToolDescriptor): string {
  const icon = ICONS[tool.icon] ?? ICONS.sparkles;
  return `
    <button
      type="button"
      class="ai-tool-card ai-tool-card--${tool.accent}"
      data-ai-tool="${tool.id}"
      aria-label="${escapeAttr(tool.title)}: ${escapeAttr(tool.description)}"
    >
      <span class="ai-tool-card__icon">${icon}</span>
      <span class="ai-tool-card__body">
        <span class="ai-tool-card__title">${escapeText(tool.title)}</span>
        <span class="ai-tool-card__desc">${escapeText(tool.description)}</span>
      </span>
      <span class="ai-tool-card__arrow" aria-hidden="true">→</span>
    </button>
  `;
}

function wireDelegation(panel: HTMLElement): void {
  panel.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-ai-tool]');
    if (!btn || !panel.contains(btn)) return;
    const toolId = btn.getAttribute('data-ai-tool') as keyof typeof AI | null;
    if (!toolId) return;
    void launchTool(toolId);
  });
}

// ==================== TOOL LAUNCHERS ====================

async function launchTool(toolId: keyof typeof AI): Promise<void> {
  switch (toolId) {
    case 'earlyWarning':
      return runEarlyWarning();
    case 'curriculumGap':
      return runCurriculumGap();
    case 'progressReport':
      return runProgressReport();
    case 'quizGenerator':
      return runQuizGenerator();
    case 'lessonPlan':
      return runLessonPlan();
    case 'parentEmail':
      return runParentEmail();
    case 'scanExamPaper':
      return runExamScanner();
    case 'bibleChat':
      return runBibleChat();
    default:
      return;
  }
}

// ---------- Early Warning (no form) ----------

async function runEarlyWarning(): Promise<void> {
  showModal(
    'Early Warning System',
    `<div class="ai-tool-result" data-lms-ai-busy>${loadingMarkup('Scanning your students for risk signals…')}</div>`
  );
  try {
    const res = await AI.earlyWarning();
    showModal(
      `Early Warning — ${res.studentsAnalyzed} students analyzed`,
      renderEarlyWarningHtml(res.alerts)
    );
  } catch (err) {
    showErrorResult('Could not run early-warning analysis.', err);
  }
}

function renderEarlyWarningHtml(alerts: AiEarlyWarningAlert[]): string {
  if (!alerts || alerts.length === 0) {
    return `
      <div class="ai-card">
        <h3 class="ai-title">All clear</h3>
        <div class="ai-body">
          <p>No at-risk students detected in the current data window.</p>
        </div>
      </div>`;
  }
  const rows = alerts
    .map((a) => {
      const level = String(a?.riskLevel ?? 'low');
      return `
        <div class="ai-card ai-card--risk-${escapeAttr(level)}">
          <h3 class="ai-title">${escapeText(a?.studentName ?? 'Student')} — <span class="ai-pill ai-pill--${escapeAttr(level)}">${escapeText(level)} risk</span></h3>
          <div class="ai-body">
            <p><strong>Grade average:</strong> ${formatPct(a?.gradeAverage)} · <strong>Attendance:</strong> ${formatPct(a?.attendanceRate)}</p>
            <ul class="ai-list">${(a?.reasons ?? [])
              .map((r: string) => `<li>${escapeText(r)}</li>`)
              .join('')}</ul>
            <p><strong>Next step:</strong> ${escapeText(a?.recommendation ?? '')}</p>
          </div>
        </div>`;
    })
    .join('');
  return `<div class="ai-tool-result">${rows}</div>`;
}

// ---------- Curriculum Gap ----------

async function runCurriculumGap(): Promise<void> {
  showModal(
    'Curriculum Gap Analysis',
    `<div class="ai-tool-result" data-lms-ai-busy>${loadingMarkup('Analyzing class-wide performance…')}</div>`
  );
  try {
    const res = await AI.curriculumGap({});
    showModal(
      `Curriculum Gap — ${res.studentsAnalyzed} students`,
      `<div class="ai-tool-result">${res.reportHtml}</div>`
    );
  } catch (err) {
    showErrorResult('Could not run curriculum gap analysis.', err);
  }
}

// ---------- Progress Report ----------

async function runProgressReport(): Promise<void> {
  const students = await fetchStudentPicks();
  showModal(
    'Progress Report',
    renderFormShell({
      fields: [studentSelectField(students)],
      submitLabel: 'Generate report',
      toolId: 'progressReport',
    })
  );
  bindFormSubmit('progressReport', async (values) => {
    const { studentId } = values;
    if (!studentId) throw new Error('Please select a student.');
    const res = await AI.progressReport({ studentId });
    showModal(
      `Progress Report — ${res.studentName}`,
      `<div class="ai-tool-result">${res.reportHtml}</div>`
    );
  });
}

// ---------- Quiz Generator ----------

async function runQuizGenerator(): Promise<void> {
  showModal(
    'Quiz Generator',
    renderFormShell({
      fields: [
        textField({ name: 'topic', label: 'Topic', placeholder: 'Photosynthesis' }),
        textField({ name: 'gradeLevel', label: 'Grade level', placeholder: 'Grade 9' }),
        numberField({
          name: 'questionCount',
          label: '# of questions',
          value: '10',
          min: 3,
          max: 30,
        }),
        selectField({
          name: 'difficulty',
          label: 'Difficulty',
          options: [
            ['easy', 'Easy'],
            ['medium', 'Medium'],
            ['hard', 'Hard'],
          ],
          value: 'medium',
        }),
        selectField({
          name: 'questionTypes',
          label: 'Question types',
          options: [
            ['mixed', 'Mixed'],
            ['multiple-choice', 'Multiple choice'],
            ['true-false', 'True / False'],
            ['short-answer', 'Short answer'],
          ],
          value: 'mixed',
        }),
      ],
      submitLabel: 'Generate quiz',
      toolId: 'quizGenerator',
    })
  );
  bindFormSubmit('quizGenerator', async (values) => {
    const res = await AI.quizGenerator({
      topic: values.topic,
      gradeLevel: values.gradeLevel || 'Grade 9',
      questionCount: Number(values.questionCount) || 10,
      difficulty: (values.difficulty as AiDifficulty) || 'medium',
      questionTypes: values.questionTypes || 'mixed',
    });
    showModal(
      `Quiz — ${values.topic}`,
      `<div class="ai-tool-result">
        <div class="ai-card"><h3 class="ai-title">Quiz</h3><div class="ai-body">${res.quizHtml}</div></div>
        <div class="ai-card"><h3 class="ai-title">Answer key</h3><div class="ai-body">${res.answerKeyHtml || '<p>No answer key was generated.</p>'}</div></div>
      </div>`
    );
  });
}

// ---------- Lesson Plan ----------

async function runLessonPlan(): Promise<void> {
  showModal(
    'Lesson Plan Generator',
    renderFormShell({
      fields: [
        textField({ name: 'topic', label: 'Topic', placeholder: 'Cellular respiration' }),
        textField({ name: 'subject', label: 'Subject', placeholder: 'Biology' }),
        textField({ name: 'gradeLevel', label: 'Grade level', placeholder: 'Grade 10' }),
        textField({ name: 'duration', label: 'Duration', placeholder: '45 minutes' }),
        textField({
          name: 'objectives',
          label: 'Objectives (optional)',
          placeholder: 'Explain ATP generation, contrast aerobic vs anaerobic',
        }),
      ],
      submitLabel: 'Generate lesson plan',
      toolId: 'lessonPlan',
    })
  );
  bindFormSubmit('lessonPlan', async (values) => {
    const res = await AI.lessonPlan({
      topic: values.topic,
      subject: values.subject || 'General',
      gradeLevel: values.gradeLevel || 'Grade 9',
      duration: values.duration || '45 minutes',
      objectives: values.objectives || undefined,
    });
    showModal(
      `Lesson Plan — ${values.topic}`,
      `<div class="ai-tool-result">${res.lessonPlanHtml}</div>`
    );
  });
}

// ---------- Parent Email ----------

async function runParentEmail(): Promise<void> {
  const students = await fetchStudentPicks();
  showModal(
    'Parent Email Drafter',
    renderFormShell({
      fields: [
        studentSelectField(students),
        selectField({
          name: 'emailType',
          label: 'Email type',
          options: [
            ['progress', 'Progress update'],
            ['concern', 'Concern'],
            ['achievement', 'Achievement'],
            ['attendance', 'Attendance'],
          ],
          value: 'progress',
        }),
        textField({ name: 'parentName', label: 'Parent name (optional)', placeholder: '' }),
        textField({
          name: 'context',
          label: 'Context / notes',
          placeholder: 'Any specifics the AI should mention',
        }),
      ],
      submitLabel: 'Draft email',
      toolId: 'parentEmail',
    })
  );
  bindFormSubmit('parentEmail', async (values) => {
    if (!values.studentId) throw new Error('Please select a student.');
    const res = await AI.parentEmail({
      studentId: values.studentId,
      emailType: (values.emailType as AiEmailType) || 'progress',
      parentName: values.parentName || undefined,
      context: values.context || '',
    });
    showModal(
      `Email draft — ${res.studentName}`,
      `<div class="ai-tool-result">
        <div class="ai-card"><h3 class="ai-title">Subject</h3><div class="ai-body"><p><strong>${escapeText(res.subject)}</strong></p></div></div>
        <div class="ai-card"><h3 class="ai-title">Body</h3><div class="ai-body"><pre class="ai-pre">${escapeText(res.body)}</pre></div></div>
      </div>`
    );
  });
}

// ---------- Bible Chat ----------

async function runBibleChat(): Promise<void> {
  showModal(
    'Bible Companion',
    `
      <div class="ai-tool-result">
        <div id="ai-bible-log" class="ai-bible-log" aria-live="polite"></div>
        <div class="ai-bible-input">
          <input id="ai-bible-message" type="text" aria-label="Ask the Bible Companion" placeholder="Ask a question or a verse to read…" class="ai-input" />
          <button id="ai-bible-send" type="button" class="ai-btn ai-btn--primary">Send</button>
        </div>
      </div>
    `
  );
  const log = document.getElementById('ai-bible-log');
  const input = document.getElementById('ai-bible-message') as HTMLInputElement | null;
  const send = document.getElementById('ai-bible-send') as HTMLButtonElement | null;
  if (!log || !input || !send) return;
  const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  const append = (who: 'you' | 'ai', text: string) => {
    const row = document.createElement('div');
    row.className =
      who === 'you' ? 'ai-bible-row ai-bible-row--you' : 'ai-bible-row ai-bible-row--ai';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bible-bubble';
    bubble.innerHTML = sanitizeHTML(text.replace(/\n/g, '<br>'));
    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  };
  const submit = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    append('you', msg);
    history.push({ role: 'user', parts: [{ text: msg }] });
    input.value = '';
    send.disabled = true;
    try {
      const res = await AI.bibleChat({ message: msg, conversationHistory: history });
      append('ai', res.reply);
      history.push({ role: 'model', parts: [{ text: res.reply }] });
    } catch (err) {
      appendError(log, err);
    } finally {
      send.disabled = false;
      input.focus();
    }
  };
  send.addEventListener('click', () => {
    void submit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });
  input.focus();
}

// ---------- Exam Scanner ----------

async function runExamScanner(): Promise<void> {
  showModal(
    'Exam Scanner',
    `
      <div class="ai-tool-result">
        <p class="ai-tool-hint">Drop a photo of a completed exam (JPG or PNG, up to 5MB) and the AI will extract questions and student answers.</p>
        <label class="ai-upload">
          <input id="ai-scanner-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload exam image" />
          <span class="ai-upload__label">Choose image…</span>
        </label>
        <div id="ai-scanner-preview" class="ai-scanner-preview" aria-hidden="true"></div>
        <label class="ai-field">
          <span class="ai-field__label">Optional hints for the AI</span>
          <input id="ai-scanner-hints" type="text" class="ai-input" placeholder="e.g. Grade 8 History, mostly short-answer" />
        </label>
        <div class="ai-form__actions">
          <button id="ai-scanner-run" type="button" class="ai-btn ai-btn--primary" disabled>Extract exam</button>
        </div>
        <div id="ai-scanner-output" class="ai-scanner-output"></div>
      </div>
    `
  );
  const fileInput = document.getElementById('ai-scanner-file') as HTMLInputElement | null;
  const preview = document.getElementById('ai-scanner-preview');
  const runBtn = document.getElementById('ai-scanner-run') as HTMLButtonElement | null;
  const hintsInput = document.getElementById('ai-scanner-hints') as HTMLInputElement | null;
  const output = document.getElementById('ai-scanner-output');
  if (!fileInput || !preview || !runBtn || !output) return;

  let currentBase64: string | null = null;
  let currentMime = 'image/jpeg';

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    preview.innerHTML = '';
    runBtn.disabled = true;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showAppToast('Image must be under 5MB.', 'error');
      return;
    }
    currentMime = file.type || 'image/jpeg';
    const dataUrl = await readFileAsDataURL(file);
    const comma = dataUrl.indexOf(',');
    currentBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Preview of the uploaded exam';
    preview.appendChild(img);
    runBtn.disabled = false;
  });

  runBtn.addEventListener('click', async () => {
    if (!currentBase64) return;
    runBtn.disabled = true;
    output.innerHTML = loadingMarkup('Extracting text from the image…');
    try {
      const res = await AI.scanExamPaper({
        imageBase64: currentBase64,
        mimeType: currentMime,
        hints: hintsInput?.value || undefined,
      });
      output.innerHTML = sanitizeHTML(renderExamResult(res));
    } catch (err) {
      appendError(output, err);
    } finally {
      runBtn.disabled = false;
    }
  });
}

function renderExamResult(res: AiExamScanResult): string {
  const warn =
    res.warnings && res.warnings.length
      ? `<div class="ai-card ai-card--warn"><h3 class="ai-title">Warnings</h3><div class="ai-body"><ul class="ai-list">${res.warnings
          .map((w) => `<li>${escapeText(w)}</li>`)
          .join('')}</ul></div></div>`
      : '';
  const meta = `
    <div class="ai-card"><h3 class="ai-title">Detected</h3>
      <div class="ai-body">
        <p><strong>Student:</strong> ${escapeText(res.studentName ?? 'Not detected')}</p>
        <p><strong>Assessment:</strong> ${escapeText(res.assessmentTitle ?? 'Not detected')}</p>
        <p><strong>Date:</strong> ${escapeText(res.detectedDate ?? 'Not detected')}</p>
      </div>
    </div>`;
  const items = (res.questions ?? [])
    .map(
      (q, i) => `
      <div class="ai-card">
        <h3 class="ai-title">Q${escapeText(String(q?.number ?? i + 1))} · <span class="ai-pill">${escapeText(String(q?.type ?? 'short-answer'))}</span></h3>
        <div class="ai-body">
          <p><strong>Prompt:</strong> ${escapeText(String(q?.prompt ?? ''))}</p>
          <p><strong>Student answer:</strong> ${escapeText(String(q?.studentAnswer ?? ''))}</p>
          ${typeof q?.points === 'number' ? `<p><strong>Points:</strong> ${escapeText(String(q.points))}</p>` : ''}
        </div>
      </div>`
    )
    .join('');
  return meta + warn + items;
}

// ==================== FORM UTILITIES ====================

interface FieldSpec {
  kind: 'text' | 'number' | 'select' | 'student';
  name: string;
  label: string;
  placeholder?: string;
  value?: string;
  min?: number;
  max?: number;
  options?: Array<[string, string]>;
}

function textField(opts: {
  name: string;
  label: string;
  placeholder?: string;
  value?: string;
}): FieldSpec {
  return { kind: 'text', ...opts };
}
function numberField(opts: {
  name: string;
  label: string;
  value?: string;
  min?: number;
  max?: number;
}): FieldSpec {
  return { kind: 'number', ...opts };
}
function selectField(opts: {
  name: string;
  label: string;
  options: Array<[string, string]>;
  value?: string;
}): FieldSpec {
  return { kind: 'select', ...opts };
}
function studentSelectField(students: StudentPick[]): FieldSpec {
  return {
    kind: 'student',
    name: 'studentId',
    label: 'Student',
    options: students.map((s) => [s.id, s.name]),
  };
}

function renderField(f: FieldSpec): string {
  if (f.kind === 'select' || f.kind === 'student') {
    const opts = (f.options ?? [])
      .map(
        ([v, l]) =>
          `<option value="${escapeAttr(v)}"${v === f.value ? ' ' : ''}>${escapeText(l)}</option>`
      )
      .join('');
    const placeholder =
      f.kind === 'student' && !f.value ? '<option value="" >Select a student…</option>' : '';
    return `
      <label class="ai-field">
        <span class="ai-field__label">${escapeText(f.label)}</span>
        <select class="ai-input" name="${escapeAttr(f.name)}" data-ai-field="${escapeAttr(f.name)}">${placeholder}${opts}</select>
      </label>`;
  }
  const type = f.kind === 'number' ? 'number' : 'text';
  const extra = f.kind === 'number' ? ` value="${escapeAttr(f.value ?? '')}"` : '';
  return `
    <label class="ai-field">
      <span class="ai-field__label">${escapeText(f.label)}</span>
      <input class="ai-input" type="${type}" name="${escapeAttr(f.name)}" data-ai-field="${escapeAttr(f.name)}" placeholder="${escapeAttr(f.placeholder ?? '')}"${extra} />
    </label>`;
}

function renderFormShell(opts: {
  fields: FieldSpec[];
  submitLabel: string;
  toolId: string;
}): string {
  return `
    <div class="ai-form" data-ai-form="${escapeAttr(opts.toolId)}">
      ${opts.fields.map(renderField).join('')}
      <div class="ai-form__actions">
        <button type="button" class="ai-btn ai-btn--primary" data-ai-submit="${escapeAttr(opts.toolId)}">${escapeText(opts.submitLabel)}</button>
      </div>
      <div class="ai-form__status" data-ai-status></div>
    </div>
  `;
}

function bindFormSubmit(
  toolId: string,
  handler: (values: Record<string, string>) => Promise<void>
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const content = document.getElementById('ai-modal-content');
      if (!content) return;
      const form = content.querySelector<HTMLElement>(`[data-ai-form="${toolId}"]`);
      if (!form) return;

      const runHandler = async (): Promise<void> => {
        const btn = form.querySelector<HTMLButtonElement>(`[data-ai-submit="${toolId}"]`);
        const status = form.querySelector<HTMLElement>('[data-ai-status]');
        const values: Record<string, string> = {};
        form
          .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-ai-field]')
          .forEach((el) => {
            values[el.getAttribute('data-ai-field') ?? ''] = (el as HTMLInputElement).value ?? '';
          });
        if (btn) btn.disabled = true;
        if (status) status.innerHTML = loadingMarkup('Working on it…');
        try {
          await handler(values);
        } catch (err) {
          if (status) {
            status.innerHTML = '';
            appendError(status, err);
          }
          if (err instanceof Error) {
            showAppToast(err.message, 'error');
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      };

      // Bind click on the submit button.
      const submitBtn = form.querySelector<HTMLButtonElement>(`[data-ai-submit="${toolId}"]`);
      submitBtn?.addEventListener('click', () => {
        void runHandler();
      });

      // Keyboard UX: pressing Enter in any text input submits the form
      // (matches native <form> behavior without requiring a form element).
      form
        .querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"]')
        .forEach((input) => {
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              void runHandler();
            }
          });
        });
    });
  });
}

// ==================== HELPERS ====================

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadingMarkup(label: string): string {
  return `
    <div class="ai-loading" role="status" aria-live="polite">
      <span class="ai-loading__dot"></span>
      <span class="ai-loading__dot"></span>
      <span class="ai-loading__dot"></span>
      <span class="ai-loading__label">${escapeText(label)}</span>
    </div>`;
}

function appendError(container: Element, err: unknown): void {
  const message = isAiClientError(err)
    ? err.message
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';
  const html = `<div class="ai-card ai-card--error"><h3 class="ai-title">Unable to complete</h3><div class="ai-body"><p>${escapeText(
    message
  )}</p></div></div>`;
  container.insertAdjacentHTML('beforeend', sanitizeHTML(html));
  reportClientFault(err);
}

function showErrorResult(title: string, err: unknown): void {
  const message = isAiClientError(err)
    ? err.message
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';
  showModal(
    title,
    `<div class="ai-tool-result"><div class="ai-card ai-card--error"><h3 class="ai-title">${escapeText(title)}</h3><div class="ai-body"><p>${escapeText(message)}</p></div></div></div>`
  );
  reportClientFault(err);
}

function escapeText(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(v: unknown): string {
  return String(v ?? '')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
function formatPct(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

// ==================== STYLES ====================
//
// Keep all the AI-tools specific styles co-located so the module is entirely
// self-contained. Uses CSS variables that already exist in the app for theme
// alignment (light + dark). Designed with the "balanced hybrid" philosophy:
// minimal monochrome base, expressive micro-interactions only at key moments.

let stylesInjected = false;
function injectPanelStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-lms-ai-tools', '');
  style.textContent = `
    .ai-tools-panel { margin-top: 1.25rem; }
    .ai-tools-panel__header { display:flex; align-items:baseline; justify-content:space-between; gap:.5rem; margin-bottom:.75rem; }
    .ai-tools-panel__title { font-weight:600; font-size:.95rem; letter-spacing:-.01em; margin:0; color: inherit; }
    .ai-tools-panel__hint { margin:0; font-size:.8rem; color: rgb(120 120 128); }
    .ai-tools-panel__grid { display:grid; grid-template-columns:1fr; gap:.5rem; }
    @media (min-width:640px) { .ai-tools-panel__grid { grid-template-columns:1fr 1fr; } }
    @media (min-width:1024px) { .ai-tools-panel__grid { grid-template-columns:1fr 1fr 1fr; } }

    .ai-tool-card {
      display:flex; align-items:center; gap:.75rem; padding:.75rem .875rem;
      border-radius:14px; border:1px solid rgba(0,0,0,.08);
      background:#fff; color: inherit;
      text-align:left; cursor:pointer; position:relative;
      transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease, background .2s ease;
      box-shadow: 0 1px 0 rgba(15,23,42,.02);
    }
    .ai-tool-card:hover { transform: translateY(-1px); border-color: rgba(0,0,0,.15); box-shadow: 0 6px 24px -12px rgba(15,23,42,.18); }
    .ai-tool-card:active { transform: translateY(0); }
    .ai-tool-card:focus-visible { outline: 2px solid rgb(99 102 241); outline-offset:2px; }

    .dark .ai-tool-card { background: rgba(30,41,59,.6); border-color: rgba(255,255,255,.08); }
    .dark .ai-tool-card:hover { border-color: rgba(255,255,255,.16); background: rgba(30,41,59,.8); }

    .ai-tool-card__icon {
      width:36px; height:36px; flex-shrink:0; border-radius:10px;
      display:flex; align-items:center; justify-content:center;
      background:#f4f4f5; color:#18181b;
      transition: transform .25s cubic-bezier(.2,.8,.2,1);
    }
    .ai-tool-card:hover .ai-tool-card__icon { transform: scale(1.06); }
    .ai-tool-card__icon svg { width:18px; height:18px; }
    .dark .ai-tool-card__icon { background: rgba(255,255,255,.06); color:#f4f4f5; }

    .ai-tool-card--violet .ai-tool-card__icon { background: rgba(139,92,246,.12); color:#6d28d9; }
    .ai-tool-card--emerald .ai-tool-card__icon { background: rgba(16,185,129,.12); color:#047857; }
    .ai-tool-card--rose .ai-tool-card__icon { background: rgba(244,63,94,.12); color:#be123c; }
    .ai-tool-card--amber .ai-tool-card__icon { background: rgba(245,158,11,.14); color:#b45309; }
    .ai-tool-card--sky .ai-tool-card__icon { background: rgba(14,165,233,.12); color:#0369a1; }
    .ai-tool-card--slate .ai-tool-card__icon { background: rgba(100,116,139,.14); color:#334155; }
    .dark .ai-tool-card--violet .ai-tool-card__icon { color:#c4b5fd; }
    .dark .ai-tool-card--emerald .ai-tool-card__icon { color:#6ee7b7; }
    .dark .ai-tool-card--rose .ai-tool-card__icon { color:#fda4af; }
    .dark .ai-tool-card--amber .ai-tool-card__icon { color:#fcd34d; }
    .dark .ai-tool-card--sky .ai-tool-card__icon { color:#7dd3fc; }
    .dark .ai-tool-card--slate .ai-tool-card__icon { color:#cbd5e1; }

    .ai-tool-card__body { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .ai-tool-card__title { font-size:.875rem; font-weight:600; color: inherit; }
    .ai-tool-card__desc { font-size:.78rem; color: rgb(100 116 139); line-height:1.4; }
    .dark .ai-tool-card__desc { color: rgb(148 163 184); }
    .ai-tool-card__arrow { margin-left:auto; color: rgb(148 163 184); font-size:.95rem; transition: transform .2s ease; }
    .ai-tool-card:hover .ai-tool-card__arrow { transform: translateX(2px); }

    /* Tool modal body */
    .ai-tool-result { display:flex; flex-direction:column; gap:.75rem; }
    .ai-tool-hint { font-size:.85rem; color: rgb(100 116 139); margin:0; }
    .dark .ai-tool-hint { color: rgb(148 163 184); }

    /* Form primitives */
    .ai-form { display:flex; flex-direction:column; gap:.625rem; }
    .ai-form__actions { display:flex; justify-content:flex-end; margin-top:.25rem; }
    .ai-form__status { min-height:1rem; }
    .ai-field { display:flex; flex-direction:column; gap:.25rem; font-size:.825rem; }
    .ai-field__label { font-weight:500; color: rgb(63 63 70); }
    .dark .ai-field__label { color: rgb(226 232 240); }
    .ai-input {
      width:100%; padding:.55rem .7rem;
      border-radius:10px; border:1px solid rgba(0,0,0,.12);
      background:#fff; color:#18181b; font-size:.875rem;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    .ai-input:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.15); }
    .dark .ai-input { background: rgba(15,23,42,.6); color:#f1f5f9; border-color: rgba(255,255,255,.12); }
    select.ai-input { appearance:none; -webkit-appearance:none; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; padding-right:2rem; }

    .ai-btn {
      display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
      padding:.55rem 1rem; border-radius:10px; border:1px solid transparent;
      font-size:.875rem; font-weight:600; cursor:pointer;
      transition: background .15s ease, transform .1s ease, box-shadow .15s ease;
    }
    .ai-btn:disabled { opacity:.55; cursor: not-allowed; }
    .ai-btn--primary { background:#171717; color:#fafafa; }
    .ai-btn--primary:hover:not(:disabled) { background:#27272a; }
    .ai-btn--primary:active:not(:disabled) { transform: translateY(1px); }
    .dark .ai-btn--primary { background:#e4e4e7; color:#18181b; }
    .dark .ai-btn--primary:hover:not(:disabled) { background:#fafafa; }

    /* Result cards */
    .ai-card { border:1px solid rgba(0,0,0,.08); border-radius:14px; background:#fff; padding:1rem; }
    .dark .ai-card { background: rgba(15,23,42,.55); border-color: rgba(255,255,255,.08); }
    .ai-card h3.ai-title { margin:0 0 .5rem; font-size:.95rem; font-weight:600; }
    .ai-card .ai-body { font-size:.875rem; line-height:1.55; color: rgb(39 39 42); }
    .dark .ai-card .ai-body { color: rgb(226 232 240); }
    .ai-card--error { border-color: rgba(225,29,72,.3); background: rgba(254,242,242,.7); }
    .dark .ai-card--error { background: rgba(190,18,60,.12); }
    .ai-card--warn { border-color: rgba(217,119,6,.3); background: rgba(254,252,232,.7); }
    .dark .ai-card--warn { background: rgba(180,83,9,.12); }

    .ai-card--risk-high { border-color: rgba(225,29,72,.35); }
    .ai-card--risk-medium { border-color: rgba(234,179,8,.4); }
    .ai-card--risk-low { border-color: rgba(14,165,233,.35); }

    .ai-pill { display:inline-flex; align-items:center; padding:.1rem .5rem; border-radius:999px; background:#f4f4f5; color:#3f3f46; font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
    .dark .ai-pill { background: rgba(255,255,255,.08); color:#e4e4e7; }
    .ai-pill--high { background: rgba(225,29,72,.12); color:#9f1239; }
    .ai-pill--medium { background: rgba(234,179,8,.12); color:#854d0e; }
    .ai-pill--low { background: rgba(14,165,233,.12); color:#0369a1; }

    .ai-list { margin:.25rem 0; padding-left:1.1rem; }
    .ai-list li { margin:.15rem 0; }
    .ai-pre { white-space:pre-wrap; font-family: inherit; font-size:.85rem; line-height:1.55; margin:0; }

    /* Loading */
    .ai-loading { display:inline-flex; align-items:center; gap:.5rem; font-size:.85rem; color: rgb(82 82 91); }
    .dark .ai-loading { color: rgb(203 213 225); }
    .ai-loading__dot { width:6px; height:6px; border-radius:999px; background: currentColor; animation: aiLoadingDot 1s infinite ease-in-out; }
    .ai-loading__dot:nth-child(2) { animation-delay:.12s; }
    .ai-loading__dot:nth-child(3) { animation-delay:.24s; }
    @keyframes aiLoadingDot { 0%,80%,100% { transform: scale(.6); opacity:.5; } 40% { transform: scale(1); opacity:1; } }

    /* Bible chat */
    .ai-bible-log { max-height: 320px; overflow-y:auto; display:flex; flex-direction:column; gap:.5rem; padding:.25rem; }
    .ai-bible-row { display:flex; }
    .ai-bible-row--you { justify-content:flex-end; }
    .ai-bible-bubble { max-width:80%; padding:.55rem .75rem; border-radius:14px; font-size:.875rem; line-height:1.5; }
    .ai-bible-row--you .ai-bible-bubble { background:#18181b; color:#fafafa; border-bottom-right-radius:4px; }
    .ai-bible-row--ai .ai-bible-bubble { background:#f4f4f5; color:#18181b; border-bottom-left-radius:4px; }
    .dark .ai-bible-row--you .ai-bible-bubble { background:#e4e4e7; color:#18181b; }
    .dark .ai-bible-row--ai .ai-bible-bubble { background: rgba(30,41,59,.7); color:#f1f5f9; }
    .ai-bible-input { display:flex; gap:.5rem; margin-top:.75rem; }
    .ai-bible-input .ai-input { flex:1; }

    /* Scanner */
    .ai-upload { display:block; cursor:pointer; padding:1rem; border:1.5px dashed rgba(0,0,0,.15); border-radius:12px; text-align:center; background:#fafafa; transition: border-color .15s ease, background .15s ease; }
    .ai-upload:hover { border-color: rgba(0,0,0,.3); background:#f4f4f5; }
    .dark .ai-upload { background: rgba(15,23,42,.4); border-color: rgba(255,255,255,.12); }
    .dark .ai-upload:hover { border-color: rgba(255,255,255,.22); background: rgba(15,23,42,.6); }
    .ai-upload input[type=file] { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
    .ai-upload__label { font-size:.875rem; font-weight:500; }
    .ai-scanner-preview img { width:100%; max-height: 260px; object-fit:contain; border-radius:10px; margin-top:.5rem; border:1px solid rgba(0,0,0,.08); }
    .ai-scanner-output { display:flex; flex-direction:column; gap:.5rem; margin-top:.5rem; }

    /* Expressive micro-interactions: result cards fade-up on reveal. */
    .ai-tool-result > * {
      animation: aiCardReveal .45s cubic-bezier(.25,.46,.45,.94) both;
    }
    .ai-tool-result > *:nth-child(2) { animation-delay: .06s; }
    .ai-tool-result > *:nth-child(3) { animation-delay: .12s; }
    .ai-tool-result > *:nth-child(4) { animation-delay: .18s; }
    .ai-tool-result > *:nth-child(n+5) { animation-delay: .24s; }
    @keyframes aiCardReveal {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Mobile-first tap targets: ensure AI-tools interactions meet WCAG 2.2 AA (44pt). */
    @media (max-width: 640px) {
      .ai-tools-panel__grid { gap:.625rem; }
      .ai-tool-card { padding: .875rem; min-height: 64px; }
      .ai-btn { min-height: 44px; padding: .65rem 1rem; }
      .ai-input { min-height: 44px; }
      .ai-bible-input .ai-btn { min-height: 44px; }
    }

    /* Spring-physics press feedback (Material 3 Expressive "hero moment"): a
       brief, damped bounce on primary action. Only applied on pointer-capable
       devices so it never feels laggy on touch. */
    @media (hover: hover) {
      .ai-btn--primary { transition: background .18s cubic-bezier(.2,.8,.2,1), transform .22s cubic-bezier(.22,1.4,.36,1), box-shadow .18s ease; }
      .ai-btn--primary:active:not(:disabled) { transform: translateY(1px) scale(.985); }
    }

    /* Respect user preference for reduced motion — disable all animated
       micro-interactions (transforms, fades, spinner) per WCAG 2.3.3. */
    @media (prefers-reduced-motion: reduce) {
      .ai-tool-card,
      .ai-tool-card:hover,
      .ai-tool-card__icon,
      .ai-tool-card__arrow,
      .ai-tool-result > *,
      .ai-btn,
      .ai-btn--primary,
      .ai-input,
      .ai-loading__dot {
        animation: none !important;
        transition: none !important;
        transform: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}
