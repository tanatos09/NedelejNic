/**
 * HTTP Client with built-in JWT injection and 401 handler
 * 
 * Responsibilities:
 * 1. Read JWT from localStorage
 * 2. Inject into every request header
 * 3. Handle 401 responses → global logout
 * 4. Return trusted data from backend
 *
 * ⚠️ NOT a security layer - just transport middleware
 * Backend validates JWT in middleware - that's the source of truth
 */

const TOKEN_KEY = 'nedelejnic_token';
const API_URL = 'http://localhost:3001';

// Token storage utilities (same as api.ts)
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Global logout handler - called on 401
let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorizedHandler(callback: () => void): void {
  onUnauthorizedCallback = callback;
}

/**
 * Make HTTP request with JWT injection
 * Throws on non-200 responses
 * Handles 401 globally
 */
async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Inject JWT token if available
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_URL}${path}`;
  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401 - global logout
  if (response.status === 401) {
    clearToken();
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    throw new Error('Unauthorized - session expired');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Chyba serveru');
  }

  return data as T;
}

// Export convenience methods
export const httpClient = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T,>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
