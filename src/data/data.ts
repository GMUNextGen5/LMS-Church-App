import type { DocumentReference } from 'firebase/firestore';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '../core/firebase';
import { Student, Grade, Attendance, Course, User } from '../types';

const GRADE_CATEGORIES = new Set<string>(['Quiz', 'Test', 'Homework', 'Project', 'Exam']);

function coerceGradeCategory(value: unknown): Grade['category'] {
  return typeof value === 'string' && GRADE_CATEGORIES.has(value) ? (value as Grade['category']) : 'Homework';
}
import { getCurrentUser, normalizeLegalUserAgent, coerceFirestoreDateToIso } from '../core/auth';
import { isFirebasePermissionDenied } from '../core/firestore-errors';
import { notifyGradesFirestoreAccessDenied } from '../core/firestore-ui-bridge';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '../core/legal-versions';
import { showAppToast } from '../ui/ui';
import { reportClientFault } from '../core/client-errors';

function cleanText(value: unknown, maxLen: number): string {
  if (value == null) return '';
  const s = String(value).replace(/[\x00-\x1f\x7f]/g, '').trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function cleanEmail(value: unknown): string {
  return cleanText(value, 254).toLowerCase();
}

/**
 * Normalizes `students/{id}` into the client `Student` shape without spreading arbitrary Firestore keys
 * (prevents surprise PII / internal fields from entering `currentStudents`).
 */
function studentRecordFromFirestore(id: string, raw: Record<string, unknown>): Student {
  const nameRaw = typeof raw.name === 'string' ? raw.name.trim() : '';
  const teacherIds = Array.isArray(raw.teacherIds)
    ? raw.teacherIds.filter((t): t is string => typeof t === 'string')
    : undefined;
  return {
    id,
    name: nameRaw || 'Student',
    memberId: typeof raw.memberId === 'string' ? raw.memberId : undefined,
    yearOfBirth: typeof raw.yearOfBirth === 'number' ? raw.yearOfBirth : undefined,
    contactPhone: typeof raw.contactPhone === 'string' ? raw.contactPhone : undefined,
    contactEmail: typeof raw.contactEmail === 'string' ? raw.contactEmail : undefined,
    parentUid: typeof raw.parentUid === 'string' ? raw.parentUid : '',
    studentUid: typeof raw.studentUid === 'string' ? raw.studentUid : '',
    teacherIds,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    createdAt: coerceFirestoreDateToIso(raw.createdAt),
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : undefined,
  };
}

/** Learner session: keep only roster identity in memory (no contact fields or third-party UIDs). */
function studentRosterMinimalForLearner(s: Student, authUid: string): Student {
  return {
    id: s.id,
    name: s.name,
    parentUid: '',
    studentUid: authUid,
    createdAt: s.createdAt,
  };
}

export async function fetchStudents(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const studentsRef = collection(db, 'students');
  let students: Student[] = [];

  if (user.role === 'admin') {
    const q = query(studentsRef);
    const snapshot = await getDocs(q);
    students = snapshot.docs.map((d) => studentRecordFromFirestore(d.id, d.data() as Record<string, unknown>));
  } else if (user.role === 'teacher') {
    const coursesRef = collection(db, 'courses');
    const coursesQuery = query(coursesRef, where('teacherId', '==', user.uid));
    const coursesSnapshot = await getDocs(coursesQuery);
    const studentIds = new Set<string>();
    coursesSnapshot.docs.forEach(courseDoc => {
      const course = courseDoc.data() as Course;
      course.studentIds.forEach(id => studentIds.add(id));
    });
    for (const studentId of studentIds) {
      try {
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        if (studentDoc.exists()) {
          students.push(studentRecordFromFirestore(studentDoc.id, studentDoc.data() as Record<string, unknown>));
        }
      } catch (e) {
        reportClientFault(e);
        /* omit this roster id — remainder of list still usable */
      }
    }
  } else if (user.role === 'student') {
    const q = query(studentsRef, where('studentUid', '==', user.uid));
    const snapshot = await getDocs(q);
    students = snapshot.docs
      .map((d) => studentRecordFromFirestore(d.id, d.data() as Record<string, unknown>))
      .map((s) => studentRosterMinimalForLearner(s, user.uid));
  } else {
    throw new Error(`Invalid user role: ${user.role}`);
  }
  return students;
}

export async function fetchAllStudentProfiles(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators and teachers can list student profiles');
  if (user.role === 'admin') {
    const snapshot = await getDocs(collection(db, 'students'));
    return snapshot.docs.map((d) => studentRecordFromFirestore(d.id, d.data() as Record<string, unknown>));
  }
  const q = query(collection(db, 'students'), where('teacherIds', 'array-contains', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => studentRecordFromFirestore(d.id, d.data() as Record<string, unknown>));
}

export async function createStudent(studentData: {
  name: string;
  memberId?: string;
  yearOfBirth: number;
  contactPhone: string;
  contactEmail: string;
  studentUid: string;
  parentUid: string;
  notes?: string;
}): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) throw new Error('Only administrators and teachers can create student records');

  const studentUid = cleanText(studentData.studentUid, 128);
  const userRecordRef = doc(db, 'users', studentUid);
  const existingUserSnap = await getDoc(userRecordRef);

  if (user.role === 'teacher') {
    if (existingUserSnap.exists()) {
      const role = existingUserSnap.data()?.role;
      if (role !== 'student') {
        throw new Error('Cannot register: selected account is not a student user.');
      }
    }
  }

  const hadStudentUserDoc = existingUserSnap.exists() && existingUserSnap.data()?.role === 'student';
  if (user.role === 'teacher' && !hadStudentUserDoc) {
    const em = cleanEmail(studentData.contactEmail);
    if (!em) {
      throw new Error('Contact email is required when the student has no user profile yet.');
    }
  }

  const studentsRef = collection(db, 'students');
  let profileRef: DocumentReference | null = null;
  try {
    profileRef = await addDoc(studentsRef, {
      name: cleanText(studentData.name, 120),
      memberId: cleanText(studentData.memberId || '', 40),
      yearOfBirth: studentData.yearOfBirth,
      contactPhone: cleanText(studentData.contactPhone, 40),
      contactEmail: cleanEmail(studentData.contactEmail),
      parentUid: cleanText(studentData.parentUid, 128),
      studentUid,
      teacherIds: user.role === 'teacher' ? [user.uid] : [],
      notes: cleanText(studentData.notes || '', 2000),
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    });

    const linkPayload = { studentProfileId: profileRef.id };

    if (user.role === 'admin') {
      await setDoc(userRecordRef, linkPayload, { merge: true });
    } else {
      if (hadStudentUserDoc) {
        await setDoc(userRecordRef, linkPayload, { merge: true });
      } else {
        await setDoc(userRecordRef, {
          email: cleanEmail(studentData.contactEmail),
          role: 'student',
          createdAt: new Date().toISOString(),
          legalAcceptance: {
            termsVersion: LEGAL_TERMS_VERSION,
            privacyVersion: LEGAL_PRIVACY_VERSION,
            userAgent: normalizeLegalUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
            acceptedAt: serverTimestamp(),
          },
        });
        await setDoc(userRecordRef, linkPayload, { merge: true });
      }
    }

    return profileRef.id;
  } catch (error: unknown) {
    reportClientFault(error);
    if (profileRef) {
      try {
        await deleteDoc(profileRef);
      } catch {
        /* best-effort rollback */
      }
    }
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
    if (code === 'permission-denied') {
      showAppToast(
        'Verification failed: You are not authorized to manage this student profile.',
        'error'
      );
    }
    throw error;
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can delete student records');
  await deleteDoc(doc(db, 'students', studentId));
}

export async function updateStudent(studentId: string, data: Partial<{
  name: string;
  memberId: string;
  yearOfBirth: number;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}>): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) throw new Error('Only administrators and teachers can update student records');
  const ref = doc(db, 'students', studentId);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = cleanText(data.name, 120);
  if (data.memberId !== undefined) updates.memberId = cleanText(data.memberId, 40);
  if (data.yearOfBirth !== undefined) updates.yearOfBirth = data.yearOfBirth;
  if (data.contactPhone !== undefined) updates.contactPhone = cleanText(data.contactPhone, 40);
  if (data.contactEmail !== undefined) updates.contactEmail = cleanEmail(data.contactEmail);
  if (data.notes !== undefined) updates.notes = cleanText(data.notes, 2000);
  if (Object.keys(updates).length === 0) return;
  await updateDoc(ref, updates);
}

