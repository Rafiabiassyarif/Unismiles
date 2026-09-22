import React, { useState, useEffect, useRef } from 'react';
import { Upload, CreditCard, Loader2, Image as ImageIcon, Plus, Trash2, Layers, Sliders, Monitor, Printer, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { deleteReusableAsset, fetchReusableAssets, ReusableAsset, resolveAssetUrl, uploadReusableAsset } from '../lib/assets';
import { useKiosks } from '../KioskContext';
import { PrinterConfiguration } from '../components/PrinterConfiguration';
import { cn } from '../lib/utils';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { kiosks, loading: kiosksLoading } = useKiosks();
  const [activeTab, setActiveTab] = useState<'calibration' | 'payment' | 'assets'>('calibration');
  const [selectedKioskId, setSelectedKioskId] = useState<string>('');

  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<ReusableAsset[]>([]);
  const [assetName, setAssetName] = useState('');
  const [assetUploading, setAssetUploading] = useState(false);

  // Visual proof configuration states
  const [merchantName, setMerchantName] = useState('UNI SMILE');
  const [displayName, setDisplayName] = useState('UNI SMILE');
  const [uniqueAmountEnabled, setUniqueAmountEnabled] = useState(false);
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(5);
  const [verificationMode, setVerificationMode] = useState('assisted');
  const [merchantAliases, setMerchantAliases] = useState('');
  const [activeProviders, setActiveProviders] = useState<string[]>(['DANA', 'GOPAY', 'OVO', 'SHOPEEPAY']);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchReusableAssets('logo').then(setAssets).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (kiosks.length > 0 && (!selectedKioskId || !kiosks.some(k => k.id === selectedKioskId))) {
      setSelectedKioskId(kiosks[0].id);
    }
  }, [kiosks, selectedKioskId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/payment-profile');
      const data = res.data?.data || res.data;
      if (data) {
        setMerchantName(data.merchant_name || 'UNI SMILE');
        setDisplayName(data.display_name || 'UNI SMILE');
        
        let paymentData = data.payment_data;
        if (typeof paymentData === 'string') {
          try { paymentData = JSON.parse(paymentData); } catch (_) {}
        }
        
        if (paymentData) {
          if (paymentData.qris_image_url) {
            setQrisUrl(paymentData.qris_image_url);
          }
          setUniqueAmountEnabled(!!paymentData.unique_amount_enabled);
          setSessionTtlMinutes(paymentData.session_ttl_minutes || 5);
          setVerificationMode(paymentData.verification_mode || 'assisted');
          setMerchantAliases(Array.isArray(paymentData.merchant_aliases) ? paymentData.merchant_aliases.join(', ') : '');
          setActiveProviders(paymentData.active_providers || ['DANA', 'GOPAY', 'OVO', 'SHOPEEPAY']);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch payment profile:', error);
      if (error.response?.status !== 404) {
        toast.error('Failed to load payment profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG/JPG).');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('qris_image', file);

      const res = await api.post('/admin/payment-profile/qris', formData);
      const imageUrl = res.data.url;
      
      if (imageUrl) {
        setQrisUrl(imageUrl);
        toast.success('QRIS image uploaded successfully');
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error: any) {
      console.error('Failed to upload QRIS image:', error);
      toast.error(error.response?.data?.message || 'Failed to upload QRIS image');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleAssetUpload = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      toast.error('Asset logo/overlay harus berupa PNG transparan.');
      return;
    }
    setAssetUploading(true);
    try {
      const asset = await uploadReusableAsset(file, assetName, 'logo');
      setAssets(current => [asset, ...current]);
      setAssetName('');
      toast.success('Asset berhasil disimpan dan siap dipakai di Frame Editor.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menyimpan asset.');
    } finally {
      setAssetUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = '';
    }
  };

  const handleDeleteAsset = async (asset: ReusableAsset) => {
    if (!window.confirm(`Hapus asset "${asset.name}"?`)) return;
    try {
      await deleteReusableAsset(asset.id);
      setAssets(current => current.filter(item => item.id !== asset.id));
      toast.success('Asset dihapus.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghapus asset.');
    }
  };

  const resolveImageUrl = (url?: string | null) => {
    if (!url) return '';
    return resolveAssetUrl(url);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/payment-profile', {
        merchant_name: merchantName,
        display_name: displayName,
        unique_amount_enabled: uniqueAmountEnabled,
        session_ttl_minutes: sessionTtlMinutes,
        verification_mode: verificationMode,
        merchant_aliases: merchantAliases.split(',').map(s => s.trim()).filter(Boolean),
        active_providers: activeProviders
      });
      toast.success('Payment configuration updated successfully');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to save payment configuration');
    } finally {
      setSaving(false);
    }
  };

  const currentKiosk = kiosks.find(k => k.id === selectedKioskId) || kiosks[0];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      <header className="mb-6 border-b border-white/5 pb-6">
        <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 text-foreground">Pengaturan</h1>
        <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">System Configuration & Photo Print Calibration</p>
      </header>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-4">
        <button
          onClick={() => setActiveTab('calibration')}
          className={cn(
            'flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer',
            activeTab === 'calibration'
              ? 'bg-primary text-[#10172A] shadow-lg shadow-primary/20 scale-[1.02]'
              : 'bg-white/5 text-muted hover:text-foreground hover:bg-white/10'
          )}
        >
          <Sliders className="w-4 h-4" />
          Photo & Print Calibration
        </button>
        <button
          onClick={() => setActiveTab('payment')}
          className={cn(
            'flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer',
            activeTab === 'payment'
              ? 'bg-primary text-[#10172A] shadow-lg shadow-primary/20 scale-[1.02]'
              : 'bg-white/5 text-muted hover:text-foreground hover:bg-white/10'
          )}
        >
          <CreditCard className="w-4 h-4" />
          Payment Profile
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={cn(
            'flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer',
            activeTab === 'assets'
              ? 'bg-primary text-[#10172A] shadow-lg shadow-primary/20 scale-[1.02]'
              : 'bg-white/5 text-muted hover:text-foreground hover:bg-white/10'
          )}
        >
          <Layers className="w-4 h-4" />
          Frame Assets
        </button>
      </div>

      {/* Tab Content: Photo & Print Calibration */}
      {activeTab === 'calibration' && (
        <div className="space-y-6">
          {kiosksLoading ? (
            <div className="py-16 text-center text-muted text-xs font-black uppercase tracking-widest">
              Memuat daftar kiosk...
            </div>
          ) : kiosks.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#1E293B] border border-white/5 text-center space-y-4 max-w-xl mx-auto my-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase text-foreground">Belum Ada Kiosk Terdaftar</h3>
                <p className="text-xs text-muted font-bold mt-2 leading-relaxed">
                  Pengaturan printer dan kalibrasi cetak membutuhkan minimal 1 kiosk terdaftar. Daftarkan kiosk pertama Anda di menu Kiosks.
                </p>
              </div>
              <button
                onClick={() => navigate('/kiosks')}
                className="px-6 py-3 bg-primary text-[#10172A] rounded-xl font-black text-xs uppercase tracking-wider hover:bg-primary/95 transition-all"
              >
                Kelola Kiosks
              </button>
            </div>
          ) : (
            <>
              {/* Kiosk Selector Bar (jika ada lebih dari 1 kiosk) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#1E293B] border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Target Kiosk</p>
                    <h3 className="text-base font-black uppercase tracking-tight text-foreground">
                      {currentKiosk?.name || 'Pilih Kiosk'} ({currentKiosk?.id})
                    </h3>
                  </div>
                </div>

                {kiosks.length > 1 ? (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-muted uppercase">Ganti Kiosk:</label>
                    <select
                      value={selectedKioskId}
                      onChange={(e) => setSelectedKioskId(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-foreground font-black outline-none focus:border-primary/50"
                    >
                      {kiosks.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} ({k.id}) — {k.status.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-xs font-bold text-muted border border-white/5">
                    <span className={cn('w-2 h-2 rounded-full', currentKiosk?.status === 'online' ? 'bg-emerald-400' : 'bg-muted')} />
                    Status: <span className="uppercase font-black text-foreground">{currentKiosk?.status || 'OFFLINE'}</span>
                  </div>
                )}
              </div>

              {/* Main Printer Configuration & Photo Calibration Panel */}
              <div className="bg-[#1E293B] border border-white/5 p-6 md:p-8 rounded-[2.5rem] shadow-2xl">
                {currentKiosk && <PrinterConfiguration kiosk={currentKiosk} />}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Payment Profile */}
      {activeTab === 'payment' && (
        <form onSubmit={handleSaveProfile} className="max-w-2xl bg-[#1E293B] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Payment Configuration</h2>
              <p className="text-xs font-bold text-muted mt-1">Upload your static QRIS image to receive payments at the kiosk.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest">QRIS Image (Static)</label>
              
              <div 
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`w-full min-h-[300px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all p-6 relative overflow-hidden group ${qrisUrl ? 'border-primary/40 bg-black/20' : 'border-white/10 hover:border-primary/50 bg-[#10172A]'}`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-4 text-primary">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <span className="text-xs font-black uppercase tracking-widest">Uploading...</span>
                  </div>
                ) : qrisUrl ? (
                  <>
                    <img 
                      src={resolveImageUrl(qrisUrl)} 
                      alt="QRIS Code" 
                      className="max-h-[250px] object-contain group-hover:scale-105 transition-transform duration-500" 
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                      <div className="flex items-center gap-2 bg-primary text-[#10172A] px-6 py-3 rounded-full font-black text-xs uppercase tracking-wider">
                        <Upload className="w-4 h-4" /> Change Image
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-muted group-hover:text-primary transition-colors">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-foreground uppercase">Upload QRIS</p>
                      <p className="text-[10px] font-bold mt-1">Click to browse (PNG, JPG)</p>
                    </div>
                  </div>
                )}
              </div>
              
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg"
                className="hidden"
              />
            </div>

            <div className="border-t border-white/5 pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest">Merchant Name</label>
                  <input 
                    type="text" 
                    value={merchantName} 
                    onChange={e => setMerchantName(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest">Display Name</label>
                  <input 
                    type="text" 
                    value={displayName} 
                    onChange={e => setDisplayName(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest">Verification Mode</label>
                  <select 
                    value={verificationMode} 
                    onChange={e => setVerificationMode(e.target.value)} 
                    className="w-full bg-[#10172A] border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="disabled">Disabled</option>
                    <option value="shadow">Shadow (Log only)</option>
                    <option value="assisted">Assisted Auto-approve</option>
                    <option value="enforced">Enforced strict verification</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest">Session TTL (Minutes)</label>
                  <input 
                    type="number" 
                    value={sessionTtlMinutes} 
                    onChange={e => setSessionTtlMinutes(Number(e.target.value))} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Merchant Aliases (comma separated)</label>
                <input 
                  type="text" 
                  value={merchantAliases} 
                  onChange={e => setMerchantAliases(e.target.value)} 
                  placeholder="e.g. unismile, uni smiles, unismile pt"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div className="flex items-center gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
                <input 
                  type="checkbox" 
                  id="uniqueAmount" 
                  checked={uniqueAmountEnabled} 
                  onChange={e => setUniqueAmountEnabled(e.target.checked)} 
                  className="w-5 h-5 rounded bg-black/30 border-white/10 accent-primary"
                />
                <label htmlFor="uniqueAmount" className="text-xs font-bold text-foreground cursor-pointer select-none">
                  Enable Unique Suffix Amount (adds Rp1 - Rp99 to session pricing for easy tracking)
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-6 py-3 rounded-xl bg-primary text-[#10172A] text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Tab Content: Frame Assets */}
      {activeTab === 'assets' && (
        <div className="max-w-4xl bg-[#1E293B] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20"><Layers className="w-6 h-6 text-primary" /></div>
            <div><h2 className="text-xl font-black uppercase tracking-tight text-foreground">Frame Assets</h2><p className="text-xs font-bold text-muted mt-1">Simpan logo atau overlay PNG sekali, lalu tambahkan dari Frame Editor.</p></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="Nama asset, contoh: Logo UniSmiles" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50" />
            <input ref={assetInputRef} type="file" accept="image/png" className="hidden" onChange={e => handleAssetUpload(e.target.files?.[0])} />
            <button type="button" onClick={() => assetInputRef.current?.click()} disabled={assetUploading} className="px-5 py-3 rounded-xl bg-primary text-[#10172A] text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"><Plus className="w-4 h-4" />{assetUploading ? 'Uploading...' : 'Tambah PNG'}</button>
          </div>
          {assets.length === 0 ? <p className="text-sm text-muted py-8 text-center border border-dashed border-white/10 rounded-2xl">Belum ada asset reusable.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{assets.map(asset => <div key={asset.id} className="relative rounded-2xl border border-white/10 bg-black/20 p-3"><div className="h-28 rounded-xl bg-[linear-gradient(45deg,#182235_25%,transparent_25%),linear-gradient(-45deg,#182235_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#182235_75%),linear-gradient(-45deg,transparent_75%,#182235_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] flex items-center justify-center"><img src={resolveAssetUrl(asset.url)} alt={asset.name} className="max-w-full max-h-full object-contain" /></div><p className="text-xs font-bold text-foreground truncate mt-2" title={asset.name}>{asset.name}</p><button type="button" onClick={() => handleDeleteAsset(asset)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>)}</div>}
        </div>
      )}
    </div>
  );
};
