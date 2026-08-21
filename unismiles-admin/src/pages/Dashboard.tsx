import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  DollarSign,
  History,
  Loader2,
  Monitor,
  Wifi,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../components/AuthProvider';
import { useKiosks } from '../KioskContext';
import { useSession } from '../SessionContext';
import api from '../lib/api';

interface DashboardStats {
  totalKiosks: number;
  totalSessions: number;
  totalRevenue: number;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(amount);

const getSessionDate = (timestamp: unknown) => {
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  if (timestamp && typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    const date = (timestamp as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof timestamp !== 'string' && typeof timestamp !== 'number') return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const compactCurrency = (amount: number) => {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)} M`;
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)} jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)} rb`;
  return `Rp ${amount}`;
};

const isSuccessfulSession = (status: unknown) => {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  if (!normalizedStatus) return true;
  return normalizedStatus === 'success'
    || normalizedStatus === 'successful'
    || normalizedStatus === 'complete'
    || normalizedStatus === 'completed'
    || normalizedStatus === 'paid'
    || normalizedStatus.startsWith('success')
    || normalizedStatus.startsWith('complete');
};

const readNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseDashboardStats = (payload: unknown): DashboardStats | null => {
  if (!payload || typeof payload !== 'object') return null;

  const envelope = payload as Record<string, unknown>;
  const responseData = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : envelope;
  const data = responseData.dashboard && typeof responseData.dashboard === 'object'
    ? responseData.dashboard as Record<string, unknown>
    : responseData.stats && typeof responseData.stats === 'object'
      ? responseData.stats as Record<string, unknown>
      : responseData;

  const totalKiosks = readNumber(data.total_kiosks ?? data.totalKiosks);
  const totalSessions = readNumber(data.total_sessions ?? data.totalSessions);
  const totalRevenue = readNumber(data.total_revenue ?? data.totalRevenue);

  if (totalKiosks === null || totalSessions === null || totalRevenue === null) return null;
  return { totalKiosks, totalSessions, totalRevenue };
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { kiosks, loading: kiosksLoading, lastFetchedAt } = useKiosks();
  const { sessions, loading: sessionsLoading } = useSession();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    api.get('/admin/dashboard')
      .then((response) => {
        if (mounted) setDashboardStats(parseDashboardStats(response.data));
      })
      .catch((error) => {
        console.warn('Dashboard aggregate unavailable; using loaded records.', error?.message);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!lastFetchedAt) return;
    const update = () => setSecondsAgo(Math.floor((Date.now() - lastFetchedAt.getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastFetchedAt]);

  const lastUpdatedLabel = secondsAgo === null
    ? 'Memuat...'
    : secondsAgo < 5
      ? 'Baru saja'
      : secondsAgo < 60
        ? `${secondsAgo} detik lalu`
        : `${Math.floor(secondsAgo / 60)} menit lalu`;

  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 89);
    startDate.setHours(0, 0, 0, 0);

    const revenueByDay = new Map<string, number>();
    const successfulSessions = sessions.filter((session) => isSuccessfulSession(session.status));
    let sessionRevenue = 0;
    let recentRevenue = 0;
    let recentSessions = 0;

    successfulSessions.forEach((session) => {
      const amount = Number(session.amount) || 0;
      sessionRevenue += amount;
      const date = getSessionDate(session.timestamp);
      if (!date || date < startDate || date > today) return;

      const key = dayKey(date);
      revenueByDay.set(key, (revenueByDay.get(key) || 0) + amount);
      recentRevenue += amount;
      recentSessions += 1;
    });

    const revenueTrend = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return {
        date: dayKey(date),
        label: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        revenue: revenueByDay.get(dayKey(date)) || 0,
      };
    });

    const onlineKiosks = kiosks.filter((kiosk) => kiosk.status === 'online').length;
    const idleKiosks = kiosks.filter((kiosk) => kiosk.status === 'idle').length;
    const offlineKiosks = kiosks.filter((kiosk) => kiosk.status === 'offline').length;

