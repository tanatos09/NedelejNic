import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import type { EngineState, EventLogEntry, RenderModel } from '../engine/newEngine/types';
import type { User, LevelConfig } from '../types';
import { EngineHost } from '../engine/core/EngineHost';

interface Props {
  user: User;
  onLogout: () => void;
  onAdmin?: () => void;
}

type Phase = 'loading' | 'ready' | 'playing' | 'ended';

/** České názvy řádků v logu (pro testery bez technického žargonu v hlavičce). */
const EVENT_KIND_META: Record<
  EventLogEntry['kind'],
  { label: string; color: string }
> = {
  engine: { label: 'systém', color: '#94a3b8' },
  action: { label: 'akce ve hře', color: '#38bdf8' },
  trap: { label: 'past', color: '#f87171' },
  rule: { label: 'pravidlo', color: '#fbbf24' },
  random: { label: 'náhoda', color: '#c084fc' },
};

function formatTimeShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function ruleModeCz(m: string): string {
  const map: Record<string, string> = {
    forbidden: 'zakázáno',
    allowed: 'povoleno',
    required: 'nutné',
  };
  return map[m] ?? m;
}

function describeWhen(when: {
  input?: string;
  key?: string;
  var?: string;
  gte?: number;
}): string {
  if (when.input === 'click') return 'kliknutí myší';
  if (when.input === 'keyDown' && when.key) return `stisk klávesy „${when.key}"`;
  if (when.input === 'keyDown') return 'stisk klávesy';
  if (when.var != null && when.gte != null)
    return `hodnota „${when.var}" je alespoň ${when.gte}`;
  return JSON.stringify(when);
}

function describeWaiting(waiting: {
  kind: string;
  dueAtMs?: number;
  when?: { input?: string; key?: string; var?: string; gte?: number };
}): string {
  if (!waiting || waiting.kind === 'none')
    return 'Nic nečeká — může se vrátit k dalším krokům časové osy.';
  if (waiting.kind === 'at' && typeof waiting.dueAtMs === 'number') {
    const s = (waiting.dueAtMs / 1000).toFixed(1);
    return `Čeká na časovač (další krok po cca ${s} s od startu levelu).`;
  }
  if (waiting.kind === 'when' && waiting.when)
    return `Čeká na účastníka: ${describeWhen(waiting.when)}.`;
  return String(waiting.kind);
}

function inspectorRows(snap: unknown): { k: string; v: string }[] {
  const s = snap as {
    scheduler?: {
      pc: number;
      jumpCount: number;
      waiting?: { kind: string; dueAtMs?: number; when?: { input?: string; key?: string; var?: string; gte?: number } };
      steps?: unknown[];
    };
    rules?: Record<string, string>;
    traps?: { enabled?: boolean }[];
    effects?: Record<string, boolean | number | string>;
    vars?: Record<string, unknown>;
  } | null;
  const rows: { k: string; v: string }[] = [];
  if (!s?.scheduler) {
    return [{ k: 'Stav', v: 'Zatím není k dispozici (spusť level).' }];
  }
  const { pc, jumpCount, waiting, steps } = s.scheduler;
  const stepCount = Array.isArray(steps) ? steps.length : 0;
  rows.push({
    k: 'Časová osa',
    v: `Krok ${pc + 1} z ${stepCount}${jumpCount ? ` · ${jumpCount}× skok v osi` : ''}`,
  });
  rows.push({
    k: 'Co teď engine dělá',
    v: describeWaiting(waiting ?? { kind: 'none' }),
  });
  const r = s.rules;
  if (r && typeof r === 'object') {
    rows.push({
      k: 'Pravidla vstupu',
      v: `Klik ${ruleModeCz(String(r.click))}, pohyb myši ${ruleModeCz(String(r.mouseMove))}, klávesnice ${ruleModeCz(String(r.keyboard))}, kolečko ${ruleModeCz(String(r.scroll))}, dotyk ${ruleModeCz(String(r.touch))}`,
    });
  }
  const traps = s.traps;
  if (Array.isArray(traps)) {
    const en = traps.filter((t) => t.enabled).length;
    rows.push({
      k: 'Pasti',
      v: `${en} zapnutých z ${traps.length}`,
    });
  }
  const fx = s.effects;
  if (fx && typeof fx === 'object') {
    const keys = Object.keys(fx).filter((k) => {
      const v = (fx as Record<string, unknown>)[k];
      return v != null && v !== false && v !== 0 && v !== '';
    });
    rows.push({
      k: 'Efekty obrazovky',
      v: keys.length ? keys.join(', ') : 'žádné',
    });
  }
  const vars = s.vars;
  if (vars && typeof vars === 'object') {
    const n = Object.keys(vars).length;
    rows.push({
      k: 'Proměnné (stav hry)',
      v: `${n} proměnných`,
    });
  }
  return rows;
}

function extraEventDetail(entry: EventLogEntry): string | null {
  if (entry.data == null) return null;
  if (typeof entry.data === 'string') return entry.data;
  try {
    const j = JSON.stringify(entry.data);
    if (j.length > 140) return `${j.slice(0, 137)}…`;
    return j;
  } catch {
    return String(entry.data);
  }
}

