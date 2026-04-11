/**
 * Type definitions for the LMS. Maps to Firestore: users, students, grades, attendance, courses, assessments.
 * Parity: backend role literals live in `firebase-functions/src/domain-types.ts` — keep both in sync when roles change.
 */
export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  createdAt: string;
  /** Display name from Firestore profile and/or Firebase Auth; prefer for UI over raw email. */
  displayName?: string;
  /** Set for self-registered students; may be absent on admin-provisioned profiles. */
  legalAcceptance?: {
    termsVersion?: string;
    privacyVersion?: string;
    /** ISO string; Firestore may store Timestamp or string. */
    acceptedAt?: string;
  };
  /**
   * For `student` accounts: linked `students/{id}` roster record when present.
   * `null` when the account is valid but no student document exists yet (incomplete setup).
   */
  studentProfile?: Student | null;
  /** Self-service fields on `users/{uid}` (optional until the student saves them). */
  phoneNumber?: string;
  birthYear?: number;
  /** Optional church/member reference; may also exist on linked `students/{id}` for learners. */
  memberId?: string;
  /** Admin/legacy fields sometimes stored on `users/{uid}` (teacher provisioning, imports). */
  name?: string;
  fullName?: string;
  phone?: string;
  yearOfBirth?: number;
  notes?: string;
}

export interface Student {
  id: string;
  name: string;
  memberId?: string;
  yearOfBirth?: number;
  contactPhone?: string;
  contactEmail?: string;
  parentUid: string;
  studentUid: string;
  /** UIDs of teachers linked via course roster; drives Firestore read access for teachers. */
  teacherIds?: string[];
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Grade {
  id: string;
  studentId: string;
  assignmentName: string;
  category: 'Quiz' | 'Test' | 'Homework' | 'Project' | 'Exam';
  score: number;
  totalPoints: number;
  date: string;
  teacherId: string;
}

export interface Attendance {
  id: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  markedBy: string;
}

export interface Course {
  id: string;
  courseName: string;
  courseCode?: string;
  teacherId: string;
  studentIds: string[];
  schedule?: string;
  description?: string;
  createdAt: string;
}

export type AssessmentStatus = 'draft' | 'published';
export type ReleasePolicy = 'auto' | 'manual';
export type AssignedMode = 'class' | 'individual';
export type QuestionType = 'multiple_choice' | 'checkbox' | 'short_answer' | 'paragraph' | 'numeric';
export type SubmissionStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'graded'
  | 'overdue'
  | 'late_submitted';

export interface Assessment {
  id: string;
  classId: string;
  title: string;
  description: string;
  status: AssessmentStatus;
  dueDateTime: string;
  allowLate: boolean;
  latePolicy?: string;
  timeLimit?: number;
  releasePolicy: ReleasePolicy;
  assignedMode: AssignedMode;
  assignedStudentIds: string[];
  totalPoints: number;
  questionCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  points: number;
  options?: string[];
  correctAnswers?: string[];
  order: number;
  shuffleOptions?: boolean;
}

export interface QuestionAnswer {
  value?: string;
  selectedOptions?: number[];
}

export interface QuestionGradeDetail {
  points: number;
  maxPoints: number;
  feedback?: string;
  autoGraded: boolean;
}

export interface Submission {
  id: string;
  assessmentId: string;
  classId: string;
  studentProfileId: string;
  studentName?: string;
  status: SubmissionStatus;
  startedAt?: string;
  submittedAt?: string;
  isLate: boolean;
  answers: Record<string, QuestionAnswer>;
  questionGrades: Record<string, QuestionGradeDetail>;
  autoScore: number;
  finalScore: number;
  totalPoints: number;
  needsGrading: boolean;
  released: boolean;
  feedbackSummary?: string;
  gradedBy?: string;
  gradedAt?: string;
  reopenedBy?: string;
  reopenedAt?: string;
}

export interface AIRequest {
  studentId: string;
  type: 'summary' | 'study-tips';
}

export interface AIResponse {
  summaryHtml: string;
}
