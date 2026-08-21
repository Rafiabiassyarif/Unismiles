import React, { useState, useEffect, useRef } from 'react';
import { 
  GripVertical, 
  Type, 
  Image as ImageIcon, 
  Save, 
  Plus,
  Trash2,
  ChevronDown,
  Eye,
  Layers,
  Palette,
  Maximize2,
  RotateCw,
  X,
  Type as TypeIcon,
  Sticker as StickerIcon,
  Circle as CircleIcon,
  Square as SquareIcon,
  Move,
  Settings2,
  Copy,
  Minus,
  Edit3,
  Sparkles,
  Wand2,
  Layout,
  History,
  Archive,
  Star,
  CheckCircle2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useTemplate } from '../TemplateContext';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { useKiosks } from '../KioskContext';

interface CanvasElement {
  id: string;
  type: 'sticker' | 'text';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
}

interface PhotoSlot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const STORYBOARD_KEY = 'unismiles_storyboards_v2';
const STICKERS_STORAGE_KEY = 'unismiles_sticker_assets';

export const Storyboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { templates } = useTemplate();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Kiosk & Orientation State
  const { kiosks } = useKiosks();
  const [selectedKioskId, setSelectedKioskId] = useState<string>('');

  // Layout State
  const [layoutName, setLayoutName] = useState('New Dynamic Layout');
  const [layoutType, setLayoutType] = useState('2x6-3-photo');
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [baseTemplateId, setBaseTemplateId] = useState<string | null>(null);
  
  const layoutConfigs: Record<string, PhotoSlot[]> = {
    '2x6-3-photo': [
      { id: '1', x: 10, y: 10, w: 80, h: 22 },
      { id: '2', x: 10, y: 38, w: 80, h: 22 },
      { id: '3', x: 10, y: 66, w: 80, h: 22 },
    ],
    '2x6-4-photo': [
      { id: '1', x: 10, y: 5, w: 80, h: 18 },
      { id: '2', x: 10, y: 25, w: 80, h: 18 },
      { id: '3', x: 10, y: 45, w: 80, h: 18 },
      { id: '4', x: 10, y: 65, w: 80, h: 18 },
    ],
    'strip-3x1': [
      { id: '1', x: 10, y: 10, w: 80, h: 25 },
      { id: '2', x: 10, y: 40, w: 80, h: 25 },
      { id: '3', x: 10, y: 70, w: 80, h: 25 },
    ],
    'strip-4x1': [
      { id: '1', x: 10, y: 5, w: 80, h: 18 },
      { id: '2', x: 10, y: 25, w: 80, h: 18 },
      { id: '3', x: 10, y: 45, w: 80, h: 18 },
      { id: '4', x: 10, y: 65, w: 80, h: 18 },
    ],
    '4x6-1-photo': [
      { id: '1', x: 10, y: 10, w: 80, h: 80 },
    ]
  };

  // Layout Display Names
  const layoutDisplayNames: Record<string, string> = {
    '2x6-3-photo': '2x6 - 3 Photo',
    '2x6-4-photo': '2x6 - 4 Photo',
    'strip-3x1': 'Strip 3x1',
    'strip-4x1': 'Strip 4x1',
    '4x6-1-photo': '4x6 - 1 Photo',
  };

  // Aspect Ratio & Layout Helpers for Landscape Kiosks
  const selectedKiosk = kiosks.find(k => k.id === selectedKioskId);
  const isLandscape = selectedKiosk?.config?.orientation === 'landscape';

  const currentAspectRatio = isLandscape
    ? (layoutType === '4x6-1-photo' ? '3/2' : '3/1')
    : (layoutType === '4x6-1-photo' ? '2/3' : '1/3');

  const getLayoutSlots = (type: string, kioskLandscape: boolean): PhotoSlot[] => {
    if (kioskLandscape) {
      if (type === '2x6-3-photo' || type === 'strip-3x1') {
        return [
          { id: '1', x: 5, y: 10, w: 26, h: 80 },
          { id: '2', x: 37, y: 10, w: 26, h: 80 },
          { id: '3', x: 69, y: 10, w: 26, h: 80 },
        ];
      }
      if (type === '2x6-4-photo' || type === 'strip-4x1') {
        return [
          { id: '1', x: 5, y: 10, w: 20, h: 80 },
          { id: '2', x: 28, y: 10, w: 20, h: 80 },
          { id: '3', x: 51, y: 10, w: 20, h: 80 },
          { id: '4', x: 74, y: 10, w: 20, h: 80 },
        ];
      }
      if (type === '4x6-1-photo') {
        return [
          { id: '1', x: 10, y: 10, w: 80, h: 80 },
        ];
      }
    }
    return layoutConfigs[type] || [];
  };

  const prevKioskIdRef = useRef(selectedKioskId);
  const prevLayoutTypeRef = useRef(layoutType);

  useEffect(() => {
    const kiosk = kiosks.find(k => k.id === selectedKioskId);
    const isKioskLandscape = kiosk?.config?.orientation === 'landscape';
    
    if (prevKioskIdRef.current !== selectedKioskId || prevLayoutTypeRef.current !== layoutType) {
      setSlots(getLayoutSlots(layoutType, isKioskLandscape));
      prevKioskIdRef.current = selectedKioskId;
      prevLayoutTypeRef.current = layoutType;
    }
  }, [selectedKioskId, layoutType, kiosks]);

  // Canvas State 
  const [slots, setSlots] = useState<PhotoSlot[]>(layoutConfigs['2x6-3-photo']);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('#020617');
  const [gradientColorEnd, setGradientColorEnd] = useState('#10B981');
  const [backgroundType, setBackgroundType] = useState<'solid' | 'gradient' | 'transparent'>('solid');
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [activePaletteTab, setActivePaletteTab] = useState<'stickers' | 'text'>('stickers');

  // Persistence State
  const [savedLayouts, setSavedLayouts] = useState<any[]>([]);

  // Load stickers & saved layouts
  const [availableStickers, setAvailableStickers] = useState<any[]>([]);

  useEffect(() => {
    // Check for incoming template from Gallery
    const state = location.state as { templateId?: string };
    if (state?.templateId) {
      const template = templates.find(t => t.id === state.templateId);
      if (template) {
        setBaseTemplateId(template.id);
        setLayoutName(`Modified ${template.name}`);
        toast.success(`Template ${template.name} loaded as background`);
      }
    }

    const savedStickers = localStorage.getItem(STICKERS_STORAGE_KEY);
    if (savedStickers) {
      try {
        const allStickers = JSON.parse(savedStickers);
        setAvailableStickers(allStickers.filter((s: any) => s.status === 'active'));
      } catch (err) {
        console.error("Error parsing stickers:", err);
        setAvailableStickers([]);
      }
    } else {
      const defaults = [
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
      localStorage.setItem(STICKERS_STORAGE_KEY, JSON.stringify(defaults));
      setAvailableStickers(defaults.filter((s: any) => s.status === 'active'));
    }

    const savedL = localStorage.getItem(STORYBOARD_KEY);
    if (savedL) setSavedLayouts(JSON.parse(savedL));
  }, [location.state, templates]);

  const addElement = (type: CanvasElement['type'], content: string) => {
    const newElement: CanvasElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content,
      x: 30,
      y: 30,
      width: type === 'text' ? 150 : 80,
      height: type === 'text' ? 40 : 80,
      rotation: 0,
      opacity: 1,
      fontSize: type === 'text' ? 32 : undefined,
      color: type === 'text' ? '#ffffff' : undefined,
      fontWeight: type === 'text' ? 'normal' : undefined,
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center'
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
    return newElement;
  };

  const handleAiAssist = () => {
    // If target kiosk is landscape, recommend horizontal layout slots
    if (isLandscape) {
      if (layoutType === '2x6-3-photo' || layoutType === 'strip-3x1') {
        setSlots([
          { id: '1', x: 5, y: 10, w: 26, h: 80 },
          { id: '2', x: 37, y: 10, w: 26, h: 80 },
          { id: '3', x: 69, y: 10, w: 26, h: 80 },
        ]);
        toast.success("AI Assist: Recommended horizontal layout applied for Landscape kiosk!", {
          icon: <Sparkles className="w-5 h-5 text-emerald-400" />
        });
        return;
      }
      if (layoutType === '2x6-4-photo' || layoutType === 'strip-4x1') {
        setSlots([
          { id: '1', x: 5, y: 10, w: 20, h: 80 },
          { id: '2', x: 28, y: 10, w: 20, h: 80 },
          { id: '3', x: 51, y: 10, w: 20, h: 80 },
          { id: '4', x: 74, y: 10, w: 20, h: 80 },
        ]);
        toast.success("AI Assist: Recommended horizontal 4-photo layout applied for Landscape kiosk!", {
          icon: <Sparkles className="w-5 h-5 text-emerald-400" />
        });
        return;
      }
      if (layoutType === '4x6-1-photo') {
        setSlots([
          { id: '1', x: 10, y: 10, w: 80, h: 80 },
        ]);
        toast.success("AI Assist: Landscape 1-photo layout set!", {
          icon: <Sparkles className="w-5 h-5 text-emerald-400" />
        });
        return;
      }
    }

    if (!selectedId) {
      toast.error("Please select an element to sync from or choose a Landscape kiosk to see slot recommendations");
      return;
    }
    const target = elements.find(el => el.id === selectedId);
    if (!target) return;

    setElements(elements.map(el => ({
      ...el,
      width: target.width,
      height: target.height,
      opacity: target.opacity,
      fontSize: el.type === 'text' ? target.fontSize : el.fontSize,
      color: el.type === 'text' ? target.color : el.color
    })));
    toast.success("AI Sync: All elements unified", {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />
    });
  };

  const updateElement = (id: string, updates: Partial<CanvasElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  const handleSave = () => {
    const layoutData = {
      id: Math.random().toString(36).substr(2, 9),
      name: layoutName,
      layoutType,
      slots,
      elements,
      backgroundColor,
      gradientColorEnd,
      backgroundType,
      gradientType,
      baseTemplateId,
      updatedAt: new Date().toISOString()
    };
    
    const saved = localStorage.getItem(STORYBOARD_KEY);
    const existing = saved ? JSON.parse(saved) : [];
    const updated = [layoutData, ...existing];
    localStorage.setItem(STORYBOARD_KEY, JSON.stringify(updated));
    setSavedLayouts(updated);
    
    toast.success("Design layout saved as new portfolio item", {
      className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold"
    });
  };

  const loadSavedLayout = (layout: any) => {
    setLayoutName(layout.name);
    setLayoutType(layout.layoutType);
    setSlots(layout.slots);
    setElements(layout.elements);
    setBackgroundColor(layout.backgroundColor || '#020617');
    setGradientColorEnd(layout.gradientColorEnd || '#10B981');
    setBackgroundType(layout.backgroundType || 'solid');
    setGradientType(layout.gradientType || 'linear');
    setBaseTemplateId(layout.baseTemplateId || null);
    toast.info(`Loaded: ${layout.name}`);
  };

  const handleLayoutChange = (type: string) => {
    setLayoutType(type);
    setSlots(layoutConfigs[type] || []);
    toast.info(`Layout switched to ${type}`);
  };

  const addSlot = () => {
    const newSlot: PhotoSlot = {
      id: (slots.length + 1).toString(),
      x: 10,
      y: slots.length > 0 ? slots[slots.length - 1].y + 25 : 10,
      w: 80,
      h: 20
    };
    setSlots([...slots, newSlot]);
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter(s => s.id !== id));
  };

  const activeTemplate = templates.find(t => t.id === baseTemplateId);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-4 animate-in fade-in duration-700 overflow-hidden bg-[#020617] p-4 text-emerald-50">
      {/* Header Toolbar */}
      <header className="flex justify-between items-center bg-[#0B0F19] border border-emerald-500/10 p-5 rounded-[2.5rem] shadow-2xl">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              setElements([]);
              setBaseTemplateId(null);
              setLayoutName('New Creation');
              toast.info("Workspace Purged");
            }}
            className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-lg active:scale-90"
          >
            <Plus className="w-6 h-6" />
          </button>
          
          <div className="h-10 w-px bg-emerald-500/10" />
          
          <div>
            <input 
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              className="bg-transparent text-2xl font-black uppercase tracking-tighter outline-none focus:text-emerald-400 transition-colors block leading-tight border-b-2 border-transparent focus:border-emerald-500/40 pb-1"
            />
            <div className="flex items-center gap-2 mt-1">
              <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
              <p className="text-[9px] text-emerald-500/60 font-black uppercase tracking-[0.4em]">Design & Print Architect</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Target Kiosk Selector */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80">Target Kiosk:</span>
            <select
              value={selectedKioskId}
              onChange={(e) => setSelectedKioskId(e.target.value)}
              className="bg-transparent text-xs font-black text-foreground uppercase tracking-wider outline-none border-none cursor-pointer text-white [&>option]:bg-[#10172A] [&>option]:text-white focus:ring-0"
            >
              <option value="">-- Select Kiosk --</option>
              {kiosks.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.config?.orientation === 'landscape' ? 'Landscape' : 'Portrait'})
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleAiAssist}
            className="flex items-center gap-3 px-6 py-3 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all group shadow-lg"
          >
            <Wand2 className="w-4 h-4 group-hover:rotate-12 transition-transform" /> AI Assist
          </button>
          
          <button 
            onClick={() => setShowLivePreview(true)}
            className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 text-white/80 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all group shadow-lg"
          >
            <Eye className="w-4 h-4" /> Live Preview
          </button>
          
          <div className="h-10 w-px bg-emerald-500/10 mx-2" />
          
          <button 
            onClick={handleSave}
            className="px-10 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] active:scale-95 flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save Layout
          </button>
        </div>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Panel: Layers & Slots Management */}
        <aside className="w-80 flex flex-col bg-[#1E293B] border border-emerald-500/10 rounded-[3rem] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-black/40 space-y-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60 mb-3 flex items-center gap-2">
                <Layout className="w-4 h-4" /> Templates
              </h3>
              <div className="relative group/select">
                <select 
                  value={baseTemplateId || ''}
                  onChange={(e) => {
                    setBaseTemplateId(e.target.value || null);
                    if (e.target.value) {
                      const t = templates.find(temp => temp.id === e.target.value);
                      if (t) toast.success(`Template ${t.name} selected`);
                    }
                  }}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-foreground appearance-none outline-none focus:border-emerald-500/40 transition-all cursor-pointer"
                >
                  <option value="">No Background</option>
                  {templates.length === 0 ? (
                    <option disabled>No Templates</option>
                  ) : (
                    templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))
                  )}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/40 pointer-events-none group-hover/select:text-emerald-500 group-hover/select:translate-y-[-40%] transition-all" />
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Layer Management
              </h3>
              <button 
                onClick={addSlot}
                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Plus className="w-3 h-3" /> Add Photo Slot
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {slots.map((slot, index) => (
              <div 
                key={slot.id}
                className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 group hover:border-emerald-500/20 transition-all"
              >
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 font-black text-xs border border-emerald-500/20">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Photo Slot {slot.id}</p>
                  <p className="text-[8px] font-bold text-muted uppercase mt-0.5">{slot.w}% x {slot.h}%</p>
                </div>
                <button 
                  onClick={() => removeSlot(slot.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-red-500/40 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {elements.length > 0 && (
              <div className="pt-6 mt-6 border-t border-white/5 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/40">Active Nodes</p>
                {elements.map((el) => (
                   <div 
                    key={el.id}
                    onClick={() => setSelectedId(el.id)}
                    className={cn(
                      "p-4 rounded-2xl flex items-center gap-4 cursor-pointer transition-all border",
                      selectedId === el.id ? "bg-emerald-500/10 border-emerald-500/40" : "bg-white/5 border-transparent hover:bg-white/10"
                    )}
                  >
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                       {el.type === 'text' ? <Type className="w-4 h-4 text-emerald-400" /> : <ImageIcon className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground truncate">{el.type.toUpperCase()}</p>
                      <p className="text-[8px] font-bold text-muted uppercase mt-0.5 truncate">{el.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Middle Panel: Main Design Canvas */}
        <main className="flex-1 flex flex-col bg-[#020617] rounded-[4rem] border border-emerald-500/10 overflow-hidden relative shadow-2xl"
              onClick={() => setSelectedId(null)}>
          
          {/* Top Selection Row: Scrollable Layouts */}
          <div className="p-4 bg-black/40 border-b border-white/5 overflow-x-auto no-scrollbar flex gap-4 scroll-smooth">
            {Object.keys(layoutConfigs).map(type => (
              <button
                key={type}
                onClick={() => handleLayoutChange(type)}
                className={cn(
                  "flex-shrink-0 px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border whitespace-nowrap",
                  layoutType === type 
                    ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 border-emerald-500" 
                    : "bg-[#1E293B] border-white/5 text-emerald-500/40 hover:text-emerald-400 hover:bg-white/10"
                )}
              >
                {layoutDisplayNames[type] || type.replace(/-/g, ' ')}
              </button>
            ))}
          </div>
          
            {/* Canvas Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden group/canvas p-4 bg-[#020617]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]" />
              
              {/* Working Canvas */}
              <div 
                ref={canvasRef}
                className="relative shadow-[0_100px_200px_-40px_rgba(0,0,0,1)] border border-white/10 transition-all duration-700 overflow-hidden bg-black"
                style={{
                  width: isLandscape ? '90%' : 'auto',
                  height: isLandscape ? 'auto' : '96%',
                  maxHeight: '96%',
                  aspectRatio: currentAspectRatio,
                  backgroundColor: backgroundType === 'transparent' ? 'transparent' : (backgroundType === 'solid' ? backgroundColor : 'transparent'),
                  backgroundImage: backgroundType === 'gradient' 
                    ? `${gradientType === 'linear' ? 'linear-gradient' : 'radial-gradient'}(${backgroundColor}, ${gradientColorEnd})` 
                    : 'none',
                }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Base Template Layer */}
              {activeTemplate && (
                <div className="absolute inset-0 z-0 pointer-events-none opacity-100 flex items-center justify-center overflow-hidden">
                  <img 
                    src={activeTemplate.imageUrl} 
                    className="w-full h-full object-contain" 
                    alt="Base" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {/* Elements Layer */}
              <AnimatePresence>
                {elements.map((el) => (
                  <DraggableElement 
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id}
                    onSelect={() => setSelectedId(el.id)}
                    onChange={(updates) => updateElement(el.id, updates)}
                    onDelete={() => setElements(elements.filter(e => e.id !== el.id))}
                  />
                ))}
              </AnimatePresence>

              {/* Slots Layer (Unselectable reference) */}
              <div className="absolute inset-0 z-1 pointer-events-none p-4">
                {slots.map(slot => (
                  <div
                    key={slot.id}
                    style={{
                      position: 'absolute',
                      left: `${slot.x}%`,
                      top: `${slot.y}%`,
                      width: `${slot.w}%`,
                      height: `${slot.h}%`,
                      backgroundColor: 'rgba(16,185,129,0.03)',
                      border: '2px solid rgba(16,185,129,0.15)',
                    }}
                    className="flex items-center justify-center overflow-hidden backdrop-blur-[2px]"
                  >
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <ImageIcon className="w-6 h-6 text-emerald-400" />
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">PHOTO {slot.id}</div>
                    </div>
                  </div>
                ))}
                
                {/* Dedicated Logo/Watermark Area for Strips */}
                {layoutType.startsWith('2x6') && (
                  <div 
                    style={{
                      position: 'absolute',
                      left: '10%',
                      bottom: '2%',
                      width: '80%',
                      height: '8%',
                      border: '1px dashed rgba(16,185,129,0.1)',
                      backgroundColor: 'rgba(16,185,129,0.02)'
                    }}
                    className="flex items-center justify-center"
                  >
                    <div className="text-[8px] font-black uppercase tracking-[0.4em] text-emerald-500/20">Logo / Watermark Area</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Panel: Saved Layouts (requested feature) */}
          <div className="h-44 bg-black/40 border-t border-emerald-500/10 p-6">
            <div className="flex items-center justify-between mb-4">
               <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60 flex items-center gap-3">
                 <History className="w-4 h-4" /> Layout Repositories
               </h4>
               <span className="text-[9px] font-black text-muted uppercase tracking-widest">{savedLayouts.length} Units Saved</span>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
               {savedLayouts.length === 0 ? (
                 <div className="flex-1 flex items-center justify-center border border-dashed border-emerald-500/10 rounded-[1.5rem] py-4 h-16">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted">No design variations persisted yet</p>
                 </div>
               ) : (
                 savedLayouts.map((layout, i) => (
                   <button
                    key={layout.id}
                    onClick={() => loadSavedLayout(layout)}
                    className="flex-shrink-0 w-48 h-18 bg-[#0B0F19] border border-white/5 hover:border-emerald-500/40 rounded-2xl p-4 flex items-center gap-4 transition-all group"
                   >
                     <div className="w-10 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/20">
                       {i + 1}
                     </div>
                     <div className="flex-1 text-left overflow-hidden">
                       <p className="text-[9px] font-black uppercase tracking-tight text-foreground truncate">{layout.name}</p>
                       <p className="text-[7px] font-bold text-muted uppercase mt-1 truncate">{new Date(layout.updatedAt).toLocaleDateString()}</p>
                     </div>
                     <Star className="w-3 h-3 text-emerald-500/20 group-hover:text-emerald-500 transition-colors" />
                   </button>
                 ))
               )}
            </div>
          </div>
        </main>

        {/* Right Panel: Assets & Canvas Palette */}
        <aside className="w-80 flex flex-col bg-[#1E293B] border border-emerald-500/10 rounded-[3rem] overflow-hidden shadow-2xl">
          {!selectedId ? (
            <>
              <div className="flex p-3 gap-2 bg-black/40">
                {(['stickers', 'text'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActivePaletteTab(tab)}
                    className={cn(
                      "flex-1 py-4 text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all",
                      activePaletteTab === tab 
                        ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20" 
                        : "text-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-400"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide space-y-8">
                {activePaletteTab === 'stickers' && (
                  <div className="grid grid-cols-2 gap-4">
                    {availableStickers.map(sticker => (
                      <button
                        key={sticker.id}
                        onClick={() => addElement('sticker', sticker.content)}
                        className="aspect-square bg-white/5 border border-white/5 rounded-3xl flex items-center justify-center text-4xl hover:border-emerald-500/40 transition-all hover:scale-105 active:scale-90 group relative"
                      >
                        {sticker.isEmoji ? (
                          <span className="drop-shadow-2xl">{sticker.content}</span>
                        ) : (
                          <img src={sticker.content} alt="S" className="w-12 h-12 object-contain" />
                        )}
                        <div className="absolute inset-x-0 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[7px] font-black uppercase tracking-widest text-emerald-400">Node+</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {activePaletteTab === 'text' && (
                  <div className="space-y-4">
                    {[
                      { label: 'Branding Headline', icon: TypeIcon },
                      { label: 'Studio Subtext', icon: Edit3 },
                      { label: 'Digital Caption', icon: TypeIcon }
                    ].map((txt, i) => (
                      <button
                        key={i}
                        onClick={() => addElement('text', txt.label)}
                        className="w-full p-6 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-4 hover:border-emerald-500/40 transition-all group group-hover:bg-emerald-500/5"
                      >
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                           <txt.icon className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="flex-1 text-left text-[10px] font-black uppercase tracking-widest text-[#F1F5F9] group-hover:text-emerald-400">
                          {txt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-8 border-t border-white/5 space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60">Stage Control</h3>
                <div className="flex bg-black/40 p-1.5 rounded-2xl gap-1">
                  {(['solid', 'gradient', 'transparent'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setBackgroundType(type)}
                      className={cn(
                        "flex-1 py-3 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all",
                        backgroundType === type ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                
                {backgroundType !== 'transparent' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black uppercase text-emerald-500/40">Primary Color</span>
                      <div className="flex gap-1">
                        {['#020617', '#1E293B', '#10B981', '#FFB800', '#F1F5F9'].map(c => (
                          <button
                           key={c}
                           onClick={() => setBackgroundColor(c)}
                           className={cn(
                             "w-4 h-4 rounded-full border transition-all",
                             backgroundColor === c ? "border-white scale-110" : "border-transparent"
                           )}
                           style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {backgroundType === 'gradient' && (
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-black uppercase text-emerald-500/40">Secondary Color</span>
                        <div className="flex gap-1">
                          {['#020617', '#1E293B', '#10B981', '#F59E0B', '#EF4444'].map(c => (
                            <button
                             key={c}
                             onClick={() => setGradientColorEnd(c)}
                             className={cn(
                               "w-4 h-4 rounded-full border transition-all",
                               gradientColorEnd === c ? "border-white scale-110" : "border-transparent"
                             )}
                             style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {backgroundType === 'gradient' && (
                      <div className="flex bg-black/40 p-1 rounded-xl gap-1">
                         <button 
                          onClick={() => setGradientType('linear')}
                          className={cn("flex-1 py-2 text-[7px] font-black uppercase rounded-lg transition-all",
                            gradientType === 'linear' ? "bg-white/10 text-emerald-400" : "text-muted"
                          )}
                         >
                           Linear
                         </button>
                         <button 
                          onClick={() => setGradientType('radial')}
                          className={cn("flex-1 py-2 text-[7px] font-black uppercase rounded-lg transition-all",
                            gradientType === 'radial' ? "bg-white/10 text-emerald-400" : "text-muted"
                          )}
                         >
                           Radial
                         </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            selectedElement && (
              <div className="flex-1 flex flex-col animate-in slide-in-from-right duration-500">
               <div className="p-8 border-b border-white/5 bg-black/20 flex justify-between items-center">
                  <h2 className="text-xl font-black uppercase tracking-tighter text-foreground flex items-center gap-3">
                    <Settings2 className="w-5 h-5 text-emerald-400" /> Inspector
                  </h2>
                  <button onClick={() => setSelectedId(null)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
               </div>                <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-2">
                       <h3 className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em]">Properties</h3>
                       <div className="h-px flex-1 bg-emerald-500/10 ml-4" />
                    </div>
                    
                    <div className="space-y-5">
                      {[
                        { label: 'Opacity', value: selectedElement.opacity, min: 0, max: 1, step: 0.01, quickStep: 0.1, key: 'opacity' },
                        { label: 'Rotation', value: selectedElement.rotation, min: -180, max: 180, step: 1, quickStep: 1, key: 'rotation' },
                        { label: 'Width', value: selectedElement.width, min: 20, max: 2000, step: 1, quickStep: 1, key: 'width' },
                        { label: 'Height', value: selectedElement.height, min: 20, max: 2000, step: 1, quickStep: 1, key: 'height' }
                      ].map(prop => (
                        <div key={prop.key} className="space-y-3">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-muted">
                             <span>{prop.label}</span>
                             <div className="flex items-center bg-black/40 rounded-lg border border-white/5 p-0.5">
                               <button 
                                 onClick={() => updateElement(selectedId, { [prop.key]: Math.max(prop.min, (prop.value || 0) - (prop.quickStep)) })}
                                 className="w-5 h-5 flex items-center justify-center hover:text-emerald-400 transition-colors"
                               >
                                 <Minus className="w-2.5 h-2.5" />
                               </button>
                               <span className="text-emerald-400 min-w-8 text-center text-[9px] font-bold">
                                 {typeof prop.value === 'number' ? prop.value.toFixed(prop.step < 1 ? 2 : 0) : prop.value}
                               </span>
                               <button 
                                 onClick={() => updateElement(selectedId, { [prop.key]: Math.min(prop.max, (prop.value || 0) + (prop.quickStep)) })}
                                 className="w-5 h-5 flex items-center justify-center hover:text-emerald-400 transition-colors"
                               >
                                 <Plus className="w-2.5 h-2.5" />
                               </button>
                             </div>
                          </div>
                          <input 
                            type="range" min={prop.min} max={prop.max} step={prop.step} value={prop.value}
                            onChange={(e) => updateElement(selectedId, { [prop.key]: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      ))}

                      {/* Integrated Font Size Control (Canva style) */}
                      {selectedElement.type === 'text' && (
                        <div className="space-y-3 pt-2">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-muted">
                             <span>Font Size</span>
                             <div className="flex items-center bg-black/40 rounded-lg border border-emerald-500/20 p-0.5 ring-1 ring-emerald-500/10">
                               <button 
                                 onClick={() => updateElement(selectedId, { fontSize: Math.max(8, (selectedElement.fontSize || 32) - 1) })}
                                 className="w-5 h-5 flex items-center justify-center hover:text-emerald-400 transition-colors"
                               >
                                 <Minus className="w-2.5 h-2.5" />
                               </button>
                               <input 
                                 type="text" 
                                 value={selectedElement.fontSize}
                                 onChange={(e) => {
                                   const val = parseInt(e.target.value);
                                   if (!isNaN(val)) updateElement(selectedId, { fontSize: val });
                                 }}
                                 className="w-10 bg-transparent text-center text-[10px] font-bold text-emerald-400 outline-none"
                               />
                               <button 
                                 onClick={() => updateElement(selectedId, { fontSize: Math.min(1000, (selectedElement.fontSize || 32) + 1) })}
                                 className="w-5 h-5 flex items-center justify-center hover:text-emerald-400 transition-colors"
                               >
                                 <Plus className="w-2.5 h-2.5" />
                               </button>
                             </div>
                          </div>
                          <input 
                            type="range" min="8" max="1000" step="1" value={selectedElement.fontSize || 32}
                            onChange={(e) => updateElement(selectedId, { fontSize: parseInt(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedElement.type === 'text' && (
                    <div className="space-y-6 pt-6 border-t border-white/5">
                      <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 mb-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Text Properties</span>
                      </div>

                      <textarea 
                        value={selectedElement.content}
                        onChange={(e) => updateElement(selectedId, { content: e.target.value })}
                        placeholder="Type something..."
                        className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-[10px] font-bold tracking-widest outline-none focus:border-emerald-500/40 min-h-[80px] text-foreground resize-none"
                      />
                      
                      {/* Styling Actions (Inline Controls) */}
                      <div className="flex items-center gap-2">
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => updateElement(selectedId, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
                            className={cn(
                              "w-10 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.fontWeight === 'bold' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <Bold className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateElement(selectedId, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
                            className={cn(
                              "w-10 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.fontStyle === 'italic' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <Italic className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateElement(selectedId, { textDecoration: selectedElement.textDecoration === 'underline' ? 'none' : 'underline' })}
                            className={cn(
                              "w-10 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.textDecoration === 'underline' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <Underline className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex flex-1 bg-black/40 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => updateElement(selectedId, { textAlign: 'left' })}
                            className={cn(
                              "flex-1 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.textAlign === 'left' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <AlignLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateElement(selectedId, { textAlign: 'center' })}
                            className={cn(
                              "flex-1 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.textAlign === 'center' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <AlignCenter className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateElement(selectedId, { textAlign: 'right' })}
                            className={cn(
                              "flex-1 h-10 flex items-center justify-center rounded-lg transition-all",
                              selectedElement.textAlign === 'right' ? "bg-emerald-500 text-white shadow-lg" : "text-muted hover:text-emerald-400"
                            )}
                          >
                            <AlignRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <span className="text-[8px] font-black uppercase text-emerald-500/40">Color</span>
                        <div className="grid grid-cols-6 gap-2">
                          {['#ffffff', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#000000'].map(c => (
                            <button
                              key={c}
                              onClick={() => updateElement(selectedId, { color: c })}
                              className={cn(
                                "aspect-square rounded-full border transition-all",
                                selectedElement.color === c ? "border-white scale-110" : "border-transparent"
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 space-y-3">
                    <button onClick={() => setElements(elements.filter(e => e.id !== selectedId))} className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                      Delete Node
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </aside>
      </div>

      {/* Live Preview Overlay */}
      <AnimatePresence>
        {showLivePreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLivePreview(false)}
              className="absolute inset-0 bg-black/98 backdrop-blur-3xl"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 50 }}
              className="relative max-w-2xl w-full flex flex-col items-center gap-16"
            >
               <div className="text-center space-y-6">
                <h2 className="text-6xl font-black text-white tracking-[-0.05em] uppercase leading-none">Simulation Lab</h2>
                <p className="text-emerald-400/60 text-[10px] font-black uppercase tracking-[1em] px-4 py-2 border border-emerald-500/10 rounded-full bg-emerald-500/5 inline-block">Final Composition Verification</p>
              </div>

              <div 
                className="p-3 shadow-[0_0_200px_rgba(16,185,129,0.1)] relative overflow-hidden"
                style={{
                  width: isLandscape 
                    ? (layoutType === '4x6-1-photo' ? '500px' : '600px')
                    : (layoutType === '4x6-1-photo' ? '500px' : '230px'),
                  aspectRatio: currentAspectRatio,
                  backgroundColor: backgroundType === 'transparent' ? 'transparent' : (backgroundType === 'solid' ? backgroundColor : 'transparent'),
                  backgroundImage: backgroundType === 'gradient' 
                    ? `${gradientType === 'linear' ? 'linear-gradient' : 'radial-gradient'}(${backgroundColor}, ${gradientColorEnd})` 
                    : 'none',
                }}
              >
                 {activeTemplate && (
                  <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-100 p-1">
                    <img src={activeTemplate.imageUrl} className="w-full h-full object-contain" alt="" referrerPolicy="no-referrer" />
                  </div>
                )}

                {elements.map(el => (
                   <div
                   key={el.id}
                   style={{
                     position: 'absolute',
                     left: `${el.x}%`,
                     top: `${el.y}%`,
                     width: `${el.width}px`,
                     height: `${el.height}px`,
                     transform: `rotate(${el.rotation}deg)`,
                     opacity: el.opacity,
                     color: el.color,
                     fontSize: `${el.fontSize}px`,
                     fontWeight: el.fontWeight,
                     fontStyle: el.fontStyle || 'normal',
                     textDecoration: el.textDecoration || 'none',
                     textAlign: el.textAlign,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     userSelect: 'none',
                     pointerEvents: 'none',
                     zIndex: 20
                   }}
                 >
                   {el.type === 'sticker' ? (
                     el.content.startsWith('http') ? <img src={el.content} className="w-full h-full object-contain" alt="" /> : el.content
                   ) : (
                     <span className="whitespace-pre-wrap">{el.content}</span>
                   )}
                 </div>
                ))}

                {slots.map(slot => (
                  <div
                    key={slot.id}
                    style={{
                      position: 'absolute',
                      left: `${slot.x}%`,
                      top: `${slot.y}%`,
                      width: `${slot.w}%`,
                      height: `${slot.h}%`,
                      backgroundColor: '#1E293B',
                      backgroundImage: 'url(https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid rgba(255,255,255,0.1)',
                      zIndex: 10
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-4">
                 <button 
                  onClick={() => setShowLivePreview(false)}
                  className="px-16 py-6 bg-emerald-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] transition-all hover:scale-105 active:scale-95 shadow-[0_20px_40px_rgba(16,185,129,0.2)]"
                >
                  Return to Matrix
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Helper Component for Canvas Interaction
const DraggableElement: React.FC<{
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  onDelete: () => void;
}> = ({ element, isSelected, onSelect, onChange, onDelete }) => {
  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragEnd={(e, info) => {
        const parent = (e.target as HTMLElement).parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          const newX = ((info.point.x - rect.left) / rect.width) * 100;
          const newY = ((info.point.y - rect.top) / rect.height) * 100;
          onChange({ x: Math.max(0, Math.min(95, newX)), y: Math.max(0, Math.min(95, newY)) });
        }
      }}
      initial={false}
      animate={{ 
        left: `${element.x}%`, 
        top: `${element.y}%`,
        rotate: element.rotation,
        opacity: element.opacity
      }}
      className={cn(
        "absolute cursor-move select-none flex items-center justify-center p-2 transition-shadow",
        isSelected && "ring-2 ring-emerald-500 ring-offset-4 ring-offset-transparent shadow-[0_0_30px_rgba(16,185,129,0.3)] z-50"
      )}
      style={{
        width: element.width,
        height: element.height,
        position: 'absolute',
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Visual Bounding Box Corners */}
      {isSelected && (
        <>
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white shadow-lg z-[60]" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white shadow-lg z-[60]" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white shadow-lg z-[60]" />
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white shadow-lg z-[60]" />
        </>
      )}

      {element.type === 'sticker' ? (
        element.content.startsWith('http') ? (
          <img src={element.content} className="w-full h-full object-contain pointer-events-none" alt="" />
        ) : (
          <span className="text-4xl pointer-events-none drop-shadow-lg">{element.content}</span>
        )
      ) : (
        <span 
          style={{ 
            color: element.color, 
            fontSize: element.fontSize, 
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle || 'normal',
            textDecoration: element.textDecoration || 'none',
            textAlign: element.textAlign,
            lineHeight: 1
          }}
          className="whitespace-pre-wrap text-center block w-full drop-shadow-md pb-2"
        >
          {element.content}
        </span>
      )}

      {/* Control Overlay */}
      <AnimatePresence>
        {isSelected && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute inset-x-0 -top-16 flex items-center justify-center gap-3 pointer-events-auto"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-10 h-10 bg-red-500 text-white rounded-xl shadow-xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all border border-red-400/20"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              className="w-10 h-10 bg-emerald-500 text-white rounded-xl shadow-xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all border border-emerald-400/20"
              onMouseDown={(e) => {
                e.stopPropagation();
                // Future resize expansion
              }}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resize Handle */}
      {isSelected && (
        <div 
          className="absolute -bottom-2 -right-2 w-6 h-6 bg-emerald-500 rounded-lg cursor-nwse-resize shadow-xl border-2 border-[#0B0F19] pointer-events-auto flex items-center justify-center"
          onMouseDown={(e) => e.stopPropagation()}
        >
           <Move className="w-3 h-3 text-white" />
        </div>
      )}
    </motion.div>
  );
};

export default Storyboard;
