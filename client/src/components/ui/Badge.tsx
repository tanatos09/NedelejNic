import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'role' | 'status' | 'banned';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
}) => {
  const baseStyles = 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium';

  const variants = {
    default: 'bg-gray-200 text-gray-800',
    role: 'bg-blue-100 text-blue-800',
    status: 'bg-green-100 text-green-800',
    banned: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};
