/**
 * Auth Forms — Login, signup, and logout form handlers
 */

import { signUp, signIn, logout } from '../../auth';
import {
  showError,
  clearError,
  loginForm,
  signupForm,
  logoutBtn,
  loginError,
  signupError,
  showModal
} from '../../ui';

/**
 * Show UID modal to user after signup so they can share it with admin
 */
function showUidModal(uid: string, email: string): void {
  console.log('📋 [showUidModal] Displaying UID modal for user');

  const modalHtml = `
    <div class="space-y-4">
      <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
        <p class="text-green-400 font-semibold mb-2">✅ Account Created Successfully!</p>
        <p class="text-dark-300 text-sm">Welcome, <strong class="text-white">${email}</strong></p>
      </div>
      
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">🔑 Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">
          You MUST share this ID with your teacher/admin so they can register you in the system.
        </p>
        
        <div class="relative">
          <input 
            type="text" 
            id="uid-display"
            value="${uid}" 
            readonly 
            class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm focus:outline-none focus:border-primary-500"
          >
          <button 
            id="copy-uid-btn"
            class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all"
          >
            Copy
          </button>
        </div>
        
        <p class="text-xs text-dark-400 mt-2">
          💡 Click "Copy" and send this ID to your teacher via email or message.
        </p>
      </div>
      
      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p class="text-yellow-400 font-semibold mb-2">📝 Next Steps:</p>
        <ol class="text-dark-300 text-sm space-y-1 ml-4 list-decimal">
          <li>Copy your Account ID using the button above</li>
          <li>Send it to your teacher/administrator</li>
          <li>Wait for them to register you in the system</li>
          <li>Log back in to see your grades and attendance</li>
        </ol>
      </div>
      
      <div class="text-center">
        <button 
          id="close-uid-modal-btn"
          class="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg"
        >
          I've Copied My ID
        </button>
      </div>
    </div>
  `;

  showModal('🎉 Account Created!', modalHtml);

  // Add copy functionality after modal renders
  setTimeout(() => {
    const copyBtn = document.getElementById('copy-uid-btn');
    const uidInput = document.getElementById('uid-display') as HTMLInputElement;
    const closeBtn = document.getElementById('close-uid-modal-btn');

    if (copyBtn && uidInput) {
      copyBtn.addEventListener('click', () => {
        uidInput.select();
        navigator.clipboard.writeText(uid).then(() => {
          copyBtn.textContent = '✓ Copied!';
          copyBtn.classList.add('bg-green-500', 'hover:bg-green-600');
          copyBtn.classList.remove('bg-primary-500', 'hover:bg-primary-600');
          console.log('✅ [showUidModal] UID copied to clipboard:', uid);
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            copyBtn.classList.add('bg-primary-500', 'hover:bg-primary-600');
          }, 2000);
        }).catch(err => {
          console.error('❌ [showUidModal] Failed to copy UID:', err);
          alert('Failed to copy. Please select and copy manually.');
        });
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const modal = document.getElementById('modal');
        if (modal) modal.classList.add('hide');
      });
    }
  }, 100);
}

/**
 * Setup authentication form handlers (login, signup, logout)
 */
export function setupAuthForms(): void {
  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginError);

    const formData = new FormData(loginForm);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await signIn(email, password);
      loginForm.reset();
    } catch (error: any) {
      showError(loginError, error.message);
    }
  });

  // Signup form
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(signupError);

    const formData = new FormData(signupForm);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      showError(signupError, 'Passwords do not match');
      return;
    }

    try {
      console.log('🚀 [Signup] Starting signup process...');
      const uid = await signUp(email, password);
      console.log('🎉 [Signup] Account created! Displaying UID to user...');
      showUidModal(uid, email);
      signupForm.reset();
    } catch (error: any) {
      console.error('❌ [Signup] Signup failed:', error);
      showError(signupError, error.message);
    }
  });

  // Logout button
  logoutBtn.addEventListener('click', async () => {
    try {
      await logout();
    } catch (error: any) {
      alert('Logout failed: ' + error.message);
    }
  });
}
