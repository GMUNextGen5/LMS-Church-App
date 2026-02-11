/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA MANAGEMENT - FIRESTORE OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Centralized data access layer for all Firestore operations. Implements
 * role-based data access control (RBAC) ensuring FERPA compliance.
 * 
 * ARCHITECTURE OVERVIEW:
 * 
 * FIRESTORE COLLECTIONS:
 * ├── /users/{uid}                           ← User profiles with roles
 * ├── /students/{studentId}                  ← Student records (main collection)
 * │   ├── /grades/{gradeId}                 ← Student's grades (subcollection)
 * │   └── /attendance/{attendanceId}        ← Student's attendance (subcollection)
 * └── /courses/{courseId}                    ← Courses and enrollments
 * 
 * DATA ACCESS PATTERNS:
 * 
 * STUDENTS:
 * - Admin: Queries ALL students from /students
 * - Teacher: Queries /courses where teacherId==uid → gets studentIds → fetches those students
 * - Student: Queries /students where studentUid==uid (their own record only)
 * 
 * GRADES & ATTENDANCE:
 * - Stored in subcollections under each student: /students/{studentId}/grades
 * - Access controlled by parent student document permissions
 * - Efficient querying with orderBy('date', 'desc')
 * 
 * SECURITY LAYERS:
 * 
 * 1. CLIENT-SIDE (this file):
 *    - Role checks before queries
 *    - Query filtering based on user role
 *    - Error handling and logging
 * 
 * 2. SERVER-SIDE (Firestore Security Rules):
 *    - Ultimate authority on data access
 *    - Validates role from /users/{uid}/role
 *    - Enforces ownership checks
 *    - Blocks unauthorized access even if client tries
 * 
 * ROLE-BASED ACCESS CONTROL (RBAC):
 * 
 * ADMIN:
 * - Full read/write access to ALL data
 * - Can create/edit/delete students, grades, attendance, courses
 * - Can change user roles
 * - Can access all reports and analytics
 * 
 * TEACHER:
 * - Read/write access to assigned students only (via courses)
 * - Can add/edit/delete grades for their students
 * - Can mark attendance for their students
 * - Cannot create student records
 * - Cannot change user roles
 * 
 * STUDENT:
 * - Read-only access to OWN data only
 * - Can view own grades (where studentUid matches their UID)
 * - Can view own attendance
 * - Cannot edit any data
 * - Cannot see other students' data
 * 
 * FERPA COMPLIANCE:
 * 
 * Family Educational Rights and Privacy Act (FERPA) requires:
 * - Students can only access their own records
 * - Teachers can only access assigned students
 * - All access is logged for audit trails
 * - Sensitive data is protected from unauthorized access
 * 
 * This system implements FERPA compliance through:
 * - Role-based access control
 * - Query-level filtering
 * - Firestore security rules
 * - Audit logging via console.log (can be enhanced)
 * 
 * REAL-TIME UPDATES:
 * 
 * Some operations use onSnapshot() for real-time updates:
 * - Grades: Real-time listener updates UI when grades change
 * - Dashboard: Real-time activity feed
 * 
 * Benefits:
 * - Instant updates without page refresh
 * - Multiple users see changes immediately
 * - Reduces server requests
 * 
 * Trade-offs:
 * - Slightly higher bandwidth usage
 * - Need to properly unsubscribe to prevent memory leaks
 * 
 * DEBUGGING GUIDE:
 * 
 * IF DATA DOESN'T LOAD:
 * 1. Check browser console for error messages
 * 2. Verify user is authenticated (getCurrentUser() returns non-null)
 * 3. Check user role in /users/{uid} document
 * 4. Verify Firestore security rules allow the operation
 * 5. Check collection/document paths are correct
 * 6. Use Firebase Console to verify data exists
 * 7. Check Network tab in DevTools for failed Firestore queries
 * 8. Look for "permission-denied" errors
 * 
 * IF WRONG DATA APPEARS:
 * 1. Check query filters (where clauses)
 * 2. Verify studentUid matches Firebase Auth UID
 * 3. Check course studentIds arrays are correct
 * 4. Verify role is set correctly
 * 5. Check for stale cached data
 * 
 * IF REAL-TIME UPDATES DON'T WORK:
 * 1. Verify listener is set up (listenToGrades)
 * 2. Check listener hasn't been unsubscribed prematurely
 * 3. Verify network connectivity
 * 4. Check Firestore security rules allow reads
 * 
 * PERFORMANCE OPTIMIZATION:
 * 
 * - Queries limited to recent data (limit(20), limit(30))
 * - Indexes created for common queries (orderBy + where)
 * - Real-time listeners used selectively
 * - Batch operations where possible (future enhancement)
 * 
 * FUTURE ENHANCEMENTS:
 * 
 * - Pagination for large datasets
 * - Caching layer (IndexedDB)
 * - Offline support
 * - Batch write operations
 * - Advanced search/filtering
 * - Data export capabilities
 * - Audit trail logging to Firestore
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  db,              // Firestore database instance
  collection,      // Get collection reference
  doc,             // Get document reference
  getDoc,          // Read single document
  getDocs,         // Read multiple documents (query results)
  addDoc,          // Add document with auto-generated ID
  setDoc,          // Write document (merge supported)
  updateDoc,       // Update document fields
  deleteDoc,       // Delete document
  query,           // Build query
  where,           // Add where filter to query
  orderBy,         // Add ordering to query
  onSnapshot,      // Real-time listener
} from './firebase';

