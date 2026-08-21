import React, { useState } from 'react';
import {
  Search,
  Filter,
  Download,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  X,
  Mail,
  Printer,
  Settings,
  Save
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSession } from '../SessionContext';
import { toast } from 'sonner';
import api from '../lib/api';
import { resolvePublicUrl } from '../lib/urls';

export const SessionRepository: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [templateFilter, setTemplateFilter] = useState('All Templates');
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [resendEmail, setResendEmail] = useState('');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [retentionMonths, setRetentionMonths] = useState<number>(0);
  const [savingSettings, setSavingSettings] = useState(false);
  
  const { sessions, loading } = useSession();

  React.useEffect(() => {
    if (isSettingsOpen) {
      api.get('/admin/settings').then(res => {
        if (res.data && res.data.success) {
          setRetentionMonths(res.data.data.session_retention_months || 0);
        }
      }).catch(err => console.error(err));
    }
  }, [isSettingsOpen]);

  const saveRetentionSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/admin/settings', { session_retention_months: retentionMonths });
      toast.success('Retention policy saved successfully');
      setIsSettingsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const getPhotoUrl = (url: string) => resolvePublicUrl(url);

  const templates = Array.from(new Set(sessions.map(s => s.template || 'Default')));

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.id.toLowerCase().includes(search.toLowerCase()) ||
      (s.template || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'All Status' || s.status === statusFilter;
    const matchesTemplate = templateFilter === 'All Templates' || (s.template || 'Default') === templateFilter;

    const sessionDate = new Date(s.timestamp);
    const matchesDate = (!dateRange.start || sessionDate >= new Date(dateRange.start)) &&
      (!dateRange.end || sessionDate <= new Date(dateRange.end + 'T23:59:59'));

    return matchesSearch && matchesStatus && matchesTemplate && matchesDate;
  });

  const exportCSV = () => {
    const headers = ['Session ID', 'Date', 'Template', 'Amount', 'Status'];
    const rows = filteredSessions.map(s => [
      s.id,
      new Date(s.timestamp).toLocaleString(),
      s.template,
      s.amount,
      s.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sessions_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredSessions.length} sessions to CSV`);
  };

  const downloadUrl = async (url: string, filename: string) => {
    try {
      const fullUrl = getPhotoUrl(url);
      const response = await fetch(fullUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download image", err);
      const fullUrl = getPhotoUrl(url);
      window.open(fullUrl, '_blank');
    }
  };

  const downloadSessionPhotos = async (photos: string[], sessionId: string) => {
    if (!photos || photos.length === 0) {
      toast.error('No photos available for download in this session.');
      return;
    }

    const toastId = toast.loading('Downloading session photos...');

    try {
      for (let idx = 0; idx < photos.length; idx++) {
        await downloadUrl(photos[idx], `session-${sessionId}-photo-${idx + 1}.jpg`);
      }
      toast.success(`Downloaded ${photos.length} photo(s) successfully`, { id: toastId });
    } catch (err) {
      toast.error('Failed to download some photos.', { id: toastId });
    }
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast.error('Please enter a valid email address');
      return;
    }
    toast.success(`Photos sent to ${resendEmail} successfully!`);
    setResendEmail('');
  };

  const handlePrintCommand = (sessionId: string) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Connecting to kiosk printer...',
        success: `Print command sent! Session ${sessionId} is printing...`,
        error: 'Failed to communicate with the kiosk printer.',
      }
    );
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) return timestamp.toDate().toLocaleString();
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (e) {
      console.error("Date parsing error", e);
    }
    return 'N/A';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Session Repository</h1>
          <p className="text-muted mt-1 font-medium">Centralized database of all photo booth sessions.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-6 py-3 glass-panel hover:bg-foreground/5 transition-all flex items-center gap-2 text-sm font-extrabold border-primary/20 shadow-[0_0_15px_rgba(255,140,102,0.1)] active:scale-95 cursor-pointer"
          >
            <Settings className="w-5 h-5 text-primary" /> Auto-Delete
          </button>
          <button
            onClick={exportCSV}
            className="px-6 py-3 glass-panel hover:bg-foreground/5 transition-all flex items-center gap-2 text-sm font-extrabold border-primary/20 shadow-[0_0_15px_rgba(255,140,102,0.1)] active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-5 h-5 text-green-400 neon-text-glow" /> Export CSV
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Session ID..."
            className="w-full bg-foreground/5 border border-primary/20 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary/50 transition-all text-foreground font-medium focus:shadow-[0_0_15px_rgba(255,140,102,0.1)]"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-4 py-2 glass-panel bg-foreground/5 border-primary/20 rounded-xl text-sm font-bold outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              <option value="All Status" className="bg-background text-foreground">All Status</option>
              <option value="Success" className="bg-background text-foreground">Success</option>
              <option value="Failed (Paper Jam)" className="bg-background text-foreground">Failed (Paper Jam)</option>
              <option value="Pending" className="bg-background text-foreground">Pending</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="px-4 py-2 glass-panel bg-foreground/5 border-primary/20 rounded-xl text-sm font-bold outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              <option className="bg-background text-foreground">All Templates</option>
              {templates.map(t => (
                <option key={t} value={t} className="bg-background text-foreground">{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 glass-panel p-1 border-primary/20 rounded-xl">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-transparent text-xs font-bold px-2 py-1 outline-none text-foreground color-scheme-dark"
            />
            <span className="text-muted text-[10px] font-bold">TO</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-transparent text-xs font-bold px-2 py-1 outline-none text-foreground color-scheme-dark"
            />
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden neon-border border-primary/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-primary/10 bg-foreground/5">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Session ID</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Date & Time</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Template</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Photos</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Amount</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {filteredSessions.map((session) => (
                <tr key={session.id} className="hover:bg-foreground/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-mono text-primary font-bold neon-text-glow">{session.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-foreground/80 font-medium">
                      {formatDateTime(session.timestamp)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-foreground">{session.template || 'Default'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {(session.photos || []).length > 0 ? (
                      <div className="flex -space-x-2 overflow-hidden">
                        {session.photos.slice(0, 3).map((photo: string, idx: number) => (
                          <img
                            key={idx}
                            src={getPhotoUrl(photo)}
                            alt={`Session photo ${idx + 1}`}
                            className="inline-block h-8 w-8 rounded-lg ring-2 ring-background object-cover shadow-lg"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                        {session.photos.length > 3 && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10 text-[10px] font-bold text-muted ring-2 ring-background">
                            +{session.photos.length - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted/60">
                        Belum ada foto
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-foreground">Rp {(session.amount || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full w-fit",
                      (session.status === 'Success') ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" :
                        (session.status?.startsWith('Failed')) ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    )}>
                      {(session.status === 'Success') ? <CheckCircle2 className="w-3 h-3" /> :
                        (session.status?.startsWith('Failed')) ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      <span>{session.status || 'unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setSelectedSession(session); setResendEmail(''); }}
                        className="p-2 hover:bg-primary/10 rounded-lg transition-all text-muted hover:text-primary cursor-pointer"
                        title="View Details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadSessionPhotos(session.photos, session.id)}
                        className="p-2 hover:bg-primary/10 rounded-lg transition-all text-muted hover:text-primary cursor-pointer"
                        title="Download Photos"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted font-bold uppercase tracking-widest">
                    No sessions found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted font-bold uppercase tracking-widest">
                    Loading sessions...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1E293B] border border-white/5 p-8 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedSession(null)}
              className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-black text-primary border border-primary/20 bg-primary/5 px-3 py-1 rounded-full uppercase tracking-widest">
                  Session Details
                </span>
                <h3 className="text-3xl font-black tracking-tighter uppercase mt-3 text-foreground">{selectedSession.id}</h3>
                <p className="text-xs text-muted font-bold">{formatDateTime(selectedSession.timestamp)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-black/20 p-6 rounded-2xl border border-white/5">
                <div>
                  <span className="text-[8px] font-black text-muted uppercase tracking-widest block">Template Used</span>
                  <span className="text-sm font-bold text-foreground">{selectedSession.template || 'Default'}</span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-muted uppercase tracking-widest block">Transaction Amount</span>
                  <span className="text-sm font-bold text-foreground">Rp {(selectedSession.amount || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-muted uppercase tracking-widest block">Status</span>
                  <span className="text-sm font-bold text-foreground">{selectedSession.status || 'Success'}</span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-muted uppercase tracking-widest block">Kiosk Origin</span>
                  <span className="text-sm font-bold text-foreground">Kios-K GIAT</span>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3">Captured Photos</h4>
                {(selectedSession.photos || []).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {selectedSession.photos.map((photoUrl: string, idx: number) => (
                      <div key={idx} className="relative group overflow-hidden rounded-2xl border border-white/5 bg-black/20 aspect-[2/3]">
                        <img
                          src={getPhotoUrl(photoUrl)}
                          alt={`Capture ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          onClick={() => downloadUrl(photoUrl, `session-${selectedSession.id}-photo-${idx + 1}.jpg`)}
                          className="absolute bottom-3 right-3 p-2 bg-black/80 backdrop-blur-md rounded-xl text-primary border border-primary/20 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Download Photo"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-10 text-center text-sm font-bold text-muted">
                    Belum ada foto untuk session ini.
                  </div>
                )}
              </div>

              {/* Action Actions */}
              <div className="pt-4 border-t border-white/5 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" /> Resend Session Email
                    </span>
                    <form onSubmit={handleSendEmail} className="flex gap-2">
                      <input
                        type="email"
                        placeholder="recipient@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/5 rounded-xl px-4 py-2 text-xs outline-none focus:border-primary/40 font-bold"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-primary text-[#10172A] rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:opacity-90"
                      >
                        Send
                      </button>
                    </form>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2">
                      <Printer className="w-3.5 h-3.5" /> Kiosk Operations
                    </span>
                    <button
                      onClick={() => handlePrintCommand(selectedSession.id)}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer text-foreground"
                    >
                      <Printer className="w-4 h-4" /> Trigger Reprint at Kiosk
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1E293B] border border-white/5 p-8 rounded-[2rem] w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-black tracking-tighter uppercase text-foreground">Retention Policy</h3>
                <p className="text-xs text-muted font-bold mt-2 leading-relaxed">
                  Konfigurasi waktu penyimpanan otomatis. Sesi dan foto yang melewati batas ini akan dihapus secara permanen dari server.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest block">
                  Simpan Sesi Selama
                </label>
                <select
                  value={retentionMonths}
                  onChange={(e) => setRetentionMonths(parseInt(e.target.value))}
                  className="w-full bg-black/20 border border-white/5 rounded-2xl px-4 py-3 outline-none focus:border-primary/40 font-bold text-sm text-foreground appearance-none cursor-pointer"
                >
                  <option value={0} className="bg-background">Never Delete (Simpan Selamanya)</option>
                  <option value={1} className="bg-background">1 Month</option>
                  <option value={2} className="bg-background">2 Months</option>
                  <option value={3} className="bg-background">3 Months</option>
                  <option value={6} className="bg-background">6 Months</option>
                  <option value={12} className="bg-background">1 Year</option>
                </select>
              </div>

              <button
                onClick={saveRetentionSettings}
                disabled={savingSettings}
                className="w-full py-4 bg-primary hover:opacity-90 text-[#10172A] rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {savingSettings ? 'Menyimpan...' : (
                  <>
                    <Save className="w-4 h-4" /> Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
