import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'w-80',
    md: 'w-[520px]',
    lg: 'w-[720px]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className={`${sizeStyles[size]} bg-[#0d0d0d] border border-[#1a1a1a] rounded`}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#1a1a1a]">
          <h2 className="text-sm font-bold text-white tracking-[1px] uppercase">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#444] hover:text-white text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#1a1a1a] flex gap-3 justify-end">{footer}</div>}
      </div>
    </div>
  );
};
