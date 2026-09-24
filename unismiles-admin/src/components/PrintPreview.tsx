import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CameraIcon, Image as ImageIcon, Info, RotateCcw, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  previewPlan, renderPrintBitmap, inkSummary, findPaper, PAPER_CATALOG,
  PRINTHEAD_PX, DPI, applyAdjust, cameraErrorMessage, frameToImage,
  effectiveSourceDpi, GRAYSCALE_OPTIONS, type Margin,
} from '../lib/printPapers';

/**
 * PRINT PREVIEW WYSIWYG + CAPTURE FOTO.
 *
 * Yang digambar di sini BUKAN tafsiran: jalur yang sama dengan produksi
 * dijalankan sungguhan (clip ke kotak cetak → gambar foto → dither
 * Floyd–Steinberg 1-bit), lalu hasilnya ditampilkan. Karena itu preview ini
 * bisa menunjukkan hal yang tidak terlihat dari angka: foto yang terpotong,
 * bingkai yang ketimpa tinta, tepi yang jatuh di luar jangkauan kepala cetak,
 * dan — inti fitur capture — bagaimana brightness/contrast mengubah FOTO
 * SUNGGUHAN, bukan pola uji.
 *
 * Kenapa hitam-putih dan berbintik: printer termal hanya punya dua keadaan per
 * titik. Preview berwarna akan menampilkan sesuatu yang tidak pernah keluar di
 * kertas.
 */

/** Skala tampilan preview. Lebih kecil dari sebelumnya (3) karena label 67 mm
 *  dengan pengali 3 terlalu tinggi untuk layar biasa dan mendorong tombol ke
 *  luar jangkauan. Dengan 2, seluruh label muat tanpa perlu digulir. */
const ZOOM = 2;

export interface PrintPreviewProps {
  paperSize: string;
  margin: Margin;
  offsetXPx: number;
  offsetYPx: number;
  fitMode: 'fit' | 'cover' | 'stretch';
  brightness: number;
  contrast: number;
  saturation: number;
  /** Algoritma abu-abu dari Admin; lihat GRAYSCALE_OPTIONS. */
  grayscale: string;
  /** Penajaman 0..100 dari Admin. */
  sharpen: number;
}

