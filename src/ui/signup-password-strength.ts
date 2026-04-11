import {
  evaluatePasswordStrength,
  type PasswordStrengthTier,
} from '../core/password-strength';

type NonZeroTier = Exclude<PasswordStrengthTier, 0>;

const SEG_BASE =
  'signup-pw-seg h-2 flex-1 min-w-0 rounded-[10px] transition-colors duration-150 ease-out';
const SEG_INACTIVE = 'bg-slate-400/35 dark:bg-slate-500/40';

/** Filled segments: higher contrast vs track (non-text UI ~3:1 on slate track). */
const SEG_ACTIVE: Record<NonZeroTier, string> = {
  1: 'bg-rose-600 dark:bg-rose-500',
  2: 'bg-amber-600 dark:bg-amber-500',
  3: 'bg-lime-600 dark:bg-lime-500',
  4: 'bg-teal-600 dark:bg-teal-400',
};

/** Label text: WCAG AA–oriented on #f9fafb / #111827 card backgrounds. */
const LABEL_TONE: Record<NonZeroTier, string> = {
  1: 'text-rose-700 dark:text-rose-400',
  2: 'text-amber-800 dark:text-amber-400',
  3: 'text-lime-800 dark:text-lime-400',
  4: 'text-teal-800 dark:text-teal-300',
};

function paintSegments(
  segments: NodeListOf<Element> | Element[],
  tier: PasswordStrengthTier
): void {
  const n = tier;
  const activeClass = n > 0 ? SEG_ACTIVE[n as NonZeroTier] : '';
  segments.forEach((el, i) => {
    const seg = el as HTMLElement;
    const on = n > 0 && i < n;
    seg.className = `${SEG_BASE} ${on ? activeClass : SEG_INACTIVE}`;
  });
}

/**
 * Wires the signup password strength meter (expects matching ids in `index.html`).
 * Uses rAF scheduling; `aria-live` updates only when the strength tier changes.
 */
export function setupSignupPasswordStrengthMeter(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('#signup-password');
  const wrap = document.getElementById('signup-password-strength-wrap');
  const inner = document.getElementById('signup-password-strength-inner');
  const bar = document.getElementById('signup-password-strength-bar');
  const labelEl = document.getElementById('signup-password-strength-label');
  const liveEl = document.getElementById('signup-password-strength-live');

  if (!input || !wrap || !inner || !bar || !labelEl) return;

  const segments = wrap.querySelectorAll('.signup-pw-seg');
  if (segments.length !== 4) return;

  let rafId = 0;
  let lastAnnouncedTier: PasswordStrengthTier | null = null;

  const apply = (value: string): void => {
    const { tier, label, ariaValueText } = evaluatePasswordStrength(value);

    if (tier !== lastAnnouncedTier) {
      if (liveEl) {
        liveEl.textContent = tier === 0 ? '' : ariaValueText;
      }
      lastAnnouncedTier = tier;
    }

    if (tier === 0) {
      inner.classList.add('invisible');
      inner.setAttribute('aria-hidden', 'true');
      bar.setAttribute('aria-hidden', 'true');
      bar.setAttribute('aria-valuenow', '0');
      bar.setAttribute('aria-valuetext', ariaValueText);
      labelEl.textContent = '';
      labelEl.setAttribute('aria-hidden', 'true');
      labelEl.className =
        'shrink-0 text-xs font-medium text-slate-600 tabular-nums leading-none dark:text-slate-400';
      paintSegments(segments, 0);
      return;
    }

    inner.classList.remove('invisible');
    inner.removeAttribute('aria-hidden');
    bar.removeAttribute('aria-hidden');
    labelEl.removeAttribute('aria-hidden');
    bar.setAttribute('aria-valuenow', String(tier));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '4');
    bar.setAttribute('aria-valuetext', ariaValueText);
    labelEl.textContent = `Strength: ${label}`;
    labelEl.className = `shrink-0 text-xs font-semibold tabular-nums leading-none ${LABEL_TONE[tier]}`;
    paintSegments(segments, tier);
  };

  const schedule = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      apply(input.value);
    });
  };

  const syncSoon = (): void => {
    schedule();
    window.setTimeout(() => apply(input.value), 0);
    window.setTimeout(() => apply(input.value), 120);
    window.setTimeout(() => apply(input.value), 500);
  };

  for (const ev of ['input', 'change', 'paste', 'cut', 'keyup'] as const) {
    input.addEventListener(ev, schedule, { passive: true });
  }
  input.addEventListener('focus', syncSoon, { passive: true });
  input.addEventListener('compositionend', schedule, { passive: true });

  document.getElementById('signup-tab-btn')?.addEventListener('click', () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => apply(input.value));
    });
    window.setTimeout(() => apply(input.value), 80);
    window.setTimeout(() => apply(input.value), 400);
  });

  const signupShell = document.getElementById('signup-form-container');
  if (signupShell) {
    /** Coalesce class mutations so `syncSoon` cannot re-enter the observer synchronously. */
    let moCoalesce = false;
    const mo = new MutationObserver(() => {
      if (!signupShell.classList.contains('hide')) {
        if (moCoalesce) return;
        moCoalesce = true;
        requestAnimationFrame(() => {
          moCoalesce = false;
          syncSoon();
        });
      }
    });
    mo.observe(signupShell, { attributes: true, attributeFilter: ['class'] });
  }

  form.addEventListener('reset', () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastAnnouncedTier = null;
    queueMicrotask(() => apply(input.value));
  });

  lastAnnouncedTier = null;
  apply(input.value);
  syncSoon();
}
