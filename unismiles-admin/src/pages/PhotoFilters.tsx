import React, { useState, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Trash2, 
  Plus, 
  RotateCcw, 
  Edit2, 
  X,
  Check,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import api from '../lib/api';
import { resolvePublicUrl } from '../lib/urls';

interface PhotoFilter {
  id: string | number;
  name: string;
  description?: string;
  css_filter?: string;
  cssFilter?: string;
  is_active?: boolean | number;
  enabled?: boolean;
  type?: 'color' | 'overlay' | 'sticker' | string;
  preview_url?: string;
  previewUrl?: string;
  isDefault?: boolean;
}

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  return resolvePublicUrl(url);
};

const getFilterCss = (filter: PhotoFilter): string => {
  return filter.css_filter || filter.cssFilter || 'none';
};

const getFilterActive = (filter: PhotoFilter): boolean => {
  if (filter.is_active !== undefined) {
    return Boolean(Number(filter.is_active));
  }
  if (filter.enabled !== undefined) {
    return filter.enabled;
  }
  return true;
};

const getFilterType = (filter: PhotoFilter): 'color' | 'overlay' | 'sticker' => {
  const type = filter.type;
  if (type === 'overlay' || type === 'sticker') return type;
  return 'color';
};

const getFilterPreviewUrl = (filter: PhotoFilter): string => {
  return resolveImageUrl(filter.preview_url || filter.previewUrl || '');
};

const SAMPLE_PHOTO = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=300&fit=crop';

