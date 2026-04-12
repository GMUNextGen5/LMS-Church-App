/**
 * Classes (courses) data layer. Firestore CRUD and roster; uses existing `courses` collection. Student IDs = profile doc IDs.
 * Keeps `students/{id}.teacherIds` in sync with course rosters for security rules.
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
import type { Course, Student, User } from '../types';

const COURSES = 'courses';
const STUDENTS = 'students';

/** Keep student.teacherIds aligned when course roster or teacher assignment changes. */
async function reconcileRosterTeacherIds(
  oldTeacherId: string,
  oldStudentIds: string[],
  newTeacherId: string,
  newStudentIds: string[]
): Promise<void> {
  const olds = new Set(oldStudentIds);
  const news = new Set(newStudentIds);
  for (const sid of olds) {
    if (!news.has(sid) && oldTeacherId) {
      await updateDoc(doc(db, STUDENTS, sid), { teacherIds: arrayRemove(oldTeacherId) });
    }
  }
  for (const sid of news) {
    if (!olds.has(sid) && newTeacherId) {
      await updateDoc(doc(db, STUDENTS, sid), { teacherIds: arrayUnion(newTeacherId) });
    }
  }
  if (oldTeacherId && newTeacherId && oldTeacherId !== newTeacherId) {
    for (const sid of news) {
      if (olds.has(sid)) {
        await updateDoc(doc(db, STUDENTS, sid), { teacherIds: arrayRemove(oldTeacherId) });
        await updateDoc(doc(db, STUDENTS, sid), { teacherIds: arrayUnion(newTeacherId) });
      }
    }
  }
}

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
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Course);
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
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Course);
}

/** Get a single course by ID. Allowed for admin or the assigned teacher. */
export async function getCourse(courseId: string): Promise<Course | null> {
  const user = getCurrentUser();
  if (!user) return null;
  const snap = await getDoc(doc(db, COURSES, courseId));
  if (!snap.exists()) return null;
  const data = snap.data() as Course;
  const course = { ...data, id: snap.id } as Course;
  if (user.role === 'admin') return course;
  if (user.role === 'teacher' && data.teacherId === user.uid) return course;
  return null;
}

export async function createClass(data: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators or teachers can create classes');
  const payload = { ...data, createdAt: data.createdAt || new Date().toISOString() } as Course;
  if (user.role === 'teacher') payload.teacherId = user.uid;
  const docRef = await addDoc(collection(db, COURSES), payload);
  const tid = payload.teacherId || '';
  const sids = payload.studentIds ?? [];
  if (tid && sids.length > 0) {
    await reconcileRosterTeacherIds('', [], tid, sids);
  }
  return docRef.id;
}

