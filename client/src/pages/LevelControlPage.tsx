import React, { useState } from 'react';

export const LevelControlPage: React.FC = () => {
  const [selectedLevel, setSelectedLevel] = useState<number>(1);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1a1a1a] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-wide">Levels</h1>
        <p className="text-[#444] text-sm mt-1">Přehled a správa levelů</p>
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
          { label: 'Hráči dokončili', value: '1 234' },
          { label: 'Průměrný čas', value: '2m 43s' },
          { label: 'Dokončenost', value: '78.5%' },
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
        <p className="text-[#555] text-sm">Data levelu se načtou ze serveru při implementaci level editoru.</p>
      </div>
    </div>
  );
};
