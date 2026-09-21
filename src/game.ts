import { randomToken } from './random';
export const COLORS = ['#ff875e', '#bca0ff', '#c6f278', '#69d9ea', '#ff9ac3', '#ffd670'];
export const ROUND_SECONDS = 45;
export const MAX_PLAYERS = 30;
export const STARTING_LIVES = 3;
export const RESPAWN_SECONDS = 10;
export type Phase = 'lobby' | 'countdown' | 'playing' | 'finished';
export type Input = { x: number; z: number; dash: boolean };
export type Player = {
  id: string; name: string; color: number; bot: boolean; connected: boolean;
  x: number; z: number; vx: number; vz: number; alive: boolean; waiting: boolean;
  cooldown: number; boost: number; fallenAt: number; score: number; input: Input; lastInput: number;
  lives: number; respawnAt: number | null;
};
export class Game {
  players: Player[] = [];
  phase: Phase = 'lobby';
  remaining = ROUND_SECONDS;
  countdown = 3;
  radius = 8;
  round = 1;
  elapsed = 0;
  winner: Player | undefined;
  onBump?: (x: number, z: number, power: number) => void;
  onFall?: (player: Player) => void;
  addPlayer(id: string, name: string, color: number, bot = false): Player | undefined {
    const existing = this.players.find(p => p.id === id);
    if (existing) { existing.connected = true; return existing; }
    if (this.players.length >= MAX_PLAYERS) return undefined;
    const angle = this.players.length * 2.39996;
    const waiting = this.phase === 'playing' || this.phase === 'countdown';
    const p: Player = { id, name: name.slice(0, 14), color: color % COLORS.length, bot, connected: true,
      x: Math.cos(angle) * 4.5, z: Math.sin(angle) * 4.5, vx: 0, vz: 0, alive: !waiting, waiting,
      cooldown: 0, boost: 0, fallenAt: -1, score: 0, input: { x: 0, z: 0, dash: false }, lastInput: this.elapsed,
      lives: STARTING_LIVES, respawnAt: null };
    this.players.push(p); return p;
  }
  addBots(count = 6) {
    const names = ['Peaches', 'Wobble', 'Pickle', 'Orbit', 'Mochi', 'Sunny', 'Noodle', 'Bubbles'];
    for (let i = 0; i < count; i++) this.addPlayer(`bot-${randomToken(8)}`, names[i % names.length], i, true);
  }
  removeBots() {
    this.players = this.players.filter(p => !p.bot);
    if (this.winner?.bot) this.winner = undefined;
    if (this.players.filter(p => p.connected).length < 2) {
      this.phase = 'lobby'; this.winner = undefined; this.remaining = ROUND_SECONDS; this.radius = 8;
      for (const p of this.players) { p.waiting = false; p.lives = STARTING_LIVES; this.respawn(p); }
    }
  }
  setInput(id: string, input: Input) {
    const p = this.players.find(p => p.id === id); if (!p) return;
    const len = Math.max(1, Math.hypot(input.x, input.z));
    p.input = { x: input.x / len, z: input.z / len, dash: input.dash || p.input.dash }; p.lastInput = this.elapsed;
  }
  start() {
    if (this.phase === 'playing' || this.phase === 'countdown') return false;
    if (this.players.filter(p => p.connected).length < 2) { this.phase = 'lobby'; this.winner = undefined; return false; }
    this.players = this.players.filter(p => p.connected || p.bot);
    this.players.forEach((p, i) => {
      const a = i / this.players.length * Math.PI * 2;
      Object.assign(p, { x: Math.cos(a) * 5.2, z: Math.sin(a) * 5.2, vx: 0, vz: 0, alive: true,
        waiting: false, cooldown: 0, boost: 0, fallenAt: -1, lives: STARTING_LIVES, respawnAt: null,
        lastInput: this.elapsed, input: { x: 0, z: 0, dash: false } });
    });
    this.phase = 'countdown'; this.countdown = 3; this.remaining = ROUND_SECONDS; this.radius = 8; this.winner = undefined;
    return true;
  }
  private respawn(p: Player) {
    // Choose a clear spot inside the current (possibly shrunken) arena.
    const others = this.players.filter(q => q !== p && q.alive && !q.waiting);
    const safeRadius = Math.max(0, this.radius - 1.6);
    let best = { x: 0, z: 0, clearance: -1 };
    for (let i = 0; i < 40; i++) {
      const r = safeRadius * Math.sqrt(i / 39), a = i * 2.39996;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const clearance = Math.min(...others.map(q => Math.hypot(q.x - x, q.z - z)));
      if (clearance > best.clearance) best = { x, z, clearance };
    }
    Object.assign(p, { x: best.x, z: best.z, vx: 0, vz: 0, alive: true, respawnAt: null,
      fallenAt: -1, cooldown: 0, boost: 0, lastInput: this.elapsed, input: { x: 0, z: 0, dash: false } });
    this.onBump?.(p.x, p.z, 0.5);
  }
  step(dt: number) {
    dt = Math.min(dt, 0.04); this.elapsed += dt;
    if (this.phase === 'countdown') { this.countdown -= dt; if (this.countdown <= 0) this.phase = 'playing'; return; }
    if (this.phase !== 'playing') return;
    this.remaining = Math.max(0, this.remaining - dt);
    this.radius = 8 - 5 * Math.min(1, (ROUND_SECONDS - this.remaining) / ROUND_SECONDS);
    for (const p of this.players) {
      if (!p.waiting && !p.alive && p.lives > 0 && p.respawnAt !== null && this.elapsed >= p.respawnAt) this.respawn(p);
    }
    for (const p of this.players) {
      if (!p.alive || p.waiting) continue;
      p.cooldown = Math.max(0, p.cooldown - dt); p.boost = Math.max(0, p.boost - dt);
      if (p.bot) {
        const others = this.players.filter(q => q.id !== p.id && q.alive && !q.waiting);
        const target = others.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        const edge = Math.hypot(p.x, p.z) > this.radius - 1.8;
        const tx = edge ? -p.x : (target ? target.x - p.x : -p.x);
        const tz = edge ? -p.z : (target ? target.z - p.z : -p.z);
        const length = Math.hypot(tx, tz) || 1;
        p.input = { x: tx / length, z: tz / length, dash: !edge && Math.random() < dt * 0.65 };
      } else if (this.elapsed - p.lastInput > 0.5) p.input = { x: 0, z: 0, dash: false };
      if (p.input.dash && p.cooldown === 0) {
        const n = Math.hypot(p.input.x, p.input.z);
        const dx = n > 0.1 ? p.input.x / n : -p.x / (Math.hypot(p.x, p.z) || 1);
        const dz = n > 0.1 ? p.input.z / n : -p.z / (Math.hypot(p.x, p.z) || 1);
        p.vx += dx * 15; p.vz += dz * 15; p.cooldown = 2.5; p.boost = 0.28;
        this.onBump?.(p.x, p.z, 0.5);
      }
      p.input.dash = false;
      p.vx += p.input.x * 24 * dt; p.vz += p.input.z * 24 * dt;
      const friction = Math.exp(-(p.boost > 0 ? 1.6 : 5) * dt);
      p.vx *= friction; p.vz *= friction;
      p.x += p.vx * dt; p.z += p.vz * dt;
    }
    const alive = this.players.filter(p => p.alive && !p.waiting);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j]; let dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz); if (distance >= 1.05) continue;
      if (distance < 0.001) { dx = 1; dz = 0; } else { dx /= distance; dz /= distance; }
      const overlap = (1.05 - distance) / 2;
      a.x -= dx * overlap; a.z -= dz * overlap; b.x += dx * overlap; b.z += dz * overlap;
      const relative = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
      if (relative > 0) {
        const impulse = relative * 0.9 + (a.boost > 0 || b.boost > 0 ? 8 : 1.5);
        a.vx -= dx * impulse; a.vz -= dz * impulse; b.vx += dx * impulse; b.vz += dz * impulse;
        if (impulse > 4) this.onBump?.((a.x + b.x) / 2, (a.z + b.z) / 2, impulse / 12);
      }
    }
    for (const p of alive) if (Math.hypot(p.x, p.z) > this.radius + 0.25) {
      p.alive = false; p.fallenAt = this.elapsed; p.lives = Math.max(0, p.lives - 1);
      p.respawnAt = p.lives > 0 ? this.elapsed + RESPAWN_SECONDS : null;
      p.input = { x: 0, z: 0, dash: false }; this.onFall?.(p);
    }
    // Orbiting players with lives left are still contenders, so don't end their comeback early.
    const contenders = this.players.filter(p => p.lives > 0 && !p.waiting);
    if (contenders.length === 0 || (contenders.length === 1 && contenders[0].alive) || this.remaining === 0) {
      this.phase = 'finished';
      // A timeout with multiple contenders is a draw, including players awaiting respawn.
      this.winner = contenders.length === 1 ? contenders[0] : undefined;
      if (this.winner) this.winner.score++;
    }
  }
  snapshot() {
    return { phase: this.phase, remaining: this.remaining, countdown: this.countdown, round: this.round,
      winner: this.winner?.id, players: this.players.map(p => ({ id: p.id, name: p.name, color: p.color,
        alive: p.alive, waiting: p.waiting, cooldown: p.cooldown, connected: p.connected, score: p.score,
        lives: p.lives, respawnIn: this.phase === 'playing' && p.respawnAt !== null ? Math.min(RESPAWN_SECONDS, Math.max(0, p.respawnAt - this.elapsed)) : null })) };
  }
}
