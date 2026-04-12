import { UserRole } from '../types/admin';
import type { User } from '../types';

/**
 * useAuthGuard Hook
 *
 * Provides role-based UI rendering helpers.
 * Takes actual user from app state — no mocking.
 *
 * Backend middleware is the source of truth for authorization.
 */
export function useAuthGuard(user: User | null) {
  const role = (user?.role ?? 'PLAYER') as UserRole;

  return {
    role,

    canAccessAdmin: (): boolean => {
      return role === 'ADMIN' || role === 'DEV';
    },

    canChangeRole: (): boolean => {
      return role === 'ADMIN';
    },

    canBanUsers: (): boolean => {
      return role === 'ADMIN';
    },

    canSetLevel: (): boolean => {
      return role === 'ADMIN' || role === 'DEV';
    },

    canResetProgress: (): boolean => {
      return role === 'ADMIN' || role === 'DEV';
    },

    isDevMode: (): boolean => {
      return role === 'DEV' || role === 'ADMIN';
    },

    getUserRole: (): UserRole => {
      return role;
    },
  };
}