export const PhotoFilters: React.FC = () => {
  const [filters, setFilters] = useState<PhotoFilter[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFilter, setEditingFilter] = useState<PhotoFilter | null>(null);

  // Form State matching backend & user specifications
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: 'color' | 'overlay' | 'sticker';
    is_active: boolean;
    css_filter: string;
    preview_url: string;
  }>({
    name: '',
    description: '',
    type: 'color',
    is_active: true,
    css_filter: 'none',
    preview_url: ''
  });

  const fetchFilters = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/filters');
      if (response.data && Array.isArray(response.data.data)) {
        setFilters(response.data.data);
      } else if (Array.isArray(response.data)) {
        setFilters(response.data);
      } else {
        setFilters([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch photo filters:', error);
      toast.error(error?.response?.data?.message || 'Failed to load filters from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const toggleFilterActive = async (filter: PhotoFilter) => {
    const currentActive = getFilterActive(filter);
    const updatedActive = !currentActive;
    
    // Optimistic update
    setFilters(prev => prev.map(f => f.id === filter.id ? { ...f, is_active: updatedActive ? 1 : 0, enabled: updatedActive } : f));

    try {
      const payload = {
        name: filter.name,
        css_filter: getFilterCss(filter),
        is_active: updatedActive ? 1 : 0,
        type: getFilterType(filter),
        preview_url: filter.preview_url || filter.previewUrl || '',
        description: filter.description || ''
      };
      await api.put(`/filters/${filter.id}`, payload);
      toast.success(`Filter "${filter.name}" ${updatedActive ? 'enabled' : 'disabled'}.`);
    } catch (error: any) {
      console.error('Failed to toggle filter status:', error);
      toast.error(error?.response?.data?.message || 'Failed to update filter status.');
      // Revert optimistic update
      setFilters(prev => prev.map(f => f.id === filter.id ? { ...f, is_active: currentActive ? 1 : 0, enabled: currentActive } : f));
    }
  };

  const deleteFilter = async (id: string | number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete filter "${name}"?`)) return;

    try {
      await api.delete(`/filters/${id}`);
      setFilters(prev => prev.filter(f => f.id !== id));
      toast.success('Filter deleted successfully.');
    } catch (error: any) {
      console.error('Failed to delete filter:', error);
      toast.error(error?.response?.data?.message || 'Failed to delete filter.');
    }
  };

  const handleOpenModal = (filter: PhotoFilter | null = null) => {
    if (filter) {
      setEditingFilter(filter);
      setFormData({
        name: filter.name || '',
        description: filter.description || '',
        type: getFilterType(filter),
        is_active: getFilterActive(filter),
        css_filter: getFilterCss(filter),
        preview_url: filter.preview_url || filter.previewUrl || ''
      });
    } else {
      setEditingFilter(null);
      setFormData({
        name: '',
        description: '',
        type: 'color',
        is_active: true,
        css_filter: 'grayscale(100%) contrast(110%)',
        preview_url: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Filter Name is required.');
      return;
    }
    if (formData.type === 'color' && !formData.css_filter.trim()) {
      toast.error('CSS Filter value is required for color filters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        type: formData.type,
        is_active: formData.is_active ? 1 : 0,
        css_filter: formData.css_filter.trim() || 'none',
        preview_url: formData.preview_url.trim()
      };

      if (editingFilter) {
        await api.put(`/filters/${editingFilter.id}`, payload);
        toast.success('Filter updated successfully.');
      } else {
        await api.post('/filters', payload);
        toast.success('New filter created successfully.');
      }

      setIsModalOpen(false);
      setEditingFilter(null);
      await fetchFilters();
    } catch (error: any) {
      console.error('Failed to save filter:', error);
      toast.error(error?.response?.data?.message || 'Failed to save filter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Camera className="w-8 h-8 text-primary" />
            </div>
            Photo Filters
          </h1>
          <p className="text-muted mt-1 font-medium">Manage color grading, overlays, and sticker filters for the kiosk experience.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchFilters}
            disabled={isLoading}
            className="px-4 py-2.5 bg-white/5 border border-white/10 text-foreground font-bold rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={() => handleOpenModal(null)}
            className="px-5 py-2.5 bg-primary text-[#10172A] font-black uppercase tracking-wider text-xs rounded-xl shadow-[0_4px_15px_rgba(255,184,0,0.4)] hover:scale-[1.02] transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            New Filter
          </button>
        </div>
      </div>

      {/* Filter Grid / Loading state */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-black/20 border border-white/10 rounded-3xl">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm font-bold text-muted uppercase tracking-wider">Loading Filters...</p>
        </div>
      ) : filters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-black/20 border border-white/10 rounded-3xl text-center px-4">
          <AlertCircle className="w-12 h-12 text-muted mb-4 opacity-60" />
          <h3 className="text-lg font-bold text-foreground">No Filters Found</h3>
          <p className="text-xs text-muted max-w-md mt-1 mb-6">Create your first photo filter to customize the look and feel of captured photobooth pictures.</p>
          <button 
            onClick={() => handleOpenModal(null)}
            className="px-6 py-3 bg-primary text-[#10172A] font-black uppercase tracking-wider text-xs rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Create First Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filters.map((filter) => {
              const active = getFilterActive(filter);
              const cssVal = getFilterCss(filter);
              const type = getFilterType(filter);
              const previewUrl = getFilterPreviewUrl(filter);

              return (
                <motion.div
                  key={filter.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "group glass-panel p-5 space-y-4 border transition-all duration-300 rounded-3xl flex flex-col justify-between",
                    active ? "border-white/10 hover:border-primary/30" : "border-white/5 opacity-60 grayscale-[40%]"
                  )}
                >
                  <div className="space-y-4">
                    {/* Thumbnail Card */}
                    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black/40 relative border border-white/5 flex items-center justify-center">
                      <img 
                        src={previewUrl || SAMPLE_PHOTO} 
                        alt={filter.name || 'Filter Preview'}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                        style={type === 'color' && !previewUrl ? { filter: cssVal } : undefined}
                      />

                      {!active && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center font-black text-white text-[10px] uppercase tracking-[0.2em]">
                          Disabled
                        </div>
                      )}

                      {/* Type Badge */}
                      <div className="absolute top-2 left-2 px-2.5 py-1 bg-black/70 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/10 flex items-center gap-1 shadow-md">
                        {type === 'color' && <Sparkles className="w-3 h-3 text-primary" />}
                        {type === 'overlay' && <Layers className="w-3 h-3 text-emerald-400" />}
                        {type === 'sticker' && <ImageIcon className="w-3 h-3 text-sky-400" />}
                        {type}
                      </div>
                    </div>

                    {/* Metadata & Toggle */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-black text-foreground text-lg truncate uppercase tracking-tight">{filter.name}</h3>
                        <button 
                          type="button"
                          onClick={() => toggleFilterActive(filter)}
                          className={cn(
                            "w-10 h-5 flex items-center px-1 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0",
                            active ? "bg-primary shadow-[0_0_15px_rgba(255,184,0,0.4)]" : "bg-foreground/10 border border-white/20"
                          )}
                          title={active ? 'Click to disable' : 'Click to enable'}
                        >
                          <motion.div 
                            animate={{ x: active ? 20 : 0 }}
                            className={cn("w-3 h-3 rounded-full shadow-sm", active ? "bg-[#10172A]" : "bg-muted")}
                          />
                        </button>
                      </div>

                      {filter.description && (
                        <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2 h-8">{filter.description}</p>
                      )}

                      <div className="mt-3 p-2.5 bg-black/40 rounded-xl text-[10px] text-primary font-mono border border-white/5 flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-black text-muted tracking-wider">CSS / Value:</span>
                        <span className="truncate block font-bold">{cssVal}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button 
                      type="button"
                      onClick={() => handleOpenModal(filter)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-white/10 text-xs font-black uppercase tracking-wider text-foreground rounded-xl transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-primary" />
                      Edit
                    </button>
                    <button 
                      type="button"
                      onClick={() => deleteFilter(filter.id, filter.name)}
                      className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all cursor-pointer"
                      title="Delete Filter"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit Filter Modal with Fixed Header, Scrollable Body, Fixed Footer */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-[#1E293B] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.7)] rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Fixed Header */}
              <div className="flex-shrink-0 flex items-center justify-between p-6 md:p-8 border-b border-white/10 bg-[#1E293B] z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/20 rounded-2xl border border-primary/30">
                    {editingFilter ? <Edit2 className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-foreground">
                      {editingFilter ? 'Edit Photo Filter' : 'New Photo Filter'}
                    </h2>
                    <p className="text-[11px] font-bold text-muted mt-0.5">Configure filter settings and preview rendering.</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-muted hover:text-foreground transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Form Content */}
              <form onSubmit={handleSaveFilter} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
                {/* Filter Name & Active Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Filter Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Cinema B&W" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 text-sm font-black text-foreground outline-none focus:border-primary/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Status</label>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, is_active: !formData.is_active})}
                      className={cn(
                        "w-full py-3.5 px-4 rounded-2xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer",
                        formData.is_active 
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" 
                          : "bg-white/5 border-white/10 text-muted"
                      )}
                    >
                      <div className={cn("w-2 h-2 rounded-full", formData.is_active ? "bg-emerald-400 animate-pulse" : "bg-muted")} />
                      {formData.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>

                {/* Filter Type Dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Filter Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'color' | 'overlay' | 'sticker'})}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 text-xs font-black uppercase tracking-wider text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="color" className="bg-[#1E293B]">Color / CSS Filter (Standard Grading)</option>
                    <option value="overlay" className="bg-[#1E293B]">Overlay (PNG Frame/Texture Layer)</option>
                    <option value="sticker" className="bg-[#1E293B]">Sticker (Graphic Overlay Asset)</option>
                  </select>
                </div>

                {/* CSS Filter Value (For Color Type) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">
                      {formData.type === 'color' ? 'CSS Filter Value *' : 'CSS Filter Value (Optional)'}
                    </label>
                    <button 
                      type="button"
                      className="text-[10px] text-primary hover:underline font-black uppercase tracking-wider cursor-pointer"
                      onClick={() => setFormData({...formData, css_filter: 'grayscale(100%) contrast(120%) brightness(105%)'})}
                    >
                      Preset Example
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="e.g. grayscale(100%) contrast(1.1)" 
                    value={formData.css_filter}
                    onChange={(e) => setFormData({...formData, css_filter: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 text-xs font-mono text-foreground outline-none focus:border-primary/50 transition-all"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['none', 'grayscale(100%)', 'sepia(80%)', 'brightness(120%) contrast(105%)', 'saturate(140%) contrast(110%)', 'hue-rotate(180deg)'].map((ex) => (
                      <button 
                        key={ex}
                        type="button"
                        onClick={() => setFormData({...formData, css_filter: ex})}
                        className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-xl text-[9px] text-muted hover:text-primary hover:border-primary/30 transition-all font-mono cursor-pointer"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview URL / Image Asset Path */}
                {(formData.type === 'overlay' || formData.type === 'sticker' || formData.preview_url) && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">
                      {formData.type !== 'color' ? 'Image / Overlay Asset URL or Upload Path *' : 'Optional Preview Image URL'}
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. /uploads/filter_overlay.png or https://cdn.unismiles.com/asset.png" 
                      value={formData.preview_url}
                      onChange={(e) => setFormData({...formData, preview_url: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 text-xs font-mono text-foreground outline-none focus:border-primary/50 transition-all"
                    />
                    <p className="text-[10px] font-bold text-muted ml-1">
                      Relative backend paths like <code className="text-primary font-mono">/uploads/...</code> use the configured API origin automatically.
                    </p>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Description (Optional)</label>
                  <textarea 
                    placeholder="Short summary of what this filter effect achieves..." 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3 text-xs text-foreground outline-none focus:border-primary/50 min-h-[75px] resize-none"
                  />
                </div>

                {/* Live Inspection Preview Box */}
                <div className="p-5 rounded-3xl bg-black/40 border border-white/10 flex flex-col items-center gap-3">
                  <div className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-primary" /> Live Rendering Preview
                  </div>
                  <div className="w-44 h-32 rounded-2xl overflow-hidden border border-white/15 bg-black/50 relative flex items-center justify-center shadow-lg">
                    <img 
                      src={resolveImageUrl(formData.preview_url) || SAMPLE_PHOTO} 
                      alt="Filter Preview"
                      className="w-full h-full object-cover"
                      style={formData.type === 'color' && !formData.preview_url ? { filter: formData.css_filter } : undefined}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-primary font-bold">{formData.css_filter}</span>
                </div>
              </form>

              {/* Fixed Footer */}
              <div className="flex-shrink-0 p-6 md:p-8 border-t border-white/10 bg-[#1E293B] flex justify-end gap-3 z-10">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 text-foreground rounded-2xl font-black uppercase tracking-wider text-xs transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSaveFilter}
                  disabled={isSubmitting}
                  className="btn-primary flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-xs shadow-xl shadow-primary/20 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{editingFilter ? 'Update Filter' : 'Save Filter'}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