let learnerAllowedProfileIdsCacheUid: string | null = null;
let learnerAllowedProfileIdsCache: Set<string> | null = null;

async function loadAllowedStudentProfileIdsForLearner(): Promise<Set<string>> {
  const user = getCurrentUser();
  if (!user || user.role !== 'student') return new Set();
  if (learnerAllowedProfileIdsCacheUid === user.uid && learnerAllowedProfileIdsCache) {
    return learnerAllowedProfileIdsCache;
  }
  const out = new Set<string>();
  try {
    const q = query(collection(db, 'students'), where('studentUid', '==', user.uid));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => out.add(d.id));
  } catch (e) {
    reportClientFault(e);
    throw e;
  }
  try {
    const uSnap = await getDoc(doc(db, 'users', user.uid));
    const sp = uSnap.exists() ? (uSnap.data() as { studentProfileId?: unknown }).studentProfileId : undefined;
    if (typeof sp === 'string' && sp.trim()) out.add(sp.trim());
  } catch (e) {
    reportClientFault(e);
    /* continue with ids from students query only */
  }
  learnerAllowedProfileIdsCacheUid = user.uid;
  learnerAllowedProfileIdsCache = out;
  return out;
}

export async function assertLearnerMayAccessStudentProfile(studentId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'student') return;
  const allowed = await loadAllowedStudentProfileIdsForLearner();
  if (!allowed.has(studentId)) {
    throw new Error('Not authorized to view this academic record.');
  }
}