/**
 * Pola uji bawaan — dipakai kalau belum ada foto.
 *
 * Isinya sengaja informatif: penggaris 5 mm, kotak penanda di keempat sudut,
 * lingkaran di tengah, dan gradien. Dari pola ini terlihat apakah foto
 * terpotong (penanda sudut hilang). Untuk menilai brightness/contrast, pola ini
 * TIDAK cukup — nilainya seragam, dan itu sebabnya ada capture foto.
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
  grayscale, sharpen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [foto, setFoto] = useState<HTMLImageElement | null>(null);
  const [namaFoto, setNamaFoto] = useState<string>('');
  const [kameraAktif, setKameraAktif] = useState(false);
  const [kameraGalat, setKameraGalat] = useState<string | null>(null);

  const plan = useMemo(
    () => previewPlan(paperSize, margin, offsetXPx, offsetYPx),
    [paperSize, margin, offsetXPx, offsetYPx],
  );
  const ringkas = useMemo(() => inkSummary(plan), [plan]);
  const kertas = useMemo(() => findPaper(paperSize), [paperSize]);
  const adaPenyesuaian = brightness !== 100 || contrast !== 100 || saturation !== 100;
  const grayscaleLabel = GRAYSCALE_OPTIONS.find(o => o.value === grayscale)?.label || grayscale;

  // Resolusi sumber terhadap 300 dpi: beda antara "kanvas 300 dpi" (selalu) dan
  // "fotonya cukup piksel untuk 300 dpi" (belum tentu).
  const dpiSumber = useMemo(
    () => (foto ? effectiveSourceDpi(plan.box, foto.naturalWidth, foto.naturalHeight, fitMode) : null),
    [foto, plan.box, fitMode],
  );

  const pilihFoto = useCallback((file: File | null) => {
    if (!file) { setFoto(null); setNamaFoto(''); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setFoto(img); setNamaFoto(file.name); };
    img.src = url;
  }, []);

  /**
   * Tutup kamera. WAJIB dipanggil saat panel ditutup dan saat unmount: kamera
   * yang dibiarkan hidup membuat lampu indikator menyala terus, dan di kiosk itu
   * terlihat seperti mesin yang sedang dipakai.
   */
  const tutupKamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setKameraAktif(false);
  }, []);

  const bukaKamera = useCallback(async () => {
    setKameraGalat(null);
    if (!navigator?.mediaDevices?.getUserMedia) {
      setKameraGalat(cameraErrorMessage(null));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setKameraAktif(true);
      // Video dipasang setelah render berikutnya, saat elemennya sudah ada.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => { /* autoplay ditolak: gambar tetap tampil */ });
        }
      });
    } catch (err) {
      setKameraGalat(cameraErrorMessage(err));
    }
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const ambilGambar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const img = await frameToImage(video);
      setFoto(img);
      setNamaFoto('hasil capture kamera');
      tutupKamera();
    } catch (err) {
      setKameraGalat(cameraErrorMessage(err));
    }
  }, [tutupKamera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Susun bitmap dengan JALUR PRODUKSI (klip → gambar → dither 1-bit).
    const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
    const imgW = foto ? foto.naturalWidth : plan.canvasW;
    const imgH = foto ? foto.naturalHeight : plan.canvasH;

    // Foto dibaca sekali ke buffer, supaya pembacaan piksel di dalam loop tidak
    // menyentuh DOM berulang kali.
    let sumber: { data: Uint8ClampedArray; width: number; height: number } | null = null;
    if (foto) {
      const s = document.createElement('canvas');
      s.width = imgW; s.height = imgH;
      const sc = s.getContext('2d', { willReadFrequently: true })!;
      sc.drawImage(foto, 0, 0, imgW, imgH);
      sumber = sc.getImageData(0, 0, imgW, imgH);
    }
    const mentah = (sx: number, sy: number): [number, number, number] => {
      if (sumber) {
        const i = (sy * sumber.width + sx) * 4;
        return [sumber.data[i], sumber.data[i + 1], sumber.data[i + 2]];
      }
      return samplePattern(sx, sy, imgW, imgH);
    };

    // Penyesuaian diterapkan pada PIKEL SUMBER, lalu dither dijalankan SEKALI —
    // persis urutan jalur cetak (`ctx.filter` dipasang sebelum gambar, dan
    // dither dihitung dari hasil yang sudah disaring).
    //
    // SEBELUMNYA salah: dither dijalankan pada piksel mentah, lalu hasil 0/255
    // itu disesuaikan, lalu digambar ULANG dari piksel mentah — sehingga
    // brightness/contrast tidak berpengaruh sama sekali di preview.
    const sample = adaPenyesuaian
      ? (sx: number, sy: number) => applyAdjust(mentah(sx, sy), brightness, contrast, saturation)
      : mentah;

    renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH },
      { plan, fitMode, imgW, imgH, sample, grayscale: grayscale as never, sharpen });

    // 2. Tampilkan diperbesar, tanpa smoothing supaya tiap titik tinta terlihat.
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

    // 3. Panduan. Inilah yang membuat preview bisa DIBACA: tanpa garis kotak,
    // tinta dan bingkai tercetak terlihat sama saja.
    g.lineWidth = 1;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(34,211,238,0.9)';
    g.strokeRect(plan.box.x * ZOOM + 0.5, plan.box.y * ZOOM + 0.5, plan.box.w * ZOOM, plan.box.h * ZOOM);

    // Batas kepala cetak: di sebelah kanan garis ini piksel TIDAK keluar, tanpa
    // pesan error apa pun.
    if (PRINTHEAD_PX < plan.canvasW) {
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(248,113,113,0.95)';
      g.beginPath();
      g.moveTo(PRINTHEAD_PX * ZOOM + 0.5, 0);
      g.lineTo(PRINTHEAD_PX * ZOOM + 0.5, canvas.height);
      g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }, [plan, fitMode, brightness, contrast, saturation, adaPenyesuaian, foto, grayscale, sharpen]);

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={kameraAktif ? tutupKamera : bukaKamera}
            className={cn('text-[10px] font-black px-3 py-2 rounded-xl border flex items-center gap-1',
              kameraAktif ? 'bg-red-500/20 border-red-400/40 text-red-200' : 'bg-white/5 border-white/10')}
          >
            {kameraAktif ? <><X className="w-3 h-3" /> Tutup kamera</> : <><CameraIcon className="w-3 h-3" /> Capture foto</>}
          </button>
          <label className="btn-primary text-[10px] px-3 py-2 cursor-pointer">
            Pilih foto
            <input type="file" accept="image/*" className="hidden" onChange={e => pilihFoto(e.target.files?.[0] || null)} />
          </label>
          <button type="button" onClick={() => pilihFoto(null)} className="text-[10px] font-black px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Pola uji
          </button>
        </div>
      </div>

      {/* Capture kamera. Dipakai untuk MENYETEL brightness/contrast: pola uji
          nilainya seragam, jadi tidak menunjukkan apakah kulit jadi abu-abu atau
          wajah hilang jadi blok hitam. Foto sungguhan menunjukkan itu. */}
      {kameraAktif && (
        <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-start">
            <video
              ref={videoRef} playsInline muted
              className="rounded-lg bg-black w-full md:w-[320px] max-h-[240px] object-contain"
            />
            <div className="space-y-2">
              <button type="button" onClick={ambilGambar} className="btn-primary text-[11px] px-4 py-2 flex items-center gap-2">
                <CameraIcon className="w-3.5 h-3.5" /> Ambil gambar ini
              </button>
              <p className="text-[10px] text-muted font-bold max-w-[280px]">
                Arahkan ke objek dengan cahaya yang sama seperti di kiosk, lalu ambil.
                Hasilnya langsung tampil di preview, sudah termasuk brightness/contrast
                yang sedang dipakai.
              </p>
            </div>
          </div>
          {kameraGalat && <p className="text-[10px] font-black text-red-300">{kameraGalat}</p>}
        </div>
      )}

      {!kameraAktif && kameraGalat && (
        <p className="text-[10px] font-black text-red-300">{kameraGalat}</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-4 items-start">
        <div className="rounded-xl bg-black/40 border border-white/10 p-2 w-full max-w-[300px] mx-auto xl:mx-0">
          <canvas ref={canvasRef} className="block w-full h-auto" style={{ imageRendering: 'pixelated' }} />
        </div>

        <div className="space-y-3 text-xs min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            <div><p className="label">Kotak cetak</p><p className="font-black mt-0.5">{ringkas.boxLabel}</p></div>
            <div><p className="label">Ukuran</p><p className="font-black mt-0.5">{ringkas.mmLabel}</p></div>
            <div><p className="label">Kanvas (kertas)</p><p className="font-black mt-0.5">{ringkas.canvasLabel}</p></div>
            <div>
              <p className="label">Sisa ke kepala cetak</p>
              <p className={cn('font-black mt-0.5', ringkas.headroomPx < 0 ? 'text-red-300' : 'text-emerald-400')}>
                {ringkas.headroomPx} px {ringkas.headroomPx < 0 ? '— TERPOTONG' : ''}
              </p>
            </div>
            <div>
              <p className="label">Resolusi cetak</p>
              <p className="font-black mt-0.5 text-emerald-400">{DPI} dpi</p>
            </div>
            {dpiSumber && (
              <div>
                <p className="label">Detail foto di kotak</p>
                <p className={cn('font-black mt-0.5', dpiSumber.upscaled ? 'text-amber-300' : 'text-emerald-400')}>
                  {dpiSumber.x.toFixed(0)} × {dpiSumber.y.toFixed(0)} dpi
                  {dpiSumber.upscaled ? ' — DIPERBESAR' : ''}
                </p>
              </div>
            )}
            <div>
              <p className="label">Brightness / Contrast</p>
              <p className="font-black mt-0.5">{brightness}% / {contrast}%</p>
            </div>
            <div>
              <p className="label">Algoritma abu-abu</p>
              <p className="font-black mt-0.5">{grayscaleLabel}</p>
            </div>
            <div>
              <p className="label">Penajaman</p>
              <p className={cn('font-black mt-0.5', sharpen > 0 ? 'text-emerald-400' : 'text-amber-300')}>
                {sharpen > 0 ? `${sharpen}%` : '0% — belum dinaikkan'}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="label">Sumber gambar</p>
              <p className="font-black mt-0.5 truncate">{namaFoto || 'pola uji'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-cyan-400 inline-block" /> kotak cetak</span>
            {PRINTHEAD_PX < plan.canvasW && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> batas kepala cetak ({PRINTHEAD_PX} px)</span>}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-white/60 inline-block" /> tepi kertas</span>
          </div>

          {adaPenyesuaian && (
            <p className="text-[10px] text-muted font-bold">
              Foto diproses dengan brightness {brightness}% · contrast {contrast}% · saturation {saturation}%,
              lalu di-dither. Di printer termal hanya ada hitam dan putih, jadi yang berubah adalah
              seberapa banyak detail yang tersisa — bukan tingkat keabuannya.
            </p>
          )}

          <p className="text-[10px] text-muted font-bold">
            {namaFoto
              ? 'Untuk menyetel brightness/contrast: ubah slider di atas dan lihat foto ini berubah. Yang penting bukan wajahnya terang, melainkan masih ada detail setelah di-dither.'
              : 'Belum ada foto: yang tampil pola uji, bukan foto asli. Pakai “Capture foto” atau “Pilih foto” untuk menilai brightness/contrast pada gambar sungguhan.'}
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
