import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, Save, TestTube2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';

/**
 * Adapter yang bisa dipilih dari Admin.
 *
 * `thermal` untuk printer label termal (mis. NIIMBOT B1 Pro): lebar cetak
 * efektif 48 mm, tinggi 8-350 mm, dua warna (merah & hitam).
 */
const ADAPTERS = ['disabled', 'cups', 'windows', 'thermal', 'mock'] as const;

/** Preset ukuran foto lama — dipertahankan supaya konfigurasi yang ada tidak rusak. */
const PHOTO_PRESETS = [
  'Instax Mini (54 × 86 mm)', 'Polaroid 6 × 9 cm (2R)', '2 Strip 5 × 15 cm',
  '3 Strip 5 × 15 cm', '4 Strip 5 × 15 cm', '2×2 Grid 10 × 10 cm', '2×3 Grid 10 × 15 cm',
] as const;

/**
 * Preset termal. Semua lebarnya <= 48 mm supaya tidak terpotong printer label.
 * Angka tinggi mengikuti jumlah foto dalam satu strip.
 */
const THERMAL_PRESETS = [
  'Termal 40 × 60 mm (2 foto)',
  'Termal 40 × 90 mm (3 foto)',
  'Termal 40 × 120 mm (4 foto)',
  'Termal 48 × 150 mm (strip panjang)',
  'Termal 30 × 40 mm (label kecil)',
] as const;

const PAPER_SIZES = [...PHOTO_PRESETS, ...THERMAL_PRESETS] as const;

/** Batas printer termal, untuk memandu pengisian ukuran kustom. */
const THERMAL_LIMITS = { maxPrintWidthMm: 48, minHeightMm: 8, maxHeightMm: 350, dpi: 300 };

const ORIENTATIONS = ['portrait', 'landscape'] as const;

/** Pola ukuran kustom, sama dengan yang divalidasi backend. */
const CUSTOM_PATTERN = /^CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM$/i;

/**
 * Ukuran kustom yang diminta pengguna masih dalam batas printer termal?
 * Dipakai untuk memberi peringatan lebih awal di panel, supaya pengguna tidak
 * menyimpan ukuran yang pasti ditolak backend.
 */
function customSizeProblem(value: string): string | null {
  const match = String(value || '').trim().match(CUSTOM_PATTERN);
  if (!match) return 'Format: CUSTOM <lebar>X<tinggi> MM (contoh: CUSTOM 48X150 MM)';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > THERMAL_LIMITS.maxPrintWidthMm) {
    return `Lebar ${width} mm melebihi lebar cetak printer termal (${THERMAL_LIMITS.maxPrintWidthMm} mm)`;
  }
  if (height < THERMAL_LIMITS.minHeightMm || height > THERMAL_LIMITS.maxHeightMm) {
    return `Tinggi harus ${THERMAL_LIMITS.minHeightMm}-${THERMAL_LIMITS.maxHeightMm} mm (diminta ${height} mm)`;
  }
  return null;
}

type PrinterConfig = {
  printing_enabled: boolean;
  adapter: string;
  printer_name: string | null;
  paper_size: string;
  orientation: string;
  copies_limit: number;
  timeout_ms: number;
  retry_count: number;
  config_version: number;
  allowed_layouts?: string[];
};

const DEFAULT_CONFIG: PrinterConfig = {
  printing_enabled: false,
  adapter: 'disabled',
  printer_name: null,
  paper_size: 'Instax Mini (54 × 86 mm)',
  orientation: 'portrait',
  copies_limit: 1,
  timeout_ms: 60000,
  retry_count: 2,
  config_version: 1,
  allowed_layouts: [],
};

function errorMessage(error: any) {
  return error?.response?.data?.message || 'Printer configuration request failed.';
}