export async function fetchGrades(studentId: string): Promise<Grade[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  await assertLearnerMayAccessStudentProfile(studentId);
  try {
    const gradesRef = collection(db, 'students', studentId, 'grades');
    const q = query(gradesRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        studentId: typeof row.studentId === 'string' ? row.studentId : studentId,
        assignmentName: typeof row.assignmentName === 'string' ? row.assignmentName : '',
        category: coerceGradeCategory(row.category),
        score: Number(row.score),
        totalPoints: Number(row.totalPoints),
        date: typeof row.date === 'string' ? row.date : coerceFirestoreDateToIso(row.date),
        teacherId: typeof row.teacherId === 'string' ? row.teacherId : '',
      } as Grade;
    });
  } catch (e) {
    reportClientFault(e);
    if (isFirebasePermissionDenied(e)) {
      notifyGradesFirestoreAccessDenied();
      const err = new Error('permission-denied') as Error & { code?: string };
      err.code = 'permission-denied';
      throw err;
    }
    return [];
  }
}

export async function fetchGradesForManyStudents(studentIds: string[]): Promise<Grade[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  if (user.role === 'student') {
    throw new Error('Aggregate grade access is not available for student accounts.');
  }
  if (user.role !== 'admin' && user.role !== 'teacher') {
    throw new Error('Not authorized');
  }
  if (studentIds.length === 0) return [];
  const batches = await Promise.all(studentIds.map((id) => fetchGrades(id)));
  return batches.flat();
}

let studentGpaSessionCacheUid: string | null = null;
let studentGpaSessionCacheValue: number | null | undefined;

export function invalidateStudentGpaSessionCache(): void {
  studentGpaSessionCacheUid = null;
  studentGpaSessionCacheValue = undefined;
  learnerAllowedProfileIdsCacheUid = null;
  learnerAllowedProfileIdsCache = null;
}

export function invalidateStudentGpaSessionCacheIfUserChanged(uid: string): void {
  if (studentGpaSessionCacheUid !== null && studentGpaSessionCacheUid !== uid) {
    invalidateStudentGpaSessionCache();
  }
}

export function seedStudentGpaSessionCache(uid: string, grades: Grade[]): void {
  const user = getCurrentUser();
  if (!user || user.role !== 'student' || user.uid !== uid) {
    return;
  }
  studentGpaSessionCacheUid = uid;
  studentGpaSessionCacheValue = computeCumulativeGpaFromGrades(grades);
}

function percentageTo4PointScale(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  if (pct >= 93) return 4.0;
  if (pct >= 90) return 3.7;
  if (pct >= 87) return 3.3;
  if (pct >= 83) return 3.0;
  if (pct >= 80) return 2.7;
  if (pct >= 77) return 2.3;
  if (pct >= 73) return 2.0;
  if (pct >= 70) return 1.7;
  if (pct >= 67) return 1.3;
  if (pct >= 63) return 1.0;
  if (pct >= 60) return 0.7;
  return 0;
}

/** True when at least one grade row can contribute to the weighted GPA denominator. */
export function studentHasCountableGradesForGpa(grades: Grade[]): boolean {
  for (const g of grades) {
    const tp = Number(g.totalPoints);
    const sc = Number(g.score);
    if (Number.isFinite(tp) && tp > 0 && Number.isFinite(sc)) return true;
  }
  return false;
}

/**
 * Weighted GPA on a 4.0 scale: GPA = Σ(qi · wi) / Σwi where wi = totalPoints and qi from percentage bands.
 * Returns null when Σwi ≤ 0 or any intermediate sum is non-finite (never NaN/Infinity to callers).
 */
