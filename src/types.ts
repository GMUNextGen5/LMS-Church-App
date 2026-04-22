/**
 * Type Definitions for LMS Application
 *
 * Maps directly to Firestore document structures.
 * See DEVELOPER_GUIDE.md for collection schema details.
 */

// ==================== USER & AUTHENTICATION ====================

/** Three-tier RBAC: admin (full), teacher (assigned), student (own data only) */
export type UserRole = 'admin' | 'teacher' | 'student';

/** User profile — stored at /users/{uid} */
export interface User {
  uid: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

// ==================== STUDENT & ENROLLMENT ====================

/** Student record — stored at /students/{studentId}. studentUid MUST match Firebase Auth UID. */
export interface Student {
  id: string;
  name: string;
  memberId?: string;
  yearOfBirth?: number;
  contactPhone?: string;
  contactEmail?: string;
  parentUid: string;
  studentUid: string;       // Links to Firebase Auth account
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

// ==================== ACADEMIC PERFORMANCE ====================

/** Grade record — stored at /students/{studentId}/grades/{gradeId} */
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

// ==================== ATTENDANCE ====================

/** Attendance record — stored at /students/{studentId}/attendance/{attendanceId} */
export interface Attendance {
  id: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  markedBy: string;
}

// ==================== COURSE MANAGEMENT ====================

/** Course — stored at /courses/{courseId}. studentIds array controls teacher access. */
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

// ==================== AI INTEGRATION ====================

/** AI analysis request payload */
export interface AIRequest {
  studentId: string;
  type: 'summary' | 'study-tips';
}

/** AI analysis response payload (HTML content for modal display) */
export interface AIResponse {
  summaryHtml: string;
}
