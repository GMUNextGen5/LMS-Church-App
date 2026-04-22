/**
 * Data Management — Firestore Operations
 *
 * RBAC-enforced data access layer. See DEVELOPER_GUIDE.md for
 * collection schema, access patterns, and FERPA compliance details.
 *
 * Collections: /users/{uid}, /students/{studentId}/grades, /students/{studentId}/attendance, /courses/{courseId}
 */

import {
  db, collection, doc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from './firebase';

import { Student, Grade, Attendance, Course } from './types';
import { getCurrentUser } from './auth';

// ==================== STUDENTS ====================

/**
 * Fetch students based on user role (FERPA-compliant).
 * Admin: all | Teacher: assigned courses | Student: own record only
 */
export async function fetchStudents(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user) {
    console.error('❌ [fetchStudents] User not authenticated');
    throw new Error('User not authenticated');
  }

  console.log('🔍 [fetchStudents] Fetching for role:', user.role);
  const studentsRef = collection(db, 'students');
  let students: Student[] = [];

  if (user.role === 'admin') {
    const snapshot = await getDocs(query(studentsRef));
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
    console.log(`✅ [fetchStudents] Admin found ${students.length} students`);

  } else if (user.role === 'teacher') {
    const coursesQuery = query(collection(db, 'courses'), where('teacherId', '==', user.uid));
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
      } catch (error) {
        console.error(`❌ [fetchStudents] Error fetching student ${studentId}:`, error);
      }
    }
    console.log(`✅ [fetchStudents] Teacher found ${students.length} students`);

  } else if (user.role === 'student') {
    const q = query(studentsRef, where('studentUid', '==', user.uid));
    const snapshot = await getDocs(q);
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));

    if (students.length === 0) {
      console.warn('⚠️ [fetchStudents] No record found for studentUid:', user.uid);
    }
  } else {
    throw new Error(`Invalid user role: ${user.role}`);
  }

  return students;
}

/** Create a new student record (Admin only). studentUid MUST match the student's Firebase Auth UID. */
export async function createStudent(studentData: {
  name: string;
  memberId: string;
  yearOfBirth: number;
  contactPhone: string;
  contactEmail: string;
  studentUid: string;
  parentUid: string;
  notes?: string;
}): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can create student records');
  }

  const docRef = await addDoc(collection(db, 'students'), {
    name: studentData.name,
    memberId: studentData.memberId,
    yearOfBirth: studentData.yearOfBirth,
    contactPhone: studentData.contactPhone,
    contactEmail: studentData.contactEmail,
    parentUid: studentData.parentUid,
    studentUid: studentData.studentUid,
    notes: studentData.notes || '',
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  });

  console.log('✅ [createStudent] Created:', docRef.id, 'linked to UID:', studentData.studentUid);
  return docRef.id;
}

/** Delete a student (Admin only) */
export async function deleteStudent(studentId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can delete student records');
  }
  await deleteDoc(doc(db, 'students', studentId));
  console.log('✅ Student deleted:', studentId);
}

// ==================== GRADES ====================

/** Fetch grades for a student, ordered by date descending */
export async function fetchGrades(studentId: string): Promise<Grade[]> {
  try {
    const q = query(collection(db, 'students', studentId, 'grades'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    const grades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
    console.log(`✅ [fetchGrades] ${grades.length} grades for ${studentId}`);
    return grades;
  } catch (error: any) {
    console.error(`❌ [fetchGrades] Error for ${studentId}:`, error.code, error.message);
    throw error;
  }
}

/** Add a new grade (Teacher/Admin only) */
export async function addGrade(studentId: string, grade: Omit<Grade, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can add grades');
  }
  const docRef = await addDoc(collection(db, 'students', studentId, 'grades'), {
    ...grade, studentId, teacherId: user.uid, date: new Date().toISOString()
  });
  return docRef.id;
}

/** Update a grade (Teacher/Admin only) */
export async function updateGrade(studentId: string, gradeId: string, updates: Partial<Grade>): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can update grades');
  }
  await updateDoc(doc(db, 'students', studentId, 'grades', gradeId), updates);
}

/** Delete a grade (Teacher/Admin only) */
export async function deleteGrade(studentId: string, gradeId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can delete grades');
  }
  await deleteDoc(doc(db, 'students', studentId, 'grades', gradeId));
}

// ==================== ATTENDANCE ====================

/** Fetch attendance for a student, ordered by date descending */
export async function fetchAttendance(studentId: string): Promise<Attendance[]> {
  try {
    const q = query(collection(db, 'students', studentId, 'attendance'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    const attendance = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
    console.log(`✅ [fetchAttendance] ${attendance.length} records for ${studentId}`);
    return attendance;
  } catch (error: any) {
    console.error(`❌ [fetchAttendance] Error for ${studentId}:`, error.code, error.message);
    throw error;
  }
}

/** Mark attendance (Teacher/Admin only) */
export async function markAttendance(studentId: string, attendance: Omit<Attendance, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can mark attendance');
  }
  const docRef = await addDoc(collection(db, 'students', studentId, 'attendance'), {
    ...attendance, studentId, markedBy: user.uid
  });
  return docRef.id;
}

// ==================== COURSES ====================

/** Fetch courses (Admin: all, Teacher: own, Student: none) */
export async function fetchCourses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const coursesRef = collection(db, 'courses');
  let q;
  if (user.role === 'admin') {
    q = query(coursesRef);
  } else if (user.role === 'teacher') {
    q = query(coursesRef, where('teacherId', '==', user.uid));
  } else {
    return [];
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
}

/** Create a new course (Admin only) */
export async function createCourse(course: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can create courses');
  }
  const docRef = await addDoc(collection(db, 'courses'), {
    ...course, createdAt: new Date().toISOString()
  });
  return docRef.id;
}

// ==================== REAL-TIME LISTENERS ====================

/** Listen to grade changes for a student. Returns unsubscribe function. */
export function listenToGrades(studentId: string, callback: (grades: Grade[]) => void): () => void {
  const q = query(collection(db, 'students', studentId, 'grades'), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade)));
  });
}

// ==================== EXPORT UTILITIES ====================

/** Export grades to CSV format and trigger download */
export function exportGradesToCSV(grades: Grade[], studentName: string): void {
  if (grades.length === 0) { alert('No grades to export.'); return; }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Assignment,Category,Score,Total Points,Percentage,Date\n';

  grades.forEach(grade => {
    const pct = ((grade.score / grade.totalPoints) * 100).toFixed(2);
    csvContent += `"${grade.assignmentName}","${grade.category}",${grade.score},${grade.totalPoints},${pct}%,"${grade.date}"\n`;
  });

  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `${studentName}_grades_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  console.log('✅ Grades exported to CSV');
}
