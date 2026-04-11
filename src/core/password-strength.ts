/**
 * Signup password strength: bounded-length, linear-time checks (no ReDoS-prone
 * regex on user input), entropy-style estimate, discrete tiers 0–4.
 */

export type PasswordStrengthTier = 0 | 1 | 2 | 3 | 4;

export type PasswordStrengthResult = {
  tier: PasswordStrengthTier;
  /** User-facing label without the "Strength:" prefix */
  label: string;
  /** Phrase for aria-valuetext / announcements */
  ariaValueText: string;
};

const TIER_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** Bound work for UI thread safety (long pastes). */
const PASSWORD_STRENGTH_MAX_INPUT = 256;

const WEAK_LITERALS: readonly string[] = [
  'password',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  '1qaz2wsx',
  'letmein',
  'welcome',
  'admin',
  'login',
  'master',
  'dragon',
  'monkey',
  'sunshine',
  'princess',
  'football',
  'iloveyou',
  'trustno',
  'baseball',
  'shadow',
  'superman',
  'batman',
  'mustang',
  'michael',
  'jennifer',
  'hunter',
  'soccer',
  'rangers',
  'harley',
  'thomas',
  'tigger',
  'buster',
  'summer',
  'hello',
  'charlie',
  'donald',
  'secret',
  'testtest',
  'abc123',
  'adobe123',
  'photoshop',
] as const;

const KEYBOARD_ROWS: readonly string[] = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1234567890',
  '0987654321',
] as const;

function boundedPrefix(password: string): string {
  return password.length > PASSWORD_STRENGTH_MAX_INPUT
    ? password.slice(0, PASSWORD_STRENGTH_MAX_INPUT)
    : password;
}

function containsAnySubstring(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  for (let i = 0; i < needles.length; i++) {
    if (lower.includes(needles[i]!)) return true;
  }
  return false;
}

/** Ascending/descending run of letters or digits (length >= runLen). Linear in n. */
function hasSequentialRun(s: string, runLen: number): boolean {
  if (s.length < runLen) return false;
  const cap = s.length;
  for (let i = 0; i <= cap - runLen; i++) {
    let asc = true;
    let desc = true;
    for (let k = 1; k < runLen; k++) {
      const a = s.charCodeAt(i + k - 1);
      const b = s.charCodeAt(i + k);
      if (b !== a + 1) asc = false;
      if (b !== a - 1) desc = false;
      if (!asc && !desc) break;
    }
    if (asc || desc) {
      const slice = s.slice(i, i + runLen);
      if (/^[a-z]{4,}$/i.test(slice) || /^\d{4,}$/.test(slice)) return true;
    }
  }
  return false;
}

/** Pool size from character classes present (bits per character upper bound). */
function charsetPoolSize(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n += 26;
  if (/[A-Z]/.test(s)) n += 26;
  if (/\d/.test(s)) n += 10;
  if (/[^A-Za-z0-9]/.test(s)) n += 33;
  return n > 0 ? n : 1;
}

function countCharClasses(s: string): number {
  let c = 0;
  if (/[a-z]/.test(s)) c++;
  if (/[A-Z]/.test(s)) c++;
  if (/\d/.test(s)) c++;
  if (/[^A-Za-z0-9]/.test(s)) c++;
  return c;
}

/** NIST SP 800-63B memorized secret: require all four character classes for "strong" tier. */
function hasAllCharacterClasses(s: string): boolean {
  return (
    /[a-z]/.test(s) &&
    /[A-Z]/.test(s) &&
    /\d/.test(s) &&
    /[^A-Za-z0-9]/.test(s)
  );
}

function patternPenaltyBits(s: string): number {
  let pen = 0;
  if (containsAnySubstring(s, WEAK_LITERALS)) pen += 18;
  if (containsAnySubstring(s, KEYBOARD_ROWS)) pen += 14;
  if (hasSequentialRun(s, 4)) pen += 10;
  if (/^(.)\1{2,}$/.test(s)) pen += 25;
  if (/^(.)\1+$/.test(s)) pen += 30;
  if (/^[a-zA-Z]+$/.test(s) && /^(?:[a-z]+|[A-Z]+)$/.test(s) && s.length <= 10) pen += 6;
  if (/^\d+$/.test(s)) pen += 12;
  return pen;
}

function estimatedEntropyBits(s: string, rawLen: number): number {
  const len = Math.min(rawLen, PASSWORD_STRENGTH_MAX_INPUT);
  if (len === 0) return 0;
  const pool = charsetPoolSize(s);
  const perChar = Math.log2(pool);
  const uniq = new Set(s).size;
  const uniqRatio = uniq / len;
  const effectiveLen = len * (0.45 + 0.55 * uniqRatio);
  let bits = effectiveLen * perChar;
  bits -= patternPenaltyBits(s);
  return Math.max(0, bits);
}

function hasHardReject(password: string): boolean {
  const bounded = boundedPrefix(password);
  if (containsAnySubstring(bounded, WEAK_LITERALS) && password.length < 14) return true;
  if (containsAnySubstring(bounded, KEYBOARD_ROWS) && password.length < 16) return true;
  if (/^(.)\1{4,}$/.test(password)) return true;
  return false;
}

/**
 * Maps entropy, length, and class count to tiers:
 * 0 empty, 1 Weak, 2 Fair, 3 Good, 4 Strong.
 * Strong (4): NIST 800-63B-style — length ≥ 12, all four classes, entropy floor, no hard reject.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password.length) {
    return { tier: 0, label: '', ariaValueText: 'Password strength: empty' };
  }

  const rawLen = password.length;
  const s = boundedPrefix(password);
  const len = rawLen;
  const classes = countCharClasses(s);
  const bits = estimatedEntropyBits(s, rawLen);
  const hard = hasHardReject(password);
  const allClasses = hasAllCharacterClasses(s);

  let tier: PasswordStrengthTier = 1;

  if (
    !hard &&
    len >= 12 &&
    classes >= 4 &&
    allClasses &&
    bits >= 50
  ) {
    tier = 4;
  } else if (!hard && len >= 10 && classes >= 3 && bits >= 38) {
    tier = 3;
  } else if (!hard && len >= 8 && classes >= 2 && bits >= 28) {
    tier = 2;
  }

  if (hard) {
    if (bits < 24 || len < 10) tier = 1;
    else tier = Math.min(tier, 2) as PasswordStrengthTier;
  }

  const label = TIER_LABELS[tier];
  return {
    tier,
    label,
    ariaValueText: `Password strength: ${label}`,
  };
}
