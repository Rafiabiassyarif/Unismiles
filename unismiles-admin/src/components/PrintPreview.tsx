import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Info, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  previewPlan, renderPrintBitmap, inkSummary, findPaper, PAPER_CATALOG,
  PRINTHEAD_PX, type Margin,
} from '../lib/printPapers';

/**
 * PRINT PREVIEW WYSIWYG.
 *
 * Yang digambar di sini BUKAN tafsiran: jalur yang sama dengan produksi
 * dijalankan sungguhan (clip ke kotak cetak → gambar foto → dither
 * Floyd–Steinberg 1-bit), lalu hasilnya ditampilkan, bukan dijelaskan. Karena
 * itu preview ini bisa menunjukkan hal yang tidak terlihat dari angka:
 * foto yang terpotong, bingkai yang ketimpa tinta, dan tepi yang jatuh di luar
 * jangkauan kepala cetak.
 *
 * Kenapa hitam-putih dan berbintik: printer termal hanya punya dua keadaan
 * per titik. Preview berwarna akan menampilkan sesuatu yang tidak pernah keluar
 * di kertas.
 */

/** Skala tampilan: label 67 mm terlalu kecil untuk dinilai di layar. */
const ZOOM = 3;

export interface PrintPreviewProps {
  paperSize: string;
  margin: Margin;
  offsetXPx: number;
  offsetYPx: number;
  fitMode: 'fit' | 'cover' | 'stretch';
  brightness: number;
  contrast: number;
  saturation: number;
}

/** Sesuaikan warna seperti `ctx.filter` di jalur cetak, urutannya sama. */
function applyAdjust([r, g, b]: [number, number, number], brightness: number, contrast: number, saturation: number): [number, number, number] {
  const kb = brightness / 100;
  const kc = contrast / 100;
  const ks = saturation / 100;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const out: number[] = [];
  for (const c of [r, g, b]) {
    let v = c * kb;
    v = (v - 128) * kc + 128;
    v = lum + (v - lum) * ks;
    out.push(Math.max(0, Math.min(255, Math.round(v))));
  }
  return [out[0], out[1], out[2]];
}

/**
 * Pola uji bawaan — dipakai kalau operator belum memilih foto.
 *
 * Isinya sengaja informatif: penggaris 5 mm di tepi, kotak penanda di keempat
 * sudut, lingkaran di tengah, dan gradien. Dari pola ini terlihat apakah foto
 * terpotong (penanda sudut hilang) dan seberapa miring posisinya terhadap
 * bingkai — yang tidak bisa dinilai dari kotak kosong.
 */