export async function updateClass(
  courseId: string,
  data: Partial<Omit<Course, 'id' | 'createdAt'>>
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (user.role !== 'admin' && user.role !== 'teacher') throw new Error('Insufficient permissions');
  const courseRef = doc(db, COURSES, courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) throw new Error('Course not found');
  if (user.role === 'teacher') {
    if ((courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only edit your assigned classes');
  }
  const before = courseSnap.data() as Course;
  const oldT = (before.teacherId ?? '') as string;
  const oldS = (before.studentIds ?? []) as string[];
  await updateDoc(courseRef, data as Record<string, unknown>);
  if (!('studentIds' in data) && !('teacherId' in data)) return;
  const newT = (data.teacherId !== undefined ? data.teacherId : oldT) as string;
  const newS = (data.studentIds !== undefined ? data.studentIds : oldS) as string[];
  await reconcileRosterTeacherIds(oldT, oldS, newT, newS);
}

export async function deleteClass(courseId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators or the assigned teacher can delete classes');
  const courseRef = doc(db, COURSES, courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) return;
  if (user.role === 'teacher') {
    if ((courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only delete your assigned classes');
  }
  const T = (courseSnap.data()?.teacherId ?? '') as string;
  const S = (courseSnap.data()?.studentIds ?? []) as string[];
  await deleteDoc(courseRef);
  if (T) {
    await Promise.all(
      S.map((sid) => updateDoc(doc(db, STUDENTS, sid), { teacherIds: arrayRemove(T) }))
    );
  }
}

export async function addStudentsToClass(courseId: string, studentIds: string[]): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Insufficient permissions');
  const courseRef = doc(db, COURSES, courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) throw new Error('Course not found');
  if (user.role === 'teacher') {
    if ((courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  const before = courseSnap.data() as Course;
  const oldT = (before.teacherId ?? '') as string;
  const oldS = [...(before.studentIds ?? [])];
  await updateDoc(courseRef, { studentIds: arrayUnion(...studentIds) });
  const newS = [...new Set([...oldS, ...studentIds])];
  await reconcileRosterTeacherIds(oldT, oldS, oldT, newS);
}

export async function removeStudentsFromClass(
  courseId: string,
  studentIds: string[]
): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Insufficient permissions');
  const courseRef = doc(db, COURSES, courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) throw new Error('Course not found');
  if (user.role === 'teacher') {
    if ((courseSnap.data()?.teacherId as string) !== user.uid)
      throw new Error('You can only modify roster for your assigned classes');
  }
  if (studentIds.length === 0) return;
  const before = courseSnap.data() as Course;
  const oldT = (before.teacherId ?? '') as string;
  const oldS = [...(before.studentIds ?? [])];
  await updateDoc(courseRef, { studentIds: arrayRemove(...studentIds) });
  const removeSet = new Set(studentIds);
  const newS = oldS.filter((id) => !removeSet.has(id));
  await reconcileRosterTeacherIds(oldT, oldS, oldT, newS);
}

export async function assignTeacherToClass(courseId: string, teacherUid: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can assign teachers');
  const courseRef = doc(db, COURSES, courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) throw new Error('Course not found');
  const before = courseSnap.data() as Course;
  const oldT = (before.teacherId ?? '') as string;
  const S = [...(before.studentIds ?? [])];
  await updateDoc(courseRef, { teacherId: teacherUid });
  await reconcileRosterTeacherIds(oldT, S, teacherUid, S);
}

/** In-memory cache: Firebase UID → resolved display label (never a raw UID). */
const userDisplayNameCache = new Map<string, string>();
/** Coalesces concurrent lookups for the same uid (single in-flight Firestore read). */
const userDisplayNameInFlight = new Map<string, Promise<string>>();

/** Single source of truth for human-readable account labels (never a raw Firebase UID). */
export function userProfileDisplayLabel(profile: User | Record<string, unknown>): string {
  const d = profile as Record<string, unknown>;
  const label =
    (typeof d.displayName === 'string' && d.displayName.trim()) ||
    (typeof d.fullName === 'string' && d.fullName.trim()) ||
    (typeof d.name === 'string' && d.name.trim()) ||
    (typeof d.email === 'string' && d.email.trim()) ||
    '';
  return label || '—';
}

/** Resolves a user id to a human-readable name for tables and class cards (cached). */
export async function getUserDisplayName(uid: string): Promise<string> {
  const id = (uid || '').trim();
  if (!id) return '—';
  const cached = userDisplayNameCache.get(id);
  if (cached !== undefined) return cached;
  const existing = userDisplayNameInFlight.get(id);
  if (existing) return existing;

  const pending = (async (): Promise<string> => {
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        userDisplayNameCache.set(id, '—');
        return '—';
      }
      const label = userProfileDisplayLabel(snap.data() as Record<string, unknown>);
      userDisplayNameCache.set(id, label);
      return label;
    } catch {
      userDisplayNameCache.set(id, '—');
      return '—';
    } finally {
      userDisplayNameInFlight.delete(id);
    }
  })();

  userDisplayNameInFlight.set(id, pending);
  return pending;
}