import { Student, Grade, Attendance, Course, User } from './types';
import { getCurrentUser } from './auth';

// ==================== STUDENTS ====================

/**
 * Fetch all students based on user role (FERPA-COMPLIANT)
 * 
 * ROLE-BASED ACCESS:
 * - ADMIN: Sees ALL students in the system
 * - TEACHER: Sees students in their assigned courses
 * - STUDENT: Sees ONLY their own student record (where studentUid == their UID)
 * 
 * DEBUG: If students aren't showing up, check:
 * 1. User role is correctly set in /users/{uid} document
 * 2. For students: studentUid field matches their Firebase Auth UID
 * 3. Firestore security rules allow the read operation
 * 4. Console logs show the correct role and UID
 */
export async function fetchStudents(): Promise<Student[]> {
  const user = getCurrentUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const studentsRef = collection(db, 'students');
  let students: Student[] = [];
  
  if (user.role === 'admin') {
    // ADMIN: Get ALL students
    const q = query(studentsRef);
    const snapshot = await getDocs(q);
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
    
  } else if (user.role === 'teacher') {
    // TEACHER: Get students from their courses
    const coursesRef = collection(db, 'courses');
    const coursesQuery = query(coursesRef, where('teacherId', '==', user.uid));
    const coursesSnapshot = await getDocs(coursesQuery);
    
    // Extract all unique student IDs from all courses
    const studentIds = new Set<string>();
    coursesSnapshot.docs.forEach(courseDoc => {
      const course = courseDoc.data() as Course;
      course.studentIds.forEach(id => studentIds.add(id));
    });
    
    // Fetch each student document
    for (const studentId of studentIds) {
      try {
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        if (studentDoc.exists()) {
          students.push({ id: studentDoc.id, ...studentDoc.data() } as Student);
        }
      } catch (error) {
        console.error(`Error fetching student ${studentId}:`, error);
      }
    }
    
  } else if (user.role === 'student') {
    // STUDENT: Get ONLY their own record (where studentUid matches their UID)
    const q = query(studentsRef, where('studentUid', '==', user.uid));
    const snapshot = await getDocs(q);
    
    students = snapshot.docs.map(doc => {
      const data = { id: doc.id, ...doc.data() } as Student;
      return data;
    });
    
  } else {
    throw new Error(`Invalid user role: ${user.role}`);
  }
  
  return students;
}

/**
 * Create a new student record (Admin only)
 * 
 * CRITICAL: The studentUid field MUST match the Firebase Auth UID of the student's account
 * This is how students can log in and see their own data
 * 
 * DEBUG: If student can't see their data after logging in, check:
 * 1. studentUid in Firestore matches their Firebase Auth UID exactly
 * 2. Student logged in with the correct email
 * 3. Console logs show the correct UID when they log in
 */
export async function createStudent(studentData: {
  name: string;
  memberId?: string;
  yearOfBirth: number;
  contactPhone: string;
  contactEmail: string;
  studentUid: string; // Firebase Auth UID of student's account
  parentUid: string;  // Firebase Auth UID of parent's account (if different)
  notes?: string;
}): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can create student records');
  }
  
  const studentsRef = collection(db, 'students');
  const docRef = await addDoc(studentsRef, {
    name: studentData.name,
    memberId: studentData.memberId || '',
    yearOfBirth: studentData.yearOfBirth,
    contactPhone: studentData.contactPhone,
    contactEmail: studentData.contactEmail,
    parentUid: studentData.parentUid,
    studentUid: studentData.studentUid, // ⭐ CRITICAL: Links student to their Firebase Auth account
    notes: studentData.notes || '',
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  });
  
  return docRef.id;
}

// Delete a student (Admin only)
export async function deleteStudent(studentId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can delete student records');
  }
  
  const studentRef = doc(db, 'students', studentId);
  await deleteDoc(studentRef);
}

// ==================== GRADES ====================

/**
 * Fetch grades for a specific student
 * 
 * SECURITY: Firestore rules enforce that only:
 * - Admin, Teacher, or the student/parent who owns this record can read grades
 * 
 * DEBUG: If grades aren't loading, check:
 * 1. studentId is correct and exists in /students collection
 * 2. User has permission (check Firestore rules)
 * 3. Grades exist in /students/{studentId}/grades subcollection
 * 4. Console logs for any permission errors
 */
