import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { LevelEngine, preloadAssets } from '../engine/LevelEngine';
import type { EngineState, EventLogEntry } from '../engine/LevelEngine';
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

  // Dev/Admin state
  const [devStepMode, setDevStepMode] = useState(false);
  const [devEventIndex, setDevEventIndex] = useState(0);
  const [devEngineState, setDevEngineState] = useState<EngineState>('idle');
  const [devEventLog, setDevEventLog] = useState<EventLogEntry[]>([]);
  const [devLevelSelect, setDevLevelSelect] = useState<number>(user.level);

  const isDevUser = user.role === 'DEV' || user.role === 'ADMIN';
  // Pause menu is shown when engine is paused AND we are in dev mode
  const showPauseMenu = isDevUser && devEngineState === 'paused' && phase === 'playing';

  const engineRef = useRef<LevelEngine | null>(null);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  // ── Load level ─────────────────────────────────────────────────
  const loadLevel = useCallback(
    (levelId: number) => {
      engineRef.current?.stop();
      engineRef.current = null;
      setPhase('loading');
      setSubtitle('');
      setProgress(0);
      setLevelResult(null);
      setFailReason('');
      setError(null);
      setDevEventLog([]);
      setDevEventIndex(0);
      setDevEngineState('idle');

      api
        .getLevel(levelId)
        .then(async (cfg) => {
          setConfig(cfg);
          await preloadAssets(cfg);
          setPhase('intro');

          const introDelay = 2000;
          const introTimer = window.setTimeout(() => {
            setPhase('playing');
            setSubtitle('');

            const engine = new LevelEngine(
              cfg,
              {
                onFail: (reason) => {
                  setLevelResult('fail');
                  setFailReason(reason);
                  setPhase('ended');
                  api.postResult('fail', cfg.id, cfg.signature).catch(() => {});
                },
                onSuccess: () => {
                  setLevelResult('success');
                  setPhase('ended');
                  api.postResult('success', cfg.id, cfg.signature).catch(() => {});
                },
                onSubtitle: setSubtitle,
                onProgress: setProgress,
                onEventIndex: (index) => setDevEventIndex(index),
                onStateChange: (state) => setDevEngineState(state),
                onEventLog: (entry) =>
                  setDevEventLog((prev) => [...prev, entry]),
              },
              isDevUser ? { enabled: true, stepMode: devStepMode } : undefined
            );

            engineRef.current = engine;
            engine.start();
          }, introDelay);

          return () => clearTimeout(introTimer);
        })
        .catch((err) => {
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
    if (shouldBeActive) {
      engineRef.current.attachInputListeners();
    } else {
      engineRef.current.detachInputListeners();
    }

    return () => {
      engineRef.current?.detachInputListeners();
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

      if (devEngineState === 'running') {
        engineRef.current?.pause();
      } else if (devEngineState === 'paused') {
        engineRef.current?.resume();
      }
    };

    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isDevUser, phase, devEngineState]);

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
  const handleDevNextEvent = () => engineRef.current?.nextEvent();
  const handleDevSkipToEnd = () => engineRef.current?.skipToEnd();
  const handleDevResetLevel = () => {
    engineRef.current?.resetLevel();
    setPhase('playing');
    setSubtitle('');
    setProgress(0);
    setLevelResult(null);
  };
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
              Level: {config?.id} &nbsp;|&nbsp; Event: {devEventIndex}/
              {config?.events.length ?? 0} &nbsp;|&nbsp;
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
                  <span style={{ color: '#666' }}>#{entry.index}&nbsp;</span>
                  <span style={{ color: '#4ade80' }}>[{entry.type}]</span>
                  {entry.text && (
                    <span style={{ color: '#94a3b8' }}>&nbsp;"{entry.text}"</span>
                  )}
                </div>
              ))}
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
};
