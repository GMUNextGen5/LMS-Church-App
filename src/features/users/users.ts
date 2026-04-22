/**
 * User Management — Admin user table and role changes
 */

import { functions, httpsCallable } from '../../firebase';
import { getCurrentUserRole, showLoading, hideLoading } from '../../ui';

/**
 * Load all users into the admin user management table
 */
export async function loadAllUsers(): Promise<void> {
  const tableBody = document.getElementById('users-table-body');
  if (!tableBody) return;

  const role = getCurrentUserRole();
  if (role !== 'admin') return;

  try {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-dark-300">
          <div class="loading-spinner mx-auto mb-2"></div>
          Loading users...
        </td>
      </tr>
    `;

    const getAllUsers = httpsCallable(functions, 'getAllUsers');
    const result = await getAllUsers({});
    const data = result.data as any;
    const users = data.users || [];

    if (users.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-8 text-dark-300">
            No users found
          </td>
        </tr>
      `;
      return;
    }

    const getRoleBadgeClass = (userRole: string) => {
      switch (userRole) {
        case 'admin': return 'bg-red-500/20 text-red-400';
        case 'teacher': return 'bg-blue-500/20 text-blue-400';
        case 'student': return 'bg-green-500/20 text-green-400';
        default: return 'bg-gray-500/20 text-gray-400';
      }
    };

    tableBody.innerHTML = users.map((user: any) => `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${user.email}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClass(user.role)}">
            ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </td>
        <td class="py-3 px-4 text-center text-dark-400 text-xs font-mono">${user.uid}</td>
        <td class="py-3 px-4 text-center">
          <button 
            data-action="change-role"
            data-user-id="${user.uid}"
            data-current-role="${user.role}"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm"
          >
            Change Role
          </button>
        </td>
      </tr>
    `).join('');

    // Event delegation for change role buttons
    tableBody.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action="change-role"]') as HTMLElement;
      if (!btn) return;
      const userId = btn.dataset.userId!;
      const currentRole = btn.dataset.currentRole!;
      await handleChangeRole(userId, currentRole);
    });

    console.log('✅ Loaded', users.length, 'users');
  } catch (error) {
    console.error('Error loading users:', error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-red-400">
          Error loading users: ${(error as any).message}
        </td>
      </tr>
    `;
  }
}

/**
 * Change a user's role (admin only)
 */
async function handleChangeRole(userId: string, currentRole: string): Promise<void> {
  const newRole = prompt(
    `Change role for this user.\n\nCurrent role: ${currentRole}\n\nEnter new role (admin, teacher, or student):`,
    currentRole
  );

  if (!newRole) return;

  const roleNormalized = newRole.trim().toLowerCase();

  if (!['admin', 'teacher', 'student'].includes(roleNormalized)) {
    alert('Invalid role. Must be: admin, teacher, or student');
    return;
  }

  if (roleNormalized === currentRole) {
    alert('No change - same role');
    return;
  }

  try {
    showLoading();

    const updateUserRole = httpsCallable(functions, 'updateUserRole');
    const result = await updateUserRole({
      targetUserId: userId,
      newRole: roleNormalized
    });

    console.log('✅ Role updated:', result.data);
    await loadAllUsers();
    alert(`✅ User role changed to ${roleNormalized}`);
  } catch (error: any) {
    console.error('Error changing role:', error);
    alert('Failed to change role: ' + error.message);
  } finally {
    hideLoading();
  }
}
