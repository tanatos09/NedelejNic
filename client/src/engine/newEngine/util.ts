export function parseTimeMs(s: string): number {
  const str = (s ?? '').trim();
  if (!str) return 0;
  if (str.endsWith('ms')) return Number(str.slice(0, -2)) || 0;
  if (str.endsWith('s')) return (Number(str.slice(0, -1)) || 0) * 1000;
  // fallback: raw number = seconds
  const n = Number(str);
  if (Number.isFinite(n)) return n * 1000;
  return 0;
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

