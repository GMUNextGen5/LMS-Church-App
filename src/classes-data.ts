/**
 * Classes (Courses) data layer – Firestore CRUD and roster management.
 * Uses the existing `courses` collection. Student IDs in courses are student profile document IDs.
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
} from './firebase';
import { getCurrentUser } from './auth';
import type { Course, Student } from './types';

const COURSES = 'courses';
const STUDENTS = 'students';

/** Fetch classes where the given student profile IDs are enrolled (any match). */
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

/** Fetch classes assigned to the current teacher. */
export async function fetchTeacherClasses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user || user.role !== 'teacher') return [];
  const coursesRef = collection(db, COURSES);
  const q = query(coursesRef, where('teacherId', '==', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

/** Fetch student documents for a class roster by course ID. */
export async function fetchClassRoster(courseId: string): Promise<Student[]> {
  const courseSnap = await getDoc(doc(db, COURSES, courseId));
  if (!courseSnap.exists()) return [];
  const data = courseSnap.data();
  const studentIds: string[] = data?.studentIds ?? [];
  if (studentIds.length === 0) return [];
  const students = await Promise.all(
    studentIds.map(async (id) => {
      const snap = await getDoc(doc(db, STUDENTS, id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Student) : null;
    })
  );
  return students.filter((s): s is Student => s != null);
}

/** Admin: fetch all classes. */
export async function fetchAllClasses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') return [];
  const snapshot = await getDocs(collection(db, COURSES));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

/** Admin or teacher: create a class. Teachers can only create for themselves. */
export async function createClass(data: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators or teachers can create classes');
  const payload = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  if (user.role === 'teacher') {
    (payload as Course).teacherId = user.uid;
  }
  const coursesRef = collection(db, COURSES);
  const docRef = await addDoc(coursesRef, payload);
  return docRef.id;
}

/** Admin or teacher: update a class. */
export async function updateClass(courseId: string, data: Partial<Omit<Course, 'id' | 'createdAt'>>): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (user.role !== 'admin' && user.role !== 'teacher') throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only edit your assigned classes');
  }
  const ref = doc(db, COURSES, courseId);
  await updateDoc(ref, data as Record<string, unknown>);
}

/** Admin: delete a class. */
export async function deleteClass(courseId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can delete classes');
  await deleteDoc(doc(db, COURSES, courseId));
}

/** Add student profile IDs to a class (uses arrayUnion). */
export async function addStudentsToClass(courseId: string, studentIds: string[]): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  const ref = doc(db, COURSES, courseId);
  await updateDoc(ref, { studentIds: arrayUnion(...studentIds) });
}

/** Remove student profile IDs from a class (uses arrayRemove). */
export async function removeStudentsFromClass(courseId: string, studentIds: string[]): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Insufficient permissions');
  if (user.role === 'teacher') {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    if (!courseSnap.exists() || (courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  const ref = doc(db, COURSES, courseId);
  await updateDoc(ref, { studentIds: arrayRemove(...studentIds) });
}

/** Admin: set the teacher for a class. */
export async function assignTeacherToClass(courseId: string, teacherUid: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can assign teachers');
  const ref = doc(db, COURSES, courseId);
  await updateDoc(ref, { teacherId: teacherUid });
}

/** Get display name for a user (e.g. teacher) by UID.
 *  Gracefully handles permission-denied errors (e.g. students reading teacher profiles). */
export async function getUserDisplayName(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return 'Teacher';
    const d = snap.data();
    return (d?.name as string) || (d?.email as string) || 'Teacher';
  } catch {
    // Students may lack permission to read other users' profiles
    return 'Teacher';
  }
}
