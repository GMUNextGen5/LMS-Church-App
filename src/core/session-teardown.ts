/** LIFO teardown hooks before auth shell is cleared (Firestore listeners, timers, etc.). */

const hooks: Array<() => void> = [];

export function registerSessionTeardown(fn: () => void): void {
  hooks.push(fn);
}

export function runSessionTeardown(): void {
  while (hooks.length > 0) {
    const fn = hooks.pop();
    try {
      fn?.();
    } catch {
      /* teardown must never throw */
    }
  }
}
