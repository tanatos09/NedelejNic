import type {
  User,
  UsersListResponse,
  UserDetailResponse,
  UserFilters,
  AdminUserResponse,
} from '../types/admin';

const ADMIN_BASE = '/admin';

interface RequestOptions {
  headers?: Record<string, string>;
}

// Helper: build query string
function buildQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });
  return query.toString();
}

// Helper: API fetch with JWT
async function apiRequest<T>(
  path: string,
  options: RequestInit & RequestOptions = {}
): Promise<T> {
  const token = localStorage.getItem('nedelejnic_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers && typeof options.headers === 'object') {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }

  return response.json();
}

export const adminApi = {
  // GET USERS LIST
  getUsers: async (
    page: number = 1,
    pageSize: number = 50,
    filters?: UserFilters
  ): Promise<UsersListResponse> => {
    const params: Record<string, any> = {
      page,
      pageSize,
    };

    if (filters?.role && filters.role !== 'ALL') {
      params.role = filters.role;
    }
    if (filters?.status && filters.status !== 'all') {
      params.status = filters.status;
    }
    if (filters?.search) {
      params.search = filters.search;
    }

    const queryString = buildQueryString(params);
    const url = `${ADMIN_BASE}/users${queryString ? `?${queryString}` : ''}`;

    return apiRequest<UsersListResponse>(url);
  },

  // GET USER DETAIL
  getUserDetail: async (userId: string): Promise<UserDetailResponse> => {
    return apiRequest<UserDetailResponse>(`${ADMIN_BASE}/users/${userId}`);
  },

  // PUT CHANGE ROLE
  changeUserRole: async (
    userId: string,
    role: string
  ): Promise<User> => {
    const response = await apiRequest<AdminUserResponse>(
      `${ADMIN_BASE}/users/${userId}/role`,
      {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }
    );
    return response.user;
  },

  // PUT BAN/UNBAN
  toggleUserBan: async (
    userId: string,
    isBanned: boolean
  ): Promise<User> => {
    const response = await apiRequest<AdminUserResponse>(
      `${ADMIN_BASE}/users/${userId}/ban`,
      {
        method: 'PUT',
        body: JSON.stringify({ isBanned }),
      }
    );
    return response.user;
  },

  // PUT SET LEVEL
  setUserLevel: async (
    userId: string,
    level: number
  ): Promise<User> => {
    const response = await apiRequest<AdminUserResponse>(
      `${ADMIN_BASE}/users/${userId}/level`,
      {
        method: 'PUT',
        body: JSON.stringify({ level }),
      }
    );
    return response.user;
  },

  // POST RESET PROGRESS
  resetUserProgress: async (userId: string): Promise<User> => {
    const response = await apiRequest<AdminUserResponse>(
      `${ADMIN_BASE}/users/${userId}/reset-progress`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
    return response.user;
  },

  // POST INVALIDATE SESSION
  invalidateUserSession: async (userId: string): Promise<void> => {
    await apiRequest<void>(
      `${ADMIN_BASE}/users/${userId}/invalidate-session`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
  },
};