export function computeCumulativeGpaFromGrades(grades: Grade[]): number | null {
  let weightSum = 0;
  let weighted = 0;
  for (const g of grades) {
    const tp = Number(g.totalPoints);
    const sc = Number(g.score);
    if (!Number.isFinite(tp) || tp <= 0 || !Number.isFinite(sc)) continue;
    const pct = (sc / tp) * 100;
    if (!Number.isFinite(pct)) continue;
    const q = percentageTo4PointScale(pct);
    if (!Number.isFinite(q)) continue;
    const term = q * tp;
    if (!Number.isFinite(term)) continue;
    weighted += term;
    weightSum += tp;
  }
  if (weightSum <= 0 || !Number.isFinite(weightSum) || !Number.isFinite(weighted)) return null;
  const gpa = weighted / weightSum;
  if (!Number.isFinite(gpa)) return null;
  const rounded = Math.round(gpa * 100) / 100;
  return Number.isFinite(rounded) ? rounded : null;
}

export async function calculateStudentCumulativeGPA(uid: string, forceRefresh = false): Promise<number | null> {
  const user = getCurrentUser();
  if (!user || user.role !== 'student' || user.uid !== uid) {
    throw new Error('Not authorized to view this academic record.');
  }
  if (
    !forceRefresh &&
    studentGpaSessionCacheUid === uid &&
    studentGpaSessionCacheValue !== undefined
  ) {
    return studentGpaSessionCacheValue;
  }
  const profiles = await fetchStudents();
  const ids = profiles.map((s) => s.id);
  const merged: Grade[] = [];
  for (const id of ids) {
    try {
      merged.push(...(await fetchGrades(id)));
    } catch (err) {
      if (isFirebasePermissionDenied(err)) {
        studentGpaSessionCacheUid = uid;
        studentGpaSessionCacheValue = null;
        return null;
      }
      /* omit this profile id — remainder still usable */
    }
  }
  const gpa = computeCumulativeGpaFromGrades(merged);
  studentGpaSessionCacheUid = uid;
  studentGpaSessionCacheValue = gpa;
  return gpa;
}

export async function addGrade(studentId: string, grade: Omit<Grade, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Only teachers and administrators can add grades');
  const gradesRef = collection(db, 'students', studentId, 'grades');
  const docRef = await addDoc(gradesRef, {
    ...grade,
    studentId,
    teacherId: user.uid,
    date: new Date().toISOString()
  });
  return docRef.id;
}

export async function updateGrade(studentId: string, gradeId: string, updates: Partial<Grade>): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Only teachers and administrators can update grades');
  await updateDoc(doc(db, 'students', studentId, 'grades', gradeId), updates);
}

export async function deleteGrade(studentId: string, gradeId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Only teachers and administrators can delete grades');
  await deleteDoc(doc(db, 'students', studentId, 'grades', gradeId));
}

export async function fetchAttendance(studentId: string): Promise<Attendance[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  if (user.role !== 'admin' && user.role !== 'teacher' && user.role !== 'student') {
    throw new Error('Not authorized to load attendance.');
  }
  await assertLearnerMayAccessStudentProfile(studentId);
  try {
    const attendanceRef = collection(db, 'students', studentId, 'attendance');
    const q = query(attendanceRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        studentId: typeof row.studentId === 'string' ? row.studentId : studentId,
        date: typeof row.date === 'string' ? row.date : coerceFirestoreDateToIso(row.date),
        status: row.status as Attendance['status'],
        notes: typeof row.notes === 'string' ? row.notes : undefined,
        markedBy: typeof row.markedBy === 'string' ? row.markedBy : '',
      } as Attendance;
    });
  } catch (e) {
    reportClientFault(e);
    if (isFirebasePermissionDenied(e)) {
      const err = new Error('permission-denied') as Error & { code?: string };
      err.code = 'permission-denied';
      throw err;
    }
    return [];
  }
}

export async function markAttendance(studentId: string, attendance: Omit<Attendance, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Only teachers and administrators can mark attendance');
  const attendanceRef = collection(db, 'students', studentId, 'attendance');
  const docRef = await addDoc(attendanceRef, {
    ...attendance,
    studentId,
    markedBy: user.uid
  });
  return docRef.id;
}

export async function fetchCourses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  const coursesRef = collection(db, 'courses');
  const q = user.role === 'admin' ? query(coursesRef) : query(coursesRef, where('teacherId', '==', user.uid));
  if (user.role === 'student') return [];
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
}

