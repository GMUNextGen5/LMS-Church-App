/**
 * Assessment data layer. Firestore: courses/{classId}/assessments, questions, submissions. CRUD, auto-grading, grade sync to students/grades.
 * TESTING COMMENT!!!
 */
import { db } from '../core/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, writeBatch
} from 'firebase/firestore';
import { getCurrentUser } from '../core/auth';
import type {
  Assessment, AssessmentQuestion, Submission, QuestionAnswer,
  QuestionGradeDetail, Course, Student
} from '../core/types';

// ────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────────────

function requireAuth() {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

function requireTeacherOrAdmin() {
  const user = requireAuth();
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new Error('Only teachers and admins can perform this action');
  }
  return user;
}

const iso = () => new Date().toISOString();

// ────────────────────────────────────────────────────────────────────────────
//  GRADE SYNC – writes assessment results to students/{id}/grades subcollection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sync an assessment score into the student's grades subcollection
 * so it appears in the Grades & Reports tab.
 * Uses a deterministic doc ID (assessmentId) so re-grading overwrites instead of duplicating.
 */
async function syncGradeToStudent(
  studentProfileId: string,
  assessmentTitle: string,
  score: number,
  totalPoints: number,
  gradedByUid: string,
): Promise<void> {
  try {
    // Use a deterministic ID based on the assessment title to avoid duplicates
    const cleanTitle = assessmentTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
    const gradeDocRef = doc(db, 'students', studentProfileId, 'grades', `assessment_${cleanTitle}`);
    await setDoc(gradeDocRef, {
      studentId: studentProfileId,
      assignmentName: assessmentTitle,
      category: 'Exam',
      score,
      totalPoints,
      date: iso(),
      teacherId: gradedByUid,
      source: 'assessment',   // Mark as auto-synced from assessment system
    });
  } catch {
    // Grade sync failure does not break assessment flow
  }
}

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
  const { id: _id, ...rest } = data as any;
  await updateDoc(ref, { ...rest, updatedAt: iso() });
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
  const questionsSnap = await getDocs(collection(db, 'courses', classId, 'assessments', assessmentId, 'questions'));
  const batch = writeBatch(db);
  questionsSnap.docs.forEach(d => batch.delete(d.ref));
  // Delete submissions subcollection
  const subsSnap = await getDocs(collection(db, 'courses', classId, 'assessments', assessmentId, 'submissions'));
  subsSnap.docs.forEach(d => batch.delete(d.ref));
  // Delete assessment doc
  batch.delete(doc(db, 'courses', classId, 'assessments', assessmentId));
  await batch.commit();
}

/** Fetch a single assessment. */
export async function fetchAssessment(classId: string, assessmentId: string): Promise<Assessment | null> {
  const snap = await getDoc(doc(db, 'courses', classId, 'assessments', assessmentId));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Assessment : null;
}

/** Fetch all assessments the current teacher/admin can see. */
export async function fetchTeacherAssessments(): Promise<(Assessment & { courseName: string })[]> {
  const user = requireAuth();
  if (user.role !== 'teacher' && user.role !== 'admin') return [];

  const coursesRef = collection(db, 'courses');
  const cq = user.role === 'admin'
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
}

/** Fetch assessments visible to the current student. */
export async function fetchStudentAssessments(studentProfileIds: string[]): Promise<StudentAssessmentRow[]> {
  if (studentProfileIds.length === 0) return [];

  // Find courses where student is enrolled
  const allCourses = await getDocs(collection(db, 'courses'));
  const enrolled = allCourses.docs.filter(d => {
    const data = d.data() as Course;
    return (data.studentIds ?? []).some(id => studentProfileIds.includes(id));
  });

  const results: StudentAssessmentRow[] = [];
  for (const courseDoc of enrolled) {
    const courseName = (courseDoc.data() as Course).courseName;
    const aRef = collection(db, 'courses', courseDoc.id, 'assessments');
    const aSnap = await getDocs(query(aRef, where('status', '==', 'published')));

    for (const aDoc of aSnap.docs) {
      const assessment = { id: aDoc.id, ...aDoc.data() } as Assessment;

      // If assigned individually, skip if student not in list
      if (
        assessment.assignedMode === 'individual' &&
        !assessment.assignedStudentIds.some(id => studentProfileIds.includes(id))
      ) continue;

      // Look for existing submission
      let submission: Submission | undefined;
      for (const spId of studentProfileIds) {
        const subSnap = await getDoc(
          doc(db, 'courses', courseDoc.id, 'assessments', aDoc.id, 'submissions', spId)
        );
        if (subSnap.exists()) {
          submission = { id: subSnap.id, ...subSnap.data() } as Submission;
          break;
        }
      }

      results.push({ assessment, courseId: courseDoc.id, courseName, submission });
    }
  }
  return results;
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
  const ref = await addDoc(questionsCol(classId, assessmentId), data);
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
  const { id: _id, ...rest } = data as any;
  await updateDoc(doc(db, 'courses', classId, 'assessments', assessmentId, 'questions', questionId), rest);
  await recalcAssessmentTotals(classId, assessmentId);
}