/** Zbývající čas v sekundách, zobrazení se setinami (čárka jako desetinný oddělovač). */
function formatCountdownCs(remainingSec: number): string {
  const r = Math.max(0, remainingSec);
  return `${r.toFixed(2).replace('.', ',')} s`;
}

function sessionDurationSeconds(cfg: LevelConfig | null): number | null {
  if (!cfg?.end || cfg.end.type !== 'timer') return null;
  const t = cfg.end.time;
  return typeof t === 'number' && t > 0 ? t : null;
}

/** Čitelnější jednořádkový popis pro testery (technický `msg` zůstává níže šedě). */
function humanizeLogMessage(entry: EventLogEntry): string {
  const m = entry.msg;
  const cz: Record<string, string> = {
    'level.load': 'Level je načtený, připraven ke spuštění.',
    'assets.preload.start': 'Načítám zvuky a obrázky…',
    'assets.preload.end': 'Média jsou nahraná.',
    'engine.start': 'Hra startuje.',
    'scheduler.start': 'Časová osa běží.',
    'debug.skip.success': 'Testovací přeskočení na výhru.',
    'rules.set': 'Změna pravidel vstupu (klik, klávesnice…)',
    'trap.fail': 'Past zareagovala — neúspěch.',
    'trap.success': 'Past zareagovala — pokračování.',
    'trap.setVar': 'Past změnila proměnnou ve hře.',
    'hook.missing': 'Chybí napojený efekt (hook).',
    'hook.error': 'Efekt (hook) spadl na chybě.',
    'audio.play.missing': 'Nelze přehrát — soubor chybí.',
    'audio.play.blocked': 'Přehrávání je zablokované nastavením.',
    'karrel.behavior': 'Pravidla postavy (Karrel) se vyhodnocují.',
    'karrel.goto.ignored': 'Skok na štítek ignorován.',
  };
  if (cz[m]) return cz[m];
  if (m === 'flow.random') return 'Náhodná volba větvě scénáře.';
  if (m.startsWith('validate.error:')) return `Chyba v datech levelu: ${m.replace(/^validate\.error:\s*/, '')}`;
  if (m.startsWith('validate.warn:')) return `Varování u levelu: ${m.replace(/^validate\.warn:\s*/, '')}`;
  if (!m.includes('.'))
    switch (m) {
      case 'text.set':
        return 'Změní se text na obrazovce.';
      case 'audio.play':
        return 'Spouští se zvuk.';
      default:
        return `Akce: ${m}`;
    }
  return m;
}

