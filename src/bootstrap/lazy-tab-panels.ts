let assessmentsInited = false;
let classesInited = false;
let assessmentModule: typeof import('../ui/assessment-ui') | null = null;

export async function ensureAssessmentsModule(): Promise<typeof import('../ui/assessment-ui')> {
  if (!assessmentModule) {
    assessmentModule = await import('../ui/assessment-ui');
  }
  if (!assessmentsInited) {
    assessmentModule.initAssessments();
    assessmentsInited = true;
  }
  return assessmentModule;
}

export async function ensureClassesModule(): Promise<typeof import('../ui/classes-ui')> {
  const m = await import('../ui/classes-ui');
  if (!classesInited) {
    m.initClasses();
    classesInited = true;
  }
  return m;
}

export async function loadAssessmentsTab(): Promise<void> {
  const m = await ensureAssessmentsModule();
  await m.loadAssessments();
}

export async function loadClassesTab(): Promise<void> {
  const m = await ensureClassesModule();
  await m.loadClasses();
}

/** Loads classes chunk only when needed to dismiss open modals (sign-out / reset). */
export function dismissClassesModalsSafe(): void {
  void import('../ui/classes-ui')
    .then((m) => m.dismissClassesModals())
    .catch(() => {
      /* optional */
    });
}

export function prefetchTabPanelChunks(): void {
  const run = (): void => {
    void ensureAssessmentsModule().catch(() => {
      /* optional */
    });
    void ensureClassesModule().catch(() => {
      /* optional */
    });
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    window.setTimeout(run, 200);
  }
}
