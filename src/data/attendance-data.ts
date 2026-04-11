import { db, doc, getDoc, writeBatch } from '../core/firebase';
import { getCurrentUser } from '../core/auth';
import { reportClientFault } from '../core/client-errors';
import { safeCourseChromeTitle } from '../core/display-fallbacks';
import type { Course } from '../types';

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Local calendar date as YYYY-MM-DD (same as a date input value). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduleMentionsWeekday(schedule: string): boolean {
  const s = schedule.toLowerCase();
  return WEEKDAY_NAMES.some((wd) => s.includes(wd));
}

function scheduleIncludesToday(schedule: string, now: Date): boolean {
  if (!scheduleMentionsWeekday(schedule)) return true;
  const today = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  return schedule.toLowerCase().includes(today);
}

function minutesFromParts(h: number, mi: number, ap?: string): number {
  let hour = h;
  if (ap) {
    const u = ap.toUpperCase();
    if (u === 'PM' && hour < 12) hour += 12;
    if (u === 'AM' && hour === 12) hour = 0;
  }
  return hour * 60 + mi;
}

/**
 * Parses simple ranges from free-text schedule, e.g. "9:00 AM - 10:30 AM" or "14:00-15:30".
 * Returns start/end as minutes from local midnight.
 */
export function extractTimeRangesMinutes(schedule: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const re =
    /(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?\s*[-–—]\s*(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schedule)) !== null) {
    const h1 = parseInt(m[1], 10);
    const mi1 = parseInt(m[2], 10);
    const ap1 = m[3];
    const h2 = parseInt(m[4], 10);
    const mi2 = parseInt(m[5], 10);
    const ap2 = m[6] ?? ap1;
    if (
      Number.isNaN(h1) ||
      Number.isNaN(mi1) ||
      Number.isNaN(h2) ||
      Number.isNaN(mi2) ||
      mi1 > 59 ||
      mi2 > 59
    ) {
      continue;
    }
    if (ap1 || ap2) {
      const start = minutesFromParts(h1, mi1, ap1);
      let end = minutesFromParts(h2, mi2, ap2);
      if (end < start) end += 24 * 60;
      ranges.push({ start, end });
    } else {
      if (h1 > 23 || h2 > 23) continue;
      const start = h1 * 60 + mi1;
      const end = h2 * 60 + mi2;
      if (end >= start) ranges.push({ start, end });
    }
  }
  return ranges;
}

/** True when `now` falls inside a parsed same-day time window and weekday rules match. */
export function isCourseInActiveSession(course: Course, now: Date): boolean {
  const sched = course.schedule?.trim();
  if (!sched) return false;
  if (!scheduleIncludesToday(sched, now)) return false;
  const ranges = extractTimeRangesMinutes(sched);
  if (ranges.length === 0) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return ranges.some(({ start, end }) => cur >= start && cur <= end);
}

/**
 * First course in list order that is “in session” now, or `null` if none.
 * Callers should fall back to a stored class id (e.g. last-used) or the user’s manual class pick
 * and show an explicit message when still unresolved (roster access is not re-validated on a timer).
 */
export function pickActiveSessionClassId(courses: Course[], now: Date): string | null {
  for (const c of courses) {
    if (isCourseInActiveSession(c, now)) return c.id;
  }
  return null;
}

const BATCH_SIZE = 400;

export type MarkAllPresentResult = { count: number; courseName: string };

/**
 * Sets attendance for every student in the class to present for the given calendar day (default: today).
 * Uses deterministic doc ids `students/{id}/attendance/{dateKey}` with merge so the same day can be updated safely.
 */
export async function markAllStudentsPresent(
  classId: string,
  dateKey: string = localDateKey()
): Promise<MarkAllPresentResult> {
  try {
    const user = getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      throw new Error('Only teachers and administrators can record bulk attendance.');
    }

    const courseSnap = await getDoc(doc(db, 'courses', classId));
    if (!courseSnap.exists()) throw new Error('Class not found.');

    const course = { id: courseSnap.id, ...courseSnap.data() } as Course;
    if (user.role === 'teacher' && course.teacherId !== user.uid) {
      throw new Error('You can only record attendance for your own classes.');
    }

    const ids = [...new Set(course.studentIds ?? [])].filter(Boolean);
    const courseName = safeCourseChromeTitle(course);

    if (ids.length === 0) {
      return { count: 0, courseName };
    }

    let written = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const studentId of chunk) {
        const ref = doc(db, 'students', studentId, 'attendance', dateKey);
        batch.set(
          ref,
          {
            id: dateKey,
            studentId,
            date: dateKey,
            status: 'present' as const,
            notes: '',
            markedBy: user.uid,
          },
          { merge: true }
        );
      }
      await batch.commit();
      written += chunk.length;
    }

    return { count: written, courseName };
  } catch (e) {
    reportClientFault(e);
    throw e;
  }
}
