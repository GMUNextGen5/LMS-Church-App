/**
 * Login background particle canvas. Cached colors, debounced resize, requestAnimationFrame loop. Call destroy() on teardown.
 */
import { getAppTheme } from '../core/theme-events';

interface ParticleConfig {
  colors: string[];
  particleDensity: number;
  maxConnectionDistance: number;
  mouseRepelDistance: number;
  particleMinSize: number;
  particleMaxSize: number;
  speedMultiplier: number;
}

const DEFAULT_CONFIG: ParticleConfig = {
  colors: ['#8B2942', '#A03050', '#6B1D32', '#C44569', '#737373', '#525252'],
  particleDensity: 8000,
  maxConnectionDistance: 120,
  mouseRepelDistance: 180,
  particleMinSize: 1.5,
  particleMaxSize: 4,
  speedMultiplier: 0.8,
};

const LIGHT_THEME_COLORS = ['#94a3b8', '#cbd5e1', '#64748b', '#0369a1', '#0d9488', '#8B2942'];

const TWO_PI = Math.PI * 2;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

type RgbTuple = [number, number, number];
const rgbCache = new Map<string, RgbTuple>();

function getRgb(hex: string): RgbTuple {
  let v = rgbCache.get(hex);
  if (!v) {
    v = hexToRgb(hex);
    rgbCache.set(hex, v);
  }
  return v;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrameId = 0;
  private width = 0;
  private height = 0;
  private mouseX = -1000;
  private mouseY = -1000;
  private config: ParticleConfig;
  private dpr: number;
  private resizeTimer = 0;
  private maxDistSq: number;
  private readonly onReducedMotionChange = (): void => {
    if (prefersReducedMotion()) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
      this.drawStillFrame();
    } else if (this.animationFrameId === 0) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  };

  constructor(canvasId: string, config: Partial<ParticleConfig> = {}) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Canvas not found');

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    this.canvas = canvas;
    this.ctx = ctx;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.maxDistSq = this.config.maxConnectionDistance * this.config.maxConnectionDistance;

    this.resize();
    this.initListeners();
    this.initParticles();
    if (prefersReducedMotion()) {
      this.drawStillFrame();
    } else {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  private initListeners(): void {
    window.addEventListener('resize', this.handleResize, { passive: true });
    window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', this.handleMouseLeave);
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleMouseLeave);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', this.onReducedMotionChange);
    } else {
      (mq as MediaQueryList & { addListener?: (fn: () => void) => void }).addListener?.(
        this.onReducedMotionChange
      );
    }
  }

  private handleResize = (): void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resize();
      this.initParticles();
      if (prefersReducedMotion()) this.drawStillFrame();
    }, 200);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length > 0) {
      this.mouseX = e.touches[0].clientX;
      this.mouseY = e.touches[0].clientY;
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (e.touches.length > 0) {
      this.mouseX = e.touches[0].clientX;
      this.mouseY = e.touches[0].clientY;
    }
  };

  private handleMouseLeave = (): void => {
    this.mouseX = -1000;
    this.mouseY = -1000;
  };

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  private initParticles(): void {
    const count = Math.min(
      Math.max(Math.floor((this.width * this.height) / this.config.particleDensity), 30),
      200
    );
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(this.width, this.height, this.config));
    }
  }

  private animate = (): void => {
    if (prefersReducedMotion()) {
      this.drawStillFrame();
      this.animationFrameId = 0;
      return;
    }
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle =
      getAppTheme() === 'light' ? 'rgba(248, 250, 252, 0.35)' : 'rgba(10, 10, 15, 0.15)';
    ctx.fillRect(0, 0, w, h);

    const particles = this.particles;
    const len = particles.length;
    const mx = this.mouseX;
    const my = this.mouseY;
    const cfg = this.config;
    const maxDist = cfg.maxConnectionDistance;
    const maxDistSq = this.maxDistSq;

    for (let i = 0; i < len; i++) {
      particles[i].update(w, h, mx, my, cfg);
    }

    ctx.lineWidth = 1;
    for (let i = 0; i < len; i++) {
      const p1 = particles[i];
      for (let j = i + 1; j < len; j++) {
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) {
          const opacity = (1 - Math.sqrt(distSq) / maxDist) * 0.5;
          const [r, g, b] = getRgb(p1.color);
          ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < len; i++) {
      particles[i].draw(ctx);
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /** Static decorative frame: no motion, no connection lines (accessibility). */
  private drawStillFrame(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.fillStyle =
      getAppTheme() === 'light' ? 'rgba(248, 250, 252, 0.35)' : 'rgba(10, 10, 15, 0.15)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].draw(ctx);
    }
  }

  /**
   * Re-picks particle palette and respawns particles when the app theme changes (login canvas).
   */
  public refreshForTheme(): void {
    const light = getAppTheme() === 'light';
    this.config.colors = light ? [...LIGHT_THEME_COLORS] : [...DEFAULT_CONFIG.colors];
    this.initParticles();
    if (prefersReducedMotion()) this.drawStillFrame();
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    clearTimeout(this.resizeTimer);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (typeof mq.removeEventListener === 'function') {
      mq.removeEventListener('change', this.onReducedMotionChange);
    } else {
      (mq as MediaQueryList & { removeListener?: (fn: () => void) => void }).removeListener?.(
        this.onReducedMotionChange
      );
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseleave', this.handleMouseLeave);
    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleMouseLeave);
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  private baseVx: number;
  private baseVy: number;
  private pulsePhase: number;
  private glowRgba: string;
  private coreColor: string;

  constructor(width: number, height: number, config: ParticleConfig) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    const speed = config.speedMultiplier;
    this.vx = (Math.random() - 0.5) * speed;
    this.vy = (Math.random() - 0.5) * speed;
    this.baseVx = this.vx;
    this.baseVy = this.vy;
    this.size =
      Math.random() * (config.particleMaxSize - config.particleMinSize) + config.particleMinSize;
    this.color = config.colors[Math.floor(Math.random() * config.colors.length)];
    this.opacity = Math.random() * 0.5 + 0.3;
    this.pulsePhase = Math.random() * TWO_PI;
    const [r, g, b] = getRgb(this.color);
    this.glowRgba = `rgba(${r},${g},${b},0.3)`;
    this.coreColor = this.color;
  }

  update(
    width: number,
    height: number,
    mouseX: number,
    mouseY: number,
    config: ParticleConfig
  ): void {
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const distSq = dx * dx + dy * dy;
    const maxDist = config.mouseRepelDistance;

    if (distSq < maxDist * maxDist && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const force = (maxDist - dist) / maxDist;
      const angle = Math.atan2(dy, dx);
      const repelForce = force * force * 3;
      this.vx -= Math.cos(angle) * repelForce;
      this.vy -= Math.sin(angle) * repelForce;
    }

    this.vx += (this.baseVx - this.vx) * 0.02;
    this.vy += (this.baseVy - this.vy) * 0.02;
    this.x += this.vx;
    this.y += this.vy;

    this.pulsePhase += 0.02;
    this.opacity = 0.3 + Math.sin(this.pulsePhase) * 0.2;

    const buffer = 50;
    if (this.x < -buffer) this.x = width + buffer;
    else if (this.x > width + buffer) this.x = -buffer;
    if (this.y < -buffer) this.y = height + buffer;
    else if (this.y > height + buffer) this.y = -buffer;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = this.x;
    const y = this.y;
    ctx.globalAlpha = this.opacity;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, this.size * 3);
    gradient.addColorStop(0, this.coreColor);
    gradient.addColorStop(0.4, this.glowRgba);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, this.size * 3, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = this.coreColor;
    ctx.beginPath();
    ctx.arc(x, y, this.size, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
}
