import React, { useState, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronUp,
  ChevronDown,
  Settings, 
  Cpu, 
  DollarSign, 
  Palette, 
  Clock, 
  Image as ImageIcon,
  Save,
  Upload,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Camera,
  Printer,
  Volume2,
  Sun,
  Smartphone,
  CreditCard,
  History,
  Download,
  Filter,
  Smile,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Share2,
  Database,
  Terminal,
  Zap,
  RotateCcw,
  AlertCircle,
  X,
  Play,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useKiosks } from '../KioskContext';
import { useAuth } from '../components/AuthProvider';
import { PrinterConfiguration } from '../components/PrinterConfiguration';

interface KioskConfigPageProps {
  kiosk: any;
  onBack: () => void;
  onUpdate: (id: string, updates: any) => void;
}

// Legacy tab values remain typed for backwards-compatible saved state, but
// unfinished Photobooth-facing sections are intentionally not exposed here.
type TabType = 'hardware' | 'printer' | 'customization' | 'operasional' | 'gallery' | 'display' | 'pricing' | 'branding';

export const KioskConfigPage: React.FC<KioskConfigPageProps> = ({ kiosk, onBack, onUpdate }) => {
  const DEFAULT_CONFIG = {
    brightness: 80,
    volume: 50,
    maintenanceMode: false,
    camera: { resolution: '1080p', exposure: 'auto' },
    printer: { size: '4x6', quality: 'high' },
    price: 35000,
    duration: 5,
    photosPerSession: 4,
    paymentModes: { cash: true, qris: true, card: false },
    operatingHours: { open: '09:00', close: '22:00' },
    autoRestart: '03:00',
    notifications: { email: 'admin@uniinside.com' },
    orientation: 'portrait',
    resolution: '1080x1920',
    aspectRatio: '9:16'
  };

  const [activeTab, setActiveTab] = useState<TabType>('hardware');
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const idleScreenInputRef = useRef<HTMLInputElement>(null);
  const brandLogoInputRef = useRef<HTMLInputElement>(null);

  const { kiosks, updateKiosk: ctxUpdateKiosk } = useKiosks();

  const REPOSITORY_FILTERS = [
    { id: 'f-orig', name: 'Original', active: true, desc: 'Original capture with no modifications.', cssFilter: 'none', preview: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=400&fit=crop&q=80' },
    { id: 'f-bw', name: 'Black & White', active: true, desc: 'Timeless grayscale aesthetic with deep shadows.', cssFilter: 'grayscale(100%) contrast(120%)', preview: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&h=400&fit=crop&q=80' },
    { id: 'f-vintage', name: 'Vintage', active: true, desc: 'Warm, faded film color tones of the 90s.', cssFilter: 'sepia(45%) contrast(95%) brightness(105%) saturate(85%)', preview: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=400&fit=crop&q=80' },
    { id: 'f-warm', name: 'Warm Tone', active: true, desc: 'Enhanced saturation and sun-kissed cozy vibes.', cssFilter: 'saturate(130%) contrast(105%) sepia(15%)', preview: 'https://images.unsplash.com/photo-1481349518771-20055b2a7b24?w=300&h=400&fit=crop&q=80' },
    { id: 'f-cool', name: 'Cool Tone', active: true, desc: 'Fresh cold shift with blue and cyan hues.', cssFilter: 'hue-rotate(180deg) saturate(105%) brightness(102%)', preview: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&h=400&fit=crop&q=80' },
    { id: 'f-cinema', name: 'Cinematic', active: true, desc: 'Moody film tones and bold spotlight contrast.', cssFilter: 'contrast(125%) saturate(110%) brightness(95%)', preview: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=400&fit=crop&q=80' }
  ];

  const [initialConfig, setInitialConfig] = useState(() => {
    const existing = kiosk.config || {};
    const hasNewFilters = existing.filters && 
                         existing.filters.length === 6 && 
                         existing.filters.some((f: any) => f.id.startsWith('f-'));
    const resolvedFilters = hasNewFilters ? existing.filters : REPOSITORY_FILTERS;

    return {
      ...DEFAULT_CONFIG,
      ...existing,
      camera: { ...DEFAULT_CONFIG.camera, ...(existing.camera || {}) },
      printer: { ...DEFAULT_CONFIG.printer, ...(existing.printer || {}) },
      paymentModes: { ...DEFAULT_CONFIG.paymentModes, ...(existing.paymentModes || {}) },
      operatingHours: { ...DEFAULT_CONFIG.operatingHours, ...(existing.operatingHours || {}) },
      notifications: { ...DEFAULT_CONFIG.notifications, ...(existing.notifications || {}) },
      filters: resolvedFilters,
      stickers: existing.stickers || [
        { id: '1', name: 'Smiling Sun', active: true, preview: 'https://cdn-icons-png.flaticon.com/512/3222/3222800.png' },
        { id: '2', name: 'Uni Crown', active: true, preview: 'https://cdn-icons-png.flaticon.com/512/1113/1113886.png' },
        { id: '3', name: 'Retro Frame', active: false, preview: 'https://cdn-icons-png.flaticon.com/512/13/13359.png' },
        { id: '4', name: 'Cool Shades', active: true, preview: 'https://cdn-icons-png.flaticon.com/512/2853/2853755.png' }
      ],
      branding: {
        watermark: null,
        idleScreen: null,
        brandName: kiosk.name || 'UniSmiles',
        brandLogo: null,
        navStyle: 'normal',
        ...(existing.branding || {})
      },
      // kiosks.base_price adalah nominal yang dipakai photobooth, jadi Admin
      // harus menampilkan angka itu, bukan default lokal.
      price: Number(kiosk.base_price) > 0 ? Number(kiosk.base_price) : (existing.price ?? DEFAULT_CONFIG.price)
    };
  });
  const [activeConfig, setActiveConfig] = useState(initialConfig);

  const { role } = useAuth();
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncSelectedKiosks, setSyncSelectedKiosks] = useState<string[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const moveFilter = (index: number, direction: 'up' | 'down') => {
    const newFilters = [...activeConfig.filters];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFilters.length) return;

    const temp = newFilters[index];
    newFilters[index] = newFilters[targetIndex];
    newFilters[targetIndex] = temp;

    handleConfigChange({ filters: newFilters });
  };

  const handleSyncToAll = async () => {
    try {
      const promises = kiosks
        .filter((k: any) => k.id !== kiosk.id)
        .map((k: any) => ctxUpdateKiosk(k.id, {
          config: {
            ...(k.config || {}),
            filters: activeConfig.filters
          }
        }));
      await Promise.all(promises);
      toast.success("Photo filters successfully synced to all kiosks!");
    } catch (err) {
      console.error("Failed to sync filters:", err);
      toast.error("Failed to sync filters to other kiosks.");
    }
  };

  const handleSyncOrientationToAll = async () => {
    try {
      const promises = kiosks
        .filter((k: any) => k.id !== kiosk.id)
        .map((k: any) => ctxUpdateKiosk(k.id, {
          config: {
            ...(k.config || {}),
            orientation: activeConfig.orientation,
            resolution: activeConfig.resolution,
            aspectRatio: activeConfig.aspectRatio
          }
        }));
      await Promise.all(promises);
      toast.success("Display orientation successfully synced to all kiosks!");
      setIsSyncModalOpen(false);
    } catch (err) {
      console.error("Failed to sync orientation:", err);
      toast.error("Failed to sync orientation to all kiosks.");
    }
  };

  const handleSyncOrientationToSelected = async () => {
    if (syncSelectedKiosks.length === 0) {
      toast.error("Please select at least one kiosk.");
      return;
    }
    try {
      const promises = syncSelectedKiosks.map((kid: string) => {
        const k = kiosks.find(kiosk => kiosk.id === kid);
        if (!k) return Promise.resolve();
        return ctxUpdateKiosk(kid, {
          config: {
            brightness: k.config?.brightness ?? 80,
            volume: k.config?.volume ?? 50,
            maintenanceMode: k.config?.maintenanceMode ?? false,
            ...(k.config || {}),
            orientation: activeConfig.orientation,
            resolution: activeConfig.resolution,
            aspectRatio: activeConfig.aspectRatio
          }
        });
      });
      await Promise.all(promises);
      toast.success(`Display orientation successfully synced to ${syncSelectedKiosks.length} kiosks!`);
      setIsSyncModalOpen(false);
      setSyncSelectedKiosks([]);
    } catch (err) {
      console.error("Failed to sync orientation to selected:", err);
      toast.error("Failed to sync orientation to selected kiosks.");
    }
  };

  // Deep comparison to check for changes
  const checkIsDirty = (newConfig: any) => {
    return JSON.stringify(newConfig) !== JSON.stringify(initialConfig);
  };

  const handleConfigChange = (updates: any) => {
    const newConfig = { ...activeConfig, ...updates };
    setActiveConfig(newConfig);
    setIsDirty(checkIsDirty(newConfig));
  };

  const handleFileUpload = (file: File, type: 'watermark' | 'idleScreen' | 'brandLogo') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (type === 'watermark') {
        handleConfigChange({ branding: { ...activeConfig.branding, watermark: url } });
      } else if (type === 'brandLogo') {
        handleConfigChange({ branding: { ...activeConfig.branding, brandLogo: url } });
      } else {
        const fileType = file.type.startsWith('video/') ? 'video' : 'image';
        handleConfigChange({ 
          branding: { 
            ...activeConfig.branding, 
            idleScreen: { type: fileType, url, fileName: file.name } 
          } 
        });
      }
      toast.success(`${type === 'watermark' ? 'Watermark' : type === 'brandLogo' ? 'Brand Logo' : 'Welcome screen'} updated!`);
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent, type: 'watermark' | 'idleScreen' | 'brandLogo') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (type === 'watermark' && !file.type.includes('png')) {
        toast.error('Gunakan format PNG transparan untuk Watermark.');
        return;
      }
      handleFileUpload(file, type);
    }
  };

  const handleSave = () => {
    // Harga di tab Pricing harus ikut tersimpan ke kiosks.base_price, karena
    // angka itulah yang dipakai photobooth saat membuat sesi.
    onUpdate(kiosk.id, { config: activeConfig, base_price: Number(activeConfig.price) || 0 });
    setInitialConfig(activeConfig);
    setIsDirty(false);
    toast.success('Konfigurasi berhasil diperbarui');
  };

  const handleBack = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onBack();
    }
  };

  const tabs = [
    { id: 'hardware', label: 'Hardware', icon: Cpu },
    { id: 'printer', label: 'Printer Configuration', icon: Printer },
    { id: 'pricing', label: 'Pricing & Session', icon: DollarSign },
    { id: 'operasional', label: 'Operasional', icon: Clock },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 relative">
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={watermarkInputRef} 
        className="hidden" 
        accept="image/png"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'watermark')}
      />
      <input 
        type="file" 
        ref={idleScreenInputRef} 
        className="hidden" 
        accept="image/*,video/mp4"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'idleScreen')}
      />
      <input 
        type="file" 
        ref={brandLogoInputRef} 
        className="hidden" 
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'brandLogo')}
      />

      {/* Dirty State Warning Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md p-10 bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-8">
                <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-xl">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black tracking-tighter uppercase">Unsaved Changes</h3>
                  <p className="text-sm text-muted font-bold leading-relaxed max-w-[280px]">
                    Anda memiliki perubahan yang belum disimpan. Tetap keluar?
                  </p>
                </div>
                <div className="flex flex-col gap-3 w-full">
                  <button 
                    onClick={() => setShowExitConfirm(false)}
                    className="w-full py-4 bg-white/5 hover:bg-white/10 text-foreground rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={onBack}
                    className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-500/20"
                  >
                    Keluar Tanpa Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breadcrumbs & Header */}
      <div className="flex flex-col gap-6">
        <nav className="flex items-center gap-3 text-[10px] font-black text-muted uppercase tracking-[0.2em]">
          <button onClick={handleBack} className="hover:text-primary transition-colors">Kiosks</button>
          <span className="opacity-20">/</span>
          <span className="opacity-50">{kiosk.name}</span>
          <span className="opacity-20">/</span>
          <span className="text-primary">Config</span>
        </nav>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <button 
              onClick={handleBack}
              className="p-4 bg-[#1E293B] hover:bg-white/10 rounded-2xl transition-all border border-white/5 shadow-xl group"
            >
              <ChevronLeft className="w-7 h-7 text-muted group-hover:text-primary transition-colors" />
            </button>
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Configuration</h1>
              <p className="text-muted text-sm font-bold mt-2 uppercase tracking-widest">
                Editing <span className="text-primary">{kiosk.name}</span> — {kiosk.location}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 p-2 bg-[#1E293B] rounded-3xl border border-white/5 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "flex items-center gap-4 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                isActive 
                  ? "bg-primary text-[#10172A] shadow-xl shadow-primary/5" 
                  : "text-muted hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-[#10172A]" : "text-muted")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-[#1E293B] border border-white/5 p-10 rounded-[3rem] shadow-2xl min-h-[500px]">
        <AnimatePresence mode="wait">
          {activeTab === 'printer' && (
            <motion.div
              key="printer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PrinterConfiguration kiosk={kiosk} />
            </motion.div>
          )}
          {activeTab === 'hardware' && (
            <motion.div 
              key="hardware"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <Smartphone className="w-4 h-4" /> Device Controls
                  </h3>
                  
                  <div className="space-y-10">
                    <div className="space-y-5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-3">
                          <Sun className="w-4 h-4" /> Brightness
                        </label>
                        <span className="text-xl font-black tracking-tighter text-foreground">{activeConfig.brightness}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={activeConfig.brightness}
                        onChange={(e) => handleConfigChange({ brightness: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-black/30 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                    </div>

                    <div className="space-y-5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-3">
                          <Volume2 className="w-4 h-4" /> Audio Volume
                        </label>
                        <span className="text-xl font-black tracking-tighter text-foreground">{activeConfig.volume}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={activeConfig.volume}
                        onChange={(e) => handleConfigChange({ volume: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-black/30 rounded-full appearance-none cursor-pointer accent-primary/60"
                      />
                    </div>
                    
                    <div className="group flex items-center justify-between p-6 bg-black/20 rounded-3xl border border-white/5 transition-all hover:border-primary/20">
                      <div className="space-y-1">
                        <p className="text-base font-black uppercase tracking-tight">Maintenance Mode</p>
                        <p className="text-[9px] text-muted font-black uppercase tracking-widest">Disable user frontend Interaction</p>
                      </div>
                      <button 
                        onClick={() => handleConfigChange({ maintenanceMode: !activeConfig.maintenanceMode })}
                        className={cn(
                          "w-14 h-7 rounded-full transition-all relative",
                          activeConfig.maintenanceMode ? "bg-primary" : "bg-white/10"
                        )}
                      >
                        <motion.div 
                          animate={{ x: activeConfig.maintenanceMode ? 32 : 4 }}
                          className="absolute top-1 w-5 h-5 bg-[#10172A] rounded-full shadow-lg"
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <Camera className="w-4 h-4" /> Peripherals
                  </h3>
                  
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Resolution</label>
                        <select 
                          value={activeConfig.camera.resolution}
                          onChange={(e) => handleConfigChange({ camera: {...activeConfig.camera, resolution: e.target.value}})}
                          className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-[10px] uppercase tracking-widest appearance-none text-foreground"
                        >
                          <option value="1080p">Full HD 1080p</option>
                          <option value="4k">Ultra HD 4K</option>
                          <option value="720p">HD 720p</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Paper Size</label>
                        <select 
                          value={activeConfig.printer.size}
                          onChange={(e) => handleConfigChange({ printer: {...activeConfig.printer, size: e.target.value}})}
                          className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-[10px] uppercase tracking-widest appearance-none text-foreground"
                        >
                          <option value="4x6">4x6 Standard</option>
                          <option value="Strip">Photo Strip</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="p-8 bg-black/20 rounded-3xl border border-white/5 space-y-10">
                      <div className="space-y-5">
                        <div className="flex justify-between items-center text-[10px] font-black text-muted uppercase tracking-widest">
                          <span className="flex items-center gap-3">
                            <Printer className="w-4 h-4 text-primary/40" /> Ink Level
                          </span>
                          <span className="text-foreground">{kiosk.health?.printerInk || 0}%</span>
                        </div>
                        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-1000",
                              (kiosk.health?.printerInk || 0) > 50 ? "bg-primary" : 
                              (kiosk.health?.printerInk || 0) > 20 ? "bg-amber-400" : "bg-red-500"
                            )} 
                            style={{ width: `${kiosk.health?.printerInk || 0}%` }} 
                          />
                        </div>
                      </div>

                      <div className="space-y-5 pt-10 border-t border-white/5">
                        <div className="flex justify-between items-center text-[10px] font-black text-muted uppercase tracking-widest">
                          <span className="flex items-center gap-3">
                            <Database className="w-4 h-4 text-primary/40" /> Paper Status
                          </span>
                          <span className="text-foreground">75% Capacity</span>
                        </div>
                        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-1000 shadow-xl shadow-emerald-500/10" 
                            style={{ width: '75%' }} 
                          />
                        </div>
                        <p className="text-[9px] font-black text-muted tracking-widest uppercase text-center italic">
                          Approx. 150 prints remaining
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'pricing' && (
            <motion.div 
              key="pricing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-16"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <DollarSign className="w-4 h-4" /> Session & Pricing
                  </h3>
                  
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Harga Dasar Kiosk (IDR) — hanya dipakai frame tanpa harga</label>
                      <div className="relative group">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-muted text-sm group-focus-within:text-primary transition-colors">Rp</span>
                        <input 
                          type="number"
                          value={activeConfig.price}
                          onChange={(e) => handleConfigChange({ price: parseInt(e.target.value) })}
                          className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-primary/40 font-black text-lg tracking-tighter text-foreground transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Session Length</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={activeConfig.duration}
                            onChange={(e) => handleConfigChange({ duration: parseInt(e.target.value) })}
                            className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-lg tracking-tighter text-foreground"
                          />
                          <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted uppercase tracking-widest pointer-events-none">Min</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Photos Capture</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={activeConfig.photosPerSession}
                            onChange={(e) => handleConfigChange({ photosPerSession: parseInt(e.target.value) })}
                            className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-lg tracking-tighter text-foreground"
                          />
                          <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted uppercase tracking-widest pointer-events-none">Shot</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <CreditCard className="w-4 h-4" /> Payments
                  </h3>
                  
                  <div className="space-y-4">
                    {[
                      { id: 'cash', label: 'Cash Payment', desc: 'bill acceptor hardware' },
                      { id: 'qris', label: 'QRIS Dynamic', desc: 'automated digital scanning' },
                      { id: 'card', label: 'EDC / Credit Card', desc: 'external terminal required' }
                    ].map((mode) => {
                      const isEnabled = (activeConfig.paymentModes as any)[mode.id];
                      return (
                        <div key={mode.id} className="flex items-center justify-between p-6 bg-black/20 rounded-3xl border border-white/5 transition-all hover:border-primary/20">
                          <div>
                            <p className="text-base font-black uppercase tracking-tight">{mode.label}</p>
                            <p className="text-[9px] text-muted font-black uppercase tracking-widest">{mode.desc}</p>
                          </div>
                          <button 
                            onClick={() => handleConfigChange({ paymentModes: {...activeConfig.paymentModes, [mode.id]: !isEnabled}})}
                            className={cn(
                              "w-14 h-7 rounded-full transition-all relative",
                              isEnabled ? "bg-primary" : "bg-white/10"
                            )}
                          >
                            <motion.div 
                              animate={{ x: isEnabled ? 32 : 4 }}
                              className="absolute top-1 w-5 h-5 bg-[#10172A] rounded-full"
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'customization' && (
            <motion.div 
              key="customization"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-16"
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                {/* Photo Filters Section */}
                <div className="xl:col-span-2 space-y-10">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 flex items-center gap-3">
                      <Filter className="w-4 h-4" /> Interactive Filters
                    </h3>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={handleSyncToAll}
                        className="px-6 py-2.5 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#D2C7B8]/10 hover:text-[#D2C7B8] transition-all flex items-center gap-3 cursor-pointer"
                      >
                        <Share2 className="w-4 h-4" /> Sync to All
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {activeConfig.filters.map((filter: any, idx: number) => (
                      <div key={filter.id} className="group relative flex flex-col bg-black/20 rounded-[2rem] border border-white/5 hover:border-primary/40 transition-all overflow-hidden shadow-xl">
                        <div className="relative aspect-[4/3] overflow-hidden">
                          <img 
                            src={filter.preview} 
                            alt={filter.name}
                            className={cn(
                              "w-full h-full object-cover transition-all duration-1000 group-hover:scale-110",
                              !filter.active && "brightness-50 opacity-40"
                            )}
                            style={{ filter: filter.cssFilter }}
                          />
                          
                          {/* Reordering Controls */}
                          <div className="absolute top-4 left-4 flex gap-1 z-20">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveFilter(idx, 'up')}
                              className="p-1.5 bg-black/60 hover:bg-primary hover:text-[#10172A] disabled:opacity-30 disabled:hover:bg-black/60 disabled:hover:text-muted rounded-lg transition-colors border border-white/10 text-white cursor-pointer"
                              title="Pindahkan ke Atas"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === activeConfig.filters.length - 1}
                              onClick={() => moveFilter(idx, 'down')}
                              className="p-1.5 bg-black/60 hover:bg-primary hover:text-[#10172A] disabled:opacity-30 disabled:hover:bg-black/60 disabled:hover:text-muted rounded-lg transition-colors border border-white/10 text-white cursor-pointer"
                              title="Pindahkan ke Bawah"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="absolute top-4 right-4 z-20">
                            <button 
                              onClick={() => handleConfigChange({
                                filters: activeConfig.filters.map((f: any) => f.id === filter.id ? {...f, active: !f.active} : f)
                              })}
                              className={cn(
                                "w-12 h-6 rounded-full transition-all relative backdrop-blur-md border border-white/20 cursor-pointer",
                                filter.active ? "bg-primary" : "bg-black/40"
                              )}
                            >
                              <motion.div 
                                animate={{ x: filter.active ? 26 : 4 }}
                                className="absolute top-1 w-4 h-4 bg-white rounded-full"
                              />
                            </button>
                          </div>
                        </div>
 
                        <div className="p-6 space-y-2 bg-[#1E293B]/50 backdrop-blur-sm flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-base font-black uppercase tracking-tight text-foreground">{filter.name}</h4>
                            <p className="text-[9px] text-muted font-black uppercase tracking-widest leading-relaxed mt-1">
                              {filter.desc}
                            </p>
                          </div>
                          <code className="block mt-4 p-2 bg-black/40 rounded-lg text-[9px] text-primary/80 font-mono truncate border border-white/5">
                            {filter.cssFilter}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stickers Section */}
                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 flex items-center gap-3">
                    <Smile className="w-4 h-4" /> Sticker Assets
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-6">
                    {activeConfig.stickers.map((sticker: any) => (
                      <div key={sticker.id} className="group relative flex flex-col bg-black/20 rounded-[2rem] border border-white/5 hover:border-primary/40 transition-all overflow-hidden shadow-xl">
                        <div className="relative aspect-square p-10 flex items-center justify-center bg-[#000000] overflow-hidden">
                          <img 
                            src={sticker.preview} 
                            alt={sticker.name}
                            className={cn(
                              "max-w-[70%] max-h-[70%] object-contain transition-all duration-700 group-hover:scale-125 group-hover:rotate-6 drop-shadow-2xl z-10",
                              !sticker.active && "grayscale opacity-20"
                            )}
                          />
                          <div className="absolute top-4 right-4 z-20">
                            <button 
                              onClick={() => handleConfigChange({
                                stickers: activeConfig.stickers.map((s: any) => s.id === sticker.id ? {...s, active: !s.active} : s)
                              })}
                              className={cn(
                                "w-10 h-5 rounded-full transition-all relative border border-white/10 backdrop-blur-md",
                                sticker.active ? "bg-primary" : "bg-black/60"
                              )}
                            >
                              <motion.div 
                                animate={{ x: sticker.active ? 22 : 4 }}
                                className="absolute top-1 w-3 h-3 bg-[#10172A] rounded-full"
                              />
                            </button>
                          </div>
                        </div>
                        <div className="p-5 text-center bg-[#1E293B]/50">
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-muted group-hover:text-foreground transition-colors">{sticker.name}</h4>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Branding Section */}
                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4" /> Branding & UI Assets
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Watermark Section */}
                    <div className="space-y-6">
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Photo Watermark</p>
                      <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-6">
                        <div 
                          onClick={() => watermarkInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleFileDrop(e, 'watermark')}
                          className={cn(
                            "aspect-square max-w-[200px] mx-auto bg-[#10172A] rounded-3xl border-4 border-dashed flex flex-col items-center justify-center gap-4 group transition-all cursor-pointer overflow-hidden relative",
                            activeConfig.branding.watermark ? "border-primary/40 shadow-2xl shadow-primary/5" : "border-white/5 hover:border-primary/40"
                          )}
                        >
                          {activeConfig.branding.watermark ? (
                            <>
                              <img src={activeConfig.branding.watermark} className="max-w-[80%] max-h-[80%] object-contain" alt="Watermark" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfigChange({ branding: { ...activeConfig.branding, watermark: null }});
                                  }}
                                  className="p-3 bg-red-500 text-white rounded-2xl hover:scale-110 transition-transform"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-muted group-hover:text-primary transition-all group-hover:scale-110" />
                              <span className="text-[8px] font-black text-muted uppercase tracking-widest px-4 text-center">PNG Only</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Idle Screen Section */}
                    <div className="space-y-6">
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Idle Screen Media</p>
                      <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-6">
                        <div 
                          onClick={() => idleScreenInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleFileDrop(e, 'idleScreen')}
                          className={cn(
                            "aspect-video bg-[#10172A] rounded-3xl border-4 border-dashed flex flex-col items-center justify-center gap-4 group transition-all cursor-pointer overflow-hidden relative",
                            activeConfig.branding.idleScreen && activeConfig.branding.idleScreen.url ? "border-primary/40 shadow-2xl shadow-primary/5" : "border-white/5 hover:border-primary/40"
                          )}
                        >
                          {activeConfig.branding.idleScreen && activeConfig.branding.idleScreen.url ? (
                            <>
                              {activeConfig.branding.idleScreen.type === 'image' ? (
                                <img src={activeConfig.branding.idleScreen.url} className="w-full h-full object-cover" alt="Idle Screen" />
                              ) : (
                                <div className="w-full h-full bg-black flex flex-col items-center justify-center relative p-8 text-center">
                                  <Play className="w-12 h-12 text-primary fill-primary mb-2" />
                                  <p className="max-w-xs text-[10px] font-black text-white uppercase tracking-widest truncate">
                                    {activeConfig.branding.idleScreen.fileName || 'Standby Video'}
                                  </p>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfigChange({ branding: { ...activeConfig.branding, idleScreen: null }});
                                  }}
                                  className="p-3 bg-red-500 text-white rounded-2xl hover:scale-110 transition-transform"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-muted group-hover:text-primary transition-all group-hover:scale-110" />
                              <p className="text-[8px] font-black text-muted uppercase tracking-widest">Upload Video/Image</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'branding' && (
            <motion.div 
              key="branding"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-10">
                  {/* Brand Identity */}
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 flex items-center gap-3">
                      <Palette className="w-4 h-4" /> Brand Identity
                    </h3>

                    <div className="space-y-6 bg-black/20 p-8 rounded-[2.5rem] border border-white/5">
                      {/* Brand / Event Name */}
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Brand / Event Name</label>
                        <input 
                          type="text" 
                          value={activeConfig.branding?.brandName || ''}
                          onChange={(e) => handleConfigChange({ 
                            branding: { ...activeConfig.branding, brandName: e.target.value } 
                          })}
                          placeholder="e.g. Kafe Senja, Wedding Expo 2026"
                          className="w-full bg-[#10172A] border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-bold text-sm text-foreground transition-all"
                        />
                      </div>

                      {/* Logo Upload */}
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Logo Upload</label>
                        <div 
                          onClick={() => brandLogoInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleFileDrop(e, 'brandLogo')}
                          className={cn(
                            "aspect-square max-w-[200px] bg-[#10172A] rounded-3xl border-4 border-dashed flex flex-col items-center justify-center gap-4 group transition-all cursor-pointer overflow-hidden relative",
                            activeConfig.branding?.brandLogo ? "border-primary/40 shadow-2xl shadow-primary/5" : "border-white/5 hover:border-primary/40"
                          )}
                        >
                          {activeConfig.branding?.brandLogo ? (
                            <>
                              <img src={activeConfig.branding.brandLogo} className="max-w-[80%] max-h-[80%] object-contain" alt="Brand Logo" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfigChange({ branding: { ...activeConfig.branding, brandLogo: null }});
                                  }}
                                  className="p-3 bg-red-500 text-white rounded-2xl hover:scale-110 transition-transform cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-muted group-hover:text-primary transition-all group-hover:scale-110" />
                              <span className="text-[8px] font-black text-muted uppercase tracking-widest px-4 text-center">Click or Drag Image</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interface Style */}
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 flex items-center gap-3">
                      <Smartphone className="w-4 h-4" /> Interface Style
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-black/20 p-8 rounded-[2.5rem] border border-white/5">
                      <button 
                        type="button"
                        onClick={() => handleConfigChange({ branding: { ...activeConfig.branding, navStyle: 'normal' } })}
                        className={cn(
                          "p-6 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                          (activeConfig.branding?.navStyle || 'normal') === 'normal' 
                            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(255,140,102,0.1)]" 
                            : "border-white/5 hover:border-white/10 bg-[#10172A]"
                        )}
                      >
                        <div className="font-bold text-foreground text-sm">Normal UI</div>
                        <div className="text-[10px] text-muted mt-2 leading-relaxed uppercase font-black tracking-wider">
                          Standard touchscreen controls. Classic layout.
                        </div>
                        {(activeConfig.branding?.navStyle || 'normal') === 'normal' && (
                          <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />
                        )}
                      </button>

                      <button 
                        type="button"
                        onClick={() => handleConfigChange({ branding: { ...activeConfig.branding, navStyle: 'air-touch' } })}
                        className={cn(
                          "p-6 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                          activeConfig.branding?.navStyle === 'air-touch' 
                            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(255,140,102,0.1)]" 
                            : "border-white/5 hover:border-white/10 bg-[#10172A]"
                        )}
                      >
                        <div className="font-bold text-foreground text-sm">Air Touch UI</div>
                        <div className="text-[10px] text-muted mt-2 leading-relaxed uppercase font-black tracking-wider">
                          Large buttons, gesture hints, optimized for contactless interaction.
                        </div>
                        {activeConfig.branding?.navStyle === 'air-touch' && (
                          <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="space-y-6 flex flex-col">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 flex items-center gap-3">
                    <Monitor className="w-4 h-4" /> Kiosk UI Preview
                  </h3>

                  <div className="flex-1 bg-black/40 border border-white/5 rounded-[2.5rem] p-8 flex items-center justify-center min-h-[400px]">
                    <div className="w-[280px] h-[480px] bg-[#0F172A] border-4 border-slate-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-between p-6">
                      
                      {/* Notch */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4 bg-slate-800 rounded-b-2xl z-20" />

                      {/* Header Area */}
                      <div className="flex items-center gap-3 pt-2 z-10">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
                          {activeConfig.branding?.brandLogo ? (
                            <img src={activeConfig.branding.brandLogo} alt="Logo" className="w-full h-full object-contain" />
                          ) : (
                            <Smile className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-black uppercase tracking-widest text-primary truncate leading-none">
                            {activeConfig.branding?.brandName || 'UNI-SMILE'}
                          </p>
                          <p className="text-[6px] text-muted uppercase tracking-wider leading-none mt-1">Photo Kiosk Booth</p>
                        </div>
                      </div>

                      {/* Capture Screen Mock */}
                      <div className="flex-1 my-4 bg-black/60 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative p-4 overflow-hidden">
                        {/* Live camera simulator */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                        <Camera className="w-8 h-8 text-white/30 animate-pulse" />
                        <span className="text-[8px] text-white/30 uppercase tracking-widest font-black mt-2">Camera Feed</span>
                        
                        {/* Watermark preview simulation if exists */}
                        {activeConfig.branding?.watermark && (
                          <div className="absolute bottom-2 right-2 w-10 h-10 bg-white/10 border border-white/20 rounded p-1 flex items-center justify-center">
                            <img src={activeConfig.branding.watermark} className="w-full h-full object-contain opacity-55" alt="Watermark preview" />
                          </div>
                        )}
                      </div>

                      {/* Control Area */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[7px] text-muted uppercase tracking-wider font-bold">
                          <span>Ready to Capture</span>
                          <span>Rp {activeConfig.price?.toLocaleString()}</span>
                        </div>

                        {activeConfig.branding?.navStyle === 'air-touch' ? (
                          /* Air Touch Mock */
                          <div className="space-y-2">
                            <div className="w-full py-3 bg-primary text-[#0F172A] font-black text-[9px] uppercase tracking-widest text-center rounded-xl shadow-[0_0_15px_rgba(255,140,102,0.3)] animate-pulse">
                              🖐️ Wave to Start
                            </div>
                            <div className="w-full py-2 bg-white/5 border border-white/10 text-white font-black text-[8px] uppercase tracking-widest text-center rounded-xl">
                              Tap to Start (Backup)
                            </div>
                          </div>
                        ) : (
                          /* Normal Touch Mock */
                          <div className="grid grid-cols-2 gap-2">
                            <div className="w-full py-2 bg-primary text-[#0F172A] font-black text-[8px] uppercase tracking-widest text-center rounded-lg">
                              Start Session
                            </div>
                            <div className="w-full py-2 bg-white/5 border border-white/10 text-white font-black text-[8px] uppercase tracking-widest text-center rounded-lg">
                              Gallery
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bottom Bar indicator */}
                      <div className="w-20 h-1 bg-slate-800 rounded-full mx-auto mt-2" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'operasional' && (
            <motion.div 
              key="operasional"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-16"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <Clock className="w-4 h-4" /> Operational Hours
                  </h3>
                  
                  <div className="space-y-10">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Daily Opening</label>
                        <input 
                          type="time"
                          value={activeConfig.operatingHours.open}
                          onChange={(e) => handleConfigChange({ operatingHours: {...activeConfig.operatingHours, open: e.target.value}})}
                          className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-sm uppercase text-foreground appearance-none"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Daily Closing</label>
                        <input 
                          type="time"
                          value={activeConfig.operatingHours.close}
                          onChange={(e) => handleConfigChange({ operatingHours: {...activeConfig.operatingHours, close: e.target.value}})}
                          className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-sm uppercase text-foreground appearance-none"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-3">
                          <RefreshCw className="w-4 h-4" /> Auto-Restart Node
                        </label>
                        <span className="text-[8px] font-black text-primary border border-primary/20 bg-primary/5 px-3 py-1 rounded-full uppercase tracking-widest">Recommended 03:00 AM</span>
                      </div>
                      <input 
                        type="time"
                        value={activeConfig.autoRestart}
                        onChange={(e) => handleConfigChange({ autoRestart: e.target.value })}
                        className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-sm uppercase text-foreground appearance-none"
                      />
                    </div>

                    <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-8">
                      <div className="flex items-center gap-4">
                        <Terminal className="w-5 h-5 text-primary" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#F1F5F9]">Internal Node Actions</h4>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => toast.success('Sending restart signal...')}
                          className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all flex items-center justify-center gap-3"
                        >
                          <Zap className="w-4 h-4" /> Hard Restart Application
                        </button>
                        <button 
                          onClick={() => toast.success('Cloud cache purged')}
                          className="w-full py-4 bg-white/5 text-muted border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3"
                        >
                          <RotateCcw className="w-4 h-4" /> Flush Local Assets
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-10 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4" /> Smart Alerts
                  </h3>
                  
                  <div className="space-y-8">
                    <p className="text-[10px] font-black text-muted leading-relaxed uppercase tracking-[0.15em]">Automated status notifications for hardware health (Ink, Storage, Camera Pulse).</p>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Alert Recipient Email</label>
                      <input 
                        type="email"
                        value={activeConfig.notifications.email}
                        onChange={(e) => handleConfigChange({ notifications: { email: e.target.value }})}
                        className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-sm text-foreground transition-all"
                      />
                    </div>
                    
                    <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
                        <span className="text-[10px] font-black text-[#F1F5F9] uppercase tracking-[0.2em]">Monitoring Online</span>
                      </div>
                      <p className="text-[9px] text-muted font-black uppercase tracking-widest leading-loose">
                        Node is currently actively streaming health metrics via Secure WebSocket Tunnel.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 p-10 bg-black/20 rounded-[3rem] border border-white/5 shadow-2xl">
                <div className="flex items-center gap-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">Vault Storage</p>
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                    <div className="space-y-4">
                      <p className="text-3xl font-black tracking-tighter text-foreground">42.8 GB / 128 GB</p>
                      <div className="w-64 h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: '33.4%' }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="h-full bg-primary shadow-xl shadow-primary/20" 
                        />
                      </div>
                    </div>
                  </div>
                  <div className="h-16 w-px bg-white/10" />
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest">Global Captures</p>
                    <p className="text-3xl font-black tracking-tighter text-foreground">1,248</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <History className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <select className="w-full bg-black/30 border border-white/5 rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-primary/40 font-black text-[10px] uppercase tracking-[0.2em] appearance-none text-foreground cursor-pointer">
                      <option>Last 7 Business Days</option>
                      <option>Full Analytical Cycle</option>
                      <option>Annual Archive</option>
                    </select>
                  </div>
                  <button className="flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-muted hover:text-foreground">
                    <Download className="w-4 h-4" /> Export Node
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative aspect-[3/4] bg-[#10172A] rounded-[2rem] border border-white/5 overflow-hidden hover:border-primary/40 transition-all shadow-xl"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-white/5 group-hover:scale-110 transition-transform duration-700">
                      <ImageIcon className="w-16 h-16" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#10172A] to-transparent translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      <p className="text-[9px] font-black text-foreground uppercase tracking-widest">SMILE-{1000 + idx}</p>
                      <p className="text-[7px] text-muted font-black uppercase tracking-[0.2em] mt-1">20.04.26 / 14:32</p>
                    </div>
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-500 scale-90 group-hover:scale-100">
                      <button className="p-3 bg-black/60 backdrop-blur-md rounded-2xl hover:bg-primary transition-colors text-white hover:text-[#10172A] shadow-xl">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'display' && (
            <motion.div 
              key="display"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* Left Side: Controls & Display Information */}
                <div className="space-y-10">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-6 flex items-center gap-3">
                      <Monitor className="w-4 h-4" /> Monitor Orientation
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => handleConfigChange({ 
                          orientation: 'portrait',
                          resolution: '1080x1920',
                          aspectRatio: '9:16'
                        })}
                        className={cn(
                          "p-6 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                          activeConfig.orientation === 'portrait' 
                            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(255,184,0,0.15)]" 
                            : "border-white/10 hover:border-white/20 bg-white/5"
                        )}
                      >
                        <div className="font-black text-sm text-foreground uppercase tracking-wider mb-1">Portrait</div>
                        <div className="text-[9px] text-muted font-bold uppercase tracking-tight leading-relaxed">Mode Vertikal (Tegak). Cocok untuk Kios tipe ramping (tall).</div>
                        {activeConfig.orientation === 'portrait' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConfigChange({ 
                          orientation: 'landscape',
                          resolution: '1920x1080',
                          aspectRatio: '16:9'
                        })}
                        className={cn(
                          "p-6 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                          activeConfig.orientation === 'landscape' 
                            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(255,184,0,0.15)]" 
                            : "border-white/10 hover:border-white/20 bg-white/5"
                        )}
                      >
                        <div className="font-black text-sm text-foreground uppercase tracking-wider mb-1">Landscape</div>
                        <div className="text-[9px] text-muted font-bold uppercase tracking-tight leading-relaxed">Mode Horizontal (Mendatar). Cocok untuk Kios tipe lebar (wide).</div>
                        {activeConfig.orientation === 'landscape' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-6">
                    <h4 className="text-[9px] font-black text-muted uppercase tracking-[0.2em] ml-1">Display Information</h4>
                    <div className="divide-y divide-white/5">
                      <div className="py-3.5 flex justify-between items-center">
                        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Current Orientation</span>
                        <span className="text-sm font-black text-primary uppercase tracking-widest">{activeConfig.orientation}</span>
                      </div>
                      <div className="py-3.5 flex justify-between items-center">
                        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Standard Resolution</span>
                        <span className="text-sm font-black text-foreground">{activeConfig.resolution}</span>
                      </div>
                      <div className="py-3.5 flex justify-between items-center">
                        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Aspect Ratio</span>
                        <span className="text-sm font-black text-foreground">{activeConfig.aspectRatio}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sync Display Settings Section */}
                  <div className="pt-4">
                    {role === 'admin' ? (
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">Sync Configuration</h4>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdate(kiosk.id, { config: activeConfig });
                              setInitialConfig(activeConfig);
                              setIsDirty(false);
                              toast.success("Applied to current kiosk successfully!");
                            }}
                            className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-foreground text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer flex-1 animate-in fade-in"
                          >
                            Apply to Current
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const others = kiosks.filter((k: any) => k.id !== kiosk.id).map((k: any) => k.id);
                              setSyncSelectedKiosks(others);
                              setIsSyncModalOpen(true);
                            }}
                            className="px-6 py-4 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer flex-1 animate-in fade-in"
                          >
                            Apply to Selected
                          </button>
                          <button
                            type="button"
                            onClick={handleSyncOrientationToAll}
                            className="btn-primary flex-1 animate-in fade-in"
                          >
                            Sync to All
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 bg-black/10 border border-white/5 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-muted uppercase tracking-widest">Access Control</p>
                          <p className="text-[8px] text-muted/50 font-black uppercase tracking-tight mt-0.5">Role: Admin Mitra</p>
                        </div>
                        <span className="text-[9px] font-bold text-amber-500/80 bg-amber-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-amber-500/10 animate-in fade-in">
                          Single Kiosk Save Only
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Interactive Real-time Simulator Preview */}
                <div className="flex flex-col items-center justify-center p-8 bg-black/40 rounded-[3.5rem] border border-white/5 relative min-h-[400px]">
                  <div className="absolute top-6 left-8 text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">
                    Kiosk Display Preview
                  </div>
                  
                  {/* Mock Phone / Monitor Frame Wrapper */}
                  <div 
                    className={cn(
                      "bg-[#10172A] border-8 border-[#1E293B] rounded-[2.5rem] shadow-2xl flex flex-col items-center p-4 relative overflow-hidden transition-all duration-700 select-none",
                      activeConfig.orientation === 'portrait' 
                        ? "w-48 h-80" 
                        : "w-80 h-48"
                    )}
                  >
                    {/* Screen content */}
                    <div className="w-full h-full border border-white/5 rounded-2xl overflow-hidden flex flex-col justify-between p-3 bg-[#020617] relative">
                      {/* Grid background */}
                      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '6px 6px' }} />
                      
                      {/* Top status */}
                      <div className="flex justify-between items-center relative z-10">
                        <span className="text-[6px] font-black text-primary uppercase tracking-widest">UniSmiles Kiosk</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      </div>

                      {/* Mock template slot preview */}
                      <div className="flex-1 flex items-center justify-center py-2 relative z-10 w-full">
                        {activeConfig.orientation === 'portrait' ? (
                          /* Portrait stack of slots */
                          <div className="flex flex-col gap-1 w-full max-w-[60px] aspect-[1/3] border border-white/10 p-1 bg-black/60 rounded">
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 1</div>
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 2</div>
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 3</div>
                          </div>
                        ) : (
                          /* Landscape row of slots */
                          <div className="flex gap-1 w-full max-w-[120px] aspect-[3/1] border border-white/10 p-1 bg-black/60 rounded">
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 1</div>
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 2</div>
                            <div className="flex-1 bg-white/5 rounded flex items-center justify-center text-[5px] text-muted/50 font-black">PHOTO 3</div>
                          </div>
                        )}
                      </div>

                      {/* Footer label */}
                      <div className="text-center relative z-10">
                        <span className="text-[5px] font-black text-muted uppercase tracking-widest animate-pulse">Touch Screen to Start</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Base / stand of Kiosk Mock */}
                  <div className="w-16 h-2 bg-[#1E293B] rounded-t-lg mt-1 relative z-0" />
                  <div className="w-8 h-8 bg-gradient-to-b from-[#1E293B] to-transparent" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sync Selected Kiosks Modal */}
      <AnimatePresence>
        {isSyncModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setIsSyncModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#1E293B] border border-white/5 w-full max-w-md p-10 relative overflow-hidden rounded-[3rem] shadow-2xl z-10"
            >
              <button 
                onClick={() => setIsSyncModalOpen(false)}
                className="absolute top-8 right-8 text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-black tracking-tighter uppercase mb-6 flex items-center gap-2">
                <Share2 className="w-6 h-6 text-primary" />
                Sync Display Settings
              </h2>
              
              <p className="text-xs text-muted mb-6 leading-relaxed font-bold uppercase tracking-wide">
                Pilih kios yang ingin disinkronisasikan ke orientasi <span className="text-primary font-black">{activeConfig.orientation}</span> ({activeConfig.resolution}):
              </p>

              <div className="space-y-3 max-h-60 overflow-y-auto mb-8 pr-2 custom-scrollbar">
                {kiosks
                  .filter((k: any) => k.id !== kiosk.id)
                  .map((k: any) => {
                    const isChecked = syncSelectedKiosks.includes(k.id);
                    return (
                      <label 
                        key={k.id} 
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                          isChecked 
                            ? "bg-primary/5 border-primary/20 text-foreground" 
                            : "bg-white/5 border-transparent text-muted hover:text-foreground hover:bg-white/10"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSyncSelectedKiosks(syncSelectedKiosks.filter(id => id !== k.id));
                            } else {
                              setSyncSelectedKiosks([...syncSelectedKiosks, k.id]);
                            }
                          }}
                          className="hidden"
                        />
                        <div className={cn(
                          "w-4 h-4 rounded-lg border flex items-center justify-center transition-all",
                          isChecked ? "border-primary bg-primary/20" : "border-white/20"
                        )}>
                          {isChecked && <div className="w-2 h-2 rounded bg-primary" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-black uppercase tracking-wider">{k.name}</p>
                          <p className="text-[8px] font-bold text-muted/60 uppercase mt-0.5">{k.location}</p>
                        </div>
                      </label>
                    );
                  })}
                {kiosks.filter((k: any) => k.id !== kiosk.id).length === 0 && (
                  <p className="text-xs text-muted italic text-center py-6">Tidak ada kios lain terdaftar.</p>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setIsSyncModalOpen(false)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-foreground font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSyncOrientationToSelected}
                  className="btn-primary flex-1 py-4 animate-in fade-in"
                >
                  Apply Sync
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
