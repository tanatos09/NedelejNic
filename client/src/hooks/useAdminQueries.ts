import { useQuery, useMutation, useQueryClient } from 'react-query';
import { adminApi } from '../services/adminApi';
import type {
  UsersListResponse,
  User,
  UserRole,
  UserDetailResponse,
  UserFilters,
} from '../types/admin';

const USERS_QUERY_KEY = 'admin_users';
const USER_DETAIL_KEY = 'admin_user_detail';
const STALE_TIME = 30000; // 30s
const CACHE_TIME = 5 * 60 * 1000; // 5m

// ─────────────────── QUERIES ───────────────────

export const useAdminUsers = (
  page: number,
  pageSize: number,
  filters?: UserFilters
) => {
  const queryKey = [USERS_QUERY_KEY, page, pageSize, filters];

  return useQuery<UsersListResponse, Error>(
    queryKey,
    () => adminApi.getUsers(page, pageSize, filters),
    {
      keepPreviousData: true,
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
      retry: 1,
      onError: (error) => {
        console.error('[useAdminUsers] Error:', error.message);
      },
    }
  );
};

export const useAdminUserDetail = (userId: string | null) => {
  const queryKey = [USER_DETAIL_KEY, userId];

  return useQuery<UserDetailResponse, Error>(
    queryKey,
    () => {
      if (!userId) throw new Error('userId is required');
      return adminApi.getUserDetail(userId);
    },
    {
      enabled: !!userId,
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
      retry: 1,
    }
  );
};

// ─────────────────── MUTATIONS ───────────────────

export const useChangeUserRoleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { userId: string; role: UserRole }>(
    ({ userId, role }) => adminApi.changeUserRole(userId, role),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(USERS_QUERY_KEY);
        queryClient.invalidateQueries(USER_DETAIL_KEY);
      },
      onError: (error) => {
        console.error('[useChangeUserRoleMutation] Error:', error.message);
      },
    }
  );
};

export const useToggleUserBanMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { userId: string; isBanned: boolean }>(
    ({ userId, isBanned }) => adminApi.toggleUserBan(userId, isBanned),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(USERS_QUERY_KEY);
        queryClient.invalidateQueries(USER_DETAIL_KEY);
      },
      onError: (error) => {
        console.error('[useToggleUserBanMutation] Error:', error.message);
      },
    }
  );
};

export const useSetUserLevelMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { userId: string; level: number }>(
    ({ userId, level }) => adminApi.setUserLevel(userId, level),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(USERS_QUERY_KEY);
        queryClient.invalidateQueries(USER_DETAIL_KEY);
      },
      onError: (error) => {
        console.error('[useSetUserLevelMutation] Error:', error.message);
      },
    }
  );
};

export const useResetUserProgressMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, string>(
    (userId) => adminApi.resetUserProgress(userId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(USERS_QUERY_KEY);
        queryClient.invalidateQueries(USER_DETAIL_KEY);
      },
      onError: (error) => {
        console.error('[useResetUserProgressMutation] Error:', error.message);
      },
    }
  );
};

export const useInvalidateUserSessionMutation = () => {
  return useMutation<void, Error, string>(
    (userId) => adminApi.invalidateUserSession(userId),
    {
      onError: (error) => {
        console.error('[useInvalidateUserSessionMutation] Error:', error.message);
      },
    }
  );
};
