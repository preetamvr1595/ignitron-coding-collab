/**
 * IGNITRON 2K26 — Centralized API Client
 *
 * Uses relative paths by default (e.g., '/api') which are proxied
 * via Vite in development, and served from the reverse proxy/static host
 * in production.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const AUTH_TOKEN_KEY = 'ignitron_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getAuthHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders || {});
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly data?: any,
  ) {
    const errorMsg =
      data?.error?.message ||
      data?.message ||
      (typeof data === 'string' && data.trim().length > 0 && !data.trim().startsWith('<')
        ? data.trim()
        : null) ||
      (status === 502 || status === 503 || status === 504 || status === 500
        ? 'Backend service is currently unavailable. Please verify the backend server is running.'
        : `Request failed with status ${status}: ${statusText}`);
    super(errorMsg);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  const headers = getAuthHeaders(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include', // Always send HttpOnly session cookies
      cache: 'no-store', // Never serve stale cached competition/question data
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      'Connection Error',
      'Unable to connect to backend service. Please verify the backend server is running on port 4000.',
    );
  }

  // Safely extract response body text exactly once to guarantee no "body stream already read"
  let rawText = '';
  try {
    if (!response.bodyUsed) {
      rawText = await response.text();
    }
  } catch {
    rawText = '';
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
    }
    let errorData: unknown;
    if (rawText && rawText.trim()) {
      try {
        errorData = JSON.parse(rawText);
      } catch {
        errorData = rawText.trim();
      }
    } else {
      errorData = response.statusText;
    }
    throw new ApiError(response.status, response.statusText, errorData);
  }

  // Handle 204 No Content or empty responses
  if (response.status === 204 || !rawText || !rawText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return rawText as unknown as T;
  }
}
