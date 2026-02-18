/**
 * Classes (Courses) data layer – Firestore CRUD and roster management.
 * Uses the existing `courses` collection. Student IDs are student profile document IDs.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from '../core/firebase';
import { getCurrentUser } from '../core/auth';
import type { Course, Student } from '../core/types';

const COURSES = 'courses';
const STUDENTS = 'students';

export async function fetchStudentClasses(studentProfileIds: string[]): Promise<Course[]> {
  if (studentProfileIds.length === 0) return [];
  const coursesRef = collection(db, COURSES);
  const seen = new Set<string>();
  const courses: Course[] = [];
  await Promise.all(
    studentProfileIds.map(async (profileId) => {
      const q = query(coursesRef, where('studentIds', 'array-contains', profileId));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        courses.push({ id: d.id, ...d.data() } as Course);
      });
    })
  );
  return courses;
}

export async function fetchTeacherClasses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user || user.role !== 'teacher') return [];
  const q = query(collection(db, COURSES), where('teacherId', '==', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function fetchClassRoster(courseId: string): Promise<Student[]> {
  const courseSnap = await getDoc(doc(db, COURSES, courseId));
  if (!courseSnap.exists()) return [];
  const studentIds: string[] = courseSnap.data()?.studentIds ?? [];
  if (studentIds.length === 0) return [];
  const students = await Promise.all(
    studentIds.map(async (id) => {
      const snap = await getDoc(doc(db, STUDENTS, id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Student) : null;
    })
  );
  return students.filter((s): s is Student => s != null);
}

export async function fetchAllClasses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') return [];
  const snapshot = await getDocs(collection(db, COURSES));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function createClass(data: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators or teachers can create classes');
  const payload = { ...data, createdAt: data.createdAt || new Date().toISOString() } as Course;
  if (user.role === 'teacher') payload.teacherId = user.uid;
  const docRef = await addDoc(collection(db, COURSES), payload);
  return docRef.id;
}

export async function updateClass(courseId: string, data: Partial<Omit<Course, 'id' | 'createdAt'>>): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (user.role !== 'admin' && user.role !== 'teacher') throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only edit your assigned classes');
  }
  await updateDoc(doc(db, COURSES, courseId), data as Record<string, unknown>);
}

export async function deleteClass(courseId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can delete classes');
  await deleteDoc(doc(db, COURSES, courseId));
}

export async function addStudentsToClass(courseId: string, studentIds: string[]): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  await updateDoc(doc(db, COURSES, courseId), { studentIds: arrayUnion(...studentIds) });
}

export async function removeStudentsFromClass(courseId: string, studentIds: string[]): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  await updateDoc(doc(db, COURSES, courseId), { studentIds: arrayRemove(...studentIds) });
}

export async function assignTeacherToClass(courseId: string, teacherUid: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can assign teachers');
  await updateDoc(doc(db, COURSES, courseId), { teacherId: teacherUid });
}

export async function getUserDisplayName(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return 'Teacher';
    const d = snap.data();
    return (d?.name as string) || (d?.email as string) || 'Teacher';
  } catch {
    return 'Teacher';
  }
}
