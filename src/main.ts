/**
 * Main Application Entry Point — Slim Orchestrator
 *
 * Coordinates initialization across all feature modules.
 * All business logic lives in feature modules under src/features/.
 */

// Import global styles (Vite bundles these automatically)
import './styles/app.css';


import './firebase';
import { initAuth } from './features/auth/auth';
import { ParticleSystem } from './particles';
import {
  initUI,
  showAuthContainer,
  showAppContainer,
  configureUIForRole,
  getCurrentUserRole,
} from './ui';
import { User } from './types';
import { resetAppState, getSelectedStudentId } from './state';
import { copyAIResponse } from './utils';

// Feature modules
import { setupAuthForms } from './features/auth/auth-forms';
import { setupGradeHandlers } from './features/grades/grades';
import { setupAttendanceHandlers } from './features/attendance/attendance';
import { loadStudentAttendance } from './features/attendance/attendance';
import { loadDashboardData, setupDashboardHandlers, loadRecentActivity } from './features/dashboard/dashboard';
import { setupAIAgentChat } from './features/ai/ai-chat';
import { setupStudentHandlers } from './features/students/students';
import { setupProfileHandlers } from './features/students/student-profile';
import { loadAllUsers } from './features/users/users';

// ==================== Initialization ====================

async function init(): Promise<void> {
  console.log('🚀 Initializing LMS Application...');

  // Core setup
  initUI();
  initAuth(handleAuthStateChange);

  // Form and event handlers (from feature modules)
  setupAuthForms();
  setupGradeHandlers();
  setupAttendanceHandlers();
  setupDashboardHandlers();
  setupStudentHandlers();
  setupProfileHandlers();
  setupAIAgentChat();

  // Expose global handlers needed by inline onclick in HTML templates
  (window as any).copyAIResponse = copyAIResponse;

  // Refresh users button
  const refreshUsersBtn = document.getElementById('refresh-users-btn');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', async () => {
      loadAllUsers();
      await loadAllUsers();
    });
  }

  // Tab switch handler
  document.addEventListener('tab-switched', async (e: any) => {
    const tab = e.detail?.tab;
    const selectedId = getSelectedStudentId();
    if (tab === 'attendance' && selectedId) {
      await loadStudentAttendance(selectedId);
    } else if (tab === 'dashboard') {
      await loadRecentActivity();
    }
  });

  console.log('✅ Application initialized');

  // Background particles
  try {
    new ParticleSystem('background-canvas');
  } catch (e) {
    console.log('Background canvas not found or already initialized');
  }
}

// ==================== Auth State Handler ====================

async function handleAuthStateChange(user: User | null): Promise<void> {
  if (user) {
    showAppContainer();
    configureUIForRole(user);

    // Update sidebar
    const userRole = getCurrentUserRole();
    if (typeof (window as any).updateSidebarUserInfo === 'function') {
      (window as any).updateSidebarUserInfo(user.email, userRole);
    }

    // Load all data
    await loadDashboardData();

    // Set dashboard as default tab
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hide'));
    document.getElementById('dashboard-content')?.classList.remove('hide');

    // Activate dashboard tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('tab-active');
      btn.classList.add('text-dark-300');
    });
    const dashboardTabBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
    if (dashboardTabBtn) {
      dashboardTabBtn.classList.add('tab-active');
      dashboardTabBtn.classList.remove('text-dark-300');
    }

    // Activate sidebar nav
    document.querySelectorAll('.lms-nav-item[data-tab]').forEach(item => item.classList.remove('active'));
    document.querySelector('.lms-nav-item[data-tab="dashboard"]')?.classList.add('active');

    // Update breadcrumb
    const breadcrumb = document.getElementById('breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = 'Dashboard';
  } else {
    showAuthContainer();
    resetAppState();
  }
}

// ==================== Bootstrap ====================

document.addEventListener('DOMContentLoaded', init);
