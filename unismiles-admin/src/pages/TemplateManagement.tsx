import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  Upload,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  LayoutTemplate,
  Type,
  Palette,
  Copy,
  Sparkles,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import api from '../lib/api';
import { resolvePublicUrl, toStoredAssetPath } from '../lib/urls';
import { fetchReusableAssets, ReusableAsset, resolveAssetUrl, uploadReusableAsset } from '../lib/assets';

// ─── Google Fonts List ────────────────────────────────────────────────────────

const GOOGLE_FONTS = [
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Poppins', family: 'Poppins, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Playfair Display', family: "'Playfair Display', serif" },
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Pacifico', family: 'Pacifico, cursive' },
  { name: 'Caveat', family: 'Caveat, cursive' },
  { name: 'Satisfy', family: 'Satisfy, cursive' },
  { name: 'Space Grotesk', family: "'Space Grotesk', sans-serif" },
  { name: 'Roboto', family: 'Roboto, sans-serif' },
];

const GRADIENT_PRESETS = [
  { name: 'Neon Night', style: 'linear', angle: 45, stops: [{ color: '#ff00cc', position: 0 }, { color: '#333399', position: 100 }] },
  { name: 'Sunset Glow', style: 'linear', angle: 135, stops: [{ color: '#ff512f', position: 0 }, { color: '#dd2476', position: 100 }] },
  { name: 'Cyberpunk', style: 'linear', angle: 90, stops: [{ color: '#00f2fe', position: 0 }, { color: '#4facfe', position: 100 }] },
  { name: 'Midnight Luxe', style: 'linear', angle: 45, stops: [{ color: '#141e30', position: 0 }, { color: '#243b55', position: 100 }] },
  { name: 'Emerald', style: 'linear', angle: 60, stops: [{ color: '#0ba360', position: 0 }, { color: '#3cba92', position: 100 }] },
  { name: 'Deep Space', style: 'radial', angle: 0, stops: [{ color: '#302b63', position: 0 }, { color: '#0f0c29', position: 100 }] },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface GradientStop {
  color: string;
  position: number;
}

export interface TextElement {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  x: number; // percentage (0-100) or px
  y: number; // percentage (0-100) or px
  fontWeight?: string;
}

interface AssetElement {
  id: string;
  assetId: string | number;
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
}

interface FrameTemplate {
  id: number;
  name: string;
  layout_id: string;
  image_url: string;
  slot_count: number;
  layout_config: any[];
  bg_color: string;
  accent_color: string;
  frame_type: 'color' | 'gradient' | 'png';
  gradient_stops: GradientStop[];
  gradient_angle: number;
  gradient_style: 'linear' | 'radial';
  text_elements: TextElement[];
  asset_id?: string | number | null;
  asset_elements?: AssetElement[];
  is_active: boolean;
  price: number | null;
  usage_count: number;
  created_at: string;
}

const getTemplateAssetElements = (template: FrameTemplate): AssetElement[] => {
  const config = typeof template.layout_config === 'string'
    ? (() => { try { return JSON.parse(template.layout_config as any); } catch (_) { return {}; } })()
    : (template.layout_config || {});
  const elements = Array.isArray(config?.assetElements)
    ? config.assetElements
    : (Array.isArray(config?.asset_elements)
      ? config.asset_elements
      : (Array.isArray(template.asset_elements) ? template.asset_elements : []));

  return elements
    .filter((element: any) => element?.url)
    .map((element: any) => ({
      ...element,
      url: resolveAssetUrl(element.url),
    }));
};

// ─── Layout Presets ───────────────────────────────────────────────────────────

interface LayoutPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  slots: number;
  cols: number;
  rows: number;
}

const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: '1x1',  label: 'Polaroid',  width: 708, height: 1062, slots: 1, cols: 1, rows: 1 },
  { id: '2x1',  label: 'Strip 2',   width: 591,  height: 1772, slots: 2, cols: 1, rows: 2 },
  { id: '3x1',  label: 'Strip 3',   width: 591,  height: 1772, slots: 3, cols: 1, rows: 3 },
  { id: '4x1',  label: 'Strip 4',   width: 591,  height: 1772, slots: 4, cols: 1, rows: 4 },
  { id: '2x2',  label: 'Grid 2x2',  width: 1205, height: 1795, slots: 4, cols: 2, rows: 2 },
  { id: '2x3',  label: 'Grid 2x3',  width: 1205, height: 1795, slots: 6, cols: 2, rows: 3 },
  { id: '3x3',  label: 'Grid 3x3',  width: 1795, height: 2398, slots: 9, cols: 3, rows: 3 },
];

function computeSlots(preset: LayoutPreset) {
  if (preset.id === '1x1') {
    // 2R polaroid format: large bottom margin for text
    return [{ x: 40, y: 40, w: preset.width - 80, h: preset.height - 280 }];
  }

  // Matches the UniSmiles Photobooth strip standard: 30 px top/side margin,
  // 20 px between photos, and a 250 px footer reserved for branding.
  if (preset.id === '2x1' || preset.id === '3x1' || preset.id === '4x1') {
    const SLOT_X = 30;
    const SLOT_Y = 30;
    const SLOT_WIDTH = preset.width - 60;
    const GAP = 20;
    const FOOTER_HEIGHT = 250;
    const SLOT_HEIGHT = Math.floor(
      (preset.height - SLOT_Y - FOOTER_HEIGHT - (preset.slots - 1) * GAP) / preset.slots
    );

    return Array.from({ length: preset.slots }, (_, index) => ({
      x: SLOT_X,
      y: SLOT_Y + index * (SLOT_HEIGHT + GAP),
      w: SLOT_WIDTH,
      h: SLOT_HEIGHT,
    }));
  }

  const PAD_X = 60, PAD_Y = 70, GAP = 18;
  const availW = preset.width - PAD_X * 2 - (preset.cols - 1) * GAP;
  const availH = preset.height - PAD_Y * 2 - (preset.rows - 1) * GAP;
  const slotW = Math.floor(availW / preset.cols);
  const slotH = Math.floor(availH / preset.rows);
  const slots = [];
  for (let r = 0; r < preset.rows; r++) {
    for (let c = 0; c < preset.cols; c++) {
      slots.push({
        x: PAD_X + c * (slotW + GAP),
        y: PAD_Y + r * (slotH + GAP),
        w: slotW,
        h: slotH,
      });
    }
  }
  return slots;
}

/**
 * The kiosk consumes the frame configuration, not the Admin editor's
 * presentation-specific fields. Keep this shape in layout_config so the
 * backend can return the exact same frame definition to the kiosk.
 */