/** Delete a question. */
export async function deleteQuestion(classId: string, assessmentId: string, questionId: string): Promise<void> {
  requireTeacherOrAdmin();
  await deleteDoc(doc(db, 'courses', classId, 'assessments', assessmentId, 'questions', questionId));
  await recalcAssessmentTotals(classId, assessmentId);
}

/** Fetch all questions for an assessment, ordered. */
export async function fetchQuestions(classId: string, assessmentId: string): Promise<AssessmentQuestion[]> {
  const snap = await getDocs(query(questionsCol(classId, assessmentId), orderBy('order', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AssessmentQuestion));
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
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = { id: snap.id, ...snap.data() } as Submission;
    // Allow resume only if in_progress or reopened
    if (existing.status === 'in_progress') return existing;
    if (existing.status === 'submitted' || existing.status === 'graded' || existing.status === 'late_submitted') {
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
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
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

  const status = isLate ? 'late_submitted' as const : 'submitted' as const;
  const finalScore = autoScore; // Will increase when teacher grades subjective questions

  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
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

  // If fully auto-graded and auto-released, sync to student's grades subcollection immediately
  if (!needsGrading && submissionData.released) {
    const user = getCurrentUser();
    await syncGradeToStudent(
      studentProfileId,
      assessment.title,
      finalScore,
      totalPoints,
      assessment.createdBy || user?.uid || '',
    );
  }

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
  return snap.exists() ? { id: snap.id, ...snap.data() } as Submission : null;
}

/** Fetch all submissions for an assessment. */
export async function fetchSubmissions(classId: string, assessmentId: string): Promise<Submission[]> {
  requireAuth();
  const snap = await getDocs(submissionsCol(classId, assessmentId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission));
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
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
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
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
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

  // Sync the finalized grade to the student's grades subcollection
  const assessment = await fetchAssessment(classId, assessmentId);
  if (assessment) {
    await syncGradeToStudent(
      studentProfileId,
      assessment.title,
      finalScore,
      sub.totalPoints,
      user.uid,
    );
  }
}

/** Release grades for one or more submissions (makes them visible to students). */
export async function releaseGrades(
  classId: string,
  assessmentId: string,
  submissionIds: string[]
): Promise<void> {
  const user = requireTeacherOrAdmin();
  const batch = writeBatch(db);
  for (const sid of submissionIds) {
    const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', sid);
    batch.update(ref, { released: true });
  }
  await batch.commit();

  // Sync released grades to each student's grades subcollection
  const assessment = await fetchAssessment(classId, assessmentId);
  if (assessment) {
    await Promise.all(submissionIds.map(async (sid) => {
      try {
        const subSnap = await getDoc(doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', sid));
        if (subSnap.exists()) {
          const sub = subSnap.data() as Submission;
          await syncGradeToStudent(
            sid,
            assessment.title,
            sub.finalScore,
            sub.totalPoints,
            user.uid,
          );
        }
      } catch (err) {
      }
    }));
  }
}

/** Reopen a submitted assessment so the student can edit and resubmit. */
export async function reopenSubmission(
  classId: string,
  assessmentId: string,
  studentProfileId: string
): Promise<void> {
  const user = requireTeacherOrAdmin();
  const ref = doc(db, 'courses', classId, 'assessments', assessmentId, 'submissions', studentProfileId);
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
): { autoScore: number; questionGrades: Record<string, QuestionGradeDetail>; needsGrading: boolean } {
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
      isCorrect = selected.size === correct.size && [...correct].every(c => selected.has(c));
    } else if (q.type === 'numeric') {
      const studentVal = parseFloat(ans?.value ?? '');
      const correctVal = parseFloat(q.correctAnswers[0]);
      isCorrect = !isNaN(studentVal) && !isNaN(correctVal) && Math.abs(studentVal - correctVal) < 0.0001;
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
  if (studentProfileIds.length === 0) return [];
  const snap = await getDocs(collection(db, 'courses'));
  return snap.docs
    .filter(d => {
      const data = d.data() as Course;
      return (data.studentIds ?? []).some(id => studentProfileIds.includes(id));
    })
    .map(d => ({ id: d.id, ...d.data() } as Course));
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
//  DEMO SEED DATA
// ────────────────────────────────────────────────────────────────────────────

/**
 * Creates demo data for testing the assessment system.
 * Call from browser console: `window.__seedAssessmentData()`
 *
 * Prerequisites: at least one course and one student must exist.
 */
export async function seedAssessmentDemoData(): Promise<void> {
  const user = requireAuth();
  if (user.role !== 'admin') throw new Error('Only admins can seed data');

  // Get first available course
  const coursesSnap = await getDocs(collection(db, 'courses'));
  if (coursesSnap.empty) {
    return;
  }
  const course = { id: coursesSnap.docs[0].id, ...coursesSnap.docs[0].data() } as Course;

  const classId = course.id;
  const now = new Date();
  const dueFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const duePast = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  // --- Assessment 1: Published, auto-release, mixed questions ---
  const a1Id = await createAssessment(classId, {
    title: 'Chapter 1 Review Quiz',
    description: 'A review quiz covering Chapter 1 material with various question types.',
    status: 'published',
    dueDateTime: dueFuture,
    allowLate: true,
    latePolicy: '-10% per day',
    timeLimit: 30,
    releasePolicy: 'auto',
    assignedMode: 'class',
    assignedStudentIds: [],
    totalPoints: 0,
    questionCount: 0,
  });

  await addQuestion(classId, a1Id, {
    type: 'multiple_choice', prompt: 'What is the capital of France?',
    required: true, points: 10, options: ['London', 'Paris', 'Berlin', 'Madrid'],
    correctAnswers: ['1'], order: 1, shuffleOptions: true,
  });
  await addQuestion(classId, a1Id, {
    type: 'checkbox', prompt: 'Select all prime numbers:',
    required: true, points: 10, options: ['2', '4', '7', '9', '11'],
    correctAnswers: ['0', '2', '4'], order: 2, shuffleOptions: false,
  });
  await addQuestion(classId, a1Id, {
    type: 'numeric', prompt: 'What is 15 × 8?',
    required: true, points: 10, correctAnswers: ['120'], order: 3,
  });
  await addQuestion(classId, a1Id, {
    type: 'short_answer', prompt: 'What is H₂O commonly called?',
    required: true, points: 5, correctAnswers: ['water'], order: 4,
  });
  await addQuestion(classId, a1Id, {
    type: 'paragraph', prompt: 'Explain the importance of the water cycle in your own words.',
    required: true, points: 15, order: 5,
  });

  // --- Assessment 2: Draft ---
  await createAssessment(classId, {
    title: 'Midterm Exam (Draft)',
    description: 'Comprehensive midterm covering chapters 1-5.',
    status: 'draft',
    dueDateTime: dueFuture,
    allowLate: false,
    releasePolicy: 'manual',
    assignedMode: 'class',
    assignedStudentIds: [],
    totalPoints: 0,
    questionCount: 0,
  });

  // --- Assessment 3: Published, past due ---
  const a3Id = await createAssessment(classId, {
    title: 'Pop Quiz – Week 2',
    description: 'Short quiz on last week\'s readings.',
    status: 'published',
    dueDateTime: duePast,
    allowLate: false,
    releasePolicy: 'auto',
    assignedMode: 'class',
    assignedStudentIds: [],
    totalPoints: 0,
    questionCount: 0,
  });
  await addQuestion(classId, a3Id, {
    type: 'multiple_choice', prompt: 'Which planet is closest to the Sun?',
    required: true, points: 10, options: ['Venus', 'Mercury', 'Earth', 'Mars'],
    correctAnswers: ['1'], order: 1,
  });

}
