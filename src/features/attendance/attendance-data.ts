import { db, collection, getDocs, addDoc, query, orderBy } from '../../firebase';
import { Attendance } from '../../types';
import { getCurrentUser } from '../auth/auth';

export async function fetchAttendance(studentId: string): Promise<Attendance[]> {
  const q = query(collection(db, 'students', studentId, 'attendance'), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
}

export async function markAttendance(studentId: string, attendance: Omit<Attendance, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Unauthorized');
  const docRef = await addDoc(collection(db, 'students', studentId, 'attendance'), {
    ...attendance, studentId, markedBy: user.uid
  });
  return docRef.id;
}
