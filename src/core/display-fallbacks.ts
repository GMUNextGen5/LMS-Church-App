/**
 * Safe labels when Firestore or legacy rows omit names (keeps UI stable).
 * Profile photos are not rendered with `<img>` anywhere in the app — use
 * {@link pickAvatarDiscPalette} + {@link initialsForAvatarLabel} (or roster initials) for discs only.
 */
export const UNNAMED_STUDENT = 'Unnamed Student';
export const UNTITLED_CLASS = 'Untitled Class';
export const UNTITLED_ASSIGNMENT = 'Untitled assignment';

export function safeStudentDisplayName(name: unknown): string {
  const t = typeof name === 'string' ? name.trim() : '';
  return t || UNNAMED_STUDENT;
}

export function safeCourseDisplayName(name: unknown): string {
  const t = typeof name === 'string' ? name.trim() : '';
  return t || UNTITLED_CLASS;
}

export function safeAssignmentTitle(name: unknown): string {
  const t = typeof name === 'string' ? name.trim() : '';
  return t || UNTITLED_ASSIGNMENT;
}

export function safeCourseListLabel(course: { courseCode?: string; courseName?: string }): string {
  const code = typeof course.courseCode === 'string' ? course.courseCode.trim() : '';
  const title = safeCourseDisplayName(course.courseName);
  return code ? `${code} — ${title}` : title;
}

export function safeCourseChromeTitle(course: { courseCode?: string; courseName?: string }): string {
  const code = typeof course.courseCode === 'string' ? course.courseCode.trim() : '';
  const title = safeCourseDisplayName(course.courseName);
  return code ? `${code}: ${title}` : title;
}

export function finiteToFixed(n: number, fractionDigits: number, fallback = '—'): string {
  return Number.isFinite(n) ? n.toFixed(fractionDigits) : fallback;
}

/** Bar / ring width 0–100; non-finite input → 0. */
export function finitePctForBar(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/**
 * 1–2 uppercase initials for circular avatars. Empty / whitespace → "?".
 * Use for headers, teachers, admins, or any display label (name or email).
 */
export function initialsForAvatarLabel(label: unknown): string {
  const t = typeof label === 'string' ? label.trim() : '';
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0];
  const b = parts[parts.length - 1][0];
  return (a + b).toUpperCase();
}

/** Roster: when the resolved name is the unnamed sentinel, show "?" instead of "US". */
export function initialsForStudentRoster(name: unknown): string {
  const display = safeStudentDisplayName(name);
  if (display === UNNAMED_STUDENT) return '?';
  return initialsForAvatarLabel(display);
}

/** Deterministic solid `bg-*-700` + ring for initial discs (readable white text in light and dark UI). */
const AVATAR_DISC_PALETTE = [
  { bg: 'bg-primary-700', ring: 'ring-primary-400/50' },
  { bg: 'bg-secondary-700', ring: 'ring-secondary-400/50' },
  { bg: 'bg-accent-700', ring: 'ring-accent-400/50' },
  { bg: 'bg-dark-700', ring: 'ring-dark-400/50' },
] as const;

export function pickAvatarDiscPalette(seed: string): { bg: string; ring: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 1_000_000;
  return AVATAR_DISC_PALETTE[h % AVATAR_DISC_PALETTE.length];
}
