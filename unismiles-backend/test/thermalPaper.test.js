const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const backendPaper = require('../utils/paperSizes');
const { validatePrintingConfig, ADAPTERS, PAPER_SIZES } = require('../utils/printingConfigValidation');

// ---------------------------------------------------------------------------
// Printer label termal (NIIMBOT B1 Pro): lebar cetak efektif 48 mm, tinggi 8-350 mm.
// Ukuran foto lama semuanya lebih lebar dari itu, jadi tidak akan muat. Preset
// termal disediakan supaya ada pilihan yang benar-benar bisa dicetak.
// ---------------------------------------------------------------------------

test('preset termal semuanya muat lebar cetak printer label', () => {
  assert.ok(backendPaper.THERMAL_PRESETS.length >= 3, 'perlu beberapa pilihan ukuran');
  for (const preset of backendPaper.THERMAL_PRESETS) {
    const match = preset.match(/(\d+)\s*[×x]\s*(\d+)/i);
    assert.ok(match, `preset harus memuat ukuran: ${preset}`);
    const width = Number(match[1]);
    const height = Number(match[2]);
    assert.ok(width <= backendPaper.THERMAL_LIMITS.maxPrintWidthMm,
      `${preset}: lebar ${width} mm melebihi kepala cetak ${backendPaper.THERMAL_LIMITS.maxPrintWidthMm} mm`);
    assert.ok(height >= backendPaper.THERMAL_LIMITS.minHeightMm
      && height <= backendPaper.THERMAL_LIMITS.maxHeightMm,
      `${preset}: tinggi ${height} mm di luar rentang printer`);
  }
});

test('ukuran foto lama tetap diterima supaya konfigurasi lama tidak rusak', () => {
  for (const preset of backendPaper.PHOTO_PRESETS) {
    assert.ok(backendPaper.isKnownPaperSize(preset), `${preset} harus tetap diterima`);
  }
});

test('ukuran kustom divalidasi terhadap batas kertas', () => {
  assert.strictEqual(backendPaper.validateCustomSize('CUSTOM 48X150 MM').ok, true);
  assert.strictEqual(backendPaper.validateCustomSize('CUSTOM 40x60mm').ok, true);

  // Ukuran kertas yang DIPAKAI UniSmiles: 54 x 67 mm. Harus DITERIMA walau
  // kepalanya hanya 48,77 mm — kertasnya nyata, hanya 5,25 mm kanannya tidak
  // tercetak. Menolaknya akan memblokir kertas yang benar-benar dipakai.
  const label = backendPaper.validateCustomSize('CUSTOM 54X67 MM');
  assert.strictEqual(label.ok, true, 'kertas label 54 x 67 mm harus diterima');

  // Jelas salah ketik (540 mm): ditolak, dan pesannya menyebut batas KERTAS,
  // bukan batas kepala cetak — dua angka yang berbeda.
  const tooWide = backendPaper.validateCustomSize('CUSTOM 540X150 MM');
  assert.strictEqual(tooWide.ok, false);
  assert.match(tooWide.message, /lebar kertas maksimum/i);

  // Terlalu pendek / terlalu tinggi.
  assert.strictEqual(backendPaper.validateCustomSize('CUSTOM 40X5 MM').ok, false);
  assert.strictEqual(backendPaper.validateCustomSize('CUSTOM 40X400 MM').ok, false);

  // Format salah.
  assert.strictEqual(backendPaper.validateCustomSize('48x150').ok, false);
  assert.strictEqual(backendPaper.validateCustomSize('').ok, false);
});

test('lebar kepala cetak dan lebar kertas adalah dua angka berbeda', () => {
  // Kepala cetak 576 px @300dpi = 48,77 mm -> ini yang mengunci GAMBAR.
  assert.strictEqual(backendPaper.THERMAL_LIMITS.maxPrintWidthMm, 48.77);
  // Kertas boleh lebih lebar dari kepala cetak.
  assert.ok(backendPaper.THERMAL_LIMITS.maxPaperWidthMm > backendPaper.THERMAL_LIMITS.maxPrintWidthMm,
    'batas kertas harus di atas batas kepala cetak');
  const printWidthPx = Math.round(backendPaper.THERMAL_LIMITS.maxPrintWidthMm / 25.4 * 300);
  assert.strictEqual(printWidthPx, 576, 'kepala cetak B1 Pro = 576 px');
});