    return {
      totalRevenue: dashboardStats?.totalRevenue ?? sessionRevenue,
      totalSessions: dashboardStats?.totalSessions ?? successfulSessions.length,
      totalKiosks: dashboardStats?.totalKiosks ?? kiosks.length,
      recentRevenue,
      recentSessions,
      revenueTrend,
      onlineKiosks,
      idleKiosks,
      offlineKiosks,
    };
  }, [dashboardStats, kiosks, sessions]);

  if (kiosksLoading || sessionsLoading) {
    return (
      <div className="h-full min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-9 h-9 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto space-y-7 pb-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-primary mb-3">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_currentColor]" />
            Overview
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted mt-2">Pantau performa Uni-Smiles secara real-time, {user?.full_name || user?.name || 'Admin'}.</p>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-muted">
          <Activity className="w-4 h-4 text-primary" />
          Data aktual dari sistem
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Total Revenue" value={formatCurrency(summary.totalRevenue)} detail={`${compactCurrency(summary.recentRevenue)} · 90 hari`} accent="gold" />
        <MetricCard icon={History} label="Total Sessions" value={summary.totalSessions.toLocaleString('id-ID')} detail={`${summary.recentSessions.toLocaleString('id-ID')} sesi · 90 hari`} accent="blue" />
        <MetricCard icon={Monitor} label="Total Kiosks" value={summary.totalKiosks.toLocaleString('id-ID')} detail={`${summary.onlineKiosks} kiosk online`} accent="green" />
        <MetricCard icon={Wifi} label="Kiosk Offline" value={summary.offlineKiosks.toLocaleString('id-ID')} detail={`${summary.idleKiosks} kiosk idle`} accent="red" />
      </div>

      <section className="dashboard-panel p-5 md:p-7 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-extrabold tracking-tight">Revenue Overview</h2>
            </div>
            <p className="text-sm text-muted">Pendapatan per hari berdasarkan sesi photobooth yang tercatat.</p>
          </div>
          <span className="self-start rounded-lg border border-white/10 bg-[#101a2c] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">
            Last 90 days <Clock3 className="inline w-3 h-3 ml-1" />
          </span>
        </div>

        <div className="h-[300px] md:h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={summary.revenueTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0b" vertical={false} />
              <XAxis
                dataKey="date"
                interval={14}
                tickFormatter={(value) => summary.revenueTrend.find((item) => item.date === value)?.label || value}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={12}
              />
              <YAxis
                tickFormatter={compactCurrency}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={74}
              />
              <Tooltip
                labelFormatter={(value) => summary.revenueTrend.find((item) => item.date === value)?.label || value}
                formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                contentStyle={{ background: '#111c2f', border: '1px solid rgba(255,184,0,0.28)', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,.3)' }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700, marginBottom: 4 }}
                itemStyle={{ color: '#ffb800', fontWeight: 800 }}
                cursor={{ stroke: '#ffb800', strokeOpacity: 0.18 }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#ffb800" strokeWidth={3.5} dot={false} activeDot={{ r: 5, fill: '#ffb800', stroke: '#111c2f', strokeWidth: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="dashboard-panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold">Status Kiosk</h2>
              <p className="text-sm text-muted mt-1">Ringkasan status dari semua kiosk terdaftar.</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-400">Live</span>
              </div>
              <span className="text-[10px] text-muted">Diperbarui: {lastUpdatedLabel}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatusItem icon={CheckCircle2} label="Online" value={summary.onlineKiosks} color="green" />
            <StatusItem icon={Clock3} label="Idle" value={summary.idleKiosks} color="gold" />
            <StatusItem icon={Wifi} label="Offline" value={summary.offlineKiosks} color="red" />
          </div>
        </section>

        <section className="dashboard-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold">Session Activity</h2>
              <p className="text-sm text-muted mt-1">Aktivitas 90 hari terakhir.</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-primary" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">{summary.recentSessions.toLocaleString('id-ID')}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-primary mt-2">Sessions recorded</p>
        </section>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ElementType; label: string; value: string; detail: string; accent: 'gold' | 'blue' | 'green' | 'red' }> = ({ icon: Icon, label, value, detail, accent }) => (
  <div className={`metric-card metric-${accent}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="metric-icon"><Icon className="w-5 h-5" /></div>
      <ArrowUpRight className="w-4 h-4 text-white/30" />
    </div>
    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted mt-5">{label}</p>
    <p className="text-2xl font-extrabold tracking-tight text-foreground mt-2 truncate">{value}</p>
    <p className="text-xs text-muted mt-2">{detail}</p>
  </div>
);

const StatusItem: React.FC<{ icon: React.ElementType; label: string; value: number; color: 'green' | 'gold' | 'red' }> = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-xl border border-white/8 bg-black/10 p-4">
    <div className={`status-dot status-${color}`}><Icon className="w-4 h-4" /></div>
    <p className="text-xs font-bold text-muted mt-3">{label}</p>
    <p className="text-2xl font-extrabold mt-1">{value.toLocaleString('id-ID')}</p>
  </div>
);
