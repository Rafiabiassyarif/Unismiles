import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { useAuth } from './components/AuthProvider';
import api from './lib/api';

export interface KioskHealth {
  printerInk: number;
  storage: number;
  camera: 'good' | 'bad';
}

export interface Kiosk {
  id: string;
  name: string;
  location: string;
  base_price?: number;
  status: 'online' | 'offline' | 'idle' | 'restarting';
  health: KioskHealth;
  config?: {
    brightness: number;
    volume: number;
    maintenanceMode: boolean;
    filters?: any[];
    stickers?: any[];
    branding?: any;
    [key: string]: any;
  };
  lastHeartbeat?: string | null;
  createdAt?: string;
  user_id?: number | string;
  api_key?: string;
}

interface KioskContextType {
  kiosks: Kiosk[];
  fetchKiosks: () => Promise<void>;
  addKiosk: (kiosk: any) => Promise<string | undefined>;
  updateKiosk: (id: string, data: Partial<Kiosk>) => Promise<void>;
  restartKiosk: (id: string) => Promise<void>;
  deleteKiosk: (id: string) => Promise<void>;
  loading: boolean;
  lastFetchedAt: Date | null;
}

const KioskContext = createContext<KioskContextType | undefined>(undefined);

/** Mirrors the backend threshold logic — used as a UI-side fallback. */
export function getComputedStatus(lastHeartbeat: string | null | undefined): Kiosk['status'] {
  if (!lastHeartbeat) return 'offline';
  const normalizedStr = typeof lastHeartbeat === 'string' ? lastHeartbeat.replace(' ', 'T') : lastHeartbeat;
  const time = new Date(normalizedStr).getTime();
  if (isNaN(time)) return 'offline';
  const diffMin = (Date.now() - time) / 60000;
  if (diffMin < 2) return 'online';
  return 'offline';
}

/** Auto-polling interval in milliseconds. */
const POLL_INTERVAL_MS = 15_000;

/** Live status recompute interval — derives online/idle/offline from lastHeartbeat client-side */
const STATUS_RECOMPUTE_INTERVAL_MS = 30_000;

const mapKiosk = (item: any): Kiosk => {
  let parsedHealth = item.health;
  if (typeof parsedHealth === 'string') {
    try { parsedHealth = JSON.parse(parsedHealth); } catch {}
  }

  const lastHeartbeat = item.last_heartbeat || item.lastHeartbeat || item.lastSeenAt || null;
  const reportedStatus = String(item.status || '').toLowerCase();
  const status = ['online', 'offline', 'idle', 'restarting'].includes(reportedStatus)
    ? reportedStatus as Kiosk['status']
    : getComputedStatus(lastHeartbeat);

  const health: KioskHealth = {
    printerInk: parsedHealth?.printerInk ?? parsedHealth?.inkLevel ?? item.inkLevel ?? 100,
    storage: parsedHealth?.storage ?? parsedHealth?.storageUsedPercent ?? item.storageUsedPercent ?? 0,
    camera: parsedHealth?.camera ?? parsedHealth?.cameraStatus ?? item.cameraStatus ?? 'good',
  };

  let parsedConfig = item.config;
  if (typeof parsedConfig === 'string') {
    try { parsedConfig = JSON.parse(parsedConfig); } catch {}
  }

  return {
    ...item,
    id: String(item.id),
    name: item.name || 'Unnamed Kiosk',
    location: item.location || 'Unknown Location',
    base_price: item.base_price,
    status,
    health,
    config: parsedConfig || { brightness: 80, volume: 50, maintenanceMode: false },
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    lastHeartbeat,
    api_key: item.api_key || null,
  };
};

export const KioskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchKiosks = useCallback(async () => {
    try {
      const res = await api.get('/admin/kiosks');
      const rawData = res.data?.data || res.data;
      setKiosks(Array.isArray(rawData) ? rawData.map(mapKiosk) : []);
      setLastFetchedAt(new Date());
    } catch (err) {
      console.error('Error fetching kiosks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-polling every 15 s
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchKiosks();

    pollRef.current = setInterval(() => {
      fetchKiosks();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAuthenticated, fetchKiosks]);

  // Live status recompute — re-derives online/idle/offline from lastHeartbeat
  // every 30 s WITHOUT hitting the API. Keeps cards accurate between polls.
  useEffect(() => {
    const recomputeInterval = setInterval(() => {
      setKiosks(prev => prev.map(k => {
        if (k.status === 'restarting' || k.status === 'offline') return k; // preserve manual/explicit offline state
        const recomputed = getComputedStatus(k.lastHeartbeat);
        return recomputed !== k.status ? { ...k, status: recomputed } : k;
      }));
    }, STATUS_RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(recomputeInterval);
  }, []);

  const addKiosk = async (kioskData: any): Promise<string | undefined> => {
    try {
      const { id, name, location, base_price } = kioskData;
      const res = await api.post('/admin/kiosks', { id, name, location, base_price });
      const newKiosk = res.data?.data || res.data;
      const apiKey = newKiosk?.api_key || res.data?.api_key || res.data?.data?.api_key;
      await fetchKiosks();
      return apiKey;
    } catch (err: any) {
      console.error('Error adding kiosk:', err);
      const msg = err.response?.data?.message || 'Network error or failure while adding kiosk.';
      toast.error(msg);
      throw err;
    }
  };

  const updateKiosk = async (id: string, data: Partial<Kiosk>) => {
    try {
      await api.put(`/admin/kiosks/${id}`, data);
      await fetchKiosks();
    } catch (err: any) {
      // Fallback: apply update locally if endpoint not yet available
      console.warn('updateKiosk: applying locally as fallback.', err?.message);
      setKiosks(prev => prev.map(k => k.id === id ? { ...k, ...data } : k));
    }
  };

  const restartKiosk = async (id: string) => {
    // Optimistic UI: show restarting state, then back to online after 3.2s
    setKiosks(prev => prev.map(k => k.id === id ? { ...k, status: 'restarting' } : k));
    setTimeout(() => {
      setKiosks(prev => prev.map(k =>
        k.id === id && k.status === 'restarting' ? { ...k, status: 'online' } : k
      ));
    }, 3200);
  };

  const deleteKiosk = async (id: string) => {
    try {
      await api.delete(`/admin/kiosks/${id}`);
      setKiosks(prev => prev.filter(k => k.id !== id));
      toast.error('Kiosk Berhasil Dihapus', {
        icon: <Trash2 className="w-5 h-5 text-red-400" />,
        duration: 3000,
        position: 'top-center',
        style: {
          background: 'rgba(239, 68, 68, 0.15)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#fff',
          borderRadius: '9999px',
          padding: '12px 24px',
          fontWeight: '600',
          fontSize: '14px',
        },
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Gagal menghapus kiosk.';
      toast.error(msg);
      throw err;
    }
  };

  return (
    <KioskContext.Provider value={{ kiosks, fetchKiosks, addKiosk, updateKiosk, restartKiosk, deleteKiosk, loading, lastFetchedAt }}>
      {children}
    </KioskContext.Provider>
  );
};

export const useKiosks = () => {
  const context = useContext(KioskContext);
  if (context === undefined) {
    throw new Error('useKiosks must be used within a KioskProvider');
  }
  return context;
};
