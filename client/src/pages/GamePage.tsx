import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { LevelEngine, preloadAssets } from "../engine/LevelEngine";
import type { User, LevelConfig } from "../types";

interface Props {
  user: User;
  onLevelChange: (newLevel: number) => void;
}

type Phase = "loading" | "intro" | "playing" | "fail" | "success";

export default function GamePage({ user, onLevelChange }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [failReason, setFailReason] = useState("");
  const [nextSecs, setNextSecs] = useState(3);
  const [progress, setProgress] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const engineRef = useRef<LevelEngine | null>(null);
  const onLevelChangeRef = useRef(onLevelChange);
  const configRef = useRef<LevelConfig | null>(null);

  useEffect(() => {
    onLevelChangeRef.current = onLevelChange;
  }, [onLevelChange]);

  // Load level → preload assets → intro → start engine
  useEffect(() => {
    let cancelled = false;
    engineRef.current?.stop();
    engineRef.current = null;
    setPhase("loading");
    setSubtitle("");
    setProgress(0);

    api
      .getLevel(user.level)
      .then(async (cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        configRef.current = cfg;

        // Preload any audio assets before starting
        await preloadAssets(cfg);
        if (cancelled) return;

        setPhase("intro");

        // After 2s intro → start engine (0 network requests from here)
        const introTimer = window.setTimeout(() => {
          if (cancelled) return;
          setPhase("playing");
          setSubtitle("");

          const engine = new LevelEngine(cfg, {
            onFail: (reason) => {
              setPhase("fail");
              setFailReason(reason);
              // Send result AFTER level ended (level is over, request is allowed)
              api
                .postResult("fail", cfg.id, cfg.signature)
                .then((res) => onLevelChangeRef.current(res.newLevel))
                .catch(() => {});
            },
            onSuccess: () => {
              setPhase("success");
              api
                .postResult("success", cfg.id, cfg.signature)
                .then((res) => onLevelChangeRef.current(res.newLevel))
                .catch(() => {});
            },
            onSubtitle: setSubtitle,
            onProgress: setProgress,
          });

          engineRef.current = engine;
          engine.start();
        }, 2000);

        return () => clearTimeout(introTimer);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [reloadKey, user.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fail → countdown → next level
  useEffect(() => {
    if (phase !== "fail") return;
    setNextSecs(3);
    let s = 3;
    const cd = window.setInterval(() => {
      s -= 1;
      setNextSecs(s);
      if (s <= 0) {
        clearInterval(cd);
        setReloadKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(cd);
  }, [phase]);

  // Success → auto-reload next level
  useEffect(() => {
    if (phase !== "success") return;
    const t = window.setTimeout(() => setReloadKey((k) => k + 1), 3000);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Render ──────────────────────────────────────────────────────

  if (phase === "fail") {
    return (
      <div style={styles.failOverlay}>
        <div style={styles.failBox}>
          <p style={styles.failTitle}>PROHRÁL JSI</p>
          <p style={styles.failSub}>{failReason}</p>
          <p style={styles.failClose}>
            {nextSecs > 0
              ? `Další level za ${nextSecs}...`
              : "Načítám další level..."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div style={{ ...styles.screen, backgroundColor: "#001200" }}>
        <p style={styles.successText}>Zvládl jsi to.</p>
        <p style={styles.dimText}>Načítám další level...</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div style={styles.screen}>
        <p style={styles.dimText}>Načítám...</p>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div style={styles.screen}>
        <p style={styles.levelLabel}>LEVEL {config?.id}</p>
        <p style={styles.introText}>Nic. Nedělej. Nic.</p>
      </div>
    );
  }

  // Playing
  return (
    <div style={styles.screen}>
      <p style={styles.playerInfo}>
        {user.username} · {config?.id}
      </p>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      <div style={styles.progressBar}>
        <div
          style={{ ...styles.progressFill, width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    alignItems: "center",
    backgroundColor: "#000",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    justifyContent: "center",
    position: "relative",
    userSelect: "none",
  },
  failOverlay: {
    alignItems: "center",
    backgroundColor: "#080000",
    display: "flex",
    height: "100vh",
    justifyContent: "center",
    userSelect: "none",
  },
  failBox: {
    backgroundColor: "#150000",
    border: "1px solid #3a0000",
    borderRadius: "8px",
    maxWidth: "440px",
    padding: "52px 60px",
    textAlign: "center",
    width: "100%",
  },
  failTitle: {
    color: "#ff3333",
    fontSize: "34px",
    fontWeight: "700",
    letterSpacing: "8px",
    marginBottom: "20px",
  },
  failSub: {
    color: "#777",
    fontSize: "15px",
    marginBottom: "28px",
    lineHeight: "1.5",
  },
  failClose: {
    color: "#333",
    fontSize: "12px",
    letterSpacing: "0.5px",
  },
  levelLabel: {
    color: "#222",
    fontSize: "11px",
    letterSpacing: "5px",
    marginBottom: "18px",
    textTransform: "uppercase",
  },
  introText: {
    color: "#555",
    fontSize: "22px",
    letterSpacing: "1px",
  },
  subtitle: {
    color: "#aaa",
    fontSize: "20px",
    fontStyle: "italic",
    lineHeight: "1.6",
    maxWidth: "560px",
    padding: "0 24px",
    textAlign: "center",
  },
  successText: {
    color: "#3a9e3a",
    fontSize: "20px",
    marginBottom: "10px",
  },
  progressBar: {
    backgroundColor: "#0a0a0a",
    borderRadius: "2px",
    bottom: "36px",
    height: "2px",
    left: "10%",
    position: "absolute",
    right: "10%",
  },
  progressFill: {
    backgroundColor: "#1c1c1c",
    borderRadius: "2px",
    height: "100%",
    transition: "width 0.1s linear",
  },
  playerInfo: {
    color: "#181818",
    fontSize: "11px",
    letterSpacing: "1px",
    position: "absolute",
    right: "20px",
    top: "20px",
  },
  dimText: {
    color: "#252525",
    fontSize: "13px",
  },
};