test('ukuran piksel dihitung dari 300 dpi', () => {
  // 48 mm @300dpi = 567 px; 150 mm = 1772 px.
  const px = backendPaper.pixelSize('CUSTOM 48X150 MM');
  assert.strictEqual(px.widthPx, 567);
  // Lebar kertas 54 mm tetap dihitung apa adanya (638 px) — penguncian ke
  // kepala cetak terjadi di sisi cetak/photobooth, bukan di sini.
  assert.strictEqual(backendPaper.pixelSize('CUSTOM 54X67 MM').widthPx, 638);
  assert.strictEqual(px.heightPx, 1772);
  assert.strictEqual(px.dpi, 300);

  const preset = backendPaper.pixelSize('Termal 40 × 60 mm (2 foto)');
  assert.strictEqual(preset.widthPx, 472);
  assert.strictEqual(preset.heightPx, 709);

  assert.strictEqual(backendPaper.pixelSize('4R'), null, 'ukuran foto tidak dihitung termal');
});

test('konfigurasi ukuran kustom diterima lewat validasi', () => {
  const result = validatePrintingConfig(
    { printing_enabled: false, adapter: 'disabled', paper_size: 'CUSTOM 48X150 MM' },
    { printing_enabled: false, adapter: 'disabled' },
  );
  assert.strictEqual(result.paper_size, 'CUSTOM 48X150 MM');
});

test('konfigurasi ukuran kustom di luar batas ditolak dengan pesan yang jelas', () => {
  assert.throws(
    () => validatePrintingConfig(
      { printing_enabled: false, adapter: 'disabled', paper_size: 'CUSTOM 540X150 MM' },
      { printing_enabled: false, adapter: 'disabled' },
    ),
    /lebar kertas maksimum/i,
  );
});

test('adapter thermal dikenali', () => {
  assert.ok(ADAPTERS.includes('thermal'), 'admin harus bisa memilih adapter thermal');
});

test('preset foto dan termal digabung tanpa duplikat', () => {
  const merged = new Set(PAPER_SIZES);
  assert.strictEqual(merged.size, PAPER_SIZES.length, 'daftar tidak boleh memuat duplikat');
  assert.ok(PAPER_SIZES.length >= backendPaper.PHOTO_PRESETS.length + backendPaper.THERMAL_PRESETS.length);
});

// ---------------------------------------------------------------------------
// Daftar ukuran diduplikasi di kiosk-agent karena agent berjalan di komputer
// terpisah. Test ini menjaga kedua sisi tetap sama supaya tidak menyimpang.
// ---------------------------------------------------------------------------

test('daftar ukuran di kiosk-agent sama dengan di backend', () => {
  const agentPaper = require(path.join(__dirname, '..', '..', 'kiosk-agent', 'src', 'paperSizes.js'));
  assert.deepStrictEqual(agentPaper.PHOTO_PRESETS, backendPaper.PHOTO_PRESETS,
    'preset foto harus sama di kedua sisi');
  assert.deepStrictEqual(agentPaper.THERMAL_PRESETS, backendPaper.THERMAL_PRESETS,
    'preset termal harus sama di kedua sisi');
  assert.deepStrictEqual(agentPaper.THERMAL_LIMITS, backendPaper.THERMAL_LIMITS,
    'batas printer termal harus sama di kedua sisi');
});

test('agent menerima ukuran yang sama seperti backend', () => {
  const agentPaper = require(path.join(__dirname, '..', '..', 'kiosk-agent', 'src', 'paperSizes.js'));
  const samples = [
    'Instax Mini (54 × 86 mm)',
    'Polaroid 6 × 9 cm (2R)',
    'Termal 40 × 60 mm (2 foto)',
    'CUSTOM 48X150 MM',
    '4R', '3R', 'STRIP', 'POLAROID',
  ];
  for (const sample of samples) {
    assert.strictEqual(agentPaper.isSupportedPaperSize(sample), true, `agent harus menerima ${sample}`);
  }
  // Yang di luar batas harus ditolak di kedua sisi.
  assert.strictEqual(agentPaper.isSupportedPaperSize('CUSTOM 540X150 MM'), false);
  assert.strictEqual(backendPaper.validateCustomSize('CUSTOM 540X150 MM').ok, false);
});

test('agent mengenal adapter thermal', () => {
  const factory = require(path.join(__dirname, '..', '..', 'kiosk-agent', 'src', 'printerAdapterFactory.js'));
  assert.ok(factory.SUPPORTED_ADAPTER_NAMES.includes('thermal'));
  assert.ok(factory.supportedAdapters().includes('thermal'),
    'thermal harus tersedia di OS yang mendukung printer sistem');
});
