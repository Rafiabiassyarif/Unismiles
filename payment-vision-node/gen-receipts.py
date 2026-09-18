"""
gen-receipts.py — buat struk QRIS tiruan pada ukuran frame produksi.

Penting: frontend kiosk mengirim frame potret selebar 1400px (outputWidth=1400
di PhotoBooth.tsx). Jadi masalah nyata bukan gambar kecil, melainkan resolusi
tinggi yang OUT OF FOCUS. Gambar uji di sini mengikuti kondisi itu.

Degradasi: blur (kamera belum fokus), redup, noise sensor, dan kombinasi.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

LINES = [
    "Pembayaran Berhasil",
    "QRIS - GoPay",
    "Nominal Rp 5.068",
    "Ke UNI SMILE",
    "No. Transaksi 20260918435090531176054",
]

# Frame kiosk: 1400 x 1790 (potret, aspect 0.78 seperti crop frontend).
FRAME_W = 1400
FRAME_H = 1790

# (nama, blur_radius_pada_1400px, faktor redup, amplitudo noise)
CONDITIONS = [
    ("tajam", 0.0, 1.00, 0),
    ("fokus_lemah", 1.5, 1.00, 3),
    ("buram_ringan", 3.0, 0.90, 6),
    ("buram", 5.0, 0.80, 10),
    ("buram_gelap", 7.0, 0.65, 14),
]


def render_receipt(width=880):
    """Struk setinggi mungkin di dalam frame, seperti HP dipegang dekat kamera."""
    line_height = int(width * 0.075)
    height = line_height * (len(LINES) + 2)
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font_size = int(width * 0.045)
    try:
        font = ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size
        )
    except Exception:
        font = ImageFont.load_default()
    for i, line in enumerate(LINES):
        draw.text((width * 0.05, line_height * (i + 1.2)), line, fill=(17, 17, 17), font=font)
    return img


def compose_frame(receipt):
    """Tempel struk di tengah frame kiosk supaya konteksnya realistis."""
    frame = Image.new("RGB", (FRAME_W, FRAME_H), (28, 28, 32))
    x = (FRAME_W - receipt.width) // 2
    y = (FRAME_H - receipt.height) // 2
    frame.paste(receipt, (x, y))
    return frame


def degrade(src, dst, blur_radius, dim, noise_amp):
    img = Image.open(src).convert("RGB")
    if blur_radius:
        img = img.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    arr = np.asarray(img).astype(np.float32) * dim
    if noise_amp:
        rng = np.random.default_rng(12345)
        arr = arr + rng.normal(0, noise_amp, arr.shape)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(dst, "JPEG", quality=88)
    return img.size


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ocrbench2"
    os.makedirs(outdir, exist_ok=True)
    base = os.path.join(outdir, "_base.jpg")
    compose_frame(render_receipt()).save(base, "JPEG", quality=95)

    manifest = []
    for name, blur_radius, dim, noise_amp in CONDITIONS:
        dst = os.path.join(outdir, f"{name}.jpg")
        w, h = degrade(base, dst, blur_radius, dim, noise_amp)
        manifest.append((name, dst, w, h))
        print(f"{name:14} blur={blur_radius:<4} dim={dim:<5} noise={noise_amp:<3} {w}x{h}")

    os.remove(base)
    with open(os.path.join(outdir, "manifest.txt"), "w") as fh:
        for name, path, w, h in manifest:
            fh.write(f"{name}|{path}|{w}|{h}\n")
    print(f"\n{len(manifest)} gambar uji (ukuran produksi) di {outdir}")


if __name__ == "__main__":
    main()
