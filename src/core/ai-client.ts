/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI CLIENT FACADE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralized, typed wrapper over every AI-related Firebase callable so the
 * rest of the application never has to talk to `httpsCallable` directly.
 *
 * Benefits:
 * - One place to add timeouts, metrics, and retries.
 * - Uniform error normalization (HttpsError -> friendly Error with `.code`).
 * - A stable, documented contract between UI and backend.
 *
 * All callables here are defined in firebase-functions/src/index.ts.
 */
import { functions, httpsCallable } from './firebase';

// ==================== TYPES ====================

export type AiEmailType = 'progress' | 'concern' | 'achievement' | 'attendance';
export type AiRiskLevel = 'high' | 'medium' | 'low';
export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface AiPerformanceSummaryRequest {
  studentId: string;
}
export interface AiPerformanceSummaryResult {
  summaryHtml: string;
  studentName: string;
  generatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AiStudyTipsRequest {
  studentId: string;
}
export interface AiStudyTipsResult {
  tipsHtml: string;
  studentName: string;
  generatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AiAgentChatRequest {
  message: string;
  conversationHistory?: Array<{ user: string; assistant: string }>;
}
export interface AiAgentChatResult {
  response: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AiBibleChatRequest {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
}
export interface AiBibleChatResult {
  reply: string;
  generatedAt: string;
}

export interface AiProgressReportRequest {
  studentId: string;
  reportPeriod?: string;
}
export interface AiProgressReportResult {
  reportHtml: string;
  studentName: string;
  generatedAt: string;
}

export interface AiQuizGeneratorRequest {
  topic: string;
  gradeLevel?: string;
  questionCount?: number;
  difficulty?: AiDifficulty;
  questionTypes?: string;
}
export interface AiQuizGeneratorResult {
  quizHtml: string;
  answerKeyHtml: string;
  rawHtml: string;
  generatedAt: string;
}

export interface AiLessonPlanRequest {
  topic: string;
  subject?: string;
  gradeLevel?: string;
  duration?: string;
  objectives?: string;
}
export interface AiLessonPlanResult {
  lessonPlanHtml: string;
  generatedAt: string;
}

export interface AiParentEmailRequest {
  studentId: string;
  emailType?: AiEmailType;
  parentName?: string;
  context?: string;
}
export interface AiParentEmailResult {
  subject: string;
  body: string;
  studentName: string;
  emailType: AiEmailType;
  generatedAt: string;
}

export interface AiCurriculumGapRequest {
  className?: string;
  timeRange?: string;
  courseId?: string;
}
export interface AiCurriculumGapResult {
  reportHtml: string;
  studentsAnalyzed: number;
  generatedAt: string;
}

export interface AiEarlyWarningAlert {
  studentId: string;
  studentName: string;
  riskLevel: AiRiskLevel;
  gradeAverage: number;
  attendanceRate: number;
  reasons: string[];
  recommendation: string;
}
export interface AiEarlyWarningResult {
  alerts: AiEarlyWarningAlert[];
  studentsAnalyzed: number;
  generatedAt: string;
}

export interface AiVoiceCommandRequest {
  transcript: string;
  contextHint?: string;
}
export interface AiVoiceCommandResult {
  action: string;
  parameters: Record<string, unknown>;
  confirmationMessage: string;
  requiresConfirmation: boolean;
  generatedAt: string;
}

export interface AiExamScanRequest {
  imageBase64: string;
  mimeType: string;
  hints?: string;
}
export interface AiExamScanQuestion {
  number: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer' | 'essay';
  prompt: string;
  studentAnswer: string;
  points: number | null;
}
export interface AiExamScanResult {
  studentName: string | null;
  assessmentTitle: string | null;
  detectedDate: string | null;
  questions: AiExamScanQuestion[];
  warnings: string[];
  generatedAt: string;
}

// ==================== ERROR NORMALIZATION ====================

export interface AiClientError extends Error {
  code: string;
  details?: unknown;
  isAiClientError: true;
}

interface RawCallableError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
}

function normalizeError(callable: string, err: unknown): AiClientError {
  const rawErr = (err ?? {}) as RawCallableError;
  const rawMsg: string =
    typeof rawErr.message === 'string' && rawErr.message
      ? rawErr.message
      : 'Unexpected AI service error';
  const code: string = typeof rawErr.code === 'string' && rawErr.code ? rawErr.code : 'unknown';

  let friendly = rawMsg;
  if (code === 'unauthenticated') {
    friendly = 'Please sign in again to use AI features.';
  } else if (code === 'permission-denied') {
    friendly = "You don't have permission to use this AI tool.";
  } else if (code === 'failed-precondition' && /not configured/i.test(rawMsg)) {
    friendly = 'AI is not configured on this environment yet. Contact your administrator.';
  } else if (code === 'deadline-exceeded' || /timed out/i.test(rawMsg)) {
    friendly = 'The AI service took too long to respond. Please try again.';
  } else if (code === 'resource-exhausted') {
    friendly = 'AI quota reached. Please try again later.';
  } else if (/network|fetch|offline/i.test(rawMsg)) {
    friendly = 'Network issue reaching the AI service. Check your connection and try again.';
  }

  const normalized = new Error(friendly) as AiClientError;
  normalized.code = code;
  normalized.details = rawErr.details;
  normalized.isAiClientError = true;
  (normalized as AiClientError & { callable: string }).callable = callable;
  return normalized;
}

async function callAi<TReq, TRes>(callable: string, data: TReq, timeoutMs: number): Promise<TRes> {
  if (!functions) {
    throw normalizeError(callable, new Error('Firebase not initialized'));
  }
  try {
    const fn = httpsCallable(functions, callable, { timeout: timeoutMs });
    const result = (await fn(data as unknown as Record<string, unknown>)) as { data: TRes };
    return result.data;
  } catch (err) {
    throw normalizeError(callable, err);
  }
}

// ==================== PUBLIC API ====================

/**
 * `AI` is the single export the rest of the app should use to invoke callables.
 *
 * Example:
 *   const { reply } = await AI.bibleChat({ message, conversationHistory });
 */
export const AI = {
  performanceSummary: (req: AiPerformanceSummaryRequest) =>
    callAi<AiPerformanceSummaryRequest, AiPerformanceSummaryResult>(
      'getPerformanceSummary',
      req,
      120_000
    ),
  studyTips: (req: AiStudyTipsRequest) =>
    callAi<AiStudyTipsRequest, AiStudyTipsResult>('getStudyTips', req, 120_000),
  agentChat: (req: AiAgentChatRequest) =>
    callAi<AiAgentChatRequest, AiAgentChatResult>('aiAgentChat', req, 180_000),
  bibleChat: (req: AiBibleChatRequest) =>
    callAi<AiBibleChatRequest, AiBibleChatResult>('aiBibleChat', req, 120_000),
  progressReport: (req: AiProgressReportRequest) =>
    callAi<AiProgressReportRequest, AiProgressReportResult>('aiProgressReport', req, 180_000),
  quizGenerator: (req: AiQuizGeneratorRequest) =>
    callAi<AiQuizGeneratorRequest, AiQuizGeneratorResult>('aiQuizGenerator', req, 180_000),
  lessonPlan: (req: AiLessonPlanRequest) =>
    callAi<AiLessonPlanRequest, AiLessonPlanResult>('aiLessonPlanGenerator', req, 180_000),
  parentEmail: (req: AiParentEmailRequest) =>
    callAi<AiParentEmailRequest, AiParentEmailResult>('aiParentEmail', req, 120_000),
  curriculumGap: (req: AiCurriculumGapRequest) =>
    callAi<AiCurriculumGapRequest, AiCurriculumGapResult>('aiCurriculumGap', req, 300_000),
  earlyWarning: () =>
    callAi<Record<string, never>, AiEarlyWarningResult>('aiEarlyWarning', {}, 300_000),
  voiceCommand: (req: AiVoiceCommandRequest) =>
    callAi<AiVoiceCommandRequest, AiVoiceCommandResult>('aiVoiceCommand', req, 60_000),
  scanExamPaper: (req: AiExamScanRequest) =>
    callAi<AiExamScanRequest, AiExamScanResult>('parseExamPaper', req, 300_000),
} as const;

export type AIFacade = typeof AI;

/**
 * User-facing metadata for each AI tool so the UI can render consistent cards.
 */
export interface AiToolDescriptor {
  id: keyof AIFacade;
  title: string;
  description: string;
  accent: 'violet' | 'emerald' | 'rose' | 'amber' | 'sky' | 'slate';
  icon:
    | 'sparkles'
    | 'document'
    | 'alert'
    | 'book'
    | 'mail'
    | 'clipboard'
    | 'camera'
    | 'mic'
    | 'chart';
  roles: Array<'admin' | 'teacher' | 'student' | 'parent'>;
}

export const AI_TOOLS: AiToolDescriptor[] = [
  {
    id: 'earlyWarning',
    title: 'Early Warning',
    description: 'Surface at-risk students from grades and attendance.',
    accent: 'rose',
    icon: 'alert',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'curriculumGap',
    title: 'Curriculum Gap',
    description: 'Class-wide analysis of weak and strong areas.',
    accent: 'violet',
    icon: 'chart',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'progressReport',
    title: 'Progress Report',
    description: 'Parent-ready progress summary for a student.',
    accent: 'emerald',
    icon: 'document',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'quizGenerator',
    title: 'Quiz Generator',
    description: 'Draft quizzes with answer keys in seconds.',
    accent: 'sky',
    icon: 'clipboard',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'lessonPlan',
    title: 'Lesson Plan',
    description: 'Structured lesson plan with activities and assessment.',
    accent: 'amber',
    icon: 'document',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'parentEmail',
    title: 'Parent Email',
    description: 'Draft warm, professional parent emails.',
    accent: 'emerald',
    icon: 'mail',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'scanExamPaper',
    title: 'Exam Scanner',
    description: 'Turn a photo of an exam into structured data.',
    accent: 'slate',
    icon: 'camera',
    roles: ['admin', 'teacher'],
  },
  {
    id: 'bibleChat',
    title: 'Bible Companion',
    description: 'Orthodox-aligned scripture exploration.',
    accent: 'violet',
    icon: 'book',
    roles: ['admin', 'teacher', 'student', 'parent'],
  },
];

/** Convenience guard used by the React-free UI modules. */
export function isAiClientError(err: unknown): err is AiClientError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { isAiClientError?: boolean }).isAiClientError === true
  );
}
