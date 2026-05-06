import React, { useState } from 'react';
import { api } from '../services/api';
import { adminApi } from '../services/adminApi';

export const DevToolsPage: React.FC = () => {
  const [commandInput, setCommandInput] = useState('');
  const [commandOutput, setCommandOutput] = useState<string[]>([
    '> DevTools Console initialized',
    '> Type "help" for commands. Try: me, users, level 1, audit',
  ]);

  const push = (...lines: string[]) => setCommandOutput((prev) => [...prev, ...lines]);

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    push(`$ ${trimmed}`);

    if (trimmed === 'help') {
      push(
        '  clear                 — Clear console',
        '  me                    — GET /auth/me',
        '  users                 — GET /admin/users (first page)',
        '  audit                 — GET /admin/audit (first page)',
        '  level <id>            — GET /level/:id (e.g. level 5)'
      );
    } else if (trimmed === 'clear') {
      setCommandOutput(['> Console cleared']);
    } else if (trimmed === 'me') {
      try {
        const me = await api.me();
        push(`  ok: ${me.username} [${me.role}] level=${me.level}`);
      } catch (e) {
        push(`  error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (trimmed === 'users') {
      try {
        const res = await adminApi.getUsers(0, 10, {});
        push(`  ok: total=${res.total} page=${res.page} pageSize=${res.pageSize}`);
        for (const u of res.users.slice(0, 10)) {
          push(`  - ${u.username} [${u.role}] L${u.level} banned=${u.isBanned}`);
        }
      } catch (e) {
        push(`  error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (trimmed === 'audit') {
      try {
        const r = await fetch('/admin/audit?page=0&pageSize=10', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('nedelejnic_token') ?? ''}`,
          },
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
        push(`  ok: total=${data.total} entries=${data.logs?.length ?? 0}`);
        for (const l of (data.logs ?? []).slice(0, 10)) {
          push(`  - ${l.createdAt} ${l.actorUsername} -> ${l.targetUsername}: ${l.action}`);
        }
      } catch (e) {
        push(`  error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (trimmed.startsWith('level ')) {
      const n = Number(trimmed.split(/\s+/)[1]);
      if (!Number.isFinite(n) || n < 1) {
        push('  error: usage: level <id>');
      } else {
        try {
          const lvl = await api.getLevel(n);
          push(`  ok: id=${lvl.id} type=${(lvl as any).type ?? 'unknown'}`);
          push(`  timeline=${Array.isArray((lvl as any).timeline) ? (lvl as any).timeline.length : '—'}`);
        } catch (e) {
          push(`  error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } else {
      push(`  unknown command: ${trimmed}`);
    }
    setCommandInput('');
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1a1a1a] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-wide">Dev Tools</h1>
        <p className="text-[#444] text-sm mt-1">Nástroje pro debug a správu</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: 'Rychlé akce', items: ['me', 'users', 'audit', 'level 1'] },
          { title: 'Nápověda', items: ['help', 'clear'] },
        ].map((section) => (
          <div key={section.title} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-5 space-y-2">
            <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-3">{section.title}</p>
            {section.items.map((item) => (
              <button
                key={item}
                onClick={() => executeCommand(item)}
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
