import { db, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, where } from '../../firebase';
import { Student, Course } from '../../types';
import { getCurrentUser } from '../auth/auth'; // Will be updated to ../auth/auth later

export async function fetchStudents(): Promise<Student[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const studentsRef = collection(db, 'students');
  let students: Student[] = [];

  if (user.role === 'admin') {
    const snapshot = await getDocs(query(studentsRef));
    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
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
        console.error(`Error fetching student ${studentId}:`, error);
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

export async function createStudent(studentData: {
  name: string; memberId: string; yearOfBirth: number; contactPhone: string;
  contactEmail: string; studentUid: string; parentUid: string; notes?: string;
}): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can create student records');

  const docRef = await addDoc(collection(db, 'students'), {
    ...studentData,
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  });
  return docRef.id;
}

export async function deleteStudent(studentId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Only administrators can delete student records');
  await deleteDoc(doc(db, 'students', studentId));
}
