import { describe, expect, it } from 'vitest';
import { UserRole } from '../types';
import { canAccessMainTab, resolveTabSwitchTarget } from './tab-access';

describe('canAccessMainTab', () => {
  it('allows common tabs for students', () => {
    expect(canAccessMainTab('dashboard', UserRole.Student)).toBe(true);
    expect(canAccessMainTab('grades', UserRole.Student)).toBe(true);
  });

  it('denies admin-only tabs for teachers and students', () => {
    expect(canAccessMainTab('users', UserRole.Student)).toBe(false);
    expect(canAccessMainTab('users', UserRole.Teacher)).toBe(false);
    expect(canAccessMainTab('teacher-registration', UserRole.Teacher)).toBe(false);
    expect(canAccessMainTab('users', UserRole.Admin)).toBe(true);
    expect(canAccessMainTab('teacher-registration', UserRole.Admin)).toBe(true);
  });

  it('denies staff tabs when role is unknown', () => {
    expect(canAccessMainTab('ai-agent', null)).toBe(false);
  });
});

describe('resolveTabSwitchTarget', () => {
  it('returns the requested tab when allowed', () => {
    expect(resolveTabSwitchTarget('classes', UserRole.Teacher)).toBe('classes');
    expect(resolveTabSwitchTarget('users', UserRole.Admin)).toBe('users');
  });

  it('returns dashboard when the tab is not allowed for the role', () => {
    expect(resolveTabSwitchTarget('users', UserRole.Teacher)).toBe('dashboard');
    expect(resolveTabSwitchTarget('users', UserRole.Student)).toBe('dashboard');
    expect(resolveTabSwitchTarget('ai-agent', UserRole.Student)).toBe('dashboard');
  });
});