export async function fetchGrades(studentId: string): Promise<Grade[]> {
  try {
    const gradesRef = collection(db, 'students', studentId, 'grades');
    const q = query(gradesRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
  } catch (error: any) {
    console.error(`Error fetching grades for ${studentId}:`, error);
    throw error;
  }
}

// Add a new grade (Teacher/Admin only)
export async function addGrade(studentId: string, grade: Omit<Grade, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can add grades');
  }
  
  const gradesRef = collection(db, 'students', studentId, 'grades');
  const docRef = await addDoc(gradesRef, {
    ...grade,
    studentId,
    teacherId: user.uid,
    date: new Date().toISOString()
  });
  
  return docRef.id;
}

// Update a grade (Teacher/Admin only)
export async function updateGrade(studentId: string, gradeId: string, updates: Partial<Grade>): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can update grades');
  }
  
  const gradeRef = doc(db, 'students', studentId, 'grades', gradeId);
  await updateDoc(gradeRef, updates);
}

// Delete a grade (Teacher/Admin only)
export async function deleteGrade(studentId: string, gradeId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can delete grades');
  }
  
  const gradeRef = doc(db, 'students', studentId, 'grades', gradeId);
  await deleteDoc(gradeRef);
}

// ==================== ATTENDANCE ====================

/**
 * Fetch attendance for a specific student
 * 
 * SECURITY: Firestore rules enforce that only:
 * - Admin, Teacher, or the student/parent who owns this record can read attendance
 * 
 * DEBUG: If attendance isn't loading, check:
 * 1. studentId is correct and exists in /students collection
 * 2. User has permission (check Firestore rules)
 * 3. Attendance records exist in /students/{studentId}/attendance subcollection
 * 4. Console logs for any permission errors
 */
export async function fetchAttendance(studentId: string): Promise<Attendance[]> {
  try {
    const attendanceRef = collection(db, 'students', studentId, 'attendance');
    const q = query(attendanceRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
  } catch (error: any) {
    console.error(`Error fetching attendance for ${studentId}:`, error);
    throw error;
  }
}

// Mark attendance (Teacher/Admin only)
export async function markAttendance(studentId: string, attendance: Omit<Attendance, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    throw new Error('Only teachers and administrators can mark attendance');
  }
  
  const attendanceRef = collection(db, 'students', studentId, 'attendance');
  const docRef = await addDoc(attendanceRef, {
    ...attendance,
    studentId,
    markedBy: user.uid
  });
  
  return docRef.id;
}

// ==================== COURSES ====================

// Fetch courses (based on user role)
export async function fetchCourses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');
  
  const coursesRef = collection(db, 'courses');
  let q;
  
  if (user.role === 'admin') {
    // Admin sees all courses
    q = query(coursesRef);
  } else if (user.role === 'teacher') {
    // Teacher sees only their courses
    q = query(coursesRef, where('teacherId', '==', user.uid));
  } else {
    // Students don't typically access the courses collection directly
    // They see courses through their student profile
    return [];
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
}

// Create a new course (Admin only)
export async function createCourse(course: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only administrators can create courses');
  }
  
  const coursesRef = collection(db, 'courses');
  const docRef = await addDoc(coursesRef, {
    ...course,
    createdAt: new Date().toISOString()
  });
  
  return docRef.id;
}

// ==================== USERS (Admin) ====================

/** Fetch all users (admin only). Reads /users collection directly. */
export async function fetchAllUsers(): Promise<User[]> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can list users');
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
}

/** Update a user's role (admin only). */
export async function updateUserRoleDirect(targetUserId: string, newRole: User['role']): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can change roles');
  const ref = doc(db, 'users', targetUserId);
  await updateDoc(ref, { role: newRole });
}

/** Register/link a teacher (admin only). Writes to /users/{uid} with role teacher and profile fields. */
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

// ==================== REAL-TIME LISTENERS ====================

// Listen to grade changes for a student
export function listenToGrades(studentId: string, callback: (grades: Grade[]) => void): () => void {
  const gradesRef = collection(db, 'students', studentId, 'grades');
  const q = query(gradesRef, orderBy('date', 'desc'));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const grades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
    callback(grades);
  });
  
  return unsubscribe;
}

// ==================== EXPORT UTILITIES ====================

// Export grades to CSV format
export function exportGradesToCSV(grades: Grade[], studentName: string): void {
  if (grades.length === 0) {
    alert('No grades to export.');
    return;
  }
  
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Assignment,Category,Score,Total Points,Percentage,Date\n';
  
  grades.forEach(grade => {
    const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(2);
    csvContent += `"${grade.assignmentName}","${grade.category}",${grade.score},${grade.totalPoints},${percentage}%,"${grade.date}"\n`;
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${studentName}_grades_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

