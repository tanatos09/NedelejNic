import type { User, LevelConfig, GameResult, AuthResponse } from '../types';
import { httpClient, setToken, clearToken } from './httpClient';

/**
 * Main API service - uses httpClient (API Interceptor)
 * 
 * httpClient handles:
 * ✓ JWT injection on every request
 * ✓ 401 handling (global logout)
 * ✓ Trusted data validation
 * 
 * This layer just organizes endpoints
 */

export const api = {
  register: async (username: string, password: string): Promise<User> => {
    const response = await httpClient.post<AuthResponse>('/auth/register', {
      username,
      password,
    });
    setToken(response.token);
    return response.user;
  },

  login: async (username: string, password: string): Promise<User> => {
    const response = await httpClient.post<AuthResponse>('/auth/login', {
      username,
      password,
    });
    setToken(response.token);
    return response.user;
  },

  me: () => httpClient.get<User>('/auth/me'),

  getLevel: (id: number) => httpClient.get<LevelConfig>(`/level/${id}`),

  postResult: (result: GameResult, levelId: number, signature: string) =>
    httpClient.post<{ message: string; newLevel: number }>('/result', {
      result,
      levelId,
      signature,
    }),

  logout: () => {
    clearToken();
    return Promise.resolve();
  },
};
