import { UserRole } from '../types';

/** Tabs that are not available to every signed-in role (defense-in-depth vs navigation hiding). */
const TAB_ROLE: Record<string, readonly UserRole[]> = {
  'teacher-registration': [UserRole.Admin],
  users: [UserRole.Admin],
  registration: [UserRole.Admin, UserRole.Teacher],
  'ai-agent': [UserRole.Admin, UserRole.Teacher],
};

export function canAccessMainTab(tabName: string, role: UserRole | null): boolean {
  const required = TAB_ROLE[tabName];
  if (!required || required.length === 0) return true;
  if (!role) return false;
  return required.includes(role);
}
