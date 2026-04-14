import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { LevelRunner } from '../engine/newEngine/LevelRunner';
import type { EngineState, EventLogEntry, RenderModel } from '../engine/newEngine/types';
import type { User, LevelConfig } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
  onAdmin?: () => void;
}

type Phase = 'loading' | 'intro' | 'playing' | 'ended';

export default function GamePage({ user, onLogout, onAdmin }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [levelResult, setLevelResult] = useState<'fail' | 'success' | null>(null);
  const [failReason, setFailReason] = useState('');
  const [nextSecs, setNextSecs] = useState(10);
  const [progress, setProgress] = useState(0);
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

  const engineRef = useRef<LevelRunner | null>(null);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  // ── Load level ─────────────────────────────────────────────────
  const loadLevel = useCallback(
    (levelId: number) => {
      console.log('[Game] loadLevel start', { levelId, role: user.role });
      engineRef.current?.stop();
      engineRef.current = null;
      setPhase('loading');
      setSubtitle('');
      setProgress(0);
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
          setConfig(cfg);
          setPhase('intro');

          const introDelay = 2000;
          const introTimer = window.setTimeout(() => {
            console.log('[Game] intro done -> playing');
            setPhase('playing');
            setSubtitle('');

            const engine = new LevelRunner({
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
              onProgress: setProgress,
              onRenderModel: (m) => {
                setRenderModel(m);
                setSubtitle(m.subtitle);
                if (isDevUser) setDevDebugSnap(engineRef.current?.getDebugSnapshot() ?? null);
              },
              onStateChange: (state) => setDevEngineState(state),
              onEventLog: (entry) => {
                setDevEventLog((prev) => [...prev, entry]);
                if (isDevUser) setDevDebugSnap(engineRef.current?.getDebugSnapshot() ?? null);
              },
            });

            engineRef.current = engine;
            void engine.load(cfg).then(async () => {
              console.log('[Game] engine.load ok');
              // New engine owns its own audio preload
              console.log('[Game] engine.preload start');
              await engine.preload();
              console.log('[Game] engine.preload end');
              console.log('[Game] engine.start');
              engine.start();
            });
          }, introDelay);

          return () => clearTimeout(introTimer);
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

  // Initial load
  useEffect(() => {
    loadLevel(user.level);
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [user.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase + pause based input control ─────────────────────────
  // DEV: detach input listeners when paused so the pause menu is fully safe
  useEffect(() => {
    if (!engineRef.current) return;

    const shouldBeActive = phase === 'playing' && !showPauseMenu;
    // New input listeners live outside engine; we simply pause engine updates here.
    if (shouldBeActive && devEngineState === 'paused') engineRef.current.resume();
    if (!shouldBeActive && devEngineState === 'running') engineRef.current.pause();

    return () => {
      // no-op
    };
  }, [phase, showPauseMenu]);

  // ── X key → pause / unpause (DEV only, capture phase) ─────────
  useEffect(() => {
    if (!isDevUser) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyX') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (phase !== 'playing') return;

      // Intercept before InputSystem sees it
      e.stopImmediatePropagation();
      console.log('[Game] DEV KeyX pressed', { devEngineState, phase });

      if (devEngineState === 'running') {
        engineRef.current?.pause();
      } else if (devEngineState === 'paused') {
        engineRef.current?.resume();
      }
    };

    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isDevUser, phase, devEngineState]);

  // ── Global input → engine (playing only) ───────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    const shouldIgnore = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return !!el.closest?.('[data-no-game-input]');
    };

    const onClick = (e: MouseEvent) => {
      if (shouldIgnore(e.target)) return;
      const el = e.target as HTMLElement | null;
      const layerId = el?.closest?.('[data-layer-id]')?.getAttribute?.('data-layer-id') ?? undefined;
      // Send click to engine even without layerId (rules need it); traps check layerId internally
      engineRef.current?.onInput({ type: 'click', timestamp: Date.now(), targetLayerId: layerId, raw: e });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnore(e.target)) return;
      engineRef.current?.onInput({ type: 'keyboard', timestamp: Date.now(), keyCode: e.code, raw: e });
    };

    const onScroll = (e: Event) => {
      if (shouldIgnore(e.target)) return;
      engineRef.current?.onInput({ type: 'scroll', timestamp: Date.now(), raw: e });
    };

    const onTouch = (e: TouchEvent) => {
      if (shouldIgnore(e.target)) return;
      engineRef.current?.onInput({ type: 'touch', timestamp: Date.now(), raw: e });
    };

    // Mousemove grace period (800ms) — don't fail immediately on first mouse movement
    let mouseActive = false;
    const graceTimer = window.setTimeout(() => { mouseActive = true; }, 800);

    const onMove = (e: MouseEvent) => {
      if (!mouseActive) return;
      if (shouldIgnore(e.target)) return;
      engineRef.current?.onInput({ type: 'mouseMove', timestamp: Date.now(), raw: e });
    };

    // passive listeners to avoid perf issues
    document.addEventListener('click', onClick, { passive: true });
    document.addEventListener('keydown', onKeyDown, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('touchstart', onTouch, { passive: true });
    document.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      clearTimeout(graceTimer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('mousemove', onMove);
    };
  }, [phase]);

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
  const handleDevResume = () => engineRef.current?.resume();
  const handleDevRestart = () => loadLevel(config?.id ?? user.level);
  const handleDevNextEvent = () => {};
  const handleDevSkipToEnd = () => {};
  const handleDevResetLevel = () => {
    setPhase('playing');
    setSubtitle('');
    setProgress(0);
    setLevelResult(null);
  };
  const handleDevRestartEngine = () => engineRef.current?.restart();
  const handleDevSkipEngine = () => engineRef.current?.skipSuccess();
  const handleDevJumpLevel = () => {
    if (devLevelSelect >= 1) {
      engineRef.current?.stop();
      engineRef.current = null;
      loadLevel(devLevelSelect);
    }
  };
  const handleDevResetGame = () => {
    engineRef.current?.stop();
    engineRef.current = null;
    loadLevel(1);
    setDevLevelSelect(1);
  };

  // ── Render ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={styles.failOverlay} data-no-game-input>
        <div style={styles.failBox}>
          <p style={styles.failTitle}>CHYBA</p>
          <p style={styles.failSub}>{error}</p>
          <button style={styles.logoutBtn} onClick={() => onLogoutRef.current()}>
            DOMŮ
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
          <p style={styles.failTitle}>
            {levelResult === 'success' ? 'LEVEL DOKONČEN' : 'PROHRÁL JSI'}
          </p>
          <p style={styles.failSub}>
            {levelResult === 'success' ? 'POŘÁD JSI ŠPATNÝ' : failReason}
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
          <p style={styles.failTitle}>
            {levelResult === 'success' ? 'LEVEL DOKONČEN' : 'PROHRÁL JSI'}
          </p>
          <p style={styles.failSub}>
            {levelResult === 'success' ? 'POŘÁD JSI ŠPATNÝ' : failReason}
          </p>
          <p style={styles.failClose}>
            {nextSecs > 0 ? `Odhlásím tě za ${nextSecs}...` : 'Odhlašuji...'}
          </p>
          <button style={styles.logoutBtn} onClick={() => onLogoutRef.current()}>
            odhlásit se
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div style={styles.screen} data-no-game-input>
        <p style={styles.dimText}>Načítám...</p>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div style={styles.screen} data-no-game-input>
        <p style={styles.levelLabel}>LEVEL {config?.id}</p>
        <p style={styles.introText}>Nic. Nedělej. Nic.</p>
      </div>
    );
  }

  // ── Playing ────────────────────────────────────────────────────
  return (
    <div style={styles.screen}>
      {/* Player info — top left */}
      <p style={styles.playerInfo} data-no-game-input>
        {user.username} · L{config?.id}
        {isDevUser && <span style={{ color: '#f59e0b' }}> [{user.role}]</span>}
      </p>

      {/* DEV hint + dashboard — top right */}
      {isDevUser && (
        <div style={styles.devCorner} data-no-game-input>
          {onAdmin && (
            <button style={styles.dashboardBtn} onClick={onAdmin}>
              ← DASHBOARD
            </button>
          )}
          <span style={styles.xHint}>X = PAUSE</span>
        </div>
      )}

      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}

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

      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
      </div>

      {/* ── Pause menu overlay ───────────────────────────────── */}
      {showPauseMenu && (
        <div style={styles.pauseOverlay} data-no-game-input>
          <div style={styles.pauseBox}>
            {/* Header */}
            <div style={styles.pauseHeader}>
              <span style={styles.pauseTitle}>⏸ PAUZA</span>
              <span style={styles.pauseBadge}>{devEngineState.toUpperCase()}</span>
            </div>

            <p style={styles.pauseInfo}>
              Level: {config?.id} &nbsp;|&nbsp; Events: {devEventLog.length}
              &nbsp;|&nbsp;
              {Math.round(progress * 100)}%
            </p>

            {/* Primary actions */}
            <div style={styles.pauseBtnRow}>
              <button style={styles.pauseBtn} onClick={handleDevResume}>
                ▶ POKRAČOVAT&nbsp;<kbd style={styles.kbd}>X</kbd>
              </button>
              <button style={styles.pauseBtn} onClick={handleDevRestart}>
                ↻ RESTART
              </button>
              <button style={styles.pauseBtn} onClick={handleDevRestartEngine}>
                ⟲ RESTART (ENGINE)
              </button>
              <button style={styles.pauseBtn} onClick={handleDevSkipEngine}>
                ✅ SKIP (SUCCESS)
              </button>
            </div>

            <div style={styles.divider} />

            {/* Event controls */}
            <p style={styles.sectionLabel}>EVENTS</p>
            <label style={styles.pauseCheckLabel}>
              <input
                type="checkbox"
                checked={devStepMode}
                onChange={(e) => setDevStepMode(e.target.checked)}
                style={{ marginRight: '6px' }}
              />
              STEP MODE
            </label>
            <div style={styles.pauseBtnRow}>
              <button style={styles.pauseBtn} onClick={handleDevNextEvent}>
                ▶ NEXT
              </button>
              <button style={styles.pauseBtn} onClick={handleDevSkipToEnd}>
                ⏭ SKIP TO END
              </button>
              <button style={styles.pauseBtn} onClick={handleDevResetLevel}>
                ↺ RESET
              </button>
            </div>

            <div style={styles.divider} />

            {/* Level jump */}
            <p style={styles.sectionLabel}>JUMP TO LEVEL</p>
            <div style={styles.pauseBtnRow}>
              <input
                type="number"
                min={1}
                value={devLevelSelect}
                onChange={(e) =>
                  setDevLevelSelect(parseInt(e.target.value) || 1)
                }
                style={styles.devInput}
              />
              <button style={styles.pauseBtn} onClick={handleDevJumpLevel}>
                GO
              </button>
            </div>

            <div style={styles.divider} />

            {/* Event log */}
            <p style={styles.sectionLabel}>
              EVENT LOG ({devEventLog.length})
            </p>
            <div style={styles.pauseLog}>
              {devEventLog.length === 0 && (
                <span style={{ color: '#555', fontSize: '10px' }}>
                  Žádné eventy
                </span>
              )}
              {devEventLog.map((entry, i) => (
                <div key={i} style={styles.pauseLogEntry}>
                  <span style={{ color: '#666' }}>{Math.round(entry.t)}ms&nbsp;</span>
                  <span style={{ color: '#4ade80' }}>[{entry.kind}]</span>
                  <span style={{ color: '#94a3b8' }}>&nbsp;{entry.msg}</span>
                </div>
              ))}
            </div>

            <div style={styles.divider} />

            <p style={styles.sectionLabel}>ENGINE INSPECTOR</p>
            <div style={styles.pauseLog}>
              {devDebugSnap?.scheduler && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    pc={devDebugSnap.scheduler.pc} jumps={devDebugSnap.scheduler.jumpCount} waiting={devDebugSnap.scheduler.waiting?.kind}
                  </span>
                </div>
              )}
              {devDebugSnap?.scheduler?.waiting?.kind === 'when' && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    when: {JSON.stringify(devDebugSnap.scheduler.waiting.when)}
                  </span>
                </div>
              )}
              {devDebugSnap?.rules && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    rules: click={devDebugSnap.rules.click} mouseMove={devDebugSnap.rules.mouseMove} keyboard={devDebugSnap.rules.keyboard} scroll={devDebugSnap.rules.scroll} touch={devDebugSnap.rules.touch}
                  </span>
                </div>
              )}
              {devDebugSnap?.traps && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    traps: {devDebugSnap.traps.filter((t: any) => t.enabled).length}/{devDebugSnap.traps.length} enabled
                  </span>
                </div>
              )}
              {devDebugSnap?.effects && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    effects: {Object.keys(devDebugSnap.effects).join(', ') || '(none)'}
                  </span>
                </div>
              )}
              {devDebugSnap?.vars && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#94a3b8' }}>
                    vars: {Object.keys(devDebugSnap.vars).length}
                  </span>
                </div>
              )}
              {devDebugSnap?.scheduler?.steps && (
                <div style={styles.pauseLogEntry}>
                  <span style={{ color: '#666' }}>
                    timeline: {devDebugSnap.scheduler.steps.length} steps
                  </span>
                </div>
              )}
            </div>

            <div style={styles.divider} />

            {/* Footer */}
            <div style={{ ...styles.pauseBtnRow, marginTop: '0' }}>
              <button
                style={{ ...styles.pauseBtn, backgroundColor: '#7f1d1d', borderColor: '#991b1b' }}
                onClick={handleDevResetGame}
              >
                ⟲ RESET HRY
              </button>
              {onAdmin && (
                <button
                  style={{
                    ...styles.pauseBtn,
                    backgroundColor: '#1e3a8a',
                    borderColor: '#1e40af',
                  }}
                  onClick={onAdmin}
                >
                  ← ADMIN DASHBOARD
                </button>
              )}
              <button style={styles.logoutBtnSmall} onClick={() => onLogoutRef.current()}>
                ODHLÁSIT SE
              </button>
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
    backgroundColor: '#000',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    justifyContent: 'center',
    position: 'relative',
    userSelect: 'none',
  },
  failOverlay: {
    alignItems: 'center',
    backgroundColor: '#080000',
    display: 'flex',
    height: '100vh',
    justifyContent: 'center',
    userSelect: 'none',
  },
  failBox: {
    backgroundColor: '#150000',
    border: '1px solid #3a0000',
    borderRadius: '8px',
    maxWidth: '520px',
    padding: '52px 60px',
    textAlign: 'center',
    width: '100%',
  },
  failTitle: {
    color: '#fff',
    fontSize: '36px',
    fontWeight: 'bold',
    letterSpacing: '4px',
    marginBottom: '16px',
  },
  failSub: { color: '#999', fontSize: '16px', marginBottom: '24px' },
  failClose: { color: '#555', fontSize: '14px', marginTop: '16px' },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#666',
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '16px',
    padding: '8px 16px',
  },
  logoutBtnSmall: {
    backgroundColor: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#555',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '4px 10px',
  },
  dimText: { color: '#333', fontSize: '14px' },
  levelLabel: { color: '#fff', fontSize: '48px', fontWeight: 'bold', letterSpacing: '8px' },
  introText: { color: '#666', fontSize: '18px', marginTop: '12px' },
  playerInfo: {
    color: '#333',
    fontSize: '12px',
    left: '16px',
    position: 'absolute',
    top: '12px',
  },
  subtitle: {
    color: '#ccc',
    fontSize: '18px',
    letterSpacing: '1px',
    marginBottom: '24px',
    textAlign: 'center',
  },
  progressBar: {
    backgroundColor: '#111',
    borderRadius: '2px',
    bottom: '20px',
    height: '4px',
    left: '10%',
    overflow: 'hidden',
    position: 'absolute',
    right: '10%',
  },
  progressFill: {
    backgroundColor: '#333',
    height: '100%',
    transition: 'width 0.1s linear',
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
  dashboardBtn: {
    backgroundColor: '#1e3a8a',
    border: '1px solid #1e40af',
    borderRadius: '4px',
    color: '#93c5fd',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '5px 10px',
  },
  xHint: {
    color: '#444',
    fontSize: '10px',
    letterSpacing: '1px',
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
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '4px',
    color: '#d1d5db',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '8px 14px',
  },
  devInput: {
    backgroundColor: '#111',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    padding: '5px 8px',
    width: '70px',
  },
  // Pause overlay
  pauseOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 300,
  },
  pauseBox: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    maxHeight: '88vh',
    maxWidth: '420px',
    overflowY: 'auto',
    padding: '24px',
    width: '100%',
  },
  pauseHeader: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  pauseTitle: {
    color: '#f59e0b',
    fontSize: '18px',
    fontWeight: 'bold',
    letterSpacing: '2px',
  },
  pauseBadge: {
    backgroundColor: '#1e3a8a',
    borderRadius: '4px',
    color: '#93c5fd',
    fontSize: '10px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    padding: '2px 8px',
  },
  pauseInfo: {
    color: '#666',
    fontSize: '12px',
    marginBottom: '12px',
  },
  pauseBtnRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  },
  pauseBtn: {
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '5px',
    color: '#ccc',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '11px',
    fontWeight: 'bold',
    gap: '4px',
    padding: '6px 12px',
  },
  kbd: {
    backgroundColor: '#333',
    border: '1px solid #555',
    borderRadius: '3px',
    color: '#aaa',
    fontSize: '9px',
    fontFamily: 'monospace',
    padding: '1px 4px',
  },
  sectionLabel: {
    color: '#555',
    fontSize: '9px',
    fontWeight: 'bold',
    letterSpacing: '2px',
    marginBottom: '6px',
    marginTop: '0',
  },
  pauseCheckLabel: {
    color: '#aaa',
    cursor: 'pointer',
    display: 'block',
    fontSize: '11px',
    marginBottom: '6px',
  },
  divider: {
    backgroundColor: '#1e1e1e',
    height: '1px',
    margin: '14px 0',
  },
  pauseLog: {
    backgroundColor: '#080808',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '10px',
    maxHeight: '140px',
    overflowY: 'auto',
    padding: '8px',
  },
  pauseLogEntry: {
    lineHeight: '1.6',
  },
  layerRoot: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  layerBase: {
    position: 'absolute',
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.65)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e5e7eb',
    fontSize: '14px',
    maxWidth: '420px',
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
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px)',
    opacity: 0.6,
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
