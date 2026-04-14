import type { Grade } from '../types';

export function gradePercent100(g: Grade): number | null {
  const tp = Number(g.totalPoints);
  const sc = Number(g.score);
  if (!Number.isFinite(tp) || tp <= 0 || !Number.isFinite(sc)) return null;
  const p = (sc / tp) * 100;
  return Number.isFinite(p) ? p : null;
}
