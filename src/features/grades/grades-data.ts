import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from '../../firebase';
import { Grade } from '../../types';
import { getCurrentUser } from '../auth/auth';

export async function fetchGrades(studentId: string): Promise<Grade[]> {
  const q = query(collection(db, 'students', studentId, 'grades'), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
}

export async function addGrade(studentId: string, grade: Omit<Grade, 'id' | 'studentId'>): Promise<string> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Unauthorized');
  
  const docRef = await addDoc(collection(db, 'students', studentId, 'grades'), {
    ...grade, studentId, teacherId: user.uid, date: new Date().toISOString()
  });
  return docRef.id;
}

export async function updateGrade(studentId: string, gradeId: string, updates: Partial<Grade>): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Unauthorized');
  await updateDoc(doc(db, 'students', studentId, 'grades', gradeId), updates);
}

export async function deleteGrade(studentId: string, gradeId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) throw new Error('Unauthorized');
  await deleteDoc(doc(db, 'students', studentId, 'grades', gradeId));
}

export function listenToGrades(studentId: string, callback: (grades: Grade[]) => void): () => void {
  const q = query(collection(db, 'students', studentId, 'grades'), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade)));
  });
}

export function exportGradesToCSV(grades: Grade[], studentName: string): void {
  if (grades.length === 0) { alert('No grades to export.'); return; }
  let csvContent = 'data:text/csv;charset=utf-8,Assignment,Category,Score,Total Points,Percentage,Date\n';
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
}
