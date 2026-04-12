import type { ReactNode } from 'react';
import type { UserRole } from '../types/admin';
import type { User } from '../types';

interface ProtectedRouteProps {
  user: User | null;
  children: ReactNode;
  requiredRoles: UserRole[];
  fallback?: ReactNode;
}

export function ProtectedRoute({
  user,
  children,
  requiredRoles,
  fallback = <div>Access Denied</div>,
}: ProtectedRouteProps) {
  const userRole = (user?.role ?? 'PLAYER') as UserRole;
  const hasAccess = requiredRoles.includes(userRole);

  if (!hasAccess) {
    return fallback;
  }

  return children;
}
