import React, { useState } from 'react';

export const DevToolsPage: React.FC = () => {
  const [commandInput, setCommandInput] = useState('');
  const [commandOutput, setCommandOutput] = useState<string[]>([
    '> DevTools Console initialized',
    '> Type "help" for available commands',
  ]);

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setCommandOutput((prev) => [...prev, `$ ${trimmed}`]);

    if (trimmed === 'help') {
      setCommandOutput((prev) => [
        ...prev,
        '  reset-all       â€” Reset all users to level 1',
        '  export-stats    â€” Export game statistics',
        '  server-status   â€” Check server status',
        '  clear           â€” Clear console',
      ]);
    } else if (trimmed === 'clear') {
      setCommandOutput(['> Console cleared']);
    } else if (trimmed === 'server-status') {
      setCommandOutput((prev) => [
        ...prev,
        '  status: online',
        '  db: connected',
      ]);
    } else {
      setCommandOutput((prev) => [...prev, `  unknown command: ${trimmed}`]);
    }
    setCommandInput('');
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1a1a1a] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-wide">Dev Tools</h1>
        <p className="text-[#444] text-sm mt-1">NĂˇstroje pro debug a sprĂˇvu</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: 'DatabĂˇze', items: ['Backup', 'Export uĹľivatelĹŻ'] },
          { title: 'Server', items: ['Zobrazit logy', 'System stats'] },
        ].map((section) => (
          <div key={section.title} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-5 space-y-2">
            <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-3">{section.title}</p>
            {section.items.map((item) => (
              <button
                key={item}
                className="w-full text-left px-3 py-2.5 text-sm text-[#666] hover:text-white hover:bg-[#111] rounded transition-colors border border-[#1a1a1a]"
              >
                {item}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Console */}
      <div className="bg-[#050505] border border-[#1a1a1a] rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase">Console</span>
          <button
            onClick={() => setCommandOutput(['> Console cleared'])}
            className="ml-auto text-[#333] hover:text-[#666] text-xs transition-colors"
          >
            clear
          </button>
        </div>
        <div className="p-4 font-mono text-xs text-[#666] h-48 overflow-y-auto space-y-0.5">
          {commandOutput.map((line, i) => (
            <div
              key={i}
              className={line.startsWith('$') ? 'text-white' : 'text-[#555]'}
            >
              {line}
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <span className="text-[#444] font-mono text-xs self-center">$</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') executeCommand(commandInput); }}
            placeholder="command..."
            className="flex-1 bg-transparent border-b border-[#222] text-white text-xs font-mono py-1 focus:outline-none focus:border-[#444] placeholder-[#333]"
          />
          <button
            onClick={() => executeCommand(commandInput)}
            className="text-[#444] hover:text-white text-xs transition-colors"
          >
            run
          </button>
        </div>
      </div>
    </div>
  );
};
