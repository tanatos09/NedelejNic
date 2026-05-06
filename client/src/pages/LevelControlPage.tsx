import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

export const LevelControlPage: React.FC = () => {
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [levelJson, setLevelJson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLevelJson(null);
    api
      .getLevel(selectedLevel)
      .then((lvl) => {
        if (cancelled) return;
        setLevelJson(lvl);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Chyba při načítání levelu.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLevel]);

  const summary = useMemo(() => {
    if (!levelJson) return null;
    const timelineLen = Array.isArray(levelJson.timeline) ? levelJson.timeline.length : 0;
    const assets = levelJson.assets ?? {};
    const assetCount =
      (Array.isArray(assets.voices) ? assets.voices.length : 0) +
      (Array.isArray(assets.music) ? assets.music.length : 0) +
      (Array.isArray(assets.sounds) ? assets.sounds.length : 0);
    const endTime =
      levelJson?.end?.type === 'timer' ? levelJson.end.time : undefined;
    const rules = levelJson.rules ?? {};
    const forbidden = Object.entries(rules).filter(([, v]) => v === 'forbidden').map(([k]) => k);
    return { timelineLen, assetCount, endTime, forbidden };
  }, [levelJson]);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1a1a1a] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-wide">Levels</h1>
        <p className="text-[#444] text-sm mt-1">Rychlý prohlížeč level JSON (editor doplníme později)</p>
      </div>

      {/* Level grid */}
      <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-5">
        <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-4">Vybrat level</p>
        <div className="grid grid-cols-10 gap-1.5">
          {Array.from({ length: 50 }, (_, i) => i + 1).map((level) => (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={`py-2 rounded text-xs font-bold transition-colors ${
                selectedLevel === level
                  ? 'bg-white text-black'
                  : 'bg-[#111] text-[#555] hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Stats for selected level */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Timeline kroků', value: summary ? String(summary.timelineLen) : '—' },
          { label: 'Assety', value: summary ? String(summary.assetCount) : '—' },
          { label: 'Timer (s)', value: summary?.endTime != null ? String(summary.endTime) : '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-5">
            <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase">{stat.label}</p>
            <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-5">
        <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-3">
          Level {selectedLevel}
        </p>
        {loading && <p className="text-[#555] text-sm">Načítám level ze serveru…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && levelJson && (
          <div className="space-y-3">
            {summary && summary.forbidden.length > 0 && (
              <p className="text-[#666] text-xs">
                Forbidden inputs: <span className="text-[#aaa]">{summary.forbidden.join(', ')}</span>
              </p>
            )}
            <pre className="bg-[#050505] border border-[#1a1a1a] rounded p-4 text-xs text-[#aaa] overflow-auto max-h-[45vh]">
{JSON.stringify(levelJson, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
