import React, { useState } from 'react';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage?: 'users' | 'levels' | 'devtools';
  onNavigation?: (page: 'users' | 'levels' | 'devtools' | 'game') => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  currentPage = 'users',
  onNavigation,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { id: 'users', label: 'Users', icon: '◈', page: 'users' as const },
    { id: 'levels', label: 'Levels', icon: '◉', page: 'levels' as const },
    { id: 'devtools', label: 'Dev Tools', icon: '◎', page: 'devtools' as const },
  ];

  const nav = (page: 'users' | 'levels' | 'devtools' | 'game') =>
    onNavigation?.(page);

  return (
    <div className="flex h-screen bg-[#080808] text-white overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-56' : 'w-14'
        } flex-shrink-0 bg-[#0d0d0d] border-r border-[#1a1a1a] flex flex-col transition-all duration-200`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-[#1a1a1a]">
          {sidebarOpen && (
            <span className="text-xs font-bold tracking-[3px] text-white uppercase">
              NedelejNic
            </span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-[#444] hover:text-white transition-colors text-lg leading-none"
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>

        {/* Admin badge */}
        {sidebarOpen && (
          <div className="px-4 py-3 border-b border-[#1a1a1a]">
            <span className="inline-block bg-[#1a1a1a] text-[#666] text-[10px] font-bold tracking-[2px] px-2 py-1 rounded uppercase">
              Admin
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3">
          {menuItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => nav(item.page)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  active
                    ? 'text-white bg-[#1a1a1a] border-r-2 border-white'
                    : 'text-[#555] hover:text-[#aaa] hover:bg-[#111]'
                }`}
              >
                <span className={`text-base ${active ? 'text-white' : 'text-[#444]'}`}>
                  {item.icon}
                </span>
                {sidebarOpen && (
                  <span className="font-medium tracking-wide">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Back to game */}
        <div className="p-3 border-t border-[#1a1a1a]">
          <button
            onClick={() => nav('game')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[#444] hover:text-white hover:bg-[#111] rounded transition-colors ${
              !sidebarOpen ? 'justify-center' : ''
            }`}
          >
            <span>←</span>
            {sidebarOpen && <span>Zpět do hry</span>}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
};
