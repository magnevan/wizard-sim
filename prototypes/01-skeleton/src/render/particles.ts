// Purely visual particles. Never read by the simulation; uses Math.random freely.

import type { Vec2 } from '../core/vec2';
import type { FxEvent } from '../world/world';

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  age: number;
  life: number;
  color: string;
  size: number;
  /** 'dot' shrinks, 'puff' grows and fades, 'ring' expands as a stroke. */
  shape: 'dot' | 'puff' | 'ring';
  drag: number;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  list: Particle[] = [];

  emit(p: Omit<Particle, 'age' | 'drag'> & { drag?: number }): void {
    if (this.list.length > 1500) return;
    this.list.push({ ...p, age: 0, drag: p.drag ?? 2 });
  }

  burst(pos: Vec2, color: string, n: number, speed: number, size = 0.08, life = 0.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * speed;
      this.emit({ pos: { ...pos }, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s }, life: rand(0.6, 1) * life, color, size, shape: 'dot' });
    }
  }

  ring(pos: Vec2, color: string, size: number, life = 0.4): void {
    this.emit({ pos: { ...pos }, vel: { x: 0, y: 0 }, life, color, size, shape: 'ring' });
  }

  /** Translate sim cues into visuals. */
  cue(fx: FxEvent): void {
    const c = fx.color;
    switch (fx.name) {
      case 'impact':
        this.burst(fx.pos, c ?? '#d9c7a8', 10, 4, 0.07, 0.35);
        break;
      case 'steam':
        for (let i = 0; i < 8; i++)
          this.emit({ pos: { x: fx.pos.x + rand(-0.3, 0.3), y: fx.pos.y + rand(-0.3, 0.3) }, vel: { x: rand(-0.4, 0.4), y: rand(-1.5, -0.6) }, life: rand(0.6, 1), color: '#eef3f7', size: rand(0.15, 0.3), shape: 'puff' });
        break;
      case 'freeze':
        this.burst(fx.pos, '#bff0ff', 14, 3, 0.09, 0.5);
        this.ring(fx.pos, '#bff0ff', 1.2);
        break;
      case 'thaw':
        this.burst(fx.pos, '#9fe3ff', 8, 2, 0.06, 0.4);
        break;
      case 'poof':
        this.burst(fx.pos, c ?? '#8a3b5c', 18, 5, 0.12, 0.6);
        this.ring(fx.pos, '#ffffff', 1.0);
        break;
      case 'respawn':
      case 'reset':
        this.ring(fx.pos, c ?? '#ffffff', 1.4, 0.6);
        break;
      case 'slash':
        this.burst(fx.pos, '#ff4040', 8, 4, 0.06, 0.3);
        break;
      case 'self':
        this.ring(fx.pos, '#ffffff', 1.0, 0.35);
        break;
      case 'ward':
        this.ring(fx.pos, '#f3d36b', 1.1, 0.5);
        break;
      case 'fizzle':
        this.burst(fx.pos, '#777777', 6, 1.5, 0.05, 0.3);
        break;
      case 'wardBubble':
        this.ring(fx.pos, '#f3d36b', 2.2, 0.6);
        this.ring(fx.pos, '#fff0b0', 1.5, 0.5);
        break;
      case 'rise':
        this.burst(fx.pos, c ?? '#b07a45', 12, 3, 0.1, 0.5);
        break;
      case 'shatter':
        this.burst(fx.pos, c ?? '#b07a45', 22, 6, 0.1, 0.6);
        this.ring(fx.pos, '#ffffff', 1.4, 0.4);
        break;
      case 'splash':
        this.burst(fx.pos, '#4fb4ff', 18, 4, 0.09, 0.5);
        break;
      case 'surge':
        this.burst(fx.pos, '#e6d8ff', 24, 6, 0.06, 0.4);
        this.ring(fx.pos, '#b48cff', 2.4, 0.4);
        break;
      case 'geyser':
        this.burst(fx.pos, '#b07a45', 26, 7, 0.14, 0.7);
        this.ring(fx.pos, '#d9b98a', 2.6, 0.5);
        break;
      case 'quake':
      case 'blast':
      case 'frost':
      case 'spikes':
      case 'bloom':
        this.ring(fx.pos, fx.name === 'blast' ? '#ff4f8b' : fx.name === 'bloom' ? '#5ee26a' : '#cdf3ff', 2.2, 0.45);
        break;
      case 'strike':
        this.burst(fx.pos, '#f3ecff', 20, 5, 0.07, 0.4);
        break;
      case 'seal':
        this.ring(fx.pos, '#ffd98a', 1.2, 0.5);
        this.ring(fx.pos, '#ffd98a', 0.7, 0.4);
        break;
      case 'rune':
        this.ring(fx.pos, '#ffd98a', 1.8, 0.5);
        this.burst(fx.pos, '#ffd98a', 10, 3, 0.07, 0.4);
        break;
      case 'release':
        this.ring(fx.pos, '#ffd98a', 2.6, 0.5);
        this.ring(fx.pos, '#ffffff', 1.8, 0.4);
        break;
      case 'fling':
        this.burst(fx.pos, c ?? '#ffffff', 10, 3, 0.07, 0.4);
        break;
      case 'bounce':
        this.burst(fx.pos, '#e8fbff', 4, 2, 0.05, 0.2);
        break;
      case 'enchant':
        this.ring(fx.pos, c ?? '#ffffff', 1.3, 0.5);
        this.burst(fx.pos, c ?? '#ffffff', 14, 3, 0.07, 0.5);
        break;
      case 'cage':
        this.ring(fx.pos, '#ffe08a', 2.4, 0.45);
        this.burst(fx.pos, '#fff0b0', 16, 4, 0.07, 0.45);
        break;
      case 'cageHit':
        this.burst(fx.pos, '#ffe08a', 8, 2.5, 0.06, 0.3);
        break;
      case 'charged':
        this.ring(fx.pos, '#ffd98a', 1.0, 0.3);
        break;
      case 'slam':
        this.burst(fx.pos, '#9a6a3a', 30, 7, 0.14, 0.6);
        this.ring(fx.pos, '#ff6a4a', 4.4, 0.45);
        break;
      case 'emerge':
        this.burst(fx.pos, c ?? '#ffffff', 12, 3, 0.09, 0.5);
        this.ring(fx.pos, c ?? '#ffffff', 1.4, 0.4);
        break;
      case 'portal':
      case 'horn':
        this.ring(fx.pos, fx.name === 'horn' ? '#ff6a4a' : '#c9a6ff', 30, 1.2);
        break;
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.age += dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      const k = Math.exp(-p.drag * dt);
      p.vel.x *= k;
      p.vel.y *= k;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const r = p.shape === 'puff' ? p.size * (0.6 + t) : p.size * (1 - t * 0.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

