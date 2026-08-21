import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './components/AuthProvider';
import api from './lib/api';

export interface Session {
  id: string;
  timestamp: string;
  template: string;
  photos: string[];
  amount: number;
  status: string;
}

const parseJson = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizePhotos = (session: any): string[] => {
  const rawPhotos = parseJson(
    session.photos ??
    session.photo_urls ??
    session.photoUrls ??
    session.images ??
    session.captured_photos ??
    session.capturedPhotos ??
    []
  );

  const photos = Array.isArray(rawPhotos)
    ? rawPhotos
    : typeof rawPhotos === 'string'
      ? rawPhotos.split(',')
      : rawPhotos && typeof rawPhotos === 'object'
        ? Object.values(rawPhotos)
        : [];

  return photos
    .map((photo: any) => {
      if (typeof photo === 'string') return photo.trim();
      if (!photo || typeof photo !== 'object') return '';
      return String(
        photo.url ??
        photo.image_url ??
        photo.imageUrl ??
        photo.photo_url ??
        photo.photoUrl ??
        photo.path ??
        photo.file_url ??
        photo.fileUrl ??
        ''
      ).trim();
    })
    .filter(Boolean);
};

const normalizeSession = (session: any): Session => ({
  id: String(session.id ?? session.session_code ?? session.sessionCode ?? ''),
  timestamp: session.timestamp ?? session.created_at ?? session.createdAt ?? '',
  template: session.template ?? session.template_name ?? session.templateName ?? 'Default',
  photos: normalizePhotos(session),
  amount: Number(session.amount ?? session.total_amount ?? session.totalAmount ?? 0),
  status: session.status ?? 'Unknown',
});

interface SessionContextType {
  sessions: Session[];
  loading: boolean;
  fetchSessions: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/sessions');
      const responseData = res.data?.data ?? res.data;
      const data = Array.isArray(responseData)
        ? responseData
        : responseData?.sessions || responseData?.items || responseData?.results || [];
      if (Array.isArray(data)) {
        setSessions(data.map(normalizeSession));
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error("Failed to fetch sessions from /admin/sessions:", err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Sessions conditional on isAuthenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setSessions([]);
      setLoading(false);
      return;
    }
    fetchSessions();
  }, [isAuthenticated]);

  return (
    <SessionContext.Provider value={{ sessions, loading, fetchSessions }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
