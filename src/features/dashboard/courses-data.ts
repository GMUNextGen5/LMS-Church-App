import { db, collection, getDocs, addDoc, query, where } from '../../firebase';
import { Course } from '../../types';
import { getCurrentUser } from '../auth/auth';

export async function fetchCourses(): Promise<Course[]> {
  const user = getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const coursesRef = collection(db, 'courses');
  let q;
  if (user.role === 'admin') q = query(coursesRef);
  else if (user.role === 'teacher') q = query(coursesRef, where('teacherId', '==', user.uid));
  else return [];

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
}

export async function createCourse(course: Omit<Course, 'id'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('Unauthorized');
  const docRef = await addDoc(collection(db, 'courses'), {
    ...course, createdAt: new Date().toISOString()
  });
  return docRef.id;
}
