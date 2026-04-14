/**
 * Display-name style fields: strip control characters and angle brackets for safe plain-text rendering.
 */
export function cleanProfilePlainText(value: unknown, maxLen: number): string {
  if (value == null) return '';
  const s = String(value)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const t = s.length > maxLen ? s.slice(0, maxLen) : s;
  return t.replace(/[<>]/g, '');
}
