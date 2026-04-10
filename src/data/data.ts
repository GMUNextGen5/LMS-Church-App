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
} from '../core/firebase';
import { Student, Grade, Attendance, Course, User } from '../core/types';
import { getCurrentUser } from '../core/auth';

/**
 * Loads students visible to the current user: all for admins, course-roster union for teachers,
 * or the single profile linked to the student’s Firebase uid.
 */
export async function fetchStudents(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const studentsRef = collection(db, 'students');
  let students: Student[] = [];

  if (user.role === 'admin') {
    const q = query(studentsRef);
    const snapshot = await getDocs(q);
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
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
          students.push({ id: studentDoc.id, ...studentDoc.data() } as Student);
        }
      } catch {
        /* skip missing student doc */
      }
    }
  } else if (user.role === 'student') {
    const q = query(studentsRef, where('studentUid', '==', user.uid));
    const snapshot = await getDocs(q);
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  } else {
    throw new Error(`Invalid user role: ${user.role}`);
  }
  return students;
}

/** Fetch student profiles for class rosters. Teachers only see students linked via course teacherIds. */
export async function fetchAllStudentProfiles(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    throw new Error('Only administrators and teachers can list student profiles');
  if (user.role === 'admin') {
    const snapshot = await getDocs(collection(db, 'students'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
  }
  const q = query(collection(db, 'students'), where('teacherIds', 'array-contains', user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
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
  const studentsRef = collection(db, 'students');
  const docRef = await addDoc(studentsRef, {
    name: studentData.name,
    memberId: studentData.memberId || '',
    yearOfBirth: studentData.yearOfBirth,
    contactPhone: studentData.contactPhone,
    contactEmail: studentData.contactEmail,
    parentUid: studentData.parentUid,
    studentUid: studentData.studentUid,
    teacherIds: user.role === 'teacher' ? [user.uid] : [],
    notes: studentData.notes || '',
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  });
  await setDoc(
    doc(db, 'users', studentData.studentUid),
    { studentProfileId: docRef.id },
    { merge: true }
  );
  return docRef.id;
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
  if (data.name !== undefined) updates.name = data.name;
  if (data.memberId !== undefined) updates.memberId = data.memberId;
  if (data.yearOfBirth !== undefined) updates.yearOfBirth = data.yearOfBirth;
  if (data.contactPhone !== undefined) updates.contactPhone = data.contactPhone;
  if (data.contactEmail !== undefined) updates.contactEmail = data.contactEmail;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(ref, updates);
}

export async function fetchGrades(studentId: string): Promise<Grade[]> {
  const gradesRef = collection(db, 'students', studentId, 'grades');
  const q = query(gradesRef, orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
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
  const attendanceRef = collection(db, 'students', studentId, 'attendance');
  const q = query(attendanceRef, orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
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
    name: data.name ?? '',
    phone: data.phone ?? '',
    memberId: data.memberId ?? '',
    updatedAt: new Date().toISOString(),
  };
  if (data.email !== undefined && data.email !== '') updates.email = data.email;
  if (data.notes !== undefined && data.notes !== '') updates.notes = data.notes;
  if (data.yearOfBirth !== undefined && data.yearOfBirth !== null) updates.yearOfBirth = data.yearOfBirth;
  await setDoc(ref, updates, { merge: true });
}

export function listenToGrades(studentId: string, callback: (grades: Grade[]) => void): () => void {
  const gradesRef = collection(db, 'students', studentId, 'grades');
  const q = query(gradesRef, orderBy('date', 'desc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade)));
  });
  return unsubscribe;
}

export function exportGradesToCSV(grades: Grade[], studentName: string): void {
  if (grades.length === 0) {
    alert('No grades to export.');
    return;
  }
  const BOM = '\uFEFF';
  let csvContent = 'Assignment,Category,Score,Total Points,Percentage,Date\n';
  grades.forEach(grade => {
    const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(2);
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    csvContent += `${escape(grade.assignmentName)},${escape(grade.category)},${grade.score},${grade.totalPoints},${percentage}%,${escape(grade.date)}\n`;
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
