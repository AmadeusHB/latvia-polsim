// Seeded RNG (mulberry32) — deterministic given seed.
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Box–Muller log-normal noise (multiplicative, mean ≈ 1).
  logNormal(sigma: number): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.exp(z * sigma);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}
