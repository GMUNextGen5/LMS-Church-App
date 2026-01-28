
/**
 * Premium Particle System for NG5 Login Page
 * Features: Mouse interaction, connecting lines, gradient particles, smooth animations
 */

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
    particleDensity: 8000, // Lower = more particles
    maxConnectionDistance: 120,
    mouseRepelDistance: 180,
    particleMinSize: 1.5,
    particleMaxSize: 4,
    speedMultiplier: 0.8,
};

export class ParticleSystem {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private particles: Particle[] = [];
    private animationFrameId: number | null = null;
    private width: number = 0;
    private height: number = 0;
    private mouseX: number = -1000;
    private mouseY: number = -1000;
    private config: ParticleConfig;
    private dpr: number;

    constructor(canvasId: string, config: Partial<ParticleConfig> = {}) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            console.warn(`Canvas with id ${canvasId} not found`);
            throw new Error("Canvas not found");
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true })!;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.resize();
        this.initListeners();
        this.initParticles();
        this.animate();
    }

    private initListeners() {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseleave', this.handleMouseLeave);
        // Touch support
        window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
        window.addEventListener('touchend', this.handleMouseLeave);
    }

    private handleResize = () => {
        this.resize();
    };

    private handleMouseMove = (e: MouseEvent) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    };

    private handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
            this.mouseX = e.touches[0].clientX;
            this.mouseY = e.touches[0].clientY;
        }
    };

    private handleMouseLeave = () => {
        this.mouseX = -1000;
        this.mouseY = -1000;
    };

    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx.scale(this.dpr, this.dpr);
        this.initParticles();
    }

    private initParticles() {
        this.particles = [];
        const area = this.width * this.height;
        const count = Math.floor(area / this.config.particleDensity);
        const particleCount = Math.min(Math.max(count, 30), 200); // Clamp between 30-200

        for (let i = 0; i < particleCount; i++) {
            this.particles.push(new Particle(this.width, this.height, this.config));
        }
    }

    private animate = () => {
        // Clear with slight fade for trail effect
        this.ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Update and draw particles
        for (const particle of this.particles) {
            particle.update(this.width, this.height, this.mouseX, this.mouseY, this.config);
            particle.draw(this.ctx);
        }

        // Draw connections
        this.drawConnections();

        this.animationFrameId = requestAnimationFrame(this.animate);
    };

    private drawConnections() {
        const maxDist = this.config.maxConnectionDistance;
        const particles = this.particles;
        const len = particles.length;

        for (let i = 0; i < len; i++) {
            const p1 = particles[i];
            for (let j = i + 1; j < len; j++) {
                const p2 = particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < maxDist * maxDist) {
                    const dist = Math.sqrt(distSq);
                    const opacity = (1 - dist / maxDist) * 0.5;

                    // Gradient line
                    const gradient = this.ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    gradient.addColorStop(0, this.hexToRgba(p1.color, opacity));
                    gradient.addColorStop(1, this.hexToRgba(p2.color, opacity));

                    this.ctx.beginPath();
                    this.ctx.strokeStyle = gradient;
                    this.ctx.lineWidth = 1;
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    private hexToRgba(hex: string, alpha: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    public destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseleave', this.handleMouseLeave);
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

    constructor(width: number, height: number, config: ParticleConfig) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;

        const speed = config.speedMultiplier;
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        this.baseVx = this.vx;
        this.baseVy = this.vy;

        this.size = Math.random() * (config.particleMaxSize - config.particleMinSize) + config.particleMinSize;
        this.color = config.colors[Math.floor(Math.random() * config.colors.length)];
        this.opacity = Math.random() * 0.5 + 0.3;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(width: number, height: number, mouseX: number, mouseY: number, config: ParticleConfig) {
        // Mouse interaction - smooth repulsion
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const distSq = dx * dx + dy * dy;
        const maxDist = config.mouseRepelDistance;

        if (distSq < maxDist * maxDist && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const force = (maxDist - dist) / maxDist;
            const angle = Math.atan2(dy, dx);

            // Smooth repulsion with easing
            const repelForce = force * force * 3;
            this.vx -= Math.cos(angle) * repelForce;
            this.vy -= Math.sin(angle) * repelForce;
        }

        // Return to base velocity gradually
        this.vx += (this.baseVx - this.vx) * 0.02;
        this.vy += (this.baseVy - this.vy) * 0.02;

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Pulse opacity
        this.pulsePhase += 0.02;
        this.opacity = 0.3 + Math.sin(this.pulsePhase) * 0.2;

        // Wrap around edges smoothly
        const buffer = 50;
        if (this.x < -buffer) this.x = width + buffer;
        if (this.x > width + buffer) this.x = -buffer;
        if (this.y < -buffer) this.y = height + buffer;
        if (this.y > height + buffer) this.y = -buffer;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.opacity;

        // Glow effect
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size * 3
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.4, this.hexToRgba(this.color, 0.3));
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core particle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.restore();
    }

    private hexToRgba(hex: string, alpha: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
