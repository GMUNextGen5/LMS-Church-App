/**
 * Shared Utilities — Copy-to-clipboard, formatting helpers
 */

/**
 * Copy text to clipboard and update button state
 */
export async function copyToClipboard(text: string, button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    button.classList.add('bg-green-500', 'hover:bg-green-600');
    button.classList.remove('bg-primary-500', 'hover:bg-primary-600');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('bg-green-500', 'hover:bg-green-600');
      button.classList.add('bg-primary-500', 'hover:bg-primary-600');
    }, 2000);

    console.log('✅ Copied to clipboard');
  } catch (err) {
    console.error('❌ Failed to copy:', err);
    alert('Failed to copy. Please select and copy manually.');
  }
}

/**
 * Copy AI response handler (exposed globally for onclick)
 */
export function copyAIResponse(button: HTMLElement, text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    const svg = button.querySelector('svg');
    if (svg) {
      button.innerHTML = '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
      setTimeout(() => {
        button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
      }, 2000);
    }
  }).catch(() => alert('Failed to copy'));
}

/** Format a date for display */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}
