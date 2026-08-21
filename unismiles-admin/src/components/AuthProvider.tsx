import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { getAuthUser } from '../lib/api';

export interface User {
  id: string;
  email: string;
  name?: string;
  full_name?: string;
  role: string;
  partner_name: string;
  displayName?: string;
  photoURL?: string;
  uid?: string;
}

interface AuthContextType {
  user: User | null;
  role: string | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  role: null,
  token: null,
  loading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('unismiles_token') || localStorage.getItem('token');
      const storedUser = localStorage.getItem('unismiles_user');

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        setToken(storedToken);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }

        const response = await api.get('/auth/me');
        const userData = getAuthUser(response.data);
        if (!userData) {
          throw new Error('Profil pengguna tidak ditemukan pada respons server.');
        }
        setUser(userData);
        localStorage.setItem('unismiles_user', JSON.stringify(userData));
      } catch (error: any) {
        console.error("Auth verification failed", error);
        localStorage.removeItem('unismiles_token');
        localStorage.removeItem('unismiles_user');
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          if (window.location.pathname !== '/') {
            window.location.href = '/';
          }
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = (newToken: string, userData: User) => {
    if (!newToken || !userData) return;
    localStorage.setItem('unismiles_token', newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('unismiles_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('unismiles_token');
    localStorage.removeItem('token');
    localStorage.removeItem('unismiles_user');
    setToken(null);
    setUser(null);
  };

  const isAuthenticated = Boolean(token);

  return (
    <AuthContext.Provider value={{ user, role: user?.role || null, token, loading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="glass-panel p-8 max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold text-primary">Something went wrong</h2>
          <p className="text-muted">An unexpected error occurred.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-xl font-bold"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