export default function GamePage({ user, onLogout, onAdmin }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [caption, setCaption] = useState('');
  const [levelResult, setLevelResult] = useState<'fail' | 'success' | null>(null);
  const [failReason, setFailReason] = useState('');
  const [nextSecs, setNextSecs] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [renderModel, setRenderModel] = useState<RenderModel | null>(null);
  const [devDebugSnap, setDevDebugSnap] = useState<any>(null);

  // Dev/Admin state
  const [devStepMode, setDevStepMode] = useState(false);
  const [devEngineState, setDevEngineState] = useState<EngineState>('idle');
  const [devEventLog, setDevEventLog] = useState<EventLogEntry[]>([]);
  const [devLevelSelect, setDevLevelSelect] = useState<number>(user.level);

  const isDevUser = user.role === 'DEV' || user.role === 'ADMIN';
  // Pause menu is shown when engine is paused AND we are in dev mode
  const showPauseMenu = isDevUser && devEngineState === 'paused' && phase === 'playing';

  const hostRef = useRef<EngineHost | null>(null);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  const sessionDurationSec = useMemo(() => sessionDurationSeconds(config), [config]);
  const [countdownRemain, setCountdownRemain] = useState<number | null>(null);
  const lastCountdownFmt = useRef<string | null>(null);

  useEffect(() => {
    if (sessionDurationSec == null) {
      lastCountdownFmt.current = null;
      setCountdownRemain(null);
      return;
    }
    if (phase !== 'playing') {
      lastCountdownFmt.current = null;
      setCountdownRemain(sessionDurationSec);
      return;
    }
    let raf = 0;
    const tick = () => {
      const eng = hostRef.current?.getEngine();
      const elapsedSec = eng ? eng.getElapsedMs() / 1000 : 0;
      const rem = Math.max(0, sessionDurationSec - elapsedSec);
      const fmt = rem.toFixed(2);
      if (lastCountdownFmt.current !== fmt) {
        lastCountdownFmt.current = fmt;
        setCountdownRemain(rem);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, sessionDurationSec, config?.id]);

  // ── Load level ─────────────────────────────────────────────────
  const loadLevel = useCallback(
    (levelId: number) => {
      console.log('[Game] loadLevel start', { levelId, role: user.role });
      hostRef.current?.stop();
      hostRef.current = null;
      setPhase('loading');
      setLoadProgress(0);
      setSubtitle('');
      setCaption('');
      setLevelResult(null);
      setFailReason('');
      setError(null);
      setDevEventLog([]);
      setDevEngineState('idle');
      setRenderModel(null);

      api
        .getLevel(levelId)
        .then(async (cfg) => {
          console.log('[Game] getLevel ok', { id: cfg.id, type: (cfg as any).type });
          setLoadProgress((p) => Math.max(p, 15));
          setConfig(cfg);

          const host = new EngineHost({
            isDevUser,
            onFail: (reason) => {
              console.log('[Game] engine fail', { reason });
              setLevelResult('fail');
              setFailReason(reason);
              setPhase('ended');
              api.postResult('fail', cfg.id, cfg.signature).catch(() => {});
            },
            onSuccess: () => {
              console.log('[Game] engine success');
              setLevelResult('success');
              setPhase('ended');
              api.postResult('success', cfg.id, cfg.signature).catch(() => {});
            },
            onProgress: () => {},
            onRenderModel: (m) => {
              setRenderModel(m);
              setSubtitle(m.subtitle);
              setCaption(m.caption ?? '');
              if (isDevUser) setDevDebugSnap(hostRef.current?.getEngine()?.getDebugSnapshot() ?? null);
            },
            onStateChange: (state) => setDevEngineState(state),
            onEventLog: (entry) => {
              setDevEventLog((prev) => [...prev, entry]);
              if (isDevUser) setDevDebugSnap(hostRef.current?.getEngine()?.getDebugSnapshot() ?? null);
            },
          });

          hostRef.current = host;
          setLoadProgress(22);
          await host.load(cfg, {
            onPreloadProgress: (loaded, total) => {
              const lo = Math.max(1, total);
              const spanStart = 28;
              const spanEnd = 96;
              const p = spanStart + Math.round((loaded / lo) * (spanEnd - spanStart));
              setLoadProgress(Math.min(spanEnd, p));
            },
          });
          console.log('[Game] engine.load+preload ok');
          setLoadProgress(100);
          setPhase('ready');
        })
        .catch((err) => {
          console.log('[Game] getLevel failed', err);
          setError(
            err instanceof Error ? err.message : 'Neznámá chyba při načítání levelu.'
          );
          setPhase('ended');
        });
    },
    [isDevUser, devStepMode]
  );

  const startSession = useCallback(() => {
    console.log('[Game] startSession -> playing');
    setPhase('playing');
    setSubtitle('');
    setCaption('');
    // Dva snímky počkat: rozložení bez tlačítka + vstup z effectu před naběhnutím `start()`
    // (zároveň scheduler čeká START_SCENE_ARM_MS v LevelRunner).
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        hostRef.current?.start();
      });
    });
  }, []);

  // Initial load
  useEffect(() => {
    loadLevel(user.level);
    return () => {
      hostRef.current?.stop();
      hostRef.current = null;
    };
  }, [user.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase + pause based input control ─────────────────────────
  // DEV: detach input listeners when paused so the pause menu is fully safe
  useEffect(() => {
    if (!hostRef.current) return;

    /** Běží vstup celou dobu fáze playing včetně DEV pauzy — jinak by se při pozastavení odstřihl Posluchač klávesy X. */
    const shouldBeActive = phase === 'playing';
    hostRef.current.setActive(shouldBeActive, phase, devEngineState);

    return () => {
      // no-op
    };
  }, [phase, devEngineState]);

  // ── Auto-logout countdown (PLAYER only) ──────────────────────
  useEffect(() => {
    if (phase !== 'ended') return;
    if (isDevUser) return;

    setNextSecs(10);
    let s = 10;
    const cd = window.setInterval(() => {
      s -= 1;
      setNextSecs(s);
      if (s <= 0) {
        clearInterval(cd);
        onLogoutRef.current();
      }
    }, 1000);
    return () => clearInterval(cd);
  }, [phase, isDevUser]);

  // ── DEV handlers ───────────────────────────────────────────────
  const handleDevResume = () => hostRef.current?.getEngine()?.resume();
  const handleDevRestart = () => loadLevel(config?.id ?? user.level);
  const handleDevNextEvent = () => hostRef.current?.getEngine()?.debugNextStep();
  const handleDevSkipToEnd = () => hostRef.current?.getEngine()?.debugSkipToEnd();
  const handleDevResetLevel = () => {
    setPhase('playing');
    setSubtitle('');
    setCaption('');
    setLevelResult(null);
  };
  const handleDevRestartEngine = () => hostRef.current?.getEngine()?.restart();
  const handleDevSkipEngine = () => hostRef.current?.getEngine()?.skipSuccess();
  const handleDevJumpLevel = () => {
    if (devLevelSelect >= 1) {
      hostRef.current?.stop();
      hostRef.current = null;
      loadLevel(devLevelSelect);
    }
  };
  const handleDevResetGame = () => {
    hostRef.current?.stop();
    hostRef.current = null;
    loadLevel(1);
    setDevLevelSelect(1);
  };

  // ── Render ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={styles.failOverlay} data-no-game-input>
        <div style={styles.failBox}>
          <p style={styles.failEyebrow}>SYSTÉMOVÁ ZPRÁVA</p>
          <p style={styles.failTitle}>Selhání připojení</p>
          <p style={styles.failSub}>{error}</p>
          <button style={styles.logoutBtn} onClick={() => onLogoutRef.current()}>
            Ukončit sezení
          </button>
        </div>
      </div>
    );
  }

  // DEV ended screen — no auto-logout, can restart / jump
  if (phase === 'ended' && isDevUser) {
    return (
      <div style={styles.failOverlay} data-no-game-input>
        <div style={styles.failBox}>
          <p style={styles.failEyebrow}>
            {levelResult === 'success' ? 'VÝSLEDEK POZOROVÁNÍ' : 'ÚKON UKONČEN'}
          </p>
          <p style={styles.failTitle}>
            {levelResult === 'success' ? 'Kritéria splněna' : 'Kritéria nesplněna'}
          </p>
          <p style={styles.failSub}>
            {levelResult === 'success'
              ? 'Záznam byl uložen. Pokračujte další iterací nebo opakujte blok.'
              : failReason}
          </p>
          <div style={styles.devEndBtnRow}>
            <button style={styles.devActionBtn} onClick={handleDevRestart}>
              ↻ RESTART LEVEL
            </button>
            <button style={styles.devActionBtn} onClick={handleDevResetGame}>
              ⟲ RESET HRY
            </button>
            <button style={styles.logoutBtn} onClick={() => onLogoutRef.current()}>
              ODHLÁSIT SE
            </button>
          </div>
          {/* Level jump */}
          <div style={styles.devEndBtnRow}>
            <input
              type="number"
              min={1}
              value={devLevelSelect}
              onChange={(e) => setDevLevelSelect(parseInt(e.target.value) || 1)}
              style={styles.devInput}
            />
            <button style={styles.devActionBtn} onClick={handleDevJumpLevel}>
              JUMP TO LEVEL
            </button>
          </div>
          {onAdmin && (
            <div style={{ marginTop: '16px' }}>
              <button
                style={{ ...styles.devActionBtn, backgroundColor: '#1e3a8a', borderColor: '#1e40af' }}
                onClick={onAdmin}
              >
                ← ADMIN DASHBOARD
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // PLAYER ended screen
  if (phase === 'ended') {
    return (
      <div style={styles.failOverlay} data-no-game-input>
        <div style={styles.failBox}>
          <p style={styles.failEyebrow}>
            {levelResult === 'success' ? 'VÝSLEDEK POZOROVÁNÍ' : 'UKONČENÍ PROTOTYPU'}
          </p>
          <p style={styles.failTitle}>
            {levelResult === 'success' ? 'Sezení ukončeno' : 'Účast ukončena'}
          </p>
          <p style={styles.failSub}>
            {levelResult === 'success'
              ? 'Data byla odeslána. Děkujeme za spolupráci.'
              : failReason}
          </p>
          <p style={styles.failClose}>
            {nextSecs > 0 ? `Automatické ukončení přístupu za ${nextSecs} s…` : 'Odhlašuji…'}
          </p>
          <button style={styles.logoutBtn} onClick={() => onLogoutRef.current()}>
            Ukončit sezení nyní
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div style={styles.screen} data-no-game-input>
        <p style={styles.levelEyebrow}>PŘÍPRAVA BLOKU</p>
        <p style={styles.loadPct}>{Math.min(100, Math.round(loadProgress))} %</p>
        <div style={styles.loadBarTrack}>
          <div style={{ ...styles.loadBarFill, width: `${Math.min(100, loadProgress)}%` }} />
        </div>
        <p style={styles.introText}>Stahuji konfiguraci a předběžně načítám média u účastníka.</p>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div style={styles.screen} data-no-game-input>
        <p style={styles.levelEyebrow}>BLOK • PŘIPRAVENO</p>
        <p style={styles.levelLabel}>{config?.id ?? '—'}</p>
        <p style={styles.introText}>
          Protokol a soubory jsou připraveny. Zahajte pohled na scénu až teprve nyní.
        </p>
        <button type="button" style={styles.readyStartBtn} onClick={startSession}>
          Začít nedělat nic
        </button>
      </div>
    );
  }

  // ── Playing ────────────────────────────────────────────────────
  return (
    <div style={styles.screen}>
      {/* Player info — top left */}
      <p style={styles.playerInfo} data-no-game-input>
        {user.username}
        <span style={{ color: '#555' }}> · </span>L{config?.id}
        {isDevUser && (
          <>
            <span style={{ color: '#555' }}> · </span>
            <span style={{ color: '#a16207', fontWeight: 600 }}>{user.role}</span>
          </>
        )}
      </p>

      {/* DEV — jen nenápadná nápověda (dashboard jen z pauzy) */}
      {isDevUser && (
        <div style={styles.devCorner} data-no-game-input>
          <span style={styles.xHint}>X = pauza</span>
        </div>
      )}

      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      {caption && <p style={styles.caption}>{caption}</p>}

      {/* Action-based layers (render model) */}
      {renderModel && (
        <div style={styles.layerRoot}>
          {renderModel.layers.map((layer) => (
            <div
              key={layer.id}
              data-layer-id={layer.id}
              style={{
                ...styles.layerBase,
                ...(layer.props?.position ? positionToStyle(layer.props.position) : {}),
                zIndex: 100 + (layer.props?.z ?? 0),
                pointerEvents: layer.props?.interactive ? 'auto' : 'none',
                display: layer.props?.visible === false ? 'none' : 'block',
              }}
            >
              {layer.props?.text}
            </div>
          ))}

          {/* Effects (minimal) */}
          {renderModel.effects['invert'] && <div style={styles.effectInvert} />}
          {renderModel.effects['blur'] && <div style={styles.effectBlur} />}
          {renderModel.effects['glitch'] && <div style={styles.effectGlitch} />}
        </div>
      )}

      {sessionDurationSec != null && countdownRemain != null && (
        <div style={styles.sessionTimer} data-no-game-input>
          <span style={styles.sessionTimerLabel}>Zbývající čas</span>
          <span style={styles.sessionTimerValue}>{formatCountdownCs(countdownRemain)}</span>
        </div>
      )}

      {/* ── Pause menu overlay ───────────────────────────────── */}
      {showPauseMenu && (
        <div style={styles.pauseOverlay} data-no-game-input>
          <div style={styles.pauseBox}>
            <div style={styles.pauseHero}>
              <div style={styles.pauseHeader}>
                <span style={styles.pauseTitle}>Testovací rozhraní</span>
                <span style={styles.pauseBadge}>pozastaveno</span>
              </div>
              <p style={styles.pauseSubtitle}>
                Účastník vidí stejnou scénu jako běžný subjekt. Toto rozhraní je jen pro vedoucího
                pozorování. Návrat do scény: <kbd style={styles.kbd}>X</kbd> nebo níže Pokračovat.
              </p>
              <p style={styles.pauseInfo}>
                Blok <strong style={{ color: '#f1f5f9' }}>{config?.id}</strong>
                {sessionDurationSec != null && countdownRemain != null ? (
                  <> · zbývá {formatCountdownCs(countdownRemain)}</>
                ) : null}
                {' · '}
                počet zápisů: {devEventLog.length}
              </p>
              {onAdmin && (
                <button type="button" style={styles.pauseDashboardBtn} onClick={onAdmin}>
                  Administrace (dashboard)
                </button>
              )}
            </div>

            <div style={styles.pauseCard}>
              <p style={styles.pauseCardTitle}>Scéna</p>
              <div style={{ ...styles.pauseBtnRow, marginTop: 0 }}>
                <button type="button" style={styles.pauseBtnPrimary} onClick={handleDevResume}>
                  Pokračovat ve scéně
                </button>
              </div>
              <div style={styles.pauseBtnRow}>
                <button type="button" style={styles.pauseBtn} onClick={handleDevRestart}>
                  Znovu načíst celý blok
                </button>
                <button type="button" style={styles.pauseBtn} onClick={handleDevRestartEngine}>
                  Znovu od začátku (engine)
                </button>
                <button type="button" style={styles.pauseBtn} onClick={handleDevSkipEngine}>
                  Vynutit úspěch (test)
                </button>
              </div>
            </div>

            <div style={styles.pauseCard}>
              <p style={styles.pauseCardTitle}>Časová osa</p>
              <p style={styles.sectionHint}>
                Zapněte níže řízený krok, pak používejte „Další krok“ podle potřeby.
              </p>
              <label style={styles.pauseCheckLabel}>
                <input
                  type="checkbox"
                  checked={devStepMode}
                  onChange={(e) => setDevStepMode(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                Pouštět engine jen jeden krok za stiskem
              </label>
              <div style={styles.pauseBtnRow}>
                <button type="button" style={styles.pauseBtn} onClick={handleDevNextEvent}>
                  Další krok
                </button>
                <button type="button" style={styles.pauseBtn} onClick={handleDevSkipToEnd}>
                  Dokončit osu najednou
                </button>
                <button type="button" style={styles.pauseBtn} onClick={handleDevResetLevel}>
                  Vyčistit jen obraz UI
                </button>
              </div>
            </div>

            <div style={styles.pauseCard}>
              <p style={styles.pauseCardTitle}>Přeskok bloku</p>
              <div style={styles.pauseBtnRow}>
                <input
                  type="number"
                  min={1}
                  value={devLevelSelect}
                  onChange={(e) =>
                    setDevLevelSelect(parseInt(e.target.value, 10) || 1)
                  }
                  style={{ ...styles.devInput, width: '92px', flexShrink: 0 }}
                  aria-label="Číslo levelu"
                />
                <button type="button" style={styles.pauseBtn} onClick={handleDevJumpLevel}>
                  Načíst zvolený blok
                </button>
              </div>
            </div>

            <div style={styles.pauseSplitGrid}>
              <div style={styles.pauseSplitPane}>
                <p style={styles.pauseCardTitle}>Události — nejnovější nahoře ({devEventLog.length})</p>
                <p style={styles.sectionHint}>
                  Nejnovější událost je vždy nahoře; posun níž je historie běhu.
                </p>
                <div style={styles.pauseLog}>
                  {devEventLog.length === 0 && (
                    <span style={{ color: '#64748b', fontSize: '12px' }}>
                      Zatím žádný zápis — spusťte scénu a události se objeví tady.
                    </span>
                  )}
                  {devEventLog
                    .slice()
                    .reverse()
                    .map((entry, revIdx) => {
                      const origIdx = devEventLog.length - 1 - revIdx;
                      const blockEnd = revIdx === devEventLog.length - 1;
                      const meta = EVENT_KIND_META[entry.kind];
                      const friendly = humanizeLogMessage(entry);
                      const detail = extraEventDetail(entry);
                      const showCode = friendly !== entry.msg;
                      return (
                        <div
                          key={`${origIdx}-${entry.t}-${entry.kind}-${entry.msg}`}
                          style={{
                            ...styles.pauseLogBlock,
                            ...(blockEnd
                              ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }
                              : {}),
                          }}
                        >
                          <div style={styles.pauseLogLine1}>
                            <span style={styles.pauseLogTime}>{formatTimeShort(entry.t)}</span>
                            <span
                              style={{
                                ...styles.pauseLogTag,
                                color: meta.color,
                                borderColor: meta.color,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div style={styles.pauseLogMsg}>{friendly}</div>
                          {showCode && <div style={styles.pauseLogDetail}>{entry.msg}</div>}
                          {detail && (
                            <div style={styles.pauseLogDetail} title={detail}>
                              {detail}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div style={styles.pauseSplitPane}>
                <p style={styles.pauseCardTitle}>Engine — přehled stavu</p>
                <p style={styles.sectionHint}>
                  Stručně, kde se runtime zdržuje a jaká platí vstupní pravidla.
                </p>
                <div style={styles.inspectPanelScroll}>
                  {inspectorRows(devDebugSnap).map((row) => (
                    <div key={row.k} style={styles.inspectRow}>
                      <div style={styles.inspectKey}>{row.k}</div>
                      <div style={styles.inspectVal}>{row.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...styles.pauseCard, ...styles.pauseCardFooter }}>
              <div style={{ ...styles.pauseBtnRow, marginTop: 0 }}>
                <button
                  type="button"
                  style={{ ...styles.pauseBtn, ...styles.pauseBtnDanger }}
                  onClick={handleDevResetGame}
                >
                  Celý experiment od bloku 1
                </button>
                <button
                  type="button"
                  style={styles.logoutBtnSmall}
                  onClick={() => onLogoutRef.current()}
                >
                  Odhlásit se
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  screen: {
    alignItems: 'center',
    background:
      'radial-gradient(ellipse 90% 70% at 50% 38%, #101822 0%, #070a0f 55%, #020305 100%)',
    boxShadow: 'inset 0 0 140px rgba(0, 0, 0, 0.82)',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      '"Segoe UI", ui-sans-serif, system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
    height: '100vh',
    justifyContent: 'center',
    position: 'relative',
    userSelect: 'none',
  },
  failOverlay: {
    alignItems: 'center',
    background: 'linear-gradient(180deg, #0a0f16 0%, #050708 55%, #020304 100%)',
    boxShadow: 'inset 0 0 120px rgba(0,0,0,0.75)',
    display: 'flex',
    height: '100vh',
    justifyContent: 'center',
    userSelect: 'none',
  },
  failEyebrow: {
    color: '#64748b',
    fontSize: '11px',
    letterSpacing: '0.28em',
    marginBottom: '12px',
    marginTop: 0,
    textTransform: 'uppercase',
  },
  failBox: {
    backgroundColor: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(100,116,139,0.55)',
    borderRadius: '2px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
    maxWidth: '520px',
    padding: '48px 44px',
    textAlign: 'center',
    width: '92%',
  },
  failTitle: {
    color: '#f1f5f9',
    fontSize: '26px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    lineHeight: 1.35,
    marginBottom: '16px',
    marginTop: 0,
  },
  failSub: {
    color: '#94a3b8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '14px',
    lineHeight: 1.6,
    marginBottom: '24px',
    marginTop: 0,
    textWrap: 'balance',
  },
  failClose: { color: '#475569', fontSize: '12px', marginTop: '12px', marginBottom: 0 },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(71,85,105,0.9)',
    borderRadius: '2px',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: '12px',
    letterSpacing: '0.06em',
    marginTop: '18px',
    padding: '10px 20px',
    textTransform: 'uppercase',
  },
  logoutBtnSmall: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(71,85,105,0.75)',
    borderRadius: '2px',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: '11px',
    letterSpacing: '0.06em',
    padding: '8px 14px',
    textTransform: 'uppercase',
  },
  dimText: { color: '#64748b', fontSize: '13px', letterSpacing: '0.06em' },
  levelEyebrow: {
    color: '#475569',
    fontSize: '11px',
    letterSpacing: '0.36em',
    marginBottom: '8px',
    marginTop: 0,
    textTransform: 'uppercase',
  },
  levelLabel: {
    color: '#f8fafc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '56px',
    fontWeight: 300,
    letterSpacing: '0.12em',
    margin: 0,
  },
  introText: {
    color: '#64748b',
    fontSize: '15px',
    letterSpacing: '0.04em',
    lineHeight: 1.55,
    marginTop: '20px',
    maxWidth: '360px',
    textAlign: 'center',
    textWrap: 'balance',
  },
  loadPct: {
    color: '#e2e8f0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '42px',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
    margin: '8px 0 16px',
  },
  loadBarTrack: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    border: '1px solid rgba(71,85,105,0.55)',
    borderRadius: '2px',
    height: '8px',
    marginBottom: '24px',
    maxWidth: '360px',
    overflow: 'hidden',
    width: '88%',
  },
  loadBarFill: {
    background: 'linear-gradient(90deg, #0e7490 0%, #06b6d4 55%, #22d3ee 100%)',
    height: '100%',
    transition: 'width 0.2s ease-out',
  },
  readyStartBtn: {
    backgroundColor: 'rgba(21,94,117,0.45)',
    border: '1px solid rgba(34,211,238,0.55)',
    borderRadius: '2px',
    color: '#ecfeff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    marginTop: '28px',
    padding: '14px 32px',
    textTransform: 'uppercase',
  },
  playerInfo: {
    color: 'rgba(71,85,105,0.95)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    left: '18px',
    letterSpacing: '0.06em',
    position: 'absolute',
    textTransform: 'uppercase',
    top: '14px',
  },
  subtitle: {
    color: '#94a3b8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '15px',
    letterSpacing: '0.02em',
    lineHeight: 1.55,
    marginBottom: '24px',
    marginTop: 0,
    maxWidth: 'min(560px, 92vw)',
    textAlign: 'center',
    textWrap: 'balance',
  },
  caption: {
    color: 'rgba(148,163,184,0.72)',
    fontFamily: 'ui-serif, Georgia, serif',
    fontSize: '13px',
    fontStyle: 'italic',
    letterSpacing: '0.01em',
    lineHeight: 1.5,
    marginBottom: '20px',
    marginTop: '-18px',
    maxWidth: 'min(480px, 88vw)',
    textAlign: 'center',
    textWrap: 'balance',
  },
  sessionTimer: {
    alignItems: 'baseline',
    bottom: '24px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    left: '50%',
    letterSpacing: '0.06em',
    position: 'absolute',
    transform: 'translateX(-50%)',
  },
  sessionTimerLabel: {
    color: '#475569',
    fontSize: '10px',
    textTransform: 'uppercase',
  },
  sessionTimerValue: {
    color: '#cbd5e1',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '18px',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
  },
  // DEV corner (top-right)
  devCorner: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    position: 'absolute',
    right: '12px',
    top: '10px',
  },
  xHint: {
    color: 'rgba(51,65,85,0.85)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '10px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  // DEV ended screen buttons
  devEndBtnRow: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  devActionBtn: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    border: '1px solid rgba(71,85,105,0.75)',
    borderRadius: '2px',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '8px 14px',
  },
  devInput: {
    backgroundColor: 'rgba(2,6,23,0.85)',
    border: '1px solid rgba(71,85,105,0.75)',
    borderRadius: '2px',
    color: '#f1f5f9',
    fontSize: '12px',
    padding: '5px 8px',
    width: '70px',
  },
  // Pause overlay
  pauseOverlay: {
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(3, 7, 18, 0.82)',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    padding: '16px',
    boxSizing: 'border-box',
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 300,
  },
  pauseBox: {
    background: 'linear-gradient(165deg, rgba(17,24,39,0.96) 0%, rgba(9,13,23,0.98) 100%)',
    border: '1px solid rgba(100,116,139,0.45)',
    borderRadius: '2px',
    boxShadow: '0 28px 100px rgba(0, 0, 0, 0.65)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxHeight: '92vh',
    maxWidth: 'min(760px, 94vw)',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '28px 32px',
    width: '100%',
  },
  pauseHero: {
    borderBottom: '1px solid rgba(51,65,85,0.45)',
    marginBottom: '2px',
    paddingBottom: '18px',
  },
  pauseHeader: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  pauseTitle: {
    color: '#f1f5f9',
    fontSize: '22px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  pauseBadge: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    border: '1px solid rgba(71,85,105,0.7)',
    borderRadius: '2px',
    color: '#cbd5e1',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    padding: '4px 12px',
    textTransform: 'uppercase',
  },
  pauseSubtitle: {
    color: '#64748b',
    fontSize: '13px',
    lineHeight: 1.55,
    marginBottom: '14px',
    marginTop: 0,
  },
  pauseInfo: {
    color: '#475569',
    fontSize: '12px',
    letterSpacing: '0.03em',
    marginBottom: 0,
    marginTop: 0,
    lineHeight: 1.5,
  },
  pauseDashboardBtn: {
    backgroundColor: 'rgba(30,58,138,0.5)',
    border: '1px solid rgba(59,130,246,0.75)',
    borderRadius: '2px',
    color: '#e0f2fe',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    marginTop: '14px',
    padding: '12px 16px',
    textTransform: 'uppercase',
    width: '100%',
  },
  pauseCard: {
    backgroundColor: 'rgba(2, 6, 23, 0.35)',
    border: '1px solid rgba(51,65,85,0.5)',
    borderRadius: '2px',
    padding: '16px 18px',
    flexShrink: 0,
  },
  pauseSplitGrid: {
    alignItems: 'stretch',
    display: 'grid',
    gap: '14px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    width: '100%',
  },
  pauseSplitPane: {
    backgroundColor: 'rgba(2, 6, 23, 0.35)',
    border: '1px solid rgba(51,65,85,0.5)',
    borderRadius: '2px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    padding: '16px 18px',
  },
  pauseCardFooter: {
    backgroundColor: 'transparent',
    border: '1px dashed rgba(51,65,85,0.45)',
    marginTop: '4px',
  },
  pauseCardTitle: {
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.2em',
    marginBottom: '10px',
    marginTop: 0,
    textTransform: 'uppercase',
  },
  pauseBtnRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  },
  pauseBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.75)',
    border: '1px solid rgba(71,85,105,0.65)',
    borderRadius: '2px',
    color: '#cbd5e1',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '12px',
    fontWeight: 600,
    gap: '4px',
    letterSpacing: '0.03em',
    padding: '9px 16px',
  },
  pauseBtnPrimary: {
    alignItems: 'center',
    backgroundColor: 'rgba(21,94,117,0.45)',
    border: '1px solid rgba(34,211,238,0.55)',
    borderRadius: '2px',
    color: '#ecfeff',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '13px',
    fontWeight: 700,
    gap: '4px',
    letterSpacing: '0.05em',
    padding: '12px 20px',
  },
  pauseBtnDanger: {
    backgroundColor: 'rgba(127,29,29,0.35)',
    borderColor: 'rgba(220,38,38,0.65)',
    color: '#fecaca',
  },
  kbd: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    border: '1px solid rgba(71,85,105,0.9)',
    borderRadius: '2px',
    color: '#cbd5e1',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '10px',
    padding: '2px 6px',
  },
  sectionHint: {
    color: '#64748b',
    fontSize: '12px',
    lineHeight: 1.55,
    marginBottom: '10px',
    marginTop: 0,
  },
  pauseCheckLabel: {
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'block',
    fontSize: '12px',
    lineHeight: 1.45,
    marginBottom: '10px',
  },
  pauseLog: {
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    border: '1px solid rgba(51,65,85,0.55)',
    borderRadius: '2px',
    flex: '1 1 auto',
    fontSize: '12px',
    marginTop: '4px',
    maxHeight: 'min(320px, 40vh)',
    minHeight: '140px',
    overflowY: 'auto',
    padding: '12px 14px',
  },
  pauseLogBlock: {
    borderBottom: '1px solid rgba(51,65,85,0.35)',
    marginBottom: '10px',
    paddingBottom: '10px',
  },
  pauseLogLine1: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '4px',
  },
  pauseLogTime: {
    color: '#64748b',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
  },
  pauseLogTag: {
    border: '1px solid',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 'bold',
    letterSpacing: '0.02em',
    padding: '1px 6px',
    textTransform: 'uppercase',
  },
  pauseLogMsg: {
    color: '#e2e8f0',
    lineHeight: 1.45,
  },
  pauseLogDetail: {
    color: '#64748b',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '9px',
    lineHeight: 1.35,
    marginTop: '4px',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  inspectPanel: {
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    border: '1px solid rgba(51,65,85,0.55)',
    borderRadius: '2px',
    padding: '14px 16px',
  },
  inspectPanelScroll: {
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    border: '1px solid rgba(51,65,85,0.55)',
    borderRadius: '2px',
    flex: '1 1 auto',
    marginTop: '4px',
    maxHeight: 'min(320px, 40vh)',
    minHeight: '140px',
    overflowY: 'auto',
    padding: '14px 16px',
  },
  inspectRow: {
    marginBottom: '10px',
  },
  inspectKey: {
    color: '#78716c',
    fontSize: '10px',
    fontWeight: 'bold',
    marginBottom: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  inspectVal: {
    color: '#e2e8f0',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  layerRoot: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  layerBase: {
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(100,116,139,0.35)',
    borderRadius: '2px',
    boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
    color: '#cbd5e1',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
    letterSpacing: '0.02em',
    lineHeight: 1.55,
    maxWidth: '420px',
    padding: '14px 16px',
    position: 'absolute',
  },
  effectInvert: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,255,255,0.0)',
    mixBlendMode: 'difference',
    pointerEvents: 'none',
  },
  effectBlur: {
    position: 'absolute',
    inset: 0,
    backdropFilter: 'blur(4px)',
    pointerEvents: 'none',
  },
  effectGlitch: {
    position: 'absolute',
    inset: 0,
    background:
      'repeating-linear-gradient(180deg, rgba(148,163,184,0.04) 0px, rgba(148,163,184,0.04) 1px, transparent 1px, transparent 6px)',
    mixBlendMode: 'soft-light',
    opacity: 0.35,
    pointerEvents: 'none',
  },
};

function positionToStyle(
  pos:
    | 'center'
    | 'top'
    | 'topRight'
    | 'topLeft'
    | 'bottom'
    | 'bottomRight'
    | 'bottomLeft'
): React.CSSProperties {
  const base: React.CSSProperties = {};
  if (pos === 'center') return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (pos === 'top') return { top: '16px', left: '50%', transform: 'translateX(-50%)' };
  if (pos === 'topRight') return { top: '16px', right: '16px' };
  if (pos === 'topLeft') return { top: '16px', left: '16px' };
  if (pos === 'bottom') return { bottom: '16px', left: '50%', transform: 'translateX(-50%)' };
  if (pos === 'bottomRight') return { bottom: '16px', right: '16px' };
  if (pos === 'bottomLeft') return { bottom: '16px', left: '16px' };
  return base;
}
