import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
});

export interface AuthResponse {
  token: string;
  user?: Record<string, unknown>;
}

/**
 * Accept both the documented response and the envelope used by some API
 * deployments. Keeping this in one place prevents the login page and the
 * auth provider from interpreting the response differently.
 */
export const parseAuthResponse = (payload: unknown): AuthResponse => {
  const body = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const data = body.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown>
    : body;
  const token = data.token ?? data.access_token ?? body.token ?? body.access_token;

  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Server login tidak mengembalikan token autentikasi.');
  }

  const user = (data.user ?? body.user) as Record<string, unknown> | undefined;
  return { token, user };
};

export const getAuthUser = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const data = body.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown>
    : null;
  const user = body.user ?? data?.user ?? data ?? body;
  return user && typeof user === 'object' ? user as Record<string, unknown> : null;
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('unismiles_token') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      localStorage.removeItem('unismiles_token');
      localStorage.removeItem('unismiles_user');
      localStorage.removeItem('token');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
