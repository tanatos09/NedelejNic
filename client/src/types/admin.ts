// Admin Types - Complete

export enum UserRole {
  PLAYER = 'PLAYER',
  DEV = 'DEV',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'active',
  BANNED = 'banned',
}

// API Response Types
export interface User {
  id: string;
  username: string;
  role: UserRole;
  level: number;
  isBanned: boolean;
  createdAt: string;
  lastLogin: string | null;
}

export interface AdminUserResponse {
  message: string;
  user: User;
}

export interface UsersListResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserDetailResponse {
  id: string;
  username: string;
  role: UserRole;
  level: number;
  isBanned: boolean;
  createdAt: string;
  lastLogin: string | null;
  totalLevels: number;
  progressPercentage: number;
  recentActivity: UserActivity[];
}

export interface UserActivity {
  id: string;
  type: 'level_complete' | 'level_fail' | 'login' | 'action_admin';
  levelId?: number;
  timestamp: string;
  description: string;
}

// Request Types
export interface UpdateRoleRequest {
  role: UserRole;
}

export interface BanUserRequest {
  isBanned: boolean;
}

export interface SetLevelRequest {
  level: number;
}

export interface ResetProgressRequest {
  // Empty body
}

// Filter & Pagination
export interface UserFilters {
  role?: UserRole | 'ALL';
  status?: UserStatus | 'all';
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

// API Error
export interface ApiError {
  status: number;
  message: string;
  code?: string;
}

// Store Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface ConfirmDialogPayload {
  type?: 'change_role' | 'reset_progress' | 'toggle_ban' | 'custom';
  userId?: string;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  isDangerous?: boolean;
}

export interface AdminStore {
  // State
  selectedUserId: string | null;
  filters: UserFilters;
  userDetailModalOpen: boolean;
  levelControlModalOpen: boolean;
  confirmDialogOpen: boolean;
  loadingActions: Record<string, boolean>;
  toast: Toast | null;
  confirmDialog: ConfirmDialogPayload | null;

  // Actions
  setSelectedUser: (userId: string | null) => void;
  setFilters: (filters: UserFilters) => void;
  openUserDetailModal: (userId: string) => void;
  closeUserDetailModal: () => void;
  openLevelControlModal: (userId: string) => void;
  closeLevelControlModal: () => void;
  openUserModal: (userId: string) => void;
  openRoleModal: (userId: string) => void;
  openLevelModal: (userId: string) => void;
  confirmResetProgress: (userId: string) => void;
  confirmToggleBan: (userId: string, isBanned: boolean) => void;
  openConfirmDialog: (config: ConfirmDialogPayload) => void;
  closeConfirmDialog: () => void;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  clearToast: () => void;
  setActionLoading: (action: string, loading: boolean) => void;
  isActionLoading: (action: string) => boolean;
  logout: () => void;
}

// Query Types
export interface UseUsersParams {
  page: number;
  pageSize: number;
  filters?: UserFilters;
}
