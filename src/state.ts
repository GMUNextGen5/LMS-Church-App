/**
 * Shared Application State
 * 
 * Centralized state store so all feature modules can read/write
 * shared data without circular imports.
 */

import { Student, Grade, Attendance } from './types';

// ==================== State Variables ====================

let currentStudents: Student[] = [];
let currentGrades: Grade[] = [];
let currentAttendance: Attendance[] = [];
let selectedStudentId: string | null = null;
let gradesUnsubscribe: (() => void) | null = null;

// ==================== Getters ====================

export function getStudents(): Student[] {
  return currentStudents;
}

export function getGrades(): Grade[] {
  return currentGrades;
}

export function getAttendance(): Attendance[] {
  return currentAttendance;
}

export function getSelectedStudentId(): string | null {
  return selectedStudentId;
}

export function getGradesUnsubscribe(): (() => void) | null {
  return gradesUnsubscribe;
}

// ==================== Setters ====================

export function setStudents(students: Student[]): void {
  currentStudents = students;
}

export function setGrades(grades: Grade[]): void {
  currentGrades = grades;
}

export function setAttendance(attendance: Attendance[]): void {
  currentAttendance = attendance;
}

export function setSelectedStudentId(id: string | null): void {
  selectedStudentId = id;
}

export function setGradesUnsubscribe(unsub: (() => void) | null): void {
  gradesUnsubscribe = unsub;
}

// ==================== Reset ====================

export function resetAppState(): void {
  currentStudents = [];
  currentGrades = [];
  currentAttendance = [];
  selectedStudentId = null;

  if (gradesUnsubscribe) {
    gradesUnsubscribe();
    gradesUnsubscribe = null;
  }
}
