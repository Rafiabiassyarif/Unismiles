import React, { useState, useEffect, useRef } from 'react';
import { 
  Smile, 
  Trash2, 
  Plus, 
  RotateCcw, 
  Search,
  Filter,
  Sticker as StickerIcon,
  X,
  Pencil,
  Upload,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Sticker {
  id: string;
  name: string;
  category: string;
  content: string; // Emoji character or Base64 DataURL (image/png or image/svg+xml)
  isEmoji: boolean;
  status: 'active' | 'inactive';
}

const DEFAULT_STICKERS: Sticker[] = [
  { id: 's1', name: 'Cupcake', category: 'Birthday', content: '🧁', isEmoji: true, status: 'active' },
  { id: 's2', name: 'Balloon', category: 'Birthday', content: '🎈', isEmoji: true, status: 'active' },
  { id: 's3', name: 'Ring', category: 'Wedding', content: '💍', isEmoji: true, status: 'active' },
  { id: 's4', name: 'Heart Sparkle', category: 'Wedding', content: '💖', isEmoji: true, status: 'active' },
  { id: 's5', name: 'Graduation Cap', category: 'Graduation', content: '🎓', isEmoji: true, status: 'active' },
  { id: 's6', name: 'Certificate', category: 'Graduation', content: '📜', isEmoji: true, status: 'active' },
  { id: 's7', name: 'Briefcase', category: 'Corporate', content: '💼', isEmoji: true, status: 'active' },
  { id: 's8', name: 'Building', category: 'Corporate', content: '🏢', isEmoji: true, status: 'active' },
  { id: 's9', name: 'Smile', category: 'General', content: '😊', isEmoji: true, status: 'active' },
  { id: 's10', name: 'Sparkles', category: 'General', content: '✨', isEmoji: true, status: 'active' },
  { id: 's11', name: 'Star', category: 'General', content: '⭐️', isEmoji: true, status: 'active' },
  { id: 's12', name: 'Camera', category: 'General', content: '📸', isEmoji: true, status: 'active' },
];

const STICKERS_STORAGE_KEY = 'unismiles_sticker_assets';

export const Stickers: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stickers, setStickers] = useState<Sticker[]>(() => {
    const saved = localStorage.getItem(STICKERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_STICKERS;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Form state
  const [newSticker, setNewSticker] = useState<{
    name: string;
    category: string;
    content: string;
    isEmoji: boolean;
    status: 'active' | 'inactive';
  }>({
    name: '',
    category: 'General',
    content: '',
    isEmoji: false,
    status: 'active'
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    localStorage.setItem(STICKERS_STORAGE_KEY, JSON.stringify(stickers));
  }, [stickers]);

  const categories = ['All', 'Birthday', 'Wedding', 'Graduation', 'Corporate', 'General'];

  // Handle file reading
  const processFile = (file: File) => {
    // Validasi format file
    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') {
      toast.error('Hanya mendukung format PNG transparan atau SVG.');
      return;
    }

    // Validasi ukuran file (maksimal 2MB)
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      toast.error('Ukuran file maksimal adalah 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewSticker(prev => ({
        ...prev,
        content: reader.result as string,
        isEmoji: false
      }));
      toast.success('File berhasil dimuat.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const toggleStickerStatus = (id: string) => {
    setStickers(prev => 
      prev.map(s => {
        if (s.id === id) {
          const newStatus = s.status === 'active' ? 'inactive' : 'active';
          toast.info(`Sticker ${s.name} sekarang ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}.`);
          return { ...s, status: newStatus };
        }
        return s;
      })
    );
  };

  const removeSticker = (id: string) => {
    const target = stickers.find(s => s.id === id);
    if (!target) return;

    setStickers(prev => prev.filter(s => s.id !== id));
    toast.error(`Sticker ${target.name} telah dihapus.`);
  };

  const handleEditClick = (sticker: Sticker) => {
    setEditingStickerId(sticker.id);
    setNewSticker({
      name: sticker.name,
      category: sticker.category,
      content: sticker.content,
      isEmoji: sticker.isEmoji,
      status: sticker.status
    });
    setIsModalOpen(true);
  };

  const saveSticker = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newSticker.name.trim()) {
      toast.error('Nama sticker wajib diisi.');
      return;
    }

    if (!newSticker.content.trim()) {
      toast.error('Konten sticker (file atau emoji) wajib diisi.');
      return;
    }

    setIsSaving(true);

    // Simulate saving process for premium feel
    setTimeout(() => {
      if (editingStickerId) {
        setStickers(prev => 
          prev.map(s => s.id === editingStickerId ? { ...s, ...newSticker } : s)
        );
        toast.success('Sticker berhasil diperbarui.', {
          icon: <CheckCircle2 className="w-5 h-5 text-green-400" />
        });
      } else {
        const sticker: Sticker = {
          id: 'sticker-' + Date.now(),
          ...newSticker
        };
        setStickers(prev => [sticker, ...prev]);
        toast.success('Sticker baru berhasil ditambahkan.', {
          icon: <CheckCircle2 className="w-5 h-5 text-green-400" />
        });
      }

      setIsSaving(false);
      setIsModalOpen(false);
      setEditingStickerId(null);
      setNewSticker({
        name: '',
        category: 'General',
        content: '',
        isEmoji: false,
        status: 'active'
      });
    }, 800);
  };

  const resetDefaults = () => {
    setStickers(DEFAULT_STICKERS);
    toast.info('Daftar sticker default telah dipulihkan.');
  };

  const filteredStickers = stickers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 flex items-center gap-3">
            Stickers
          </h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            Manage overlays & stickers for Storyboard Studio
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={resetDefaults}
            className="px-6 py-3 bg-white/5 border border-white/5 text-muted hover:text-foreground font-black uppercase tracking-widest text-[9px] rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </button>
          <button 
            onClick={() => {
              setEditingStickerId(null);
              setNewSticker({
                name: '',
                category: 'General',
                content: '',
                isEmoji: false,
                status: 'active'
              });
              setIsModalOpen(true);
            }}
            className="btn-primary flex items-center gap-3 px-8 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Sticker
          </button>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex gap-6 border-b border-white/5 pb-2">
        <button
          onClick={() => navigate('/templates')}
          className={cn(
            "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer",
            "border-transparent text-muted hover:text-foreground"
          )}
        >
          Frame Templates
        </button>
        <button
          onClick={() => navigate('/templates/stickers')}
          className={cn(
            "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer",
            "border-primary text-primary"
          )}
        >
          Sticker Library
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-center bg-[#0B0F19] p-6 rounded-[2rem] border border-white/5">
        <div className="relative w-full md:w-[400px]">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search stickers by name..."
            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-primary/40 font-black text-sm text-foreground transition-all"
          />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 w-full md:w-auto scrollbar-hide scroll-smooth">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap border cursor-pointer",
                categoryFilter === cat 
                  ? "bg-primary text-[#10172A] shadow-xl shadow-primary/20 border-primary" 
                  : "bg-white/5 border-transparent text-primary/40 hover:bg-white/10 hover:text-primary"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Stickers Grid */}
      <div className="bg-[#0B0F19] border border-white/5 rounded-[3rem] p-8 shadow-2xl">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredStickers.map((sticker) => (
              <motion.div
                key={sticker.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative bg-[#020617] hover:bg-[#10172A] border border-white/5 hover:border-primary/40 rounded-3xl p-6 aspect-square flex flex-col items-center justify-center gap-4 transition-all shadow-xl overflow-hidden"
              >
                {/* Active / Inactive Badge Toggle */}
                <div className="absolute top-4 left-4 z-20">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleStickerStatus(sticker.id); }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all cursor-pointer flex items-center gap-1",
                      sticker.status === 'active' 
                        ? "bg-primary/10 border-primary/20 text-primary" 
                        : "bg-white/5 border-white/10 text-muted"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", sticker.status === 'active' ? "bg-primary animate-pulse" : "bg-muted")} />
                    {sticker.status === 'active' ? 'Active' : 'Inactive'}
                  </button>
                </div>

                {/* Edit & Delete Actions */}
                <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-20">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleEditClick(sticker); }}
                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 text-muted hover:text-foreground rounded-xl transition-all cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
                    className="p-2 bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-400 hover:text-white rounded-xl transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Thumbnail Area with Checkerboard Background */}
                <div className="relative w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden bg-black/30 border border-white/5 group-hover:scale-105 transition-transform duration-500">
                  <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '8px 8px' }} />
                  <div className="relative z-10 text-5xl drop-shadow-xl flex items-center justify-center w-full h-full p-3">
                    {sticker.isEmoji ? (
                      <span className="select-none">{sticker.content}</span>
                    ) : (
                      <img 
                        src={sticker.content} 
                        alt={sticker.name} 
                        className="max-w-full max-h-full object-contain" 
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </div>

                {/* Sticker Info */}
                <div className="text-center w-full mt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#F1F5F9] truncate px-2">{sticker.name}</p>
                  <p className="text-[8px] text-primary/60 font-black uppercase tracking-[0.2em] mt-1">{sticker.category}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredStickers.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-foreground/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/10">
              <Smile className="w-8 h-8 text-muted" />
            </div>
            <p className="text-muted font-bold">No stickers match your search or filters.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Sticker Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => {
                if (!isSaving) setIsModalOpen(false);
              }}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#1E293B] border border-white/5 w-full max-w-md p-10 relative overflow-hidden rounded-[3rem] shadow-2xl z-10"
            >
              {/* Saving Overlay */}
              <AnimatePresence>
                {isSaving && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#10172A]/85 backdrop-blur-xl"
                  >
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                        <motion.div 
                          className="absolute inset-0"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <svg viewBox="0 0 100 100" className="w-full h-full text-primary">
                            <path 
                              d="M 30 65 A 25 25 0 0 0 70 65" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="5" 
                              strokeLinecap="round"
                            />
                          </svg>
                        </motion.div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Saving changes</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Close Button */}
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="absolute top-8 right-8 text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-0"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-black tracking-tighter uppercase mb-8 flex items-center gap-2">
                <StickerIcon className="w-6 h-6 text-primary" />
                {editingStickerId ? 'Edit Sticker' : 'New Sticker'}
              </h2>

              <form onSubmit={saveSticker} className="space-y-6">
                {/* Sticker Name */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Sticker Identity</label>
                  <input 
                    required
                    value={newSticker.name}
                    onChange={e => setNewSticker({...newSticker, name: e.target.value})}
                    className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-sm text-foreground"
                    placeholder="e.g. Birthday Balloon"
                  />
                </div>

                {/* Grid layout for Category & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Category</label>
                    <div className="relative">
                      <select 
                        value={newSticker.category}
                        onChange={e => setNewSticker({...newSticker, category: e.target.value})}
                        className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-[10px] uppercase tracking-widest appearance-none text-foreground cursor-pointer"
                      >
                        {categories.filter(c => c !== 'All').map(c => (
                          <option key={c} value={c} className="bg-[#1E293B]">{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Status</label>
                    <select 
                      value={newSticker.status}
                      onChange={e => setNewSticker({...newSticker, status: e.target.value as 'active' | 'inactive'})}
                      className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 font-black text-[10px] uppercase tracking-widest appearance-none text-foreground cursor-pointer"
                    >
                      <option value="active" className="bg-[#1E293B]">Active</option>
                      <option value="inactive" className="bg-[#1E293B]">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Content Type Selector */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Composition Type</span>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setNewSticker(prev => ({ ...prev, isEmoji: false, content: '' }))}
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest cursor-pointer",
                          !newSticker.isEmoji ? "text-primary border-b-2 border-primary pb-1" : "text-muted hover:text-foreground"
                        )}
                      >
                        Upload File
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewSticker(prev => ({ ...prev, isEmoji: true, content: '' }))}
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest cursor-pointer",
                          newSticker.isEmoji ? "text-primary border-b-2 border-primary pb-1" : "text-muted hover:text-foreground"
                        )}
                      >
                        Use Emoji
                      </button>
                    </div>
                  </div>

                  {newSticker.isEmoji ? (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Emoji Character</label>
                      <input 
                        required
                        maxLength={2}
                        value={newSticker.content}
                        onChange={e => setNewSticker({...newSticker, content: e.target.value})}
                        className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 text-center text-3xl text-foreground"
                        placeholder="😊"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">PNG (Transparant) / SVG File</label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={cn(
                          "w-full h-44 bg-black/30 border-2 border-dashed border-white/10 hover:border-primary/40 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group overflow-hidden relative",
                          newSticker.content && "border-primary/30"
                        )}
                      >
                        {newSticker.content ? (
                          <>
                            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '8px 8px' }} />
                            <img src={newSticker.content} alt="Asset Visual" className="w-full h-full object-contain p-6 relative z-10" />
                            <div className="absolute inset-x-0 bottom-0 bg-primary/95 py-2 text-center z-20">
                              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#10172A]">Replace File</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-muted group-hover:text-primary transition-all group-hover:scale-110" />
                            <div className="text-center">
                              <p className="text-[8px] font-black text-muted uppercase tracking-widest">Drop transparent PNG or SVG</p>
                              <p className="text-[7px] text-muted/50 mt-1 uppercase tracking-tight">Maximum 2MB</p>
                            </div>
                          </>
                        )}
                      </div>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/png, image/svg+xml"
                        className="hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary w-full mt-4 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
                >
                  {editingStickerId ? 'Commit Changes' : 'Initialize Sticker'}
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
