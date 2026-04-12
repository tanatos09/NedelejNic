import crypto from 'crypto';

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

// ── Signing ─────────────────────────────────────────────────────

const LEVEL_SECRET = process.env.LEVEL_SECRET || 'change-me-in-production';

export function signLevel(levelId: number, endTime: number, userId: string): string {
  const payload = `${userId}:${levelId}:${endTime}`;
  return crypto.createHmac('sha256', LEVEL_SECRET).update(payload).digest('hex');
}

// ── Defined levels ──────────────────────────────────────────────

const DEFINED_LEVELS: LevelConfig[] = [
  {
    id: 1,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: false, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Vítej. Pravidlo je jedno.' },
      { time: 2, type: 'subtitle', text: 'Nedělej nic.' },
      { time: 5, type: 'clear' },
      { time: 6, type: 'subtitle', text: 'Přesně tak.' },
      { time: 8, type: 'clear' },
    ],
    end: { type: 'timer', time: 10 },
  },
  {
    id: 2,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: false, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Dobré. Tentokrát déle.' },
      { time: 3, type: 'subtitle', text: 'Klikni pro pokračování.' },
      { time: 5, type: 'subtitle', text: 'Říkám NEklikej.' },
      { time: 8, type: 'clear' },
      { time: 10, type: 'subtitle', text: 'Svrbí tě prst? Drž se.' },
      { time: 13, type: 'subtitle', text: 'Skoro...' },
    ],
    end: { type: 'timer', time: 15 },
  },
  {
    id: 3,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: false, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Stiskni mezerník.' },
      { time: 3, type: 'subtitle', text: 'Jen zkus. Jen jednou.' },
      { time: 5, type: 'clear' },
      { time: 6, type: 'subtitle', text: 'Ne, nestiskni.' },
      { time: 10, type: 'clear' },
      { time: 13, type: 'subtitle', text: 'Zvládáš to.' },
      { time: 17, type: 'subtitle', text: 'Poslední sekundy...' },
    ],
    end: { type: 'timer', time: 20 },
  },
  {
    id: 4,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: true, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Nové pravidlo: ani nehýbej kolečkem.' },
      { time: 4, type: 'clear' },
      { time: 7, type: 'subtitle', text: 'Kolečko = konec.' },
      { time: 10, type: 'clear' },
      { time: 13, type: 'subtitle', text: 'Ticho je tvůj kamarád.' },
      { time: 17, type: 'subtitle', text: 'Výborně.' },
    ],
    end: { type: 'timer', time: 20 },
  },
  {
    id: 5,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: true, touch: false },
    events: [
      { time: 2, type: 'subtitle', text: '...' },
      { time: 7, type: 'clear' },
      { time: 14, type: 'subtitle', text: '...' },
      { time: 19, type: 'clear' },
      { time: 25, type: 'subtitle', text: '...' },
      { time: 28, type: 'clear' },
    ],
    end: { type: 'timer', time: 30 },
  },
  {
    id: 6,
    rules: { mouseMove: false, click: true, keyboard: true, scroll: true, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Level 6. Jsi opravdu trpělivý.' },
      { time: 4, type: 'subtitle', text: 'Nebo jsi blázen.' },
      { time: 7, type: 'clear' },
      { time: 10, type: 'subtitle', text: 'Nuda? Dobrý pocit.' },
      { time: 14, type: 'subtitle', text: 'Nuda je luxus.' },
      { time: 18, type: 'clear' },
      { time: 21, type: 'subtitle', text: 'Ještě chvíli...' },
    ],
    end: { type: 'timer', time: 25 },
  },
  {
    id: 7,
    rules: { mouseMove: true, click: true, keyboard: true, scroll: true, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Teď sledujeme i myš.' },
      { time: 3, type: 'subtitle', text: 'Ruce pryč od stolu.' },
      { time: 6, type: 'clear' },
      { time: 10, type: 'subtitle', text: 'Pryč říkám.' },
      { time: 15, type: 'clear' },
      { time: 20, type: 'subtitle', text: 'Polovinu máš za sebou.' },
      { time: 25, type: 'subtitle', text: 'Klid.' },
      { time: 28, type: 'clear' },
    ],
    end: { type: 'timer', time: 30 },
  },
  {
    id: 8,
    rules: { mouseMove: true, click: true, keyboard: true, scroll: true, touch: false },
    events: [
      { time: 0, type: 'subtitle', text: 'Level 8. Zasloužíš poklonu.' },
      { time: 4, type: 'clear' },
      { time: 8, type: 'subtitle', text: 'Tvůj mozek teď křičí: UDĚLEJ NĚCO.' },
      { time: 13, type: 'subtitle', text: 'Neposlechni ho.' },
      { time: 16, type: 'clear' },
      { time: 22, type: 'subtitle', text: 'Kontrola tichosti: probíhá...' },
      { time: 27, type: 'subtitle', text: 'Stále nic. Výborně.' },
      { time: 31, type: 'clear' },
    ],
    end: { type: 'timer', time: 35 },
  },
  {
    id: 9,
    rules: { mouseMove: true, click: true, keyboard: true, scroll: true, touch: true },
    events: [
      { time: 0, type: 'subtitle', text: 'Level 9.' },
      { time: 3, type: 'subtitle', text: 'Sed. Nic nedělej. Jen... existuj.' },
      { time: 8, type: 'clear' },
      { time: 15, type: 'subtitle', text: 'Vědomí bez akce.' },
      { time: 20, type: 'clear' },
      { time: 25, type: 'subtitle', text: 'Toto není hra.' },
      { time: 28, type: 'subtitle', text: 'Toto je meditace.' },
      { time: 33, type: 'clear' },
      { time: 36, type: 'subtitle', text: 'Čtyři sekundy.' },
    ],
    end: { type: 'timer', time: 40 },
  },
  {
    id: 10,
    rules: { mouseMove: true, click: true, keyboard: true, scroll: true, touch: true },
    events: [
      { time: 0, type: 'subtitle', text: 'Level 10. Respekt.' },
      { time: 5, type: 'clear' },
      { time: 10, type: 'subtitle', text: 'Padesát sekund nicoty.' },
      { time: 15, type: 'clear' },
      { time: 22, type: 'subtitle', text: 'Tichá revoluce.' },
      { time: 27, type: 'clear' },
      { time: 35, type: 'subtitle', text: 'Kdo dělá nic, dělá vše.' },
      { time: 40, type: 'clear' },
      { time: 43, type: 'subtitle', text: 'Sedm sekund.' },
      { time: 47, type: 'clear' },
    ],
    end: { type: 'timer', time: 50 },
  },
];

// ── Generator for levels beyond defined ones ────────────────────

function generateLevel(levelNum: number): LevelConfig {
  const duration = Math.min(15 + levelNum * 2, 120);
  const eventCount = Math.min(3 + Math.floor(levelNum / 3), 8);
  const interval = duration / (eventCount + 1);

  const messages = [
    `Level ${levelNum}.`,
    'Nic. Nedělej. Tečka.',
    '...',
    'Stále tu jsi?',
    'Výborně.',
    'Klid zůstává.',
    'Ještě chvíli...',
    'Skoro.',
  ];

  const events: LevelEvent[] = messages.slice(0, eventCount).map((text, i) => ({
    time: Math.round(interval * (i + 1)),
    type: 'subtitle' as const,
    text,
  }));

  return {
    id: levelNum,
    rules: { mouseMove: true, click: true, keyboard: true, scroll: true, touch: true },
    events,
    end: { type: 'timer', time: duration },
  };
}

export function getLevelConfig(levelNum: number): LevelConfig {
  const defined = DEFINED_LEVELS.find((l) => l.id === levelNum);
  return defined ?? generateLevel(levelNum);
}
