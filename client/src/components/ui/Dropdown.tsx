import React, { useState, useRef, useEffect } from 'react';

interface DropdownOption {
  label: string;
  value: string | number;
  color?: string;
  danger?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  onSelect: (value: string | number) => void;
  triggerLabel?: string;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  onSelect,
  triggerLabel = '⋯',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-7 h-7 flex items-center justify-center text-[#555] hover:text-white hover:bg-[#1a1a1a] rounded transition-colors text-base leading-none"
      >
        {triggerLabel}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 bg-[#0d0d0d] border border-[#222] rounded shadow-xl z-50 min-w-[140px] py-1">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => { onSelect(option.value); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[#1a1a1a] ${
                option.danger ? 'text-red-400 hover:text-red-300' : option.color || 'text-[#aaa] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
