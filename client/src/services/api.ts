import type { User, LevelConfig, GameResult } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Neznámá chyba.');
  }

  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () => request<User>('/auth/me'),

  getLevel: (id: number) => request<LevelConfig>(`/level/${id}`),

  postResult: (result: GameResult, levelId: number, signature: string) =>
    request<{ message: string; newLevel: number }>('/result', {
      method: 'POST',
      body: JSON.stringify({ result, levelId, signature }),
    }),
};
