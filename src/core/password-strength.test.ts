import { describe, it, expect } from 'vitest';
import { evaluatePasswordStrength } from './password-strength';

describe('evaluatePasswordStrength', () => {
  it('returns tier 0 for empty password', () => {
    const r = evaluatePasswordStrength('');
    expect(r.tier).toBe(0);
    expect(r.label).toBe('');
  });

  it('rates a long mixed password as strong', () => {
    const r = evaluatePasswordStrength('Aa1!aaaaaaaaaa');
    expect(r.tier).toBe(4);
    expect(r.label).toBe('Strong');
  });

  it('downgrades trivial patterns', () => {
    const r = evaluatePasswordStrength('password');
    expect(r.tier).toBeLessThanOrEqual(2);
  });
});