function samplePattern(sx: number, sy: number, w: number, h: number): [number, number, number] {
  const mmPerPx = 54 / w;
  const tick = 5 / mmPerPx;
  const tepi = 2;
  const diPenggaris = (sx % tick < 2 || sy % tick < 2);
  if (sx < tepi || sy < tepi || sx >= w - tepi || sy >= h - tepi) return [0, 0, 0];
  const kotakSudut = 26;
  const diSudut = (sx < kotakSudut || sx >= w - kotakSudut) && (sy < kotakSudut || sy >= h - kotakSudut);
  if (diSudut) return [0, 0, 0];
  const cx = w / 2, cy = h / 2;
  const d = Math.hypot(sx - cx, (sy - cy) * 1.1);
  if (d < Math.min(w, h) * 0.16) return [40, 40, 40];
  const v = Math.round(60 + 180 * ((sx / w) * 0.6 + (sy / h) * 0.4));
  return diPenggaris ? [110, 110, 110] : [v, v, v];
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
  paperSize, margin, offsetXPx, offsetYPx, fitMode, brightness, contrast, saturation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [foto, setFoto] = useState<HTMLImageElement | null>(null);
  const [namaFoto, setNamaFoto] = useState<string>('');

  const plan = useMemo(
    () => previewPlan(paperSize, margin, offsetXPx, offsetYPx),
    [paperSize, margin, offsetXPx, offsetYPx],
  );
  const ringkas = useMemo(() => inkSummary(plan), [plan]);
  const kertas = useMemo(() => findPaper(paperSize), [paperSize]);

  const pilihFoto = useCallback((file: File | null) => {
    if (!file) { setFoto(null); setNamaFoto(''); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setFoto(img); setNamaFoto(file.name); };
    img.src = url;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Susun bitmap dengan JALUR PRODUKSI (klip → gambar → dither 1-bit).
    const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
    const imgW = foto ? foto.naturalWidth : plan.canvasW;
    const imgH = foto ? foto.naturalHeight : plan.canvasH;

    // Foto diambil dari kanvas sumber, sekali, supaya pembacaan piksel di dalam
    // loop tidak menyentuh DOM berulang kali.
    let sumber: { data: Uint8ClampedArray; width: number; height: number } | null = null;
    if (foto) {
      const s = document.createElement('canvas');
      s.width = imgW; s.height = imgH;
      const sc = s.getContext('2d', { willReadFrequently: true })!;
      sc.drawImage(foto, 0, 0, imgW, imgH);
      sumber = sc.getImageData(0, 0, imgW, imgH);
    }
    const sample = (sx: number, sy: number): [number, number, number] => {
      if (sumber) {
        const i = (sy * sumber.width + sx) * 4;
        return [sumber.data[i], sumber.data[i + 1], sumber.data[i + 2]];
      }
      return samplePattern(sx, sy, imgW, imgH);
    };

    renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH }, { plan, fitMode, imgW, imgH, sample });
    // Filter dari Admin diterapkan setelahnya, sama seperti jalur cetak (filter
    // dulu baru dither akan merusak hasilnya).
    if (brightness !== 100 || contrast !== 100 || saturation !== 100) {
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = applyAdjust([data[i], data[i + 1], data[i + 2]], brightness, contrast, saturation);
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
      // Ulangi dithering setelah filter: ambang harus dihitung dari nilai akhir.
      renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH }, { plan, fitMode, imgW, imgH, sample });
    }

    // 2. Tampilkan diperbesar, tanpa smoothing supaya tiap titik tinta terlihat.
    const ctx = canvas.getContext('2d')!;
    const sumberKanvas = document.createElement('canvas');
    sumberKanvas.width = plan.canvasW;
    sumberKanvas.height = plan.canvasH;
    sumberKanvas.getContext('2d')!.putImageData(new ImageData(data, plan.canvasW, plan.canvasH), 0, 0);

    canvas.width = plan.canvasW * ZOOM;
    canvas.height = plan.canvasH * ZOOM;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(sumberKanvas, 0, 0, canvas.width, canvas.height);

    // 3. Panduan. Ini yang membuat preview bisa DIBACA: tanpa garis kotak,
    // tinta dan bingkai tercetak terlihat sama saja.
    g.lineWidth = 1;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(34,211,238,0.9)';
    g.strokeRect(plan.box.x * ZOOM + 0.5, plan.box.y * ZOOM + 0.5, plan.box.w * ZOOM, plan.box.h * ZOOM);

    // Batas kepala cetak: di sebelah kanan garis ini piksel TIDAK keluar, tanpa
    // pesan error apa pun. Karena itu digambar terang.
    if (PRINTHEAD_PX < plan.canvasW) {
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(248,113,113,0.95)';
      g.beginPath();
      g.moveTo(PRINTHEAD_PX * ZOOM + 0.5, 0);
      g.lineTo(PRINTHEAD_PX * ZOOM + 0.5, canvas.height);
      g.stroke();
      g.setLineDash([]);
    }
    // Tepi kertas.
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }, [plan, fitMode, brightness, contrast, saturation, foto]);

  return (
    <div className="p-5 rounded-2xl bg-black/20 border border-white/5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" /> Print Preview (WYSIWYG)
          </p>
          <p className="text-[10px] text-muted font-bold mt-1">
            Digambar dengan jalur cetak yang sebenarnya: klip ke kotak cetak, lalu dither
            hitam-putih 1-bit. Yang terlihat di sini yang keluar di printer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn-primary text-[10px] px-3 py-2 cursor-pointer">
            Pilih foto
            <input type="file" accept="image/*" className="hidden" onChange={e => pilihFoto(e.target.files?.[0] || null)} />
          </label>
          <button type="button" onClick={() => pilihFoto(null)} className="text-[10px] font-black px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Pola uji
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-start">
        <div className="rounded-xl bg-black/40 border border-white/10 p-2 max-w-full overflow-auto">
          <canvas ref={canvasRef} className="block max-w-full" style={{ imageRendering: 'pixelated' }} />
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="label">Kotak cetak</p><p className="font-black mt-0.5">{ringkas.boxLabel}</p></div>
            <div><p className="label">Ukuran</p><p className="font-black mt-0.5">{ringkas.mmLabel}</p></div>
            <div><p className="label">Kanvas (kertas)</p><p className="font-black mt-0.5">{ringkas.canvasLabel}</p></div>
            <div>
              <p className="label">Sisa ke kepala cetak</p>
              <p className={cn('font-black mt-0.5', ringkas.headroomPx < 0 ? 'text-red-300' : 'text-emerald-400')}>
                {ringkas.headroomPx} px {ringkas.headroomPx < 0 ? '— TERPOTONG' : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-cyan-400 inline-block" /> kotak cetak</span>
            {PRINTHEAD_PX < plan.canvasW && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> batas kepala cetak ({PRINTHEAD_PX} px)</span>}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-white/60 inline-block" /> tepi kertas</span>
          </div>

          <p className="text-[10px] text-muted font-bold">
            Foto: {namaFoto || 'pola uji (bukan foto asli) — ganti dengan foto sungguhan untuk menilai hasil akhirnya'}
          </p>

          {kertas && <p className="text-[10px] text-muted font-bold">{kertas.label}: {kertas.note}</p>}

          {plan.warning && (
            <p className="text-[10px] font-black text-amber-300 flex items-start gap-2">
              <Info className="w-3 h-3 mt-0.5 shrink-0" /> {plan.warning}
            </p>
          )}
          {plan.marginSource === 'measured' && (
            <p className="text-[10px] font-black text-emerald-400 flex items-start gap-2">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Kertas ini memakai margin TERUKUR (terkunci), jadi angka margin di form tidak dipakai untuk mencetak.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const PAPER_OPTIONS = PAPER_CATALOG;
