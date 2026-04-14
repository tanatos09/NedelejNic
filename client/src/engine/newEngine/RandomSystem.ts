export class RandomSystem {
  private state: number;

  constructor(seed: string) {
    this.state = RandomSystem.hash32(seed);
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  /** Deterministic float in [0,1). */
  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pickIndex(len: number): number {
    if (len <= 0) return 0;
    return Math.floor(this.next() * len);
  }

  static hash32(str: string): number {
    // FNV-1a 32bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

