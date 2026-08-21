import React, { useState } from 'react';
import { 
  Monitor, 
  RefreshCcw, 
  Settings, 
  MapPin, 
  Plus, 
  CheckCircle2, 
  X, 
  Trash2, 
  Key, 
  Copy, 
  Check, 
  Zap,
  Clock,
  Wrench,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useKiosks } from '../KioskContext';
import { toast } from 'sonner';
import { KioskConfigPage } from './KioskConfigPage';
import { useAuth } from '../components/AuthProvider';

const formatLastHeartbeat = (lastHeartbeat?: string | null) => {
  if (!lastHeartbeat) return 'Belum pernah terhubung';
  const normalizedStr = typeof lastHeartbeat === 'string' ? lastHeartbeat.replace(' ', 'T') : lastHeartbeat;
  const time = new Date(normalizedStr).getTime();
  if (isNaN(time)) return 'Belum pernah terhubung';

  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 10) return 'Terakhir aktif: baru saja';
  if (diffSec < 60) return `Terakhir aktif: ${Math.max(0, diffSec)} dtk lalu`;
  if (diffSec < 3600) return `Terakhir aktif: ${Math.floor(diffSec / 60)} mnt lalu`;
  if (diffSec < 86400) return `Terakhir aktif: ${Math.floor(diffSec / 3600)} jam lalu`;
  return `Terakhir aktif: ${Math.floor(diffSec / 86400)} hari lalu`;
};

