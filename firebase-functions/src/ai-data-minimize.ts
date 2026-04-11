/**
 * Strip Firestore noise / PII before building Gemini prompts (data minimization, NIST-aligned).
 */
import type { DocumentData } from 'firebase-admin/firestore';

export type AiStudentRosterEntry = {
  id: string;
  name: string;
  memberId: string;
  yearOfBirth: number | null;
};

export function rosterEntryFromStudentDoc(id: string, data: DocumentData): AiStudentRosterEntry {
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Unknown';
  const memberId =
    typeof data.memberId === 'string' && data.memberId.trim() ? data.memberId.trim() : 'N/A';
  const yearOfBirth =
    typeof data.yearOfBirth === 'number' && Number.isFinite(data.yearOfBirth)
      ? data.yearOfBirth
      : null;
  return { id, name, memberId, yearOfBirth };
}

export type AiGradeContextRow = {
  studentId: string;
  studentName: string;
  assignmentName: unknown;
  category: unknown;
  score: unknown;
  totalPoints: unknown;
  date: unknown;
};

export function sanitizeGradeDocForAi(
  studentId: string,
  studentName: string,
  data: DocumentData
): AiGradeContextRow {
  return {
    studentId,
    studentName,
    assignmentName: data.assignmentName,
    category: data.category,
    score: data.score,
    totalPoints: data.totalPoints,
    date: data.date,
  };
}

export type AiAttendanceContextRow = {
  studentId: string;
  studentName: string;
  status: unknown;
  date: unknown;
};

export function sanitizeAttendanceDocForAi(
  studentId: string,
  studentName: string,
  data: DocumentData
): AiAttendanceContextRow {
  return {
    studentId,
    studentName,
    status: data.status,
    date: data.date,
  };
}
