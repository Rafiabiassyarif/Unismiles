const assert = require('node:assert');
const { test } = require('node:test');
const {
  toGrayscale, stretchContrast, unsharpMask, brightBounds, autoCrop,
  grayToRgba, prepareForOcr, scaleGray,
} = require('./preprocess');

/** Bangun RGBA dari fungsi luminance, untuk menguji tanpa file gambar. */
function rgba(width, height, fn) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y))));
      const i = (y * width + x) * 4;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
  }
  return out;
}

test('grayscale memakai bobot luminance, bukan rata-rata kanal', () => {
  const data = Buffer.from([255, 0, 0, 255]);
  const gray = toGrayscale(data, 1, 1);
  assert.ok(Math.abs(gray[0] - 76.245) < 0.01, `dapat ${gray[0]}`);
});

test('peregangan kontras memperlebar sebaran nada', () => {
  // Gambar datar berkontras rendah: 120..140.
  const gray = new Float32Array(100);
  for (let i = 0; i < 100; i += 1) gray[i] = 120 + (i % 21);
  const out = stretchContrast(gray);
  const before = Math.max(...gray) - Math.min(...gray);
  const after = Math.max(...out) - Math.min(...out);
  assert.ok(after > before, `kontras harus naik: ${before} -> ${after}`);
  assert.ok(Math.max(...out) <= 255 && Math.min(...out) >= 0);
});

test('peregangan kontras tidak merusak gambar seragam', () => {
  const gray = new Float32Array(50).fill(128);
  const out = stretchContrast(gray);
  assert.ok(out.every((v) => Number.isFinite(v)));
});

test('unsharp mask menaikkan kontras tepi, bukan menurunkan', () => {
  // Pola kotak-kotak: tepi tajam palsu yang harus dipertajam.
  const w = 8; const h = 8;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) gray[y * w + x] = (x + y) % 2 === 0 ? 40 : 210;
  }
  const out = unsharpMask(gray, w, h, { radius: 1, amount: 1.1 });
  const variance = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  };
  assert.ok(variance(out) >= variance(gray), 'variance tepi harus naik atau sama');
  assert.ok(out.every((v) => v >= 0 && v <= 255), 'nilai harus tetap dalam rentang');
});

test('deteksi area terang menemukan layar HP, bukan latar gelap', () => {
  const w = 100; const h = 100;
  // Latar gelap, layar terang di x 30..69, y 20..79.
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      gray[y * w + x] = (x >= 30 && x <= 69 && y >= 20 && y <= 79) ? 240 : 25;
    }
  }
  const box = brightBounds(gray, w, h);
  assert.ok(box.x0 >= 28 && box.x0 <= 32, `x0 = ${box.x0}`);
  assert.ok(box.y0 >= 18 && box.y0 <= 22, `y0 = ${box.y0}`);
  assert.ok(box.width >= 36 && box.width <= 42, `width = ${box.width}`);
});

test('auto-crop dipakai saat ada layar, dilewati saat frame seragam', () => {
  const w = 100; const h = 100;
  const withScreen = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      withScreen[y * w + x] = (x >= 25 && x <= 74 && y >= 15 && y <= 84) ? 235 : 30;
    }
  }
  assert.strictEqual(autoCrop(withScreen, w, h).cropped, true);
  assert.ok(autoCrop(withScreen, w, h).width < w);

  // Gambar gelap seragam: tidak ada layar, jadi harus dilewati (tidak membuang teks).
  const dark = new Float32Array(w * h).fill(20);
  const result = autoCrop(dark, w, h);
  assert.strictEqual(result.cropped, false);
  assert.strictEqual(result.width, w);
  assert.strictEqual(result.height, h);
});

test('crop tidak pernah keluar dari batas gambar', () => {
  const w = 60; const h = 40;
  const gray = new Float32Array(w * h).fill(240);
  const box = brightBounds(gray, w, h);
  const cropped = autoCrop(gray, w, h);
  assert.ok(cropped.width >= 1 && cropped.height >= 1);
  assert.ok(box.x0 >= 0 && box.y0 >= 0);
  assert.ok(box.x0 + box.width <= w && box.y0 + box.height <= h);
});

test('prepareForOcr menghasilkan buffer RGBA utuh', () => {
  const w = 80; const h = 60;
  const data = rgba(w, h, (x, y) => (x > 20 && x < 60 && y > 15 && y < 45 ? 230 : 35));
  const prepared = prepareForOcr(data, w, h);
  assert.ok(prepared.width > 0 && prepared.height > 0);
  const out = grayToRgba(prepared.gray, prepared.width, prepared.height);
  assert.strictEqual(out.length, prepared.width * prepared.height * 4);
  // Setiap piksel harus opaque, kalau tidak JPEG encoder bisa menolak.
  for (let i = 3; i < out.length; i += 4) assert.strictEqual(out[i], 255);
});

test('scaleGray memperbesar dimensi sesuai faktor', () => {
  const gray = new Float32Array(10 * 6).fill(100);
  const out = scaleGray(gray, 10, 6, 2);
  assert.strictEqual(out.width, 20);
  assert.strictEqual(out.height, 12);
  assert.ok(out.gray.every((v) => Math.abs(v - 100) < 0.001));
});

test('scaleGray dengan faktor 1 tidak menyalin ulang', () => {
  const gray = new Float32Array(4).fill(50);
  const out = scaleGray(gray, 2, 2, 1);
  assert.strictEqual(out.gray, gray);
});