export const PrinterConfiguration: React.FC<{ kiosk: any }> = ({ kiosk }) => {
  const { role } = useAuth();
  const canEdit = ['Super Admin', 'Admin Mitra', 'admin', 'admin_mitra'].includes(role || '');
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [reported, setReported] = useState<any>(null);
  const [status, setStatus] = useState<any>({ pending: true, applied: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/kiosks/${encodeURIComponent(kiosk.id)}/printing-config`);
      const data = response.data?.data || {};
      const newConfig = { ...DEFAULT_CONFIG, ...(data.config || data) };
      const src = data.config || data;
      if ('enabled' in src) newConfig.printing_enabled = src.enabled;
      setConfig(newConfig);
      setReported(data.reported || null);
      setStatus(data.status || { pending: true, applied: false });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [kiosk.id]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const supportedAdapters = useMemo(() => new Set<string>(reported?.supported_adapters || []), [reported]);
  const availablePrinters = Array.isArray(reported?.available_printers) ? reported.available_printers : [];
  const isOnline = kiosk.status === 'online';
  const adapterSupported = config.adapter === 'disabled' || !isOnline || supportedAdapters.size === 0 || supportedAdapters.has(config.adapter);
  const canEnable = adapterSupported && Boolean(config.printer_name);
  const setField = (field: keyof PrinterConfig, value: any) => setConfig(current => ({ ...current, [field]: value }));

  // Ukuran kustom: pengguna mengetik sendiri lebar x tinggi. Draft disimpan
  // terpisah supaya teks yang sedang diketik tidak hilang saat belum valid.
  const isCustomSize = /^custom\s/i.test(String(config.paper_size || ''));
  const [customDraft, setCustomDraft] = useState<string>(isCustomSize ? config.paper_size : 'CUSTOM 48X150 MM');
  useEffect(() => { if (isCustomSize) setCustomDraft(config.paper_size); }, [isCustomSize, config.paper_size]);

  const customProblem = isCustomSize ? customSizeProblem(config.paper_size) : null;

  /**
   * Ukuran gambar dalam piksel untuk 300 dpi. Ditampilkan supaya jelas bahwa
   * ukuran kertas menentukan resolusi yang perlu dikirim ke printer — bukan
   * sekadar label.
   */
  const thermalPixels = useMemo(() => {
    const match = String(config.paper_size || '').match(/CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM/i);
    if (!match) return null;
    const px = (mm: number) => Math.round((mm / 25.4) * THERMAL_LIMITS.dpi);
    return `${px(Number(match[1]))} × ${px(Number(match[2]))} px`;
  }, [config.paper_size]);

  const handleToggle = () => {
    if (!config.printing_enabled) {
      if (!canEnable) {
        toast.error('Ketik atau pilih nama printer yang valid terlebih dahulu.');
        return;
      }
      setField('printing_enabled', true);
      return;
    }
    setConfig(current => ({ ...current, printing_enabled: false, adapter: 'disabled', printer_name: null }));
  };

  const handleSave = async () => {
    if (config.printing_enabled && !canEnable) {
      toast.error('Printing hanya dapat diaktifkan jika adapter dan printer valid tersedia.');
      return;
    }
    // Ukuran kustom yang di luar batas printer akan ditolak backend; tolak lebih
    // awal di panel supaya pengguna tidak menunggu request yang pasti gagal.
    if (isCustomSize && customProblem) {
      toast.error(customProblem);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        printing_enabled: config.printing_enabled,
        adapter: config.printing_enabled ? config.adapter : 'disabled',
        printer_name: config.printing_enabled ? config.printer_name : null,
        paper_size: config.paper_size,
        orientation: config.orientation,
        copies_limit: config.copies_limit,
        timeout_ms: config.timeout_ms,
        retry_count: config.retry_count,
        allowed_layouts: config.allowed_layouts,
      };
      const response = await api.put(`/admin/kiosks/${encodeURIComponent(kiosk.id)}/printing-config`, payload);
      const data = response.data?.data || {};
      const newConfig = { ...DEFAULT_CONFIG, ...(data.config || data) };
      const src = data.config || data;
      if ('enabled' in src) newConfig.printing_enabled = src.enabled;
      setConfig(newConfig);
      setReported(data.reported || null);
      setStatus(data.status || { pending: true, applied: false });
      toast.success(response.data?.message || 'Printer configuration saved.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post(`/admin/kiosks/${encodeURIComponent(kiosk.id)}/printing-config/refresh`);
      toast.success('Printer status refresh requested.');
      window.setTimeout(fetchConfig, 800);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleTestPrint = async () => {
    try {
      const response = await api.post(`/admin/kiosks/${encodeURIComponent(kiosk.id)}/printing-config/test`);
      toast.success(response.data?.message || 'Test print queued.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const fieldClass = 'w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-primary/50 text-foreground font-bold text-sm disabled:opacity-50';
  if (loading) return <div className="py-16 text-center text-muted text-xs font-black uppercase tracking-widest">Loading printer configuration…</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <Printer className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-black uppercase tracking-tight">Printer Configuration</h2>
          </div>
          <p className="text-xs text-muted font-bold mt-2">Konfigurasi desired dikirim ke Kiosk Agent. Backend tidak mencetak langsung.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || !isOnline}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {/* Status dot — hijau pulse saat online, abu gelap saat offline */}
            <span className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              isOnline ? 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-white/20'
            )} />
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh Printer Status
          </button>
          <button
            onClick={handleTestPrint}
            disabled={!canEdit || !isOnline || !config.printing_enabled || !status.applied}
            className="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {/* Status dot — hijau saat siap print, abu saat tidak bisa */}
            <span className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              (isOnline && config.printing_enabled && status.applied) ? 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-white/20'
            )} />
            <TestTube2 className="w-4 h-4" />
            Test Print
          </button>
        </div>
      </div>

      {!isOnline && <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold flex items-center gap-3"><WifiOff className="w-4 h-4" /> Kiosk offline. Perubahan tetap disimpan sebagai desired configuration dan dikirim saat reconnect.</div>}
      {isOnline && <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center gap-3"><Wifi className="w-4 h-4" /> Agent connected</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2 flex items-center justify-between p-5 rounded-2xl bg-black/20 border border-white/5">
          <div>
            <p className="text-sm font-black uppercase">Printing Enabled</p>
            <p className="text-[10px] text-muted font-bold mt-1">Aktif hanya jika adapter dan printer terdeteksi.</p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={!canEdit}
            className={cn(
              'w-14 h-8 rounded-full relative inline-flex items-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed',
              config.printing_enabled ? 'bg-emerald-500' : 'bg-white/10'
            )}
          >
            <span
              className={cn(
                'inline-block w-6 h-6 rounded-full transition-transform duration-300',
                config.printing_enabled
                  ? 'translate-x-7 bg-white shadow-md'
                  : 'translate-x-1 bg-white/50'
              )}
            />
          </button>
        </div>

        <label className="space-y-2"><span className="label">Adapter</span><select className={fieldClass} value={config.adapter} disabled={!canEdit} onChange={e => { const value = e.target.value; setConfig(current => ({ ...current, adapter: value, printer_name: value === 'disabled' ? null : current.printer_name, printing_enabled: value === 'disabled' ? false : current.printing_enabled })); }}>
          {ADAPTERS.map(adapter => <option key={adapter} value={adapter} disabled={adapter !== 'disabled' && supportedAdapters.size > 0 && !supportedAdapters.has(adapter)}>{adapter}{adapter !== 'disabled' && supportedAdapters.size > 0 && !supportedAdapters.has(adapter) ? ' (unsupported)' : ''}</option>)}
        </select></label>
        <label className="space-y-2"><span className="label">Printer</span>
          {isOnline && config.adapter !== 'mock' ? (
            <select className={fieldClass} value={config.printer_name || ''} disabled={!canEdit || config.adapter === 'disabled'} onChange={e => setField('printer_name', e.target.value || null)}>
              <option value="">Select detected printer</option>
              <option value="AUTO">🔍 AUTO — Deteksi printer otomatis</option>
              {availablePrinters.map((printer: any) => <option key={printer.name} value={printer.name}>{printer.name} — {printer.status || 'UNKNOWN'}</option>)}
              {config.printer_name && config.printer_name !== 'AUTO' && !availablePrinters.some((printer: any) => printer.name === config.printer_name) && <option value={config.printer_name}>{config.printer_name} (not currently reported)</option>}
            </select>
          ) : (
            <input type="text" className={fieldClass} placeholder="Ketik nama printer..." value={config.printer_name || ''} disabled={!canEdit || config.adapter === 'disabled'} onChange={e => setField('printer_name', e.target.value || null)} />
          )}
        </label>
        <label className="space-y-2">
          <span className="label">Paper Size</span>
          {/* Preset + opsi ukuran kustom. Saat "custom" dipilih, muncul kolom
              untuk mengisi lebar x tinggi dalam mm; batas printer termal
              ditampilkan supaya tidak menyimpan ukuran yang pasti ditolak. */}
          <select
            className={fieldClass}
            value={isCustomSize ? '__custom__' : config.paper_size}
            disabled={!canEdit}
            onChange={e => {
              const value = e.target.value;
              if (value === '__custom__') { setField('paper_size', customDraft || 'CUSTOM 48X150 MM'); return; }
              setField('paper_size', value);
            }}
          >
            <optgroup label="Foto (printer tinta)">
              {PHOTO_PRESETS.map(size => <option key={size} value={size}>{size}</option>)}
            </optgroup>
            <optgroup label={`Termal / label (lebar maks ${THERMAL_LIMITS.maxPrintWidthMm} mm)`}>
              {THERMAL_PRESETS.map(size => <option key={size} value={size}>{size}</option>)}
            </optgroup>
            <option value="__custom__">Ukuran kustom…</option>
          </select>
          {isCustomSize && (
            <div className="space-y-1.5 pt-1">
              <input
                className={fieldClass}
                type="text"
                placeholder="CUSTOM 48X150 MM"
                value={customDraft}
                disabled={!canEdit}
                onChange={e => { setCustomDraft(e.target.value); setField('paper_size', e.target.value); }}
              />
              <p className={cn('text-[10px] font-bold', customProblem ? 'text-amber-300' : 'text-muted')}>
                {customProblem || `OK — ${thermalPixels || 'ukuran dalam batas printer'}`}
              </p>
              <p className="text-[10px] text-muted font-bold">
                Lebar maks {THERMAL_LIMITS.maxPrintWidthMm} mm · tinggi {THERMAL_LIMITS.minHeightMm}-{THERMAL_LIMITS.maxHeightMm} mm · {THERMAL_LIMITS.dpi} dpi
              </p>
            </div>
          )}
        </label>
          <label className="space-y-2">
            <span className="label">Allowed Layout</span>
            <select 
              className={fieldClass} 
              value={(() => {
                const arr = config.allowed_layouts || [];
                if (arr.length === 0) return '';
                if (arr.includes('2x1') || arr.includes('3x1')) return 'STRIP';
                if (arr.includes('2x2') || arr.includes('3x3')) return 'GRID';
                if (arr.includes('1x1')) return 'POLAROID';
                return '';
              })()} 
              disabled={!canEdit} 
              onChange={e => {
                const val = e.target.value;
                if (val === 'STRIP') setField('allowed_layouts', ['2x1', '3x1', '4x1']);
                else if (val === 'GRID') setField('allowed_layouts', ['2x2', '2x3', '3x3']);
                else if (val === 'POLAROID') setField('allowed_layouts', ['1x1']);
                else setField('allowed_layouts', []);
              }}
            >
              <option value="">All Layouts</option>
              <option value="POLAROID">Polaroid</option>
              <option value="STRIP">Strip</option>
              <option value="GRID">Grid</option>
            </select>
          </label>
        <label className="space-y-2"><span className="label">Orientation</span><select className={fieldClass} value={config.orientation} disabled={!canEdit} onChange={e => setField('orientation', e.target.value)}>{ORIENTATIONS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="space-y-2"><span className="label">Copies Limit (1–10)</span><input className={fieldClass} type="number" min={1} max={10} value={config.copies_limit} disabled={!canEdit} onChange={e => setField('copies_limit', Number(e.target.value))} /></label>
        <label className="space-y-2"><span className="label">Timeout (5,000–300,000 ms)</span><input className={fieldClass} type="number" min={5000} max={300000} step={1000} value={config.timeout_ms} disabled={!canEdit} onChange={e => setField('timeout_ms', Number(e.target.value))} /></label>
        <label className="space-y-2"><span className="label">Retry Count (0–3)</span><input className={fieldClass} type="number" min={0} max={3} value={config.retry_count} disabled={!canEdit} onChange={e => setField('retry_count', Number(e.target.value))} /></label>
      </div>

      {!adapterSupported && <div className="text-xs text-amber-300 font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Adapter dari konfigurasi lama belum didukung Agent ini.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-5 rounded-2xl bg-black/20 border border-white/5 space-y-3"><p className="text-[10px] font-black text-muted uppercase tracking-widest">Desired Configuration</p><p className="text-sm font-black">Version {config.config_version}</p><p className="text-xs text-muted">{status.pending ? 'Pending — menunggu Agent menerapkan konfigurasi.' : 'Stored'}</p></div>
        <div className="p-5 rounded-2xl bg-black/20 border border-white/5 space-y-3"><p className="text-[10px] font-black text-muted uppercase tracking-widest">Reported Configuration</p><p className="text-sm font-black">{reported ? `Version ${reported.config_version}` : 'Belum ada report'}</p><p className="text-xs text-muted">{status.applied ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Applied</span> : 'Belum diterapkan'}</p></div>
      </div>

      <div className="p-5 rounded-2xl bg-black/20 border border-white/5 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs"><div><p className="label">Adapter aktif</p><p className="font-black mt-1">{reported?.adapter || '—'}</p></div><div><p className="label">Printer</p><p className="font-black mt-1 truncate">{reported?.printer_name || '—'}</p></div><div><p className="label">Printer status</p><p className="font-black mt-1">{reported?.status || '—'}</p></div><div><p className="label">Paper</p><p className="font-black mt-1">{reported?.paper_status || '—'}</p></div><div><p className="label">Prints remaining</p><p className="font-black mt-1">{reported?.prints_remaining ?? '—'}</p></div></div>
      {reported?.last_print_error && !(config.adapter === 'disabled' && reported.last_print_error === 'PRINTER_NOT_CONFIGURED') && <div className="text-xs text-red-300 font-bold">Last print error: {reported.last_print_error}</div>}

      <button onClick={handleSave} disabled={!canEdit || saving} className="btn-primary flex items-center gap-3 px-8 disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Printer Configuration'}</button>
    </div>
  );
};
