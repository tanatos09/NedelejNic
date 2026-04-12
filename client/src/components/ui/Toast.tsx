import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
  };

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div
      className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white flex items-center gap-3 shadow-lg z-50 animate-pulse`}
      style={{ backgroundColor: bgColor[type].replace('bg-', '') + ' #' }}
    >
      <span className="font-bold text-lg">{icon[type]}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-4 hover:opacity-75 text-lg font-bold"
      >
        ×
      </button>
    </div>
  );
};