function buildFrameConfig(
  preset: LayoutPreset,
  frameType: 'color' | 'gradient' | 'png',
  bgColor: string,
  accentColor: string,
  gradientStops: GradientStop[],
  gradientAngle: number,
  gradientStyle: 'linear' | 'radial',
  textElements: TextElement[] = [],
  overlayUrl = '',
  overlayAssetId: string | number | null = null,
  assetElements: AssetElement[] = [],
) {
  const slots = computeSlots(preset).map((slot, index) => ({
    index,
    x: slot.x,
    y: slot.y,
    width: slot.w,
    height: slot.h,
  }));

  return {
    width: preset.width,
    height: preset.height,
    backgroundConfig: {
      type: frameType === 'gradient' ? 'gradient' : frameType === 'png' ? 'image' : 'solid',
      gradientType: gradientStyle,
      gradientAngle,
      gradientStops: gradientStops.map(stop => ({
        color: stop.color,
        offset: stop.position,
      })),
      color: bgColor,
    },
    slotBorder: {
      color: accentColor || '#FFFFFF',
      width: 2,
    },
    slots,
    elements: textElements,
    assetElements: assetElements.map(element => ({
      ...element,
      url: toStoredAssetPath(element.url),
    })),
    overlayUrl: toStoredAssetPath(overlayUrl),
    overlayAssetId,
  };
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────

interface CanvasPreviewProps {
  preset: LayoutPreset;
  bgColor: string;
  accentColor: string;
  frameType: 'color' | 'gradient' | 'png';
  gradientStops: GradientStop[];
  gradientAngle: number;
  gradientStyle: 'linear' | 'radial';
  textElements?: TextElement[];
  assetElements?: AssetElement[];
  imageUrl?: string;
  onAssetChange?: (id: string, patch: Partial<AssetElement>) => void;
  onAssetSelect?: (id: string) => void;
  selectedAssetElementId?: string | null;
  displayWidth?: number;
  maxHeight?: number;
  className?: string;
}

const CanvasPreview: React.FC<CanvasPreviewProps> = ({
  preset, bgColor, accentColor, frameType,
  gradientStops, gradientAngle, gradientStyle, textElements = [],
  assetElements = [], imageUrl, displayWidth = 140, maxHeight, className,
  onAssetChange, onAssetSelect, selectedAssetElementId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aspect = preset.width / preset.height;
  let calcW = displayWidth;
  let calcH = Math.round(displayWidth / aspect);

  if (maxHeight && calcH > maxHeight) {
    calcH = maxHeight;
    calcW = Math.round(maxHeight * aspect);
  }

  useEffect(() => {
    console.log('CanvasPreview effect:', { assetElements: assetElements.length, frameType, imageUrl });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = preset.width;
    canvas.height = preset.height;

    const drawTextElements = () => {
      if (!textElements || textElements.length === 0) return;
      textElements.forEach(item => {
        ctx.save();
        ctx.fillStyle = item.color || '#FFFFFF';
        ctx.font = `${item.fontWeight || 'bold'} ${item.fontSize || 48}px ${item.fontFamily || 'Inter, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const posX = (item.x / 100) * preset.width;
        const posY = (item.y / 100) * preset.height;
        ctx.fillText(item.text, posX, posY);
        ctx.restore();
      });
    };

    const draw = (backgroundImage?: HTMLImageElement, assetImages: Array<{ element: AssetElement; image: HTMLImageElement }> = []) => {
      ctx.clearRect(0, 0, preset.width, preset.height);
      console.log('Canvas draw:', { backgroundImage: !!backgroundImage, assetImages: assetImages.length, frameType, textElements: textElements.length });

      // Uploaded artwork is a background layer. Slot fills and borders are
      // rendered afterwards so the frame structure remains visible.
      if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, preset.width, preset.height);
      }

      if (!backgroundImage && frameType === 'gradient' && gradientStops.length >= 2) {
        let grad: CanvasGradient;
        if (gradientStyle === 'radial') {
          grad = ctx.createRadialGradient(
            preset.width / 2, preset.height / 2, 0,
            preset.width / 2, preset.height / 2,
            Math.max(preset.width, preset.height) / 2
          );
        } else {
          const angleRad = (gradientAngle * Math.PI) / 180;
          const cx = preset.width / 2, cy = preset.height / 2;
          const len = Math.sqrt(preset.width ** 2 + preset.height ** 2) / 2;
          grad = ctx.createLinearGradient(
            cx - Math.cos(angleRad) * len,
            cy - Math.sin(angleRad) * len,
            cx + Math.cos(angleRad) * len,
            cy + Math.sin(angleRad) * len,
          );
        }
        gradientStops.forEach(s => grad.addColorStop(s.position / 100, s.color));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, preset.width, preset.height);
      } else if (frameType === 'color') {
        ctx.fillStyle = bgColor || '#1E293B';
        ctx.fillRect(0, 0, preset.width, preset.height);
      }

      const slots = computeSlots(preset);
      slots.forEach((slot, index) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
        ctx.strokeStyle = accentColor || '#FFFFFF';
        ctx.lineWidth = Math.max(4, Math.round(preset.width / 180));
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);

        // Draw slot index badge
        ctx.save();
        ctx.fillStyle = accentColor || '#FFFFFF';
        ctx.globalAlpha = 0.5;
        const fontSz = Math.min(slot.w, slot.h) * 0.28;
        ctx.font = `900 ${Math.round(fontSz)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, slot.x + slot.w / 2, slot.y + slot.h / 2);
        ctx.restore();
      });

      drawTextElements();

      assetImages.forEach(({ element, image }) => {
        ctx.save();
        ctx.globalAlpha = element.opacity ?? 1;
        ctx.translate((element.x / 100) * preset.width, (element.y / 100) * preset.height);
        ctx.rotate(((element.rotation || 0) * Math.PI) / 180);
        ctx.drawImage(image, 0, 0, (element.width / 100) * preset.width, (element.height / 100) * preset.height);
        ctx.restore();
      });
    };

    const loadAssets = (backgroundImage?: HTMLImageElement) => {
      if (!assetElements.length) { draw(backgroundImage); return; }
      console.log('Loading assets:', assetElements.map(e => resolveAssetUrl(e.url)));
      Promise.all(assetElements.map(element => new Promise<{ element: AssetElement; image: HTMLImageElement } | null>(resolve => {
        const image = new Image();
        image.onload = () => { console.log('Asset loaded:', resolveAssetUrl(element.url)); resolve({ element, image }); };
        image.onerror = () => { console.error('Failed to load asset image:', resolveAssetUrl(element.url)); resolve(null); };
        image.src = resolveAssetUrl(element.url);
      }))).then(images => { console.log('Drawing assets:', images.filter(Boolean).length); draw(backgroundImage, images.filter(Boolean) as Array<{ element: AssetElement; image: HTMLImageElement }>); });
    };

    if (frameType === 'png' && imageUrl) {
      const img = new Image();
      img.onload = () => {
        loadAssets(img);
      };
      img.onerror = () => {
        console.error('Failed to load frame image:', resolvePublicUrl(imageUrl));
        loadAssets();
      };
      img.src = resolvePublicUrl(imageUrl);
    } else {
      loadAssets();
    }
  }, [preset, bgColor, accentColor, frameType, gradientStops, gradientAngle, gradientStyle, textElements, assetElements, imageUrl, calcW, calcH]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onAssetChange || !onAssetSelect || assetElements.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const selected = [...assetElements].reverse().find(element => x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height);
    if (!selected) return;
    onAssetSelect(selected.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget as any).__assetDrag = { id: selected.id, startX: x, startY: y, originalX: selected.x, originalY: selected.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = (event.currentTarget as any).__assetDrag;
    if (!drag || !onAssetChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onAssetChange(drag.id, { x: Math.max(0, Math.min(100 - 1, drag.originalX + x - drag.startX)), y: Math.max(0, Math.min(100 - 1, drag.originalY + y - drag.startY)) });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    delete (event.currentTarget as any).__assetDrag;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: calcW, height: calcH }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn('rounded-xl', onAssetChange ? 'cursor-move' : '', selectedAssetElementId ? 'touch-none' : '', className)}
    />
  );
};

// ─── Layout Tab Icon ──────────────────────────────────────────────────────────

const LayoutTabIcon: React.FC<{ preset: LayoutPreset; active: boolean }> = ({ preset, active }) => {
  const gridClass =
    preset.id === '1x1' ? 'grid-cols-1 grid-rows-1' :
    preset.id === '2x1' ? 'grid-cols-1 grid-rows-2' :
    preset.id === '3x1' ? 'grid-cols-1 grid-rows-3' :
    preset.id === '4x1' ? 'grid-cols-1 grid-rows-4' :
    preset.id === '2x2' ? 'grid-cols-2 grid-rows-2' :
    preset.id === '2x3' ? 'grid-cols-2 grid-rows-3' :
                          'grid-cols-3 grid-rows-3';
  return (
    <div className={`grid gap-0.5 w-5 h-7 ${gridClass}`}>
      {Array.from({ length: preset.slots }).map((_, i) => (
        <div
          key={i}
          className={`rounded-[1px] transition-colors ${
            active ? 'bg-[#10172A]/60' : 'bg-current opacity-40'
          }`}
        />
      ))}
    </div>
  );
};

// ─── Gradient Stop Editor ─────────────────────────────────────────────────────

const GradientStopEditor: React.FC<{
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}> = ({ stops, onChange }) => {
  const updateStop = (i: number, field: keyof GradientStop, value: string | number) => {
    const next = stops.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    onChange(next);
  };
  const addStop = () => onChange([...stops, { color: '#ffffff', position: 100 }]);
  const removeStop = (i: number) => stops.length > 2 && onChange(stops.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="flex-shrink-0 cursor-pointer relative w-7 h-7 rounded-lg border border-white/20 overflow-hidden shadow">
            <span className="absolute inset-0" style={{ background: stop.color }} />
            <input
              type="color"
              value={stop.color}
              onChange={e => updateStop(i, 'color', e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
          <input
            type="range"
            min={0} max={100}
            value={stop.position}
            onChange={e => updateStop(i, 'position', Number(e.target.value))}
            className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
          />
          <span className="text-[9px] font-mono text-muted w-6 text-right">{stop.position}%</span>
          <button
            type="button"
            onClick={() => removeStop(i)}
            disabled={stops.length <= 2}
            className="p-0.5 text-muted hover:text-red-400 disabled:opacity-20 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStop}
        className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors"
      >
        + Add
      </button>
    </div>
  );
};

// ─── Frame Editor Modal ───────────────────────────────────────────────────────

interface EditorState {
  name: string;
  frameType: 'color' | 'gradient' | 'png';
  bgColor: string;
  accentColor: string;
  gradientStyle: 'linear' | 'radial';
  gradientAngle: number;
  gradientStops: GradientStop[];
  textElements: TextElement[];
  assetElements: AssetElement[];
  selectedAssetElementId: string | null;
  pngFile: File | null;
  pngPreviewUrl: string;
  overlayAssetId: string | number | null;
  overlayAssetUrl: string;
  isActive: boolean;
}

interface FrameEditorModalProps {
  preset: LayoutPreset;
  editingTemplate: FrameTemplate | null;
  framePrice: string;
  onClose: () => void;
  onSaved: () => void;
}

const FrameEditorModal: React.FC<FrameEditorModalProps> = ({
  preset, editingTemplate, framePrice, onClose, onSaved,
}) => {
  const [editorTab, setEditorTab] = useState<'bg' | 'text' | 'asset'>('bg');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoom, setZoom] = useState(35);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<ReusableAsset[]>([]);
  const [assetName, setAssetName] = useState('');
  const [assetUploading, setAssetUploading] = useState(false);

  const existingLayoutConfig = typeof editingTemplate?.layout_config === 'string'
    ? (() => { try { return JSON.parse(editingTemplate.layout_config as any); } catch (_) { return {}; } })()
    : (editingTemplate?.layout_config || {});
  const existingAssetId = editingTemplate?.asset_id ?? existingLayoutConfig.overlayAssetId ?? existingLayoutConfig.asset_id ?? null;
  const existingAssetElements = Array.isArray(existingLayoutConfig.assetElements)
    ? existingLayoutConfig.assetElements
    : (Array.isArray(existingLayoutConfig.asset_elements) ? existingLayoutConfig.asset_elements : []);

  const [state, setState] = useState<EditorState>(() => ({
    name: editingTemplate?.name || '',
    frameType: editingTemplate?.frame_type || 'color',
    bgColor: editingTemplate?.bg_color || '#1E293B',
    accentColor: editingTemplate?.accent_color || '#FFFFFF',
    gradientStyle: editingTemplate?.gradient_style || 'linear',
    gradientAngle: editingTemplate?.gradient_angle ?? 45,
    gradientStops: editingTemplate?.gradient_stops?.length
      ? editingTemplate.gradient_stops
      : [{ color: '#ff006e', position: 0 }, { color: '#4361ee', position: 100 }],
    textElements: editingTemplate?.text_elements || [],
    assetElements: existingAssetElements,
    selectedAssetElementId: null,
    pngFile: null,
    pngPreviewUrl: '',
    overlayAssetId: existingAssetId,
    overlayAssetUrl: existingLayoutConfig.overlayUrl || '',
    isActive: editingTemplate ? editingTemplate.is_active : true,
  }));

  useEffect(() => {
    // Ambil KEDUA jenis aset, bukan hanya 'logo'.
    //
    // Sebelumnya di sini hanya 'logo', padahal gambar frame yang di-upload lewat
    // "Upload Image" disimpan sebagai 'overlay'. Akibatnya gambar berhasil
    // tersimpan tetapi tidak pernah muncul di daftar — pengguna melihat seolah
    // upload-nya gagal.
    Promise.all([fetchReusableAssets('logo'), fetchReusableAssets('overlay')])
      .then(([logos, overlays]) => {
        const list = [...overlays, ...logos];
        setAssets(list);
        if (existingAssetId) {
          const selected = list.find(asset => String(asset.id) === String(existingAssetId));
          if (selected) update({ overlayAssetUrl: selected.url });
        }
      })
      .catch(() => undefined);
  }, [existingAssetId]);

  const update = (patch: Partial<EditorState>) => setState(s => ({ ...s, ...patch }));

  const addTextElement = () => {
    const newText: TextElement = {
      id: Math.random().toString(36).substring(2, 9),
      text: 'Edit Text',
      fontFamily: 'Inter, sans-serif',
      fontSize: 48,
      color: '#FFFFFF',
      x: 50,
      y: 90,
    };
    update({ textElements: [...state.textElements, newText] });
  };

  const updateTextElement = (id: string, patch: Partial<TextElement>) => {
    update({
      textElements: state.textElements.map(t => t.id === id ? { ...t, ...patch } : t),
    });
  };

  const removeTextElement = (id: string) => {
    update({ textElements: state.textElements.filter(t => t.id !== id) });
  };

  const createAssetElement = (asset: ReusableAsset, position?: { x: number; y: number }) => {
    const slot = computeSlots(preset)[0];
    const element: AssetElement = {
      id: Math.random().toString(36).slice(2, 10),
      assetId: asset.id,
      name: asset.name,
      url: asset.url,
      x: position?.x ?? (slot ? (slot.x + slot.w / 2) / preset.width * 100 - 15 : 35),
      y: position?.y ?? (slot ? (slot.y + slot.h / 2) / preset.height * 100 - 6 : 40),
      width: slot ? (slot.w / preset.width) * 100 * 0.6 : 30,
      height: slot ? (slot.h / preset.height) * 100 * 0.3 : 20,
      opacity: 1,
      rotation: 0,
    };
    return element;
  };

  const handleOverlayFile = async (file?: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Format gambar harus PNG, JPG, JPEG, atau WebP.');
      return;
    }
    setAssetUploading(true);
    try {
      const asset = await uploadReusableAsset(file, assetName || file.name, 'overlay');
      setAssets(current => [asset, ...current]);
      setAssetName('');
      addOverlayAsBackground(asset);
      toast.success('Gambar frame di-upload dan dijadikan Background Frame (di belakang foto).');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal meng-upload gambar frame.');
    } finally {
      setAssetUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleOverlayFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleOverlayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetData = e.dataTransfer.getData('application/x-asset');
    if (assetData) {
      try {
        const asset = JSON.parse(assetData) as ReusableAsset;
        addOverlayAsBackground(asset);
        return;
      } catch {}
    }
    void handleOverlayFile(e.dataTransfer.files?.[0]);
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: ReusableAsset) => {
    e.dataTransfer.setData('application/x-asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const selectReusableAsset = (asset: ReusableAsset) => {
    addOverlayAsBackground(asset);
  };

  const addOverlayAsBackground = (asset: ReusableAsset) => {
    update({
      frameType: 'png',
      overlayAssetId: asset.id,
      overlayAssetUrl: asset.url,
      pngPreviewUrl: asset.url,
      pngFile: null,
      assetElements: state.assetElements.filter(el => String(el.assetId) !== String(asset.id) && el.width < 90),
    });
    setEditorTab('bg');
    toast.success(`"${asset.name}" dijadikan Background Frame (di belakang foto).`);
  };

  const addAssetElement = (asset: ReusableAsset, position?: { x: number; y: number }) => {
    const element = createAssetElement(asset, position);
    setState(current => ({
      ...current,
      assetElements: [...current.assetElements, element],
      selectedAssetElementId: element.id,
    }));
  };

  const updateAssetElement = (id: string, patch: Partial<AssetElement>) => {
    update({ assetElements: state.assetElements.map(element => element.id === id ? { ...element, ...patch } : element) });
  };

  const removeAssetElement = (id: string) => {
    update({ assetElements: state.assetElements.filter(element => element.id !== id) });
  };

  const handleReusableAssetUpload = async (file?: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) { toast.error('Format gambar harus PNG, JPG, JPEG, atau WebP.'); return; }
    setAssetUploading(true);
    try {
      const asset = await uploadReusableAsset(file, assetName || file.name, 'logo');
      setAssets(current => [asset, ...current]);
      setAssetName('');
      toast.success('Asset berhasil di-upload. Pilih untuk dijadikan Background atau Stiker.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal meng-upload asset.');
    } finally {
      setAssetUploading(false);
      if (assetFileInputRef.current) assetFileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!state.name.trim()) { toast.error('Frame name is required.'); return; }
    const price = Number(framePrice);
    if (!framePrice.trim() || !Number.isFinite(price) || price < 0) {
      toast.error('Atur harga layout terlebih dahulu sebelum menyimpan frame.');
      return;
    }

    setIsSubmitting(true);
    try {
      const frameConfig = buildFrameConfig(
        preset,
        state.frameType,
        state.bgColor,
        state.accentColor,
        state.gradientStops,
        state.gradientAngle,
        state.gradientStyle,
        state.textElements,
        state.frameType === 'png' ? state.overlayAssetUrl || editingTemplate?.image_url || '' : '',
        state.overlayAssetId,
        state.assetElements,
      );

      if (editingTemplate) {
        if (state.frameType === 'png' && state.pngFile) {
          const form = new FormData();
          form.append('frame_image', state.pngFile);
          form.append('name', state.name.trim());
          form.append('layout_id', preset.id);
          form.append('slot_count', String(preset.slots));
          form.append('layout_config', JSON.stringify(frameConfig));
          form.append('width', String(frameConfig.width));
          form.append('height', String(frameConfig.height));
          form.append('slots', JSON.stringify(frameConfig.slots));
          form.append('backgroundConfig', JSON.stringify(frameConfig.backgroundConfig));
          form.append('slotBorder', JSON.stringify(frameConfig.slotBorder));
          form.append('elements', JSON.stringify(frameConfig.elements));
          form.append('overlayUrl', frameConfig.overlayUrl);
          form.append('bg_color', 'transparent');
          form.append('accent_color', state.accentColor);
          form.append('text_elements', JSON.stringify(state.textElements));
          form.append('price', String(price));
          if (state.overlayAssetId) form.append('asset_id', String(state.overlayAssetId));
          await api.delete(`/admin/templates/${editingTemplate.id}`);
          await api.post('/admin/templates', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          await api.put(`/admin/templates/${editingTemplate.id}`, {
            ...frameConfig,
            name: state.name.trim(),
            layout_id: preset.id,
            slot_count: preset.slots,
            layout_config: frameConfig,
            bg_color: state.bgColor,
            accent_color: state.accentColor,
            frame_type: state.frameType,
            gradient_stops: state.gradientStops,
            gradient_angle: state.gradientAngle,
            gradient_style: state.gradientStyle,
            text_elements: state.textElements,
            is_active: state.isActive,
            price,
            asset_id: state.overlayAssetId,
            asset_elements: frameConfig.assetElements,
          });
        }
        toast.success('Frame updated!');
      } else {
        if (state.frameType === 'png' && state.pngFile) {
          const form = new FormData();
          form.append('frame_image', state.pngFile);
          form.append('name', state.name.trim());
          form.append('layout_id', preset.id);
          form.append('slot_count', String(preset.slots));
          form.append('layout_config', JSON.stringify(frameConfig));
          form.append('width', String(frameConfig.width));
          form.append('height', String(frameConfig.height));
          form.append('slots', JSON.stringify(frameConfig.slots));
          form.append('backgroundConfig', JSON.stringify(frameConfig.backgroundConfig));
          form.append('slotBorder', JSON.stringify(frameConfig.slotBorder));
          form.append('elements', JSON.stringify(frameConfig.elements));
          form.append('overlayUrl', frameConfig.overlayUrl);
          form.append('bg_color', 'transparent');
          form.append('accent_color', state.accentColor);
          form.append('text_elements', JSON.stringify(state.textElements));
          form.append('price', String(price));
          if (state.overlayAssetId) form.append('asset_id', String(state.overlayAssetId));
          await api.post('/admin/templates', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          await api.post('/admin/templates/generate', {
            ...frameConfig,
            name: state.name.trim(),
            layout_id: preset.id,
            slot_count: preset.slots,
            layout_config: frameConfig,
            bg_color: state.bgColor,
            accent_color: state.accentColor,
            frame_type: state.frameType,
            gradient_stops: state.gradientStops,
            gradient_angle: state.gradientAngle,
            gradient_style: state.gradientStyle,
            text_elements: state.textElements,
            price,
            asset_id: state.overlayAssetId,
            asset_elements: frameConfig.assetElements,
          });
        }
        toast.success('Frame created!');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save frame.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewImageUrl = state.frameType === 'png'
    ? state.pngPreviewUrl || state.overlayAssetUrl || editingTemplate?.image_url || ''
    : '';

  const resolvedExistingPng = editingTemplate?.frame_type === 'png' && editingTemplate?.image_url
    ? resolvePublicUrl(editingTemplate.image_url)
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F19]/95 backdrop-blur-md flex flex-col">
      {/* Top Header */}
      <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between flex-shrink-0 bg-[#0D1322]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Frame Editor</p>
            <p className="text-xs font-bold text-foreground">
              {preset.name} ({preset.width}x{preset.height})
            </p>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(15, z - 5))} className="p-1.5 text-muted hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-muted w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(100, z + 5))} className="p-1.5 text-muted hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-muted hover:text-foreground text-[10px] font-bold uppercase tracking-wider transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !state.name.trim()}
            onClick={handleSave}
            className="px-4 py-1.5 bg-primary text-[#10172A] rounded-lg text-[10px] font-black uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center gap-1.5"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isSubmitting ? 'Saving...' : editingTemplate ? 'Update Frame' : 'Save Frame'}
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar - Controls */}
        <div className="w-72 border-r border-white/10 flex flex-col bg-[#0D1322] flex-shrink-0">
          {/* Sub-tabs */}
          <div className="flex border-b border-white/10 flex-shrink-0">
            {([
              { id: 'bg', label: 'BG', icon: Palette },
              { id: 'text', label: 'Text', icon: Type },
              { id: 'asset', label: 'Asset', icon: Layers },
            ] as const).map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setEditorTab(tab.id)}
                  className={cn(
                    'flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border-b-2',
                    editorTab === tab.id
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {editorTab === 'bg' && (
              <div className="p-3 space-y-4">
                {/* Frame Type */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">Background Type</p>
                  <div className="flex gap-1 bg-black/30 p-0.5 rounded-lg border border-white/10">
                    {(['color', 'gradient', 'png'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => update({ frameType: t })}
                        className={cn(
                          'flex-1 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-md transition-all',
                          state.frameType === t
                            ? 'bg-primary text-[#10172A]'
                            : 'bg-white/5 text-muted hover:bg-white/10 hover:text-foreground'
                        )}
                      >
                        {t === 'color' ? 'Solid' : t === 'gradient' ? 'Gradient' : 'Gambar / PNG / JPG'}
                      </button>
                    ))}
                  </div>
                </div>

                {state.frameType === 'color' && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">Color</p>
                    <label className="flex items-center gap-2 cursor-pointer bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 hover:border-primary/30 transition-colors">
                      <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" style={{ background: state.bgColor }} />
                      <input type="color" value={state.bgColor} onChange={e => update({ bgColor: e.target.value })} className="sr-only" />
                      <span className="font-mono text-[9px] text-foreground">{state.bgColor.toUpperCase()}</span>
                    </label>
                  </div>
                )}

                {state.frameType === 'png' && (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[9px] font-bold leading-relaxed">
                      ✨ Gambar ini berada di <u>LAPISAN PALING BELAKANG</u> (di bawah kotak foto), sehingga foto dan border slot akan tampil rapi di depannya.
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={assetUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 bg-primary/15 border border-dashed border-primary/50 text-primary text-[9px] font-black uppercase tracking-wider rounded-xl hover:bg-primary/25 transition-all flex flex-col items-center justify-center gap-1.5"
                    >
                      <Upload className="w-4 h-4" />
                      {assetUploading ? 'Mengunggah...' : 'Upload Background Gambar (PNG / JPG)'}
                    </button>

                    {(state.pngPreviewUrl || state.overlayAssetUrl || resolvedExistingPng) && (
                      <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40 p-2">
                        <img
                          src={state.pngPreviewUrl || state.overlayAssetUrl || resolvedExistingPng}
                          alt="Background Preview"
                          className="w-full object-contain max-h-36 rounded"
                        />
                        <p className="text-center text-[8px] font-bold text-emerald-400 mt-2 truncate">
                          {state.pngFile ? state.pngFile.name : assets.find(asset => String(asset.id) === String(state.overlayAssetId))?.name || 'Background Aktif'}
                        </p>
                      </div>
                    )}

                    {assets.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted">Pilih dari Asset yang Sudah Di-upload:</p>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                          {assets.map(asset => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => addOverlayAsBackground(asset)}
                              className={cn(
                                'rounded-lg border p-1.5 text-left transition-all hover:border-primary',
                                String(state.overlayAssetId) === String(asset.id) ? 'border-primary bg-primary/20' : 'border-white/10 bg-black/30'
                              )}
                            >
                              <div className="h-12 rounded bg-black/40 flex items-center justify-center overflow-hidden">
                                <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                              </div>
                              <span className="block text-[8px] font-bold text-foreground truncate mt-1">{asset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {state.frameType === 'gradient' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center justify-between">
                        <span>Preset Gradients</span>
                        <Sparkles className="w-3 h-3 text-primary" />
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {GRADIENT_PRESETS.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => update({
                              frameType: 'gradient',
                              gradientStyle: p.style as any,
                              gradientAngle: p.angle,
                              gradientStops: p.stops
                            })}
                            className="h-7 rounded-lg border border-white/10 overflow-hidden hover:scale-105 hover:border-primary transition-all relative group cursor-pointer"
                            style={{
                              background: p.style === 'radial'
                                ? `radial-gradient(circle, ${p.stops.map(s => `${s.color} ${s.position}%`).join(', ')})`
                                : `linear-gradient(${p.angle}deg, ${p.stops.map(s => `${s.color} ${s.position}%`).join(', ')})`
                            }}
                            title={p.name}
                          >
                            <span className="sr-only">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted">Style</p>
                      <div className="flex gap-1">
                        {(['linear', 'radial'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => update({ gradientStyle: s })}
                            className={cn(
                              'flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-md transition-all',
                              state.gradientStyle === s
                                ? 'bg-primary text-[#10172A]'
                                : 'bg-white/5 text-muted hover:bg-white/10'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    {state.gradientStyle === 'linear' && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                          Angle: {state.gradientAngle}°
                        </p>
                        <input
                          type="range" min={0} max={360}
                          value={state.gradientAngle}
                          onChange={e => update({ gradientAngle: Number(e.target.value) })}
                          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted">Stops</p>
                      <GradientStopEditor
                        stops={state.gradientStops}
                        onChange={stops => update({ gradientStops: stops })}
                      />
                    </div>
                  </div>
                )}

                {/* Slot Border */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">Slot Border (Garis Kotak Foto)</p>
                  <label className="flex items-center gap-2 cursor-pointer bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 hover:border-primary/30 transition-colors">
                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" style={{ background: state.accentColor }} />
                    <input type="color" value={state.accentColor} onChange={e => update({ accentColor: e.target.value })} className="sr-only" />
                    <span className="font-mono text-[9px] text-foreground">{state.accentColor.toUpperCase()}</span>
                  </label>
                </div>
              </div>
            )}

            {editorTab === 'asset' && (
              <div
                className="p-3 space-y-3"
                onDragOver={e => e.preventDefault()}
                onDrop={handleOverlayDrop}
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-muted">Asset & Stiker</p>
                <p className="text-[9px] text-muted leading-relaxed">
                  Upload PNG atau JPG. Anda bisa menjadikannya <b>Background Frame (di belakang foto)</b> atau <b>Stiker/Logo (di depan foto)</b>.
                </p>

                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      value={assetName}
                      onChange={e => setAssetName(e.target.value)}
                      placeholder="Nama asset baru"
                      className="min-w-0 flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-foreground"
                    />
                    <input
                      ref={assetFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={e => handleReusableAssetUpload(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={assetUploading}
                      onClick={() => assetFileInputRef.current?.click()}
                      className="px-2 py-1.5 bg-primary/15 border border-primary/30 text-primary rounded-lg text-[8px] font-black uppercase"
                    >
                      {assetUploading ? '...' : '+ Upload'}
                    </button>
                  </div>

                  <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-2">Daftar Asset Tersimpan</p>
                  {assets.length === 0 ? (
                    <p className="text-[9px] text-muted italic">Belum ada asset tersimpan.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto custom-scrollbar">
                      {assets.map(asset => (
                        <div
                          key={asset.id}
                          className="rounded-lg border border-white/10 bg-black/30 p-2 flex items-center justify-between gap-2"
                        >
                          <div className="w-12 h-12 rounded bg-black/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-[9px] font-bold text-foreground truncate">{asset.name}</span>
                            <div className="flex gap-1 mt-1.5">
                              <button
                                type="button"
                                onClick={() => addOverlayAsBackground(asset)}
                                className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-[8px] font-bold"
                                title="Jadikan background di bawah foto"
                              >
                                🖼️ Set BG
                              </button>
                              <button
                                type="button"
                                onClick={() => addAssetElement(asset)}
                                className="px-2 py-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded text-[8px] font-bold"
                                title="Jadikan stiker/logo di atas foto"
                              >
                                ➕ Stiker
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {state.assetElements.length > 0 && (
                  <div className="space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">Stiker di Canvas ({state.assetElements.length})</p>
                    {state.assetElements.map((element, index) => (
                      <div key={element.id} className={cn('rounded-lg border p-2 space-y-2', state.selectedAssetElementId === element.id ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-black/20')}>
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => update({ selectedAssetElementId: element.id })} className="text-[9px] font-bold text-foreground truncate max-w-[120px]">
                            {index + 1}. {element.name}
                          </button>
                          <button type="button" onClick={() => removeAssetElement(element.id)} className="text-muted hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {([['x', 'X', element.x], ['y', 'Y', element.y], ['width', 'Width', element.width], ['height', 'Height', element.height]] as const).map(([field, label, value]) => (
                            <label key={field} className="text-[8px] text-muted uppercase font-black">
                              {label} {Math.round(value)}%
                              <input type="range" min="0" max="100" value={value} onChange={e => updateAssetElement(element.id, { [field]: Number(e.target.value) } as Partial<AssetElement>)} className="w-full h-1 accent-primary cursor-pointer" />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-[8px] text-muted italic">Klik lalu drag logo langsung di canvas untuk memindahkannya. Atur ukuran dengan slider.</p>
                  </div>
                )}
              </div>
            )}

            {editorTab === 'text' && (
              <div className="p-3 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">Text Overlays</p>
                  <button
                    type="button"
                    onClick={addTextElement}
                    className="px-2 py-1 bg-primary text-[#10172A] text-[9px] font-black uppercase rounded hover:brightness-110 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Text
                  </button>
                </div>

                {state.textElements.length === 0 ? (
                  <p className="text-[9px] text-muted italic text-center py-4">No text elements added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {state.textElements.map((elem, idx) => (
                      <div key={elem.id} className="p-2.5 bg-black/30 border border-white/10 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-primary">Text #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeTextElement(elem.id)}
                            className="text-muted hover:text-red-400 p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Content */}
                        <input
                          type="text"
                          value={elem.text}
                          onChange={e => updateTextElement(elem.id, { text: e.target.value })}
                          placeholder="Text content"
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-foreground font-bold"
                        />

                        {/* Google Font Selector */}
                        <div className="space-y-1">
                          <p className="text-[8px] text-muted uppercase font-black">Google Font</p>
                          <select
                            value={elem.fontFamily}
                            onChange={e => updateTextElement(elem.id, { fontFamily: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-foreground font-bold outline-none"
                          >
                            {GOOGLE_FONTS.map(f => (
                              <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Size & Color */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[8px] text-muted uppercase font-black">Size ({elem.fontSize}px)</p>
                            <input
                              type="range"
                              min={16}
                              max={120}
                              value={elem.fontSize}
                              onChange={e => updateTextElement(elem.id, { fontSize: Number(e.target.value) })}
                              className="w-full h-1 accent-primary cursor-pointer"
                            />
                          </div>
                          <div>
                            <p className="text-[8px] text-muted uppercase font-black">Color</p>
                            <label className="flex items-center gap-1 cursor-pointer bg-black/40 border border-white/10 rounded px-1.5 py-0.5">
                              <span className="w-3.5 h-3.5 rounded border border-white/20" style={{ background: elem.color }} />
                              <input
                                type="color"
                                value={elem.color}
                                onChange={e => updateTextElement(elem.id, { color: e.target.value })}
                                className="sr-only"
                              />
                              <span className="font-mono text-[8px] text-foreground truncate">{elem.color}</span>
                            </label>
                          </div>
                        </div>

                        {/* Y Position */}
                        <div>
                          <p className="text-[8px] text-muted uppercase font-black">Y Position ({elem.y}%)</p>
                          <input
                            type="range"
                            min={5}
                            max={95}
                            value={elem.y}
                            onChange={e => updateTextElement(elem.id, { y: Number(e.target.value) })}
                            className="w-full h-1 accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Frame Name + Shared Layout Price */}
          <div className="border-t border-white/10 p-3 space-y-2 flex-shrink-0 bg-[#0A0F1D]">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted">Frame Name</p>
            <input
              type="text"
              value={state.name}
              onChange={e => update({ name: e.target.value })}
              placeholder="e.g. Classic Dark"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] font-bold text-foreground outline-none focus:border-primary/50 transition-all"
            />
            <p className="text-[9px] font-black uppercase tracking-widest text-muted pt-1">Harga Layout (Rp)</p>
            <div className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] font-bold text-primary">
              {framePrice ? `Rp ${Number(framePrice).toLocaleString('id-ID')}` : 'Belum diatur'}
            </div>
            <p className="text-[8px] text-muted leading-relaxed">Satu harga untuk semua style pada layout ini.</p>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c1020] relative">
          <div className="flex-1 overflow-auto flex items-center justify-center p-8">
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOverCanvas(true); }}
              onDragLeave={() => setIsDragOverCanvas(false)}
              onDrop={e => { setIsDragOverCanvas(false); handleOverlayDrop(e); }}
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
              className={cn('transition-transform duration-200 shadow-[0_0_60px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden flex-shrink-0', isDragOverCanvas ? 'ring-2 ring-primary ring-offset-2 ring-offset-[#0c1020]' : '')}
            >
              <CanvasPreview
                preset={preset}
                bgColor={state.bgColor}
                accentColor={state.accentColor}
                frameType={state.frameType}
                gradientStops={state.gradientStops}
                gradientAngle={state.gradientAngle}
                gradientStyle={state.gradientStyle}
                textElements={state.textElements}
                assetElements={state.assetElements}
                onAssetChange={updateAssetElement}
                onAssetSelect={(id) => update({ selectedAssetElementId: id })}
                selectedAssetElementId={state.selectedAssetElementId}
                imageUrl={previewImageUrl}
                displayWidth={preset.width}
              />
            </div>
          </div>

          {/* Bottom hint */}
          <div className="flex-shrink-0 h-8 flex items-center justify-center border-t border-white/5 bg-[#0D1322]">
            <p className="text-[9px] font-bold text-muted tracking-wider">
              Click element to edit. Drag to move. Use sidebar for styling. Zoom to adjust view.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Frame Style Card ─────────────────────────────────────────────────────────

interface FrameCardProps {
  template: FrameTemplate;
  preset: LayoutPreset;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
}

const FrameCard: React.FC<FrameCardProps> = ({ template, preset, onEdit, onDelete, onDuplicate, onToggle }) => {
  const [hovered, setHovered] = useState(false);
  const frameBadge = template.frame_type === 'png' ? 'PNG' : template.frame_type === 'gradient' ? 'Gradient' : 'Solid';
  const hasCustomPrice = template.price !== null && template.price !== undefined;
  const assetElements = getTemplateAssetElements(template);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
      className={cn(
        'relative rounded-2xl overflow-hidden border transition-all duration-300 group flex flex-col h-[275px] cursor-pointer',
        template.is_active
          ? 'bg-gradient-to-b from-[#1E293B]/80 to-[#0F172A]/90 border-white/10 hover:border-primary/50 hover:shadow-[0_0_25px_rgba(255,184,0,0.2)]'
          : 'bg-[#111827]/40 border-white/5 opacity-55 hover:opacity-100'
      )}
    >
      {/* Top Header Bar */}
      <div className="absolute top-2.5 inset-x-2.5 z-30 flex items-center justify-between pointer-events-none">
        <span className="px-2 py-0.5 bg-black/70 backdrop-blur-md rounded-md border border-white/10 text-[8px] font-black uppercase tracking-widest text-primary">
          {frameBadge}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cn(
            'pointer-events-auto px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer shadow-md',
            template.is_active
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
              : 'bg-white/10 border-white/20 text-muted'
          )}
          title={template.is_active ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', template.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-muted')} />
          {template.is_active ? 'Active' : 'Off'}
        </button>
      </div>

      {/* Canvas Preview Container (Fixed height h-[210px]) */}
      <div className="relative flex items-center justify-center p-3 pt-9 bg-black/30 h-[210px] flex-shrink-0">
        <CanvasPreview
          preset={preset}
          bgColor={template.bg_color}
          accentColor={template.accent_color}
          frameType={template.frame_type || 'color'}
          gradientStops={template.gradient_stops || []}
          gradientAngle={template.gradient_angle ?? 45}
          gradientStyle={template.gradient_style || 'linear'}
          textElements={template.text_elements || []}
          assetElements={assetElements}
          imageUrl={template.image_url}
          displayWidth={140}
          maxHeight={150}
          className="shadow-2xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-102"
        />

        {/* Hover Actions Overlay */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-[3px] flex flex-col items-center justify-center gap-2.5 p-3 z-20"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-white px-2 text-center line-clamp-2">
                {template.name}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-2.5 bg-primary text-[#10172A] hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(255,184,0,0.4)] cursor-pointer"
                  title="Edit Style"
                >
                  <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                  className="p-2.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-white transition-all cursor-pointer"
                  title="Duplicate Style"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-2.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-xl text-red-400 transition-all cursor-pointer"
                  title="Delete Style"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-white/5 bg-black/40 flex items-center justify-between gap-2 mt-auto h-[55px]">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-foreground truncate">{template.name}</p>
          <p className="text-[9px] font-bold text-muted uppercase tracking-widest mt-0.5">
            {preset.slots} {preset.slots === 1 ? 'Slot' : 'Slots'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] font-black text-primary">
            {hasCustomPrice ? `Rp ${Number(template.price).toLocaleString('id-ID')}` : 'Harga kiosk'}
          </p>
          <span
            className="inline-block w-3 h-3 rounded-full border border-white/20 shadow-sm mt-1"
            style={{ background: template.accent_color || '#FFFFFF' }}
            title={`Accent color: ${template.accent_color}`}
          />
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const TemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<FrameTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLayoutId, setActiveLayoutId] = useState<string>('1x1');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FrameTemplate | null>(null);
  const [layoutPrice, setLayoutPrice] = useState('');
  const [isSavingLayoutPrice, setIsSavingLayoutPrice] = useState(false);

  const activePreset = LAYOUT_PRESETS.find(p => p.id === activeLayoutId) || LAYOUT_PRESETS[0];

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/templates');
      const data = res.data?.data || [];
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load frames');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const templatesForLayout = templates.filter(t => t.layout_id === activeLayoutId);
  const enabledFrameCount = templatesForLayout.filter(t => t.is_active).length;

  useEffect(() => {
    const prices = templatesForLayout
      .map(t => t.price)
      .filter((price): price is number => price !== null && price !== undefined);
    setLayoutPrice(prices.length > 0 ? String(prices[0]) : '');
  }, [activeLayoutId, templates]);

  const saveLayoutPrice = async () => {
    const price = Number(layoutPrice);
    if (!layoutPrice.trim() || !Number.isFinite(price) || price < 0) {
      toast.error('Enter a valid frame price of Rp 0 or more.');
      return;
    }
    if (templatesForLayout.length === 0) {
      // Tanpa frame, tidak ada record harga yang bisa disimpan. Jangan tampilkan
      // sukses palsu: nominal Admin harus sama dengan yang dibaca photobooth.
      toast.error('Belum ada frame pada layout ini. Tambahkan style dulu agar harga tersimpan.');
      return;
    }

    setIsSavingLayoutPrice(true);
    try {
      await Promise.all(templatesForLayout.map(template => api.put(`/admin/templates/${template.id}`, { price })));
      setTemplates(prev => prev.map(template => template.layout_id === activeLayoutId ? { ...template, price } : template));
      toast.success(`Harga ${activePreset.label} berhasil diperbarui`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update frame price');
    } finally {
      setIsSavingLayoutPrice(false);
    }
  };

  const toggleFrame = async (template: FrameTemplate) => {
    const newState = !template.is_active;
    setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, is_active: newState } : t));
    try {
      await api.put(`/admin/templates/${template.id}`, { is_active: newState });
      toast.success(`"${template.name}" ${newState ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to toggle frame');
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, is_active: !newState } : t));
    }
  };

  const handleDelete = async (template: FrameTemplate) => {
    if (!window.confirm(`Delete frame "${template.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/templates/${template.id}`);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      toast.success('Frame deleted');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete frame');
    }
  };

  const handleDuplicate = async (template: FrameTemplate) => {
    try {
      if (template.frame_type === 'png' && template.image_url) {
        toast.error('PNG overlay frames must be created by uploading a PNG image.');
        return;
      }
      const frameConfig = buildFrameConfig(
        activePreset,
        template.frame_type || 'color',
        template.bg_color,
        template.accent_color,
        template.gradient_stops || [],
        template.gradient_angle ?? 45,
        template.gradient_style || 'linear',
        template.text_elements || [],
        template.image_url || '',
        template.asset_id || null,
        getTemplateAssetElements(template),
      );
      await api.post('/admin/templates/generate', {
        ...frameConfig,
        name: `${template.name} (Copy)`,
        layout_id: template.layout_id,
        slot_count: template.slot_count || activePreset.slots,
        layout_config: template.layout_config || frameConfig,
        bg_color: template.bg_color,
        accent_color: template.accent_color,
        frame_type: template.frame_type || 'color',
        gradient_stops: template.gradient_stops || [],
        gradient_angle: template.gradient_angle ?? 45,
        gradient_style: template.gradient_style || 'linear',
        text_elements: template.text_elements || [],
        price: layoutPrice ? Number(layoutPrice) : template.price,
      });
      toast.success(`Duplicated "${template.name}"`);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to duplicate frame');
    }
  };

  const handleOpenEditor = (template: FrameTemplate | null = null) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleEditorSaved = () => {
    setEditorOpen(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  return (
    <>
      {/* Frame Editor Fullscreen */}
      <AnimatePresence>
        {editorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200]"
          >
            <FrameEditorModal
              preset={activePreset}
              editingTemplate={editingTemplate}
              framePrice={layoutPrice}
              onClose={() => { setEditorOpen(false); setEditingTemplate(null); }}
              onSaved={handleEditorSaved}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <LayoutTemplate className="w-8 h-8 text-primary" />
              </div>
              Image Frames
            </h1>
            <p className="text-muted mt-1 font-medium">Enable layouts and customize styles.</p>
          </div>
        </div>

        {/* Layout Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {LAYOUT_PRESETS.map(preset => {
            const active = preset.id === activeLayoutId;
            const hasActive = templates.filter(t => t.layout_id === preset.id).some(t => t.is_active);
            return (
              <button
                key={preset.id}
                onClick={() => setActiveLayoutId(preset.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all flex-shrink-0',
                  active
                    ? 'bg-primary text-[#10172A] shadow-[0_4px_15px_rgba(255,184,0,0.25)]'
                    : 'bg-white/5 border border-white/10 text-muted hover:text-foreground hover:bg-white/8'
                )}
              >
                <LayoutTabIcon preset={preset} active={active} />
                <span className="text-[11px] font-black uppercase tracking-wider">{preset.label}</span>
                <span className={cn(
                  'text-[9px] font-bold',
                  active ? 'text-[#10172A]/50' : 'text-muted/60'
                )}>
                  ({preset.width}×{preset.height})
                </span>
                {hasActive && (
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    active ? 'bg-[#10172A]/50' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                  )} />
                )}
              </button>
            );
          })}
        </div>

        {/* Layout Panel */}
        <div className="glass-panel rounded-3xl p-6 space-y-5 border border-white/8">
          {/* Per-frame enabled status + Price + Create Style */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-3" title="Atur status aktif dari masing-masing kartu frame">
                <div className={cn(
                  'w-12 h-6 rounded-full flex items-center justify-end px-1',
                  enabledFrameCount > 0
                    ? 'bg-primary shadow-[0_0_15px_rgba(255,184,0,0.35)]'
                    : 'bg-white/10 border border-white/20'
                )}>
                  <div className={cn(
                    'w-4 h-4 rounded-full shadow-sm',
                    enabledFrameCount > 0 ? 'bg-[#10172A]' : 'bg-muted'
                  )} />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">Frame Status</p>
                  <p className="text-[10px] font-bold text-muted">
                    {enabledFrameCount} dari {templatesForLayout.length} frame aktif — pilih per frame
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 border-l border-white/10 pl-5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted" htmlFor="layout-frame-price">
                  Harga Layout (Rp)
                </label>
                <input
                  id="layout-frame-price"
                  type="number"
                  min="0"
                  step="1000"
                  value={layoutPrice}
                  onChange={e => setLayoutPrice(e.target.value)}
                  placeholder="Contoh: 15000"
                  disabled={isSavingLayoutPrice}
                  className="w-28 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50 disabled:opacity-40"
                />
                <button
                  onClick={saveLayoutPrice}
                  disabled={isSavingLayoutPrice}
                  className="px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider hover:bg-primary/25 disabled:opacity-40"
                >
                  {isSavingLayoutPrice ? 'Saving...' : 'Simpan ke Semua Frame'}
                </button>
              </div>
            </div>

            <button
              onClick={() => handleOpenEditor(null)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/8 text-foreground hover:text-primary text-[11px] font-black uppercase tracking-wider rounded-xl transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Style
            </button>
          </div>

          {/* Available Styles */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted">
                Available Styles ({templatesForLayout.length})
              </p>

              {templatesForLayout.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-white/10 rounded-2xl gap-4 text-center">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
                    <ImageIcon className="w-7 h-7 text-muted opacity-40" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">No Styles Yet</p>
                    <p className="text-xs text-muted mt-1">
                      Create your first frame style for {activePreset.label} ({activePreset.width}×{activePreset.height})
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenEditor(null)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary text-[11px] font-black uppercase tracking-wider rounded-xl hover:bg-primary/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Style
                  </button>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeLayoutId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                  >
                    {templatesForLayout.map(template => (
                      <FrameCard
                        key={template.id}
                        template={template}
                        preset={activePreset}
                        onEdit={() => handleOpenEditor(template)}
                        onDelete={() => handleDelete(template)}
                        onDuplicate={() => handleDuplicate(template)}
                        onToggle={() => toggleFrame(template)}
                      />
                    ))}

                    {/* Add New Card */}
                    <motion.button
                      onClick={() => handleOpenEditor(null)}
                      className="rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 transition-all h-[275px] group cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 group-hover:bg-primary/10 border border-white/10 group-hover:border-primary/30 flex items-center justify-center transition-all">
                        <Plus className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted group-hover:text-primary transition-colors">
                        New Style
                      </p>
                    </motion.button>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
