import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Types (matching LEVEL_FORMAT.md) ────────────────────────────

export interface LevelRules {
  mouseMove: boolean;
  click: boolean;
  keyboard: boolean;
  scroll: boolean;
  touch: boolean;
}

export interface LevelEvent {
  time: number;
  type: 'subtitle' | 'clear' | 'voice';
  text?: string;
  audio?: string;
}

export interface LevelEnd {
  type: 'timer';
  time: number;
}

export interface LevelConfig {
  id: number;
  rules: LevelRules;
  events: LevelEvent[];
  end: LevelEnd;
  signature?: string;
}

// ── Action-based JSON levels (filesystem source of truth) ─────────

export type ActionLevelJson = {
  id: number;
  type: 'action' | 'custom';
  title?: string;
  assets?: { voices?: string[]; music?: string[]; sounds?: string[] };
  rules?: Record<string, string>;
  end?: { type: 'timer'; time: number };
  timeline?: unknown[];
  module?: string;
  signature?: string;
};

// ── Signing ─────────────────────────────────────────────────────

const LEVEL_SECRET = process.env.LEVEL_SECRET || 'change-me-in-production';

export function signLevel(levelId: number, endTime: number, userId: string): string {
  const payload = `${userId}:${levelId}:${endTime}`;
  return crypto.createHmac('sha256', LEVEL_SECRET).update(payload).digest('hex');
}

// ── Filesystem loader (single source of truth) ───────────────────

function repoLevelsRoot(): string {
  // Stable resolution for both TS (server/src) and compiled JS (server/dist):
  // __dirname is .../server/src or .../server/dist → ../../levels is repo /levels
  const candidate = path.resolve(__dirname, '../../levels');
  if (fs.existsSync(candidate)) return candidate;

  // Fallback: handle odd working directories (shouldn't normally happen)
  const cwdCandidate = path.resolve(process.cwd(), 'levels');
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;

  return candidate;
}

function listJsonFilesRec(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsonFilesRec(full));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.json')) out.push(full);
  }
  return out;
}

function tryLoadLevelFromFile(filePath: string): ActionLevelJson | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ActionLevelJson;
    if (typeof parsed?.id !== 'number') return null;
    if (parsed.type !== 'action' && parsed.type !== 'custom') return null;
    return parsed;
  } catch {
    return null;
  }
}

function findLevelOnDisk(levelId: number): { level: ActionLevelJson; sourcePath: string; sourceKind: 'tests' | 'levels' } | null {
  const root = repoLevelsRoot();
  if (!fs.existsSync(root)) {
    console.log(`[levels] levels root not found: ${root} (cwd=${process.cwd()})`);
    return null;
  }
  const testsDir = path.join(root, 'tests');

  // 1) tests highest priority
  const testsFiles = listJsonFilesRec(testsDir);
  for (const p of testsFiles) {
    const lvl = tryLoadLevelFromFile(p);
    if (lvl && lvl.id === levelId) return { level: lvl, sourcePath: p, sourceKind: 'tests' };
  }

  // 2) all other levels (exclude tests folder)
  const all = listJsonFilesRec(root).filter((p) => !p.startsWith(testsDir + path.sep));
  for (const p of all) {
    const lvl = tryLoadLevelFromFile(p);
    if (lvl && lvl.id === levelId) return { level: lvl, sourcePath: p, sourceKind: 'levels' };
  }

  return null;
}

export function getLevelConfig(levelNum: number): ActionLevelJson {
  const found = findLevelOnDisk(levelNum);
  if (found) {
    const rel = path.relative(process.cwd(), found.sourcePath);
    if (found.sourceKind === 'tests') {
      console.log(`[levels] LEVEL OVERRIDE PRIORITY APPLIED`);
      console.log(`[levels] LEVEL LOAD SOURCE: /levels/tests/${path.basename(found.sourcePath)} (${rel})`);
    } else {
      console.log(`[levels] LEVEL LOAD SOURCE: /levels/** (${rel})`);
    }
    return found.level;
  }

  console.log(`[levels] LEGACY LEVEL BLOCKED (no filesystem level found for id=${levelNum})`);
  throw new Error(`Level ${levelNum} not found in /levels/**`);
}
