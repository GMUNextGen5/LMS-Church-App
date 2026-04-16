/**
 * Assessment data layer. Firestore: courses/{classId}/assessments, questions, submissions. CRUD, auto-grading.
 * Syncing assessment scores into students/{id}/grades is performed by the Cloud Function syncAssessmentGradeFromSubmission.
 */
import { db } from '../core/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { getCurrentUser } from '../core/auth';
import { fetchStudents } from './data';
import { fetchStudentClasses } from './classes-data';
import type {
  Assessment,
  AssessmentQuestion,
  Submission,
  QuestionAnswer,
  QuestionGradeDetail,
  Course,
  Student,
} from '../types';
import { UserRole } from '../types';

function cleanText(value: unknown, maxLen: number): string {
  if (value == null) return '';
  const s = String(value)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────────────

function requireAuth() {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

/**
 * Whether any of `studentProfileIds` may see this assessment (entire class vs individual / legacy ID lists).
 * Mirrors Firestore `assessmentAssignedToCaller`: accepts profile doc ID **or** auth UID in the array
 * so legacy documents that stored UIDs are not silently hidden on the client.
 */
function studentProfileMatchesAssessmentVisibility(
  assessment: Assessment,
  studentProfileIds: string[]
): boolean {
  const assignedIds = assessment.assignedStudentIds ?? [];
  const treatsAsIndividual =
    assessment.assignedMode === 'individual' ||
    (assessment.assignedMode !== 'class' && assignedIds.length > 0);
  if (!treatsAsIndividual) return true;
  const uid = getCurrentUser()?.uid;
  return assignedIds.some(
    (id) => studentProfileIds.includes(id) || (uid != null && id === uid)
  );
}

function requireTeacherOrAdmin() {
  const user = requireAuth();
  if (user.role !== UserRole.Teacher && user.role !== UserRole.Admin) {
    throw new Error('Only teachers and admins can perform this action');
  }
  return user;
}

const iso = () => new Date().toISOString();

// ────────────────────────────────────────────────────────────────────────────
//  ASSESSMENTS – CRUD
// ────────────────────────────────────────────────────────────────────────────

/** Create a new assessment (teacher / admin). Returns the new document ID. */
export async function createAssessment(
  classId: string,
  data: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'classId'>
): Promise<string> {
  const user = requireTeacherOrAdmin();
  const ref = collection(db, 'courses', classId, 'assessments');
  const now = iso();
  const docRef = await addDoc(ref, {
    ...data,
    classId,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
    title: cleanText(data.title, 160),
    description: cleanText(data.description, 4000),
    latePolicy: cleanText(data.latePolicy ?? '', 200),
  });
  return docRef.id;
}

/** Update assessment metadata. */
export async function updateAssessment(
  classId: string,
  assessmentId: string,
  data: Partial<Assessment>
): Promise<void> {
  requireTeacherOrAdmin();
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId);
  // Strip `id` to avoid writing it as a field
  const { id: _omitId, ...rest } = data as Partial<Assessment> & { id?: string };
  const sanitized: Record<string, unknown> = { ...rest, updatedAt: iso() };
  if ('title' in rest && rest.title !== undefined) sanitized.title = cleanText(rest.title, 160);
  if ('description' in rest && rest.description !== undefined) {
    sanitized.description = cleanText(rest.description, 4000);
  }
  if ('latePolicy' in rest && rest.latePolicy !== undefined) {
    sanitized.latePolicy = cleanText(rest.latePolicy, 200);
  }
  await updateDoc(ref, sanitized);
}

/** Publish an assessment. */
export async function publishAssessment(classId: string, assessmentId: string): Promise<void> {
  await updateAssessment(classId, assessmentId, { status: 'published' } as Partial<Assessment>);
}

/** Unpublish – only if no submissions exist yet. */
export async function unpublishAssessment(classId: string, assessmentId: string): Promise<void> {
  const subs = await fetchSubmissions(classId, assessmentId);
  if (subs.length > 0) throw new Error('Cannot unpublish: submissions already exist.');
  await updateAssessment(classId, assessmentId, { status: 'draft' } as Partial<Assessment>);
}

/** Delete an assessment and its questions subcollection. */
export async function deleteAssessment(classId: string, assessmentId: string): Promise<void> {
  requireTeacherOrAdmin();
  // Delete questions subcollection first
  const questionsSnap = await getDocs(
    collection(db, 'courses', classId, 'assessments', assessmentId, 'questions')
  );
  const batch = writeBatch(db);
  questionsSnap.docs.forEach((d) => batch.delete(d.ref));
  // Delete submissions subcollection
  const subsSnap = await getDocs(
    collection(db, 'courses', classId, 'assessments', assessmentId, 'submissions')
  );
  subsSnap.docs.forEach((d) => batch.delete(d.ref));
  // Delete assessment doc
  batch.delete(doc(db, 'courses', classId, 'assessments', assessmentId));
  await batch.commit();
}

/** Fetch a single assessment. */
export async function fetchAssessment(
  classId: string,
  assessmentId: string
): Promise<Assessment | null> {
  const snap = await getDoc(doc(db, 'courses', classId, 'assessments', assessmentId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Assessment) : null;
}

/** Fetch all assessments the current teacher/admin can see. */
export async function fetchTeacherAssessments(): Promise<(Assessment & { courseName: string })[]> {
  const user = requireAuth();
  if (user.role !== UserRole.Teacher && user.role !== UserRole.Admin) return [];

  const coursesRef = collection(db, 'courses');
  const cq =
    user.role === UserRole.Admin
      ? query(coursesRef)
      : query(coursesRef, where('teacherId', '==', user.uid));
  const coursesSnap = await getDocs(cq);

  const results: (Assessment & { courseName: string })[] = [];
  for (const courseDoc of coursesSnap.docs) {
    const courseData = courseDoc.data() as Course;
    const aRef = collection(db, 'courses', courseDoc.id, 'assessments');
    const aSnap = await getDocs(query(aRef, orderBy('createdAt', 'desc')));
    for (const aDoc of aSnap.docs) {
      results.push({
        id: aDoc.id,
        ...aDoc.data(),
        courseName: courseData.courseName,
      } as Assessment & { courseName: string });
    }
  }
  return results;
}

export interface StudentAssessmentRow {
  assessment: Assessment;
  courseId: string;
  courseName: string;
  submission?: Submission;
  /** Roster profile id for this class (for submissions / take URL when a user has multiple profiles). */
  activeStudentProfileId: string;
}

function parseDueMs(isoDue: string): number {
  const ms = Date.parse(isoDue);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Single source of truth for the learner "Upcoming" definition (Dashboard + Assessments tab).
 *
 * An assessment is "upcoming" (actionable) when:
 *  1. Due in the future and the submission is still actionable, OR
 *  2. Due has passed but late submissions are allowed and the learner can still submit, OR
 *  3. Due has passed and the learner has an in-progress attempt they should finish.
 *
 * Effectively closed (past due, no late, no in-progress) rows are excluded.
 */
export function isStudentAssessmentUpcoming(row: StudentAssessmentRow, nowMs: number): boolean {
  const dueMs = parseDueMs(row.assessment?.dueDateTime || '');
  if (!dueMs) return false;
  const actionable = submissionStillActionable(row.submission);
  if (dueMs > nowMs) return actionable;
  // Past due: still show if late submissions allowed, or if already in progress
  if (!actionable) return false;
  if (row.assessment.allowLate) return true;
  if (row.submission?.status === 'in_progress') return true;
  return false;
}

/** Fetch assessments visible to the current student. */
export async function fetchStudentAssessments(
  studentProfileIds: string[]
): Promise<StudentAssessmentRow[]> {
  if (studentProfileIds.length === 0) return [];

  const enrolled = await fetchStudentClasses(studentProfileIds);

  const results: StudentAssessmentRow[] = [];
  for (const courseDoc of enrolled) {
    try {
      const courseName = courseDoc.courseName;
      const roster = courseDoc.studentIds ?? [];
      let activeStudentProfileId = studentProfileIds[0] || '';
      for (const spId of studentProfileIds) {
        if (roster.includes(spId)) {
          activeStudentProfileId = spId;
          break;
        }
      }
      const aRef = collection(db, 'courses', courseDoc.id, 'assessments');
      const aSnap = await getDocs(query(aRef, where('status', '==', 'published')));

      for (const aDoc of aSnap.docs) {
        const assessment = { id: aDoc.id, ...aDoc.data() } as Assessment;

        if (!studentProfileMatchesAssessmentVisibility(assessment, studentProfileIds)) {
          continue;
        }

        let submission: Submission | undefined;
        let submissionProfileId = '';
        for (const spId of studentProfileIds) {
          try {
            const subSnap = await getDoc(
              doc(db, 'courses', courseDoc.id, 'assessments', aDoc.id, 'submissions', spId)
            );
            if (subSnap.exists()) {
              submission = { id: subSnap.id, ...subSnap.data() } as Submission;
              submissionProfileId = spId;
              break;
            }
          } catch {
            /* submission read denied for this profileId; try next */
          }
        }

        const rowProfileId = submissionProfileId || activeStudentProfileId;

        results.push({
          assessment,
          courseId: courseDoc.id,
          courseName,
          submission,
          activeStudentProfileId: rowProfileId,
        });
      }
    } catch {
      /* Assessment query denied for this course; continue with remaining courses. */
    }
  }
  return results;
}

export interface NextStudentDeadlineResult {
  assessment: Assessment;
  courseId: string;
  courseName: string;
  dueDateTime: string;
}

function submissionStillActionable(sub: Submission | undefined): boolean {
  if (!sub) return true;
  return sub.status === 'in_progress';
}

/**
 * Parses `dueDateTime` to UTC epoch ms. Prefer full ISO-8601 with offset or `Z` in Firestore
 * so comparisons use absolute instants (not ambiguous local calendar dates).
 */
function parseAssessmentDueInstantMs(dueDateTime: string): number | null {
  const ms = Date.parse(dueDateTime);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Earliest published assessment due after now across the student’s enrolled classes.
 * Only includes work the learner still needs to turn in (no submission yet, or in progress).
 */
export async function fetchNextStudentDeadline(
  uid: string
): Promise<NextStudentDeadlineResult | null> {
  const user = getCurrentUser();
  if (!user || user.role !== UserRole.Student || user.uid !== uid) {
    throw new Error('Not authorized');
  }
  const profiles = await fetchStudents();
  const profileIds = profiles.map((p) => p.id);
  if (profileIds.length === 0) return null;

  const courses = await fetchStudentClasses(profileIds);
  const nowMs = Date.now();
  let best: NextStudentDeadlineResult | null = null;
  let bestDue = Infinity;

  for (const course of courses) {
    try {
      const aSnap = await getDocs(
        query(
          collection(db, 'courses', course.id, 'assessments'),
          where('status', '==', 'published')
        )
      );
      for (const aDoc of aSnap.docs) {
        const assessment = { id: aDoc.id, ...aDoc.data() } as Assessment;
        const dueMs = parseAssessmentDueInstantMs(assessment.dueDateTime);
        if (dueMs === null || dueMs <= nowMs) continue;

        if (!studentProfileMatchesAssessmentVisibility(assessment, profileIds)) {
          continue;
        }

        let submission: Submission | undefined;
        for (const spId of profileIds) {
          try {
            const subSnap = await getDoc(
              doc(db, 'courses', course.id, 'assessments', aDoc.id, 'submissions', spId)
            );
            if (subSnap.exists()) {
              submission = { id: subSnap.id, ...subSnap.data() } as Submission;
              break;
            }
          } catch {
            /* submission read denied for this profileId */
          }
        }
        if (!submissionStillActionable(submission)) continue;

        if (dueMs < bestDue) {
          bestDue = dueMs;
          best = {
            assessment,
            courseId: course.id,
            courseName: course.courseName,
            dueDateTime: assessment.dueDateTime,
          };
        }
      }
    } catch {
      /* assessment query denied for this course */
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────────────────
//  QUESTIONS – CRUD
// ────────────────────────────────────────────────────────────────────────────

function questionsCol(classId: string, assessmentId: string) {
  return collection(db, 'courses', classId, 'assessments', assessmentId, 'questions');
}

/** Add a question to an assessment. Returns new question ID. */
export async function addQuestion(
  classId: string,
  assessmentId: string,
  data: Omit<AssessmentQuestion, 'id'>
): Promise<string> {
  requireTeacherOrAdmin();
  const clean: Omit<AssessmentQuestion, 'id'> = {
    ...data,
    prompt: cleanText(data.prompt, 2000),
    options: Array.isArray(data.options) ? data.options.map((o) => cleanText(o, 500)) : [],
    correctAnswers: Array.isArray(data.correctAnswers)
      ? data.correctAnswers.map((a) => cleanText(a, 200))
      : [],
  };
  const ref = await addDoc(questionsCol(classId, assessmentId), clean);
  // Update assessment totalPoints and questionCount
  await recalcAssessmentTotals(classId, assessmentId);
  return ref.id;
}

/** Update a question. */
export async function updateQuestion(
  classId: string,
  assessmentId: string,
  questionId: string,
  data: Partial<AssessmentQuestion>
): Promise<void> {
  requireTeacherOrAdmin();
  const { id: _omitQid, ...rest } = data as Partial<AssessmentQuestion> & { id?: string };
  const sanitized: Record<string, unknown> = { ...rest };
  if ('prompt' in rest && rest.prompt !== undefined)
    sanitized.prompt = cleanText(rest.prompt, 2000);
  if ('options' in rest && rest.options !== undefined) {
    const opts = rest.options;
    sanitized.options = Array.isArray(opts) ? opts.map((o) => cleanText(o, 500)) : [];
  }
  if ('correctAnswers' in rest && rest.correctAnswers !== undefined) {
    const ca = rest.correctAnswers;
    sanitized.correctAnswers = Array.isArray(ca) ? ca.map((a) => cleanText(a, 200)) : [];
  }
  await updateDoc(
    doc(db, 'courses', classId, 'assessments', assessmentId, 'questions', questionId),
    sanitized
  );
  await recalcAssessmentTotals(classId, assessmentId);
}

/** Delete a question. */
export async function deleteQuestion(
  classId: string,
  assessmentId: string,
  questionId: string
): Promise<void> {
  requireTeacherOrAdmin();
  await deleteDoc(
    doc(db, 'courses', classId, 'assessments', assessmentId, 'questions', questionId)
  );
  await recalcAssessmentTotals(classId, assessmentId);
}

/** Fetch all questions for an assessment, ordered. */
export async function fetchQuestions(
  classId: string,
  assessmentId: string
): Promise<AssessmentQuestion[]> {
  const snap = await getDocs(query(questionsCol(classId, assessmentId), orderBy('order', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AssessmentQuestion);
}

/** Recalculate totalPoints and questionCount on the parent assessment doc. */
async function recalcAssessmentTotals(classId: string, assessmentId: string): Promise<void> {
  const questions = await fetchQuestions(classId, assessmentId);
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);
  await updateDoc(doc(db, 'courses', classId, 'assessments', assessmentId), {
    totalPoints,
    questionCount: questions.length,
    updatedAt: iso(),
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  SUBMISSIONS – CRUD & LIFECYCLE
// ────────────────────────────────────────────────────────────────────────────

function submissionsCol(classId: string, assessmentId: string) {
  return collection(db, 'courses', classId, 'assessments', assessmentId, 'submissions');
}

/** Start or resume a submission (creates doc if not exists). */
export async function startSubmission(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  studentName: string
): Promise<Submission> {
  requireAuth();
  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = { id: snap.id, ...snap.data() } as Submission;
    // Allow resume only if in_progress or reopened
    if (existing.status === 'in_progress') return existing;
    if (
      existing.status === 'submitted' ||
      existing.status === 'graded' ||
      existing.status === 'late_submitted'
    ) {
      throw new Error('This assessment has already been submitted.');
    }
  }

  const now = iso();
  const data: Omit<Submission, 'id'> = {
    assessmentId,
    classId,
    studentProfileId,
    studentName,
    status: 'in_progress',
    startedAt: now,
    isLate: false,
    answers: {},
    questionGrades: {},
    autoScore: 0,
    finalScore: 0,
    totalPoints: 0,
    needsGrading: false,
    released: false,
  };
  await setDoc(ref, data);
  return { id: studentProfileId, ...data };
}

/** Autosave progress (only if status is in_progress). */
export async function saveProgress(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  answers: Record<string, QuestionAnswer>
): Promise<void> {
  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Submission not found');
  const sub = snap.data() as Submission;
  if (sub.status !== 'in_progress') throw new Error('Cannot edit a submitted assessment');
  await updateDoc(ref, { answers });
}

/** Submit an assessment – locks it, auto-grades, records timestamp. */
export async function submitAssessment(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  answers: Record<string, QuestionAnswer>
): Promise<Submission> {
  requireAuth();
  const assessment = await fetchAssessment(classId, assessmentId);
  if (!assessment) throw new Error('Assessment not found');

  const questions = await fetchQuestions(classId, assessmentId);
  const now = iso();
  const isLate = new Date(now) > new Date(assessment.dueDateTime);

  if (isLate && !assessment.allowLate) {
    throw new Error('This assessment is past due and late submissions are not allowed.');
  }

  // Auto-grade objective questions
  const { autoScore, questionGrades, needsGrading } = autoGrade(questions, answers);
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const status = isLate ? ('late_submitted' as const) : ('submitted' as const);
  const finalScore = autoScore; // Will increase when teacher grades subjective questions

  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  const existingSnap = await getDoc(ref);
  const existingData = existingSnap.exists() ? existingSnap.data() : null;

  const submissionData: Omit<Submission, 'id'> = {
    assessmentId,
    classId,
    studentProfileId,
    status,
    submittedAt: now,
    startedAt: existingData?.startedAt || now,
    studentName: existingData?.studentName || '',
    isLate,
    answers,
    questionGrades,
    autoScore,
    finalScore,
    totalPoints,
    needsGrading,
    released: assessment.releasePolicy === 'auto' && !needsGrading,
  };

  await setDoc(ref, submissionData);

  return { id: studentProfileId, ...submissionData };
}

/** Fetch a single submission. */
export async function fetchSubmission(
  classId: string,
  assessmentId: string,
  studentProfileId: string
): Promise<Submission | null> {
  const snap = await getDoc(
    doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId)
  );
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null;
}

/** Fetch all submissions for an assessment. */
export async function fetchSubmissions(
  classId: string,
  assessmentId: string
): Promise<Submission[]> {
  requireAuth();
  const snap = await getDocs(submissionsCol(classId, assessmentId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Submission);
}

// ────────────────────────────────────────────────────────────────────────────
//  GRADING
// ────────────────────────────────────────────────────────────────────────────

/** Teacher grades a single question on a submission. */
export async function gradeQuestion(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  questionId: string,
  points: number,
  maxPoints: number,
  feedback?: string
): Promise<void> {
  requireTeacherOrAdmin();
  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Submission not found');

  const sub = snap.data() as Submission;
  const qg = { ...sub.questionGrades };
  qg[questionId] = { points, maxPoints, feedback: feedback || '', autoGraded: false };

  // Recalculate final score
  const finalScore = Object.values(qg).reduce((s, g) => s + g.points, 0);

  await updateDoc(ref, {
    questionGrades: qg,
    finalScore,
    needsGrading: false, // Will be rechecked below
    gradedBy: requireAuth().uid,
    gradedAt: iso(),
  });
}

/** Finalize grading for a submission – marks as graded. */
export async function finalizeGrading(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  feedbackSummary?: string
): Promise<void> {
  const user = requireTeacherOrAdmin();
  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Submission not found');

  const sub = snap.data() as Submission;
  const finalScore = Object.values(sub.questionGrades).reduce((s, g) => s + g.points, 0);

  await updateDoc(ref, {
    status: 'graded',
    finalScore,
    needsGrading: false,
    feedbackSummary: feedbackSummary || '',
    gradedBy: user.uid,
    gradedAt: iso(),
  });
}

/** Release grades for one or more submissions (makes them visible to students). */
export async function releaseGrades(
  classId: string,
  assessmentId: string,
  submissionIds: string[]
): Promise<void> {
  requireTeacherOrAdmin();
  const batch = writeBatch(db);
  for (const sid of submissionIds) {
    const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', sid);
    batch.update(ref, { released: true });
  }
  await batch.commit();
}

/** Reopen a submitted assessment so the student can edit and resubmit. */
export async function reopenSubmission(
  classId: string,
  assessmentId: string,
  studentProfileId: string
): Promise<void> {
  const user = requireTeacherOrAdmin();
  const ref = doc(
    db,
    'courses',
    classId,
    'assessments',
    assessmentId,
    'submissions',
    studentProfileId
  );
  await updateDoc(ref, {
    status: 'in_progress',
    submittedAt: null,
    isLate: false,
    autoScore: 0,
    finalScore: 0,
    needsGrading: false,
    released: false,
    questionGrades: {},
    reopenedBy: user.uid,
    reopenedAt: iso(),
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  AUTO-GRADING ENGINE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Auto-grades objective question types.
 *  - multiple_choice : selected option index must match correctAnswers[0]
 *  - checkbox        : selected option indices must exactly match correctAnswers set
 *  - numeric         : value must equal correctAnswers[0] (as number)
 *  - short_answer    : case-insensitive exact match against correctAnswers[0]
 *  - paragraph       : always needs manual grading
 */
export function autoGrade(
  questions: AssessmentQuestion[],
  answers: Record<string, QuestionAnswer>
): {
  autoScore: number;
  questionGrades: Record<string, QuestionGradeDetail>;
  needsGrading: boolean;
} {
  let autoScore = 0;
  let needsGrading = false;
  const questionGrades: Record<string, QuestionGradeDetail> = {};

  for (const q of questions) {
    const ans = answers[q.id];
    const maxPoints = q.points;

    if (q.type === 'paragraph') {
      // Always needs manual grading
      questionGrades[q.id] = { points: 0, maxPoints, feedback: '', autoGraded: false };
      needsGrading = true;
      continue;
    }

    if (!q.correctAnswers || q.correctAnswers.length === 0) {
      // No correct answer defined → needs manual grading
      questionGrades[q.id] = { points: 0, maxPoints, feedback: '', autoGraded: false };
      needsGrading = true;
      continue;
    }

    let isCorrect = false;

    if (q.type === 'multiple_choice') {
      const selected = ans?.selectedOptions?.[0];
      isCorrect = selected !== undefined && String(selected) === q.correctAnswers[0];
    } else if (q.type === 'checkbox') {
      const selected = new Set((ans?.selectedOptions ?? []).map(String));
      const correct = new Set(q.correctAnswers);
      isCorrect = selected.size === correct.size && [...correct].every((c) => selected.has(c));
    } else if (q.type === 'numeric') {
      const studentVal = parseFloat(ans?.value ?? '');
      const correctVal = parseFloat(q.correctAnswers[0]);
      isCorrect =
        !isNaN(studentVal) && !isNaN(correctVal) && Math.abs(studentVal - correctVal) < 0.0001;
    } else if (q.type === 'short_answer') {
      const studentVal = (ans?.value ?? '').trim().toLowerCase();
      const correctVal = q.correctAnswers[0].trim().toLowerCase();
      isCorrect = studentVal === correctVal;
    }

    const pts = isCorrect ? maxPoints : 0;
    autoScore += pts;
    questionGrades[q.id] = {
      points: pts,
      maxPoints,
      feedback: isCorrect ? 'Correct' : 'Incorrect',
      autoGraded: true,
    };
  }

  return { autoScore, questionGrades, needsGrading };
}

// ────────────────────────────────────────────────────────────────────────────
//  UTILITY – Fetch courses for students
// ────────────────────────────────────────────────────────────────────────────

/** Returns courses that contain at least one of the given student profile IDs. */
export async function fetchCoursesForStudent(studentProfileIds: string[]): Promise<Course[]> {
  return fetchStudentClasses(studentProfileIds);
}

/**
 * Counts submissions across the current teacher’s assessments that still need grading (manual / open-ended).
 * Administrators are excluded; use only for the teacher dashboard.
 */
export async function countPendingSubmissionsForTeacher(): Promise<number> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  if (user.role !== UserRole.Teacher) {
    throw new Error('Pending submission counts are only available to signed-in teacher accounts.');
  }

  const coursesRef = collection(db, 'courses');
  const cq = query(coursesRef, where('teacherId', '==', user.uid));
  const coursesSnap = await getDocs(cq);
  let total = 0;

  for (const courseDoc of coursesSnap.docs) {
    const classId = courseDoc.id;
    const aRef = collection(db, 'courses', classId, 'assessments');
    const aSnap = await getDocs(aRef);
    for (const aDoc of aSnap.docs) {
      const subsSnap = await getDocs(
        collection(db, 'courses', classId, 'assessments', aDoc.id, 'submissions')
      );
      for (const s of subsSnap.docs) {
        const sub = s.data() as Submission;
        if (sub.needsGrading === true) total += 1;
      }
    }
  }
  return total;
}

/** One assessment with submissions still awaiting educator grading (teacher dashboard / mobile queue). */
export interface TeacherGradingQueueRow {
  classId: string;
  assessmentId: string;
  title: string;
  courseName: string;
  pendingCount: number;
  dueDateTime: string;
}

/**
 * Assessments that have at least one `needsGrading` submission, ordered with overdue due dates first,
 * then by due date ascending.
 */
export async function fetchTeacherGradingQueueRows(
  limit: number
): Promise<TeacherGradingQueueRow[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  if (user.role !== UserRole.Teacher) {
    throw new Error('Grading queue details are only available to signed-in teacher accounts.');
  }

  const coursesRef = collection(db, 'courses');
  const cq = query(coursesRef, where('teacherId', '==', user.uid));
  const coursesSnap = await getDocs(cq);
  const out: TeacherGradingQueueRow[] = [];
  const now = Date.now();

  for (const courseDoc of coursesSnap.docs) {
    const courseData = courseDoc.data() as Course;
    const classId = courseDoc.id;
    const aRef = collection(db, 'courses', classId, 'assessments');
    const aSnap = await getDocs(aRef);
    for (const aDoc of aSnap.docs) {
      const assessment = { id: aDoc.id, ...aDoc.data() } as Assessment;
      const subs = await fetchSubmissions(classId, aDoc.id);
      const pendingCount = subs.filter((s) => s.needsGrading === true).length;
      if (pendingCount === 0) continue;
      out.push({
        classId,
        assessmentId: aDoc.id,
        title: assessment.title,
        courseName: courseData.courseName,
        pendingCount,
        dueDateTime: assessment.dueDateTime,
      });
    }
  }

  out.sort((a, b) => {
    const da = Date.parse(a.dueDateTime);
    const db = Date.parse(b.dueDateTime);
    const ma = Number.isFinite(da) ? da : 0;
    const mb = Number.isFinite(db) ? db : 0;
    const aOver = ma > 0 && ma < now;
    const bOver = mb > 0 && mb < now;
    if (aOver !== bOver) return aOver ? -1 : 1;
    return ma - mb;
  });

  return out.slice(0, Math.max(0, limit));
}

export type StudentUpcomingAssessmentTag = 'QUIZ' | 'ESSAY' | 'REFLECTION';

export interface StudentUpcomingAssessmentMobile {
  courseId: string;
  assessmentId: string;
  title: string;
  courseName: string;
  dueDateTime: string;
  tag: StudentUpcomingAssessmentTag;
}

function inferAssessmentTag(title: string): StudentUpcomingAssessmentTag {
  const t = title.toLowerCase();
  if (/\bquiz\b/.test(t)) return 'QUIZ';
  if (/\b(essay|thesis|paper|outline|report)\b/.test(t)) return 'ESSAY';
  return 'REFLECTION';
}

/**
 * Published assessments the learner still needs to complete, sorted by due date (soonest first).
 */
export async function fetchStudentUpcomingAssessmentsMobile(
  uid: string,
  limit: number
): Promise<StudentUpcomingAssessmentMobile[]> {
  const user = getCurrentUser();
  if (!user || user.role !== UserRole.Student || user.uid !== uid) {
    throw new Error('Not authorized');
  }
  const profiles = await fetchStudents();
  const profileIds = profiles.map((p) => p.id);
  if (profileIds.length === 0) return [];

  const rows = await fetchStudentAssessments(profileIds);
  const nowMs = Date.now();
  const open: StudentUpcomingAssessmentMobile[] = [];

  for (const row of rows) {
    if (!isStudentAssessmentUpcoming(row, nowMs)) continue;

    open.push({
      courseId: row.courseId,
      assessmentId: row.assessment.id,
      title: row.assessment.title,
      courseName: row.courseName,
      dueDateTime: row.assessment.dueDateTime,
      tag: inferAssessmentTag(row.assessment.title),
    });
  }

  open.sort((a, b) => Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime));
  return open.slice(0, Math.max(0, limit));
}

/** Row for the educator dashboard “Recent assessment results” table (teachers only). */
export interface TeacherAssessmentDashboardRow {
  classId: string;
  assessmentId: string;
  title: string;
  courseName: string;
  submissionCount: number;
  /** Mean percent score across submissions with a positive total; null if none. */
  avgPercent: number | null;
}

/**
 * Summarizes the teacher’s most recently updated assessments with submission counts and mean scores.
 * Callers must be signed-in teachers; administrators use other dashboard paths.
 */
export async function fetchTeacherAssessmentDashboardRows(
  limit = 8
): Promise<TeacherAssessmentDashboardRow[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  if (user.role === UserRole.Student) {
    throw new Error('Teacher assessment dashboard rows are not available to learner accounts.');
  }
  if (user.role !== UserRole.Teacher) {
    throw new Error(
      'Teacher assessment dashboard rows are only available to signed-in teacher accounts.'
    );
  }

  const assessments = await fetchTeacherAssessments();
  const sorted = [...assessments].sort((a, b) => {
    const tb = new Date(b.updatedAt || b.createdAt).getTime();
    const ta = new Date(a.updatedAt || a.createdAt).getTime();
    return tb - ta;
  });
  const slice = sorted.slice(0, Math.max(0, limit));

  const rows: TeacherAssessmentDashboardRow[] = [];
  for (const a of slice) {
    const subs = await fetchSubmissions(a.classId, a.id);
    const submitted = subs.filter(
      (s) =>
        s.status === 'submitted' ||
        s.status === 'graded' ||
        s.status === 'late_submitted' ||
        !!s.submittedAt
    );
    const scored = submitted.filter((s) => typeof s.totalPoints === 'number' && s.totalPoints > 0);
    let avgPercent: number | null = null;
    const pcts: number[] = [];
    for (const s of scored) {
      const tp = Number(s.totalPoints);
      const fs = Number(s.finalScore);
      if (!Number.isFinite(tp) || tp <= 0 || !Number.isFinite(fs)) continue;
      const p = (fs / tp) * 100;
      if (Number.isFinite(p)) pcts.push(p);
    }
    if (pcts.length > 0) {
      avgPercent = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    }
    rows.push({
      classId: a.classId,
      assessmentId: a.id,
      title: a.title,
      courseName: a.courseName,
      submissionCount: submitted.length,
      avgPercent,
    });
  }
  return rows;
}

/** Fetch all students in a given course. */
export async function fetchStudentsInCourse(courseId: string): Promise<Student[]> {
  const courseSnap = await getDoc(doc(db, 'courses', courseId));
  if (!courseSnap.exists()) return [];
  const courseData = courseSnap.data() as Course;
  const students: Student[] = [];
  for (const sid of courseData.studentIds ?? []) {
    const sSnap = await getDoc(doc(db, 'students', sid));
    if (sSnap.exists()) students.push({ id: sSnap.id, ...sSnap.data() } as Student);
  }
  return students;
}

// ────────────────────────────────────────────────────────────────────────────