export async function createCourse(course: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can create courses');
  const docRef = await addDoc(collection(db, 'courses'), {
    ...course,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

export async function fetchAllUsers(): Promise<User[]> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) throw new Error('Only administrators and teachers can list users');
  const usersRef = collection(db, 'users');
  const q =
    user.role === 'admin'
      ? query(usersRef)
      : query(usersRef, where('role', '==', 'student'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
}

export async function updateUserRoleDirect(targetUserId: string, newRole: User['role']): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can change roles');
  await updateDoc(doc(db, 'users', targetUserId), { role: newRole });
}

export async function saveUserSelfServiceProfile(data: {
  displayName: string;
  phoneNumber: string;
  birthYearStr: string;
  memberId: string;
}): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');

  const displayName = cleanText(data.displayName, 120);
  const phoneNumber = cleanText(data.phoneNumber, 40);
  const memberId = cleanText(data.memberId, 40);

  const y = data.birthYearStr.trim();
  let birthYear: number | undefined;
  if (y !== '') {
    const n = parseInt(y, 10);
    if (!Number.isFinite(n) || n < 1900 || n > 2100) {
      throw new Error('Year of birth must be a whole year between 1900 and 2100.');
    }
    birthYear = n;
  }

  const ref = doc(db, 'users', user.uid);
  const updates: Record<string, unknown> = {
    displayName,
    phoneNumber,
    memberId,
    updatedAt: new Date().toISOString(),
  };
  if (birthYear !== undefined) updates.birthYear = birthYear;

  await setDoc(ref, updates, { merge: true });
}

export async function createTeacher(data: {
  teacherUid: string;
  name?: string;
  email?: string;
  phone?: string;
  memberId?: string;
  yearOfBirth?: number;
  notes?: string;
}): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can register teachers');
  const ref = doc(db, 'users', data.teacherUid);
  const updates: Record<string, unknown> = {
    role: 'teacher',
    name: cleanText(data.name ?? '', 120),
    phone: cleanText(data.phone ?? '', 40),
    memberId: cleanText(data.memberId ?? '', 40),
    updatedAt: new Date().toISOString(),
  };
  if (data.email !== undefined && data.email !== '') updates.email = cleanEmail(data.email);
  if (data.notes !== undefined && data.notes !== '') updates.notes = cleanText(data.notes, 2000);
  if (data.yearOfBirth !== undefined && data.yearOfBirth !== null) updates.yearOfBirth = data.yearOfBirth;
  await setDoc(ref, updates, { merge: true });
}

export function listenToGrades(studentId: string, callback: (grades: Grade[]) => void): () => void {
  const user = getCurrentUser();
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  const attach = (): void => {
    if (cancelled) return;
    const gradesRef = collection(db, 'students', studentId, 'grades');
    const q = query(gradesRef, orderBy('date', 'desc'));
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        callback(
          snapshot.docs.map((d) => {
            const row = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              studentId: typeof row.studentId === 'string' ? row.studentId : studentId,
              assignmentName: typeof row.assignmentName === 'string' ? row.assignmentName : '',
              category: coerceGradeCategory(row.category),
              score: Number(row.score),
              totalPoints: Number(row.totalPoints),
              date: typeof row.date === 'string' ? row.date : coerceFirestoreDateToIso(row.date),
              teacherId: typeof row.teacherId === 'string' ? row.teacherId : '',
            } as Grade;
          })
        );
      },
      (error) => {
        reportClientFault(error);
        if (isFirebasePermissionDenied(error)) {
          notifyGradesFirestoreAccessDenied();
        }
        callback([]);
      }
    );
  };

  if (user?.role === 'student') {
    void assertLearnerMayAccessStudentProfile(studentId)
      .then(() => {
        if (!cancelled) attach();
      })
      .catch(() => {
        callback([]);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  attach();
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export function exportGradesToCSV(grades: Grade[], studentName: string): void {
  if (grades.length === 0) {
    showAppToast('No grades to export.', 'info');
    return;
  }
  const BOM = '\uFEFF';
  let csvContent = 'Assignment,Category,Score,Total Points,Percentage,Date\n';
  grades.forEach(grade => {
    const tp = Number(grade.totalPoints);
    const sc = Number(grade.score);
    const pct =
      Number.isFinite(tp) && tp > 0 && Number.isFinite(sc) ? ((sc / tp) * 100).toFixed(2) : '';
    const pctCol = pct === '' ? '' : `${pct}%`;
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const assignTitle =
      typeof grade.assignmentName === 'string' && grade.assignmentName.trim()
        ? grade.assignmentName.trim()
        : 'Untitled assignment';
    csvContent += `${escape(assignTitle)},${escape(grade.category)},${grade.score},${grade.totalPoints},${pctCol},${escape(grade.date)}\n`;
  });
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeFileStem = String(studentName).replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 80) || 'grades';
  link.download = `${safeFileStem}_grades_${new Date().toISOString().split('T')[0]}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