export const KioskManager: React.FC = () => {
  const { role } = useAuth();
  const { kiosks, addKiosk, updateKiosk, restartKiosk, deleteKiosk, fetchKiosks, loading } = useKiosks();
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Display all real kiosks fetched from the backend
  const displayedKiosks = kiosks;
  const [isRegistering, setIsRegistering] = useState(false);
  const [newKiosk, setNewKiosk] = useState({ id: '', name: '', location: '', base_price: '' });
  
  // API Key Modal State
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState('');
  const [generatedDeviceId, setGeneratedDeviceId] = useState('');
  const [copied, setCopied] = useState(false);

  // Full Page Config state
  const [isConfigView, setIsConfigView] = useState(false);
  const [selectedKiosk, setSelectedKiosk] = useState<any>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchKiosks();
      toast.success("Kiosk list refreshed");
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmRegistration = async () => {
    if (!newKiosk.name.trim() || !newKiosk.location.trim() || !newKiosk.base_price.trim()) {
      toast.error("Please fill in Name, Location, and Base Price");
      return;
    }

    setIsRegistering(true);
    try {
      // If Kiosk ID is left empty, auto-generate a secure identifier for the backend requirement
      const kioskPayload = {
        id: newKiosk.id.trim() || `KSK-${Date.now().toString().slice(-6)}`,
        name: newKiosk.name.trim(),
        location: newKiosk.location.trim(),
        base_price: newKiosk.base_price ? Number(newKiosk.base_price) : undefined
      };

      const apiKey = await addKiosk(kioskPayload);
      
      setIsRegistering(false);
      setIsAdding(false);
      setNewKiosk({ id: '', name: '', location: '', base_price: '' });

      if (apiKey) {
        setGeneratedApiKey(apiKey);
        setGeneratedDeviceId(kioskPayload.id);
        setShowApiKeyModal(true);
      } else {
        toast.success("Kiosk berhasil didaftarkan", {
          icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
          duration: 4000,
          position: 'top-center'
        });
      }
    } catch (error) {
      console.error("Registration error:", error);
      setIsRegistering(false);
    }
  };

  const handleCopyApiKey = () => {
    if (generatedApiKey) {
      const textToCopy = `DEVICE_ID=${generatedDeviceId}\nDEVICE_TOKEN=${generatedApiKey}`;
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Kiosk Credentials copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleViewApiKey = (kiosk: any) => {
    if (kiosk.api_key) {
      setGeneratedApiKey(kiosk.api_key);
      setGeneratedDeviceId(kiosk.id);
      setShowApiKeyModal(true);
    } else {
      toast.error("API Key not available for this kiosk. Please re-register it.");
    }
  };

  const handleCloseApiKeyModal = () => {
    setShowApiKeyModal(false);
    setGeneratedApiKey('');
    setGeneratedDeviceId('');
    setCopied(false);
  };

  const handleRestart = async (id: string, name: string) => {
    try {
      toast.loading(`Restarting ${name}...`, { id: `restart-${id}` });
      await restartKiosk(id);
      toast.success(`Kiosk ${name} berhasil di-restart dari jarak jauh.`, { id: `restart-${id}` });
    } catch (error) {
      console.error("Restart failed", error);
      toast.error("Restart failed", { id: `restart-${id}` });
    }
  };

  const handleDeleteKiosk = async (id: string, name: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus kiosk "${name}"?`)) {
      try {
        await deleteKiosk(id);
      } catch (error) {
        console.error("Failed to delete kiosk", error);
      }
    }
  };  const handleToggleMaintenance = async (kiosk: any) => {
    try {
      const isMaint = kiosk.config?.maintenanceMode === true;
      const newConfig = { ...kiosk.config, maintenanceMode: !isMaint };
      await updateKiosk(kiosk.id, { config: newConfig });
      toast.success(`Maintenance Mode untuk ${kiosk.name} ${!isMaint ? 'diaktifkan' : 'dinonaktifkan'}`);
    } catch (error) {
      console.error("Toggle maintenance failed", error);
      toast.error("Gagal mengubah status maintenance");
    }
  };

  const handleOpenConfig = (kiosk: any) => {
    setSelectedKiosk(kiosk);
    setIsConfigView(true);
  };

  const currentSelectedKiosk = selectedKiosk ? kiosks.find(k => k.id === selectedKiosk.id) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      {/* API Key Modal - Displayed when new kiosk is generated */}
      <AnimatePresence>
        {showApiKeyModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#10172A]/85 backdrop-blur-xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1E293B] border border-amber-500/40 rounded-[2.5rem] p-8 md:p-10 max-w-xl w-full shadow-[0_20px_60px_-15px_rgba(245,158,11,0.25)] relative overflow-hidden"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10 shrink-0">
                  <Key className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">API Key Generated</h3>
                  <p className="text-xs text-muted font-bold tracking-wider uppercase mt-1">Kiosk Hardware Authentication</p>
                </div>
              </div>

              {/* Modal Description */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 my-6 flex items-start gap-3.5 shadow-inner">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 mt-0.5 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <p className="text-amber-200 text-xs md:text-sm font-bold leading-relaxed">
                  Please copy this API Key and configure it in the Kiosk's client environment for hardware authentication.
                </p>
              </div>

              {/* API Key Display & Copy Box */}
              <div className="space-y-4 mb-8">
                <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Kiosk Environment (.env)</label>
                <div className="bg-black/50 border border-white/10 rounded-2xl p-4 font-mono text-xs md:text-sm text-primary select-all overflow-x-auto whitespace-pre">
                  <span className="font-bold tracking-wide">{`DEVICE_ID=${generatedDeviceId}\nDEVICE_TOKEN=${generatedApiKey}`}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={handleCopyApiKey}
                  className="flex-1 py-4 bg-primary text-[#10172A] rounded-2xl font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all shadow-xl shadow-primary/10 flex items-center justify-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to Clipboard!' : 'Copy API Key'}
                </button>
                <button 
                  onClick={handleCloseApiKeyModal}
                  className="px-8 py-4 bg-white/10 hover:bg-white/15 text-foreground rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isConfigView && currentSelectedKiosk ? (
          <motion.div
            key="config-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <KioskConfigPage 
              kiosk={currentSelectedKiosk} 
              onBack={() => setIsConfigView(false)} 
              onUpdate={updateKiosk}
            />
          </motion.div>
        ) : (
          <motion.div
            key="manager-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase">Kiosk Manager</h1>
                <p className="text-muted mt-1 font-bold">Monitor and control your remote photo booth stations.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || loading}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-muted hover:text-foreground rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center gap-2 disabled:opacity-50"
                  title="Refresh Kiosks"
                >
                  <RefreshCcw className={cn("w-4 h-4", (isRefreshing || loading) && "animate-spin")} />
                  Refresh
                </button>
                {['admin', 'Admin Mitra', 'Super Admin', 'admin_mitra'].includes(role || '') && (
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="px-7 py-2.5 bg-primary text-[#10172A] rounded-xl font-black uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> Register New Kiosk
                  </button>
                )}
              </div>
            </header>

            {isAdding && (
              <div className="bg-[#1E293B] border border-white/5 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
                {/* Loading Overlay */}
                <AnimatePresence>
                  {isRegistering && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#10172A]/80 backdrop-blur-md"
                    >
                      <div className="flex flex-col items-center gap-6">
                        <div className="relative w-20 h-20">
                          <motion.div 
                            className="absolute inset-0 border-4 border-primary/20 rounded-full"
                          />
                          <motion.div 
                            className="absolute inset-0 border-4 border-t-primary rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          />
                        </div>
                        <p className="text-xl font-black uppercase tracking-widest text-[#F1F5F9]">Registering Kiosk...</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black tracking-tighter uppercase">Register New Kiosk</h3>
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Kiosk ID (Optional)</label>
                    <input 
                      placeholder="e.g. KSK-001"
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 transition-all text-foreground font-bold tracking-tight"
                      value={newKiosk.id}
                      onChange={e => setNewKiosk({...newKiosk, id: e.target.value})}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Kiosk Name <span className="text-primary">*</span></label>
                    <input 
                      placeholder="e.g. PVJ Mall Concourse"
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 transition-all text-foreground font-bold tracking-tight"
                      value={newKiosk.name}
                      onChange={e => setNewKiosk({...newKiosk, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Location <span className="text-primary">*</span></label>
                    <input 
                      placeholder="e.g. Paris Van Java, Bandung"
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 transition-all text-foreground font-bold tracking-tight"
                      value={newKiosk.location}
                      onChange={e => setNewKiosk({...newKiosk, location: e.target.value})}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Base Price (Rp) <span className="text-primary">*</span></label>
                    <input 
                      type="number"
                      placeholder="e.g. 35000"
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 transition-all text-foreground font-bold tracking-tight"
                      value={newKiosk.base_price}
                      onChange={e => setNewKiosk({...newKiosk, base_price: e.target.value})}
                    />
                  </div>
                </div>
                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={handleConfirmRegistration}
                    disabled={isRegistering || !newKiosk.name.trim() || !newKiosk.location.trim() || !newKiosk.base_price.trim()}
                    className="px-10 py-4 bg-primary text-[#10172A] rounded-2xl font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all shadow-xl shadow-primary/10 disabled:opacity-50"
                  >
                    Confirm Registration
                  </button>
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="px-10 py-4 bg-white/5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Empty State when no kiosks exist */}
            {!loading && displayedKiosks.length === 0 && (
              <div className="bg-[#1E293B]/60 border border-white/5 rounded-[2.5rem] p-16 text-center space-y-6 flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-2xl">
                  <Monitor className="w-10 h-10" />
                </div>
                <div className="max-w-md space-y-2">
                  <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">No Kiosks Registered Yet</h3>
                  <p className="text-xs text-muted font-medium leading-relaxed">
                    There are currently no photobooth kiosks linked to this account. Click the register button above to connect your first station using the real API.
                  </p>
                </div>
                {['admin', 'Admin Mitra', 'Super Admin', 'admin_mitra'].includes(role || '') && (
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="px-8 py-3.5 bg-primary text-[#10172A] rounded-xl font-black uppercase tracking-widest text-xs shadow-xl hover:opacity-90 transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Register First Kiosk
                  </button>
                )}
              </div>
            )}

            {/* Data Grid listing real kiosks fetched from the backend */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {displayedKiosks.map((kiosk, i) => {
                const isOnline = kiosk.status === 'online';
                const inkVal = isOnline ? (kiosk.health?.printerInk ?? (kiosk as any).inkLevel ?? 0) : 0;
                const storageVal = isOnline ? (kiosk.health?.storage ?? (kiosk as any).storageUsedPercent ?? 0) : 0;
                const cameraRaw = isOnline ? String(kiosk.health?.camera || (kiosk as any).cameraStatus || 'GOOD') : 'OFF';
                const isCameraGood = cameraRaw.toLowerCase() === 'good';

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    key={kiosk.id} 
                    className="bg-[#1E293B] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl group hover:border-primary/30 transition-all duration-500 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-5">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg",
                            kiosk.status === 'online' ? "bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10" : 
                            kiosk.status === 'idle' ? "bg-amber-500/10 text-amber-400 shadow-amber-500/10" : 
                            kiosk.status === 'restarting' ? "bg-blue-500/10 text-blue-400 shadow-blue-500/10" : "bg-red-500/10 text-red-400 shadow-red-500/10"
                          )}>
                            <Monitor className="w-7 h-7" />
                          </div>
                          <div>
                            <h3 className="font-black text-xl tracking-tight text-foreground uppercase">{kiosk.name}</h3>
                            <div className="flex flex-col gap-1 mt-1">
                              <div className="flex items-center gap-2 text-[10px] text-muted font-black uppercase tracking-widest">
                                <MapPin className="w-3 h-3 text-primary/40" /> {kiosk.location}
                              </div>
                              {kiosk.base_price !== undefined && kiosk.base_price !== null && (
                                <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                                  Rp {Number(kiosk.base_price).toLocaleString('id-ID')}
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-[10px] text-muted font-black uppercase tracking-widest">
                                <Monitor className="w-3 h-3 text-primary/40" />
                                <span className="text-foreground/90 font-black">
                                  {kiosk.config?.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                                </span>
                                <span className="text-muted/60 font-bold lowercase text-[8px]">
                                  ({kiosk.config?.resolution || (kiosk.config?.orientation === 'landscape' ? '1920x1080' : '1080x1920')})
                                </span>
                              </div>
                              {/* Last heartbeat — when did this kiosk last phone home? */}
                              <div className="flex items-center gap-1.5 text-[9px] text-muted/70 font-semibold">
                                <Clock className="w-2.5 h-2.5" />
                                <span>
                                  {formatLastHeartbeat(kiosk.lastHeartbeat)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={cn(
                          "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          kiosk.status === 'online' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                          kiosk.status === 'idle' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                          kiosk.status === 'restarting' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                          {kiosk.status}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6 mb-8">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-muted text-[10px] font-black uppercase tracking-[0.1em]">
                            Ink
                          </div>
                          <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${inkVal}%` }}
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                inkVal > 20 ? "bg-primary" : "bg-red-500"
                              )} 
                            />
                          </div>
                          <p className="text-xs font-black text-foreground">{inkVal}%</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-muted text-[10px] font-black uppercase tracking-[0.1em]">
                            Space
                          </div>
                          <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${storageVal}%` }}
                              className="h-full bg-blue-500 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.3)]" 
                              />
                          </div>
                          <p className="text-xs font-black text-foreground">{storageVal}%</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-muted text-[10px] font-black uppercase tracking-[0.1em]">
                            Cam
                          </div>
                          <div className={cn(
                            "text-xs font-black uppercase tracking-widest px-2 py-1 bg-white/5 rounded-lg inline-block",
                            !isOnline ? "text-muted" : (isCameraGood ? "text-emerald-400" : "text-red-400")
                          )}>
                            {cameraRaw.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-auto pt-2">
                      <button 
                        onClick={() => handleToggleMaintenance(kiosk)}
                        disabled={!['admin', 'Admin Mitra', 'Super Admin', 'admin_mitra'].includes(role || '')}
                        className={cn("px-4 py-4 rounded-2xl transition-all cursor-pointer font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50",
                          kiosk.config?.maintenanceMode ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-white/5 text-muted hover:bg-white/10"
                        )}
                        title={kiosk.config?.maintenanceMode ? "Matikan Mode Perawatan" : "Nyalakan Mode Perawatan"}
                      >
                        <Wrench className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleOpenConfig(kiosk)}
                        className="flex-1 py-4 bg-primary text-[#10172A] rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/5 hover:shadow-primary/15 flex items-center justify-center gap-2 group cursor-pointer"
                        title="Config"
                      >
                        <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                      </button>
                      <button 
                        onClick={() => handleRestart(kiosk.id, kiosk.name)}
                        disabled={kiosk.status === 'restarting'}
                        className="px-4 py-4 bg-white/5 hover:bg-red-500/10 text-muted hover:text-red-400 rounded-2xl transition-all disabled:opacity-50"
                        title="Restart Kiosk"
                      >
                        <RefreshCcw className={cn("w-5 h-5", kiosk.status === 'restarting' && "animate-spin")} />
                      </button>
                      <button 
                        onClick={() => handleViewApiKey(kiosk)}
                        className="px-4 py-4 bg-white/5 hover:bg-amber-500/10 text-muted hover:text-amber-400 rounded-2xl transition-all cursor-pointer"
                        title="View API Key"
                      >
                        <Key className="w-5 h-5" />
                      </button>
                      {['admin', 'Admin Mitra', 'Super Admin', 'admin_mitra'].includes(role || '') && (
                        <button 
                          onClick={() => handleDeleteKiosk(kiosk.id, kiosk.name)}
                          className="px-4 py-4 bg-white/5 hover:bg-red-500/10 text-muted hover:text-red-400 rounded-2xl transition-all cursor-pointer"
                          title="Delete Kiosk"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
