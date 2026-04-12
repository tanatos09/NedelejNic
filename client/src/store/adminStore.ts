import { create } from 'zustand';
import type {
  AdminStore,
  UserFilters,
  ConfirmDialogPayload,
  Toast,
} from '../types/admin';

/**
 * Admin Store (Zustand)
 * 
 * ⚠️ IMPORTANT: This is a UI SNAPSHOT, NOT a server mirror
 * - Only updated from API response data (trusted from backend)
 * - Never modified directly from decoded JWT
 * - Backend is the source of truth
 * - Store is for: modals, filters, loading states, UI hints
 */

const DEFAULT_FILTERS: UserFilters = {
  role: 'ALL',
  status: 'all',
  search: '',
};

let toastIdCounter = 0;

export const useAdminStore = create<AdminStore>((set, get) => ({
  // ─────────────────── STATE ───────────────────
  selectedUserId: null,
  filters: DEFAULT_FILTERS,
  userDetailModalOpen: false,
  levelControlModalOpen: false,
  confirmDialogOpen: false,
  loadingActions: {},
  toast: null,
  confirmDialog: null,

  // ─────────────────── ACTIONS ───────────────────

  setSelectedUser: (userId: string | null) => {
    set({ selectedUserId: userId });
  },

  setFilters: (filters: UserFilters) => {
    set({ filters });
  },

  openUserDetailModal: (userId: string) => {
    set({
      userDetailModalOpen: true,
      selectedUserId: userId,
    });
  },

  closeUserDetailModal: () => {
    set({
      userDetailModalOpen: false,
      selectedUserId: null,
    });
  },

  openLevelControlModal: (userId: string) => {
    set({
      levelControlModalOpen: true,
      selectedUserId: userId,
    });
  },

  closeLevelControlModal: () => {
    set({
      levelControlModalOpen: false,
      selectedUserId: null,
    });
  },

  // Alias methods for ActionDropdown compatibility
  openUserModal: (userId: string) => {
    set({
      userDetailModalOpen: true,
      selectedUserId: userId,
    });
  },

  openRoleModal: (userId: string) => {
    set({
      selectedUserId: userId,
      confirmDialog: {
        type: 'change_role',
        userId,
        title: 'Change User Role',
        description: 'Select a new role for this user',
      },
      confirmDialogOpen: true,
    });
  },

  openLevelModal: (userId: string) => {
    set({
      levelControlModalOpen: true,
      selectedUserId: userId,
    });
  },

  confirmResetProgress: (userId: string) => {
    set({
      selectedUserId: userId,
      confirmDialog: {
        type: 'reset_progress',
        userId,
        title: 'Reset User Progress',
        description: 'Are you sure? This will reset the user to level 1. This action cannot be undone.',
      },
      confirmDialogOpen: true,
    });
  },

  confirmToggleBan: (userId: string, isBanned: boolean) => {
    set({
      selectedUserId: userId,
      confirmDialog: {
        type: 'toggle_ban',
        userId,
        title: isBanned ? 'Ban User' : 'Unban User',
        description: isBanned
          ? 'This user will no longer be able to play. Are you sure?'
          : 'This user will be able to play again. Are you sure?',
      },
      confirmDialogOpen: true,
    });
  },

  openConfirmDialog: (config: ConfirmDialogPayload) => {
    set({
      confirmDialog: config,
      confirmDialogOpen: true,
    });
  },

  closeConfirmDialog: () => {
    set({
      confirmDialogOpen: false,
      confirmDialog: null,
    });
  },

  showToast: (toastData: Omit<Toast, 'id'>) => {
    const id = `toast_${toastIdCounter++}`;
    const toast: Toast = {
      ...toastData,
      id,
      duration: toastData.duration || 3000,
    };

    set({ toast });

    // Auto-clear after duration
    if (toast.duration) {
      setTimeout(() => {
        const currentToast = get().toast;
        if (currentToast?.id === id) {
          set({ toast: null });
        }
      }, toast.duration);
    }
  },

  clearToast: () => {
    set({ toast: null });
  },

  setActionLoading: (action: string, loading: boolean) => {
    set((state) => {
      const newLoadingActions = { ...state.loadingActions };
      if (loading) {
        newLoadingActions[action] = true;
      } else {
        delete newLoadingActions[action];
      }
      return { loadingActions: newLoadingActions };
    });
  },

  isActionLoading: (action: string): boolean => {
    return get().loadingActions[action] ?? false;
  },

  /**
   * Global logout - called from httpClient on 401
   * Clears all store state
   */
  logout: () => {
    set({
      selectedUserId: null,
      filters: DEFAULT_FILTERS,
      userDetailModalOpen: false,
      levelControlModalOpen: false,
      confirmDialogOpen: false,
      loadingActions: {},
      toast: null,
      confirmDialog: null,
    });
  },
}));
