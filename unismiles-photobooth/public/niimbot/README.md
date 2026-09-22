# Cetak ke Niimbot B1 Pro dari Photobooth (Web Bluetooth)

Mencetak langsung dari browser photobooth ke printer label Niimbot B1 Pro lewat
Bluetooth — tanpa aplikasi perantara, tanpa driver OS, tanpa `npm install` di
komputer kiosk.

Driver: [iscarelli/niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth)
(MIT, zero-dependency, B1 Pro sudah divalidasi penulisnya di perangkat nyata).

---

## 1. Sebelum apa pun: lebar 54 mm TIDAK muat

Ini bagian terpenting, dan bukan soal perangkat lunak.

| | nilai |
|---|---|
| Kepala cetak B1 Pro | **576 px = 48,77 mm** (terverifikasi di kertas oleh penulis driver) |
| Label yang Anda minta | 54 mm = **638 px** |
| Yang terjadi | **62 px = 5,25 mm tidak tercetak**, tanpa pesan error |

Lebar 54 mm juga **melebihi spesifikasi** printer (lebar kertas 20-50 mm, lebar
cetak efektif 48 mm). Jadi label 54 mm tidak bisa dicetak utuh — sisi kanannya
hilang begitu saja.

**Yang realistis:**

| Pilihan | Lebar | Hasil |
|---|---|---|
| Aman | **48 mm** = 567 px | utuh, tanpa pemotongan |
| Batas | 50 mm = 591 px | 1,3 mm terpotong |
| Tidak muat | 54 mm = 638 px | 5,3 mm terpotong |

**Tinggi 67 mm aman** — 791 px, jauh di bawah batas tinggi printer (350 mm).

Halaman uji di repo ini **sudah memakai 48 × 67 mm** sebagai bawaan, dan
menampilkan peringatan kalau ukuran dikunci. Kalau Anda tetap ingin 54 mm,
masukkan 54 di kolom lebar dan peringatannya akan muncul — hasil cetaknya akan
terpotong, jadi jangan kaget.

---

## 1b. Frame photobooth vs kertas printer

Frame photobooth punya ukuran sendiri, dan **semuanya lebih lebar** dari kepala
cetak B1 Pro:

| Frame | Kanvas | Lebar vs kepala cetak | Akibat |
|---|---|---|---|
| 1x1 | 708 × 1062 px | 708 vs 576 px | **terpotong 11,2 mm** |
| 2x1 | 591 × 1772 px | 591 vs 576 px | terpotong 1,3 mm |
| 3x1 | 591 × 1772 px | 591 vs 576 px | terpotong 1,3 mm |

Ada **dua masalah berbeda** di sini, dan solusinya juga berbeda:

**(a) Lebar berlebih → dipotong.** Bagian kanan frame hilang, tanpa pesan error.
Solusinya: **perkecil frame di Admin**, atau terima pemotongan. Halaman uji selalu
mengunci lebar ke 576 px, jadi tidak ada yang bisa lolos diam-diam.

**(b) Rasio tidak sama → gepeng.** Driver **merentangkan** gambar memenuhi label
(`drawImage(bmp, 0, dy, w, h)`), tanpa menghiraukan rasio. Jadi kalau label
48 × 67 mm (rasio 0,717) dipakai untuk frame 1x1 (rasio 0,667), fotonya **gepeng** —
bukan terpotong.

Solusi untuk (b) ada dua, dan halaman uji menyediakan keduanya:

1. **Pakai tombol ukuran frame** di halaman uji. Setiap tombol menghasilkan label
   yang rasionya **sama persis** dengan frame aslinya, dengan lebar dikunci 48,77 mm:

   | Frame | Label yang dihasilkan | Rasio |
   |---|---|---|
   | 1x1 | 49 × 73 mm | 0,667 ✓ |
   | 2x1 | 49 × 146 mm | 0,334 ✓ |
   | 3x1 | 49 × 146 mm | 0,334 ✓ |

   Ini yang paling bersih: foto tercetak penuh, tanpa bingkai, tanpa gepeng.

2. **Centang "Sesuaikan ke label tanpa distorsi."** Gambar diskalakan
   mempertahankan rasio lalu diberi **bingkai putih** di sisinya. Berguna kalau
   ukuran kertas sudah terlanjur dipotong dan tidak bisa diubah. Fotonya tidak
   gepeng, tapi tidak memenuhi kertas — ada tepi putih.

Ringkasnya: **rasio label harus sama dengan rasio frame.** Kalau tidak, pilih
bingkai putih (opsi 2) atau ubah ukuran kertas (opsi 1).

## 2. Cara mencoba di laptop Anda

Web Bluetooth butuh **HTTPS atau localhost**. `localhost` sudah memenuhi syarat,
jadi tidak perlu sertifikat apa pun.

```bash
cd ~/Unismiles/unismiles-photobooth
npx vite --port 3000
```

Lalu buka di **Chrome atau Edge** (bukan Firefox, bukan Safari):

```
http://localhost:3000/niimbot-test.html
```

Urutannya:

1. **Nyalakan printer** B1 Pro (charge dulu bila lama tidak dipakai).
2. Klik **"Pakai gambar uji"** atau pilih PNG/JPG dari laptop Anda.
3. Klik **"1. Sambungkan printer"** → jendela pemilih perangkat Bluetooth muncul
   → pilih printer Anda (namanya berawalan `B1`).
4. Klik **"2. Cetak"**.

Langkah 3 sekaligus mencetak 1 label uji — itu cara paling andal memastikan
sambungan benar-benar hidup sebelum mencetak banyak.

Kalau pengaturan lebar ditolak, atau gambar terpotong di sisi kanan, kirim
tangkapan layar log di halaman itu.

---

## 3. Kalau pindah device — ini yang perlu dilakukan

Bagusnya: **tidak ada bagian khusus mesin di kode ini.** Halaman uji memakai
Web Bluetooth, yang sepenuhnya berjalan di browser.

**Yang TIDAK perlu dilakukan:**

- Tidak install driver printer di Windows
- Tidak install Node.js, MS Build Tools, atau Python di laptop/kiosk baru
- Tidak ada perubahan kode saat pindah perangkat

**Yang perlu dicek di perangkat baru:**

| Perangkat | Yang harus ada |
|---|---|
| **Windows / macOS (laptop)** | Chrome atau Edge versi baru. Bluetooth menyala. |
| **Android** | Chrome + **layanan lokasi harus aktif** (Android memblokir pemindaian BLE tanpa lokasi — bukan masalah pairing) |
| **iPhone / iPad** | Safari **tidak punya** Web Bluetooth. Pakai browser **Bluefy** |
| **Kiosk (photobooth)** | Halaman harus dibuka dari **HTTPS atau localhost**. Kiosk produksi sudah HTTPS, jadi aman |

**Satu hal yang sering terlewat di semua perangkat:**
Printer B1 Pro **melepas sambungan sendiri saat idle** (ia mati sendiri), dan
driver ini membuka pemilih perangkat hanya **sekali** per halaman. Jadi setiap
kali printer mati atau Anda refresh halaman, klik **"Sambungkan printer"** lagi —
Bluetooth tidak akan menyambung sendiri. Ini keterbatasan driver, bukan
kesalahan pemasangan. Kalau nanti dipakai di kiosk produksi, sambungan otomatis
perlu ditambahkan terpisah.

---

## 4. Yang belum selesai (jangan dianggap beres)

Yang sudah ada di repo ini adalah **halaman uji**, bukan integrasi ke alur
photobooth. Bedanya penting:

| | status |
|---|---|
| Cetak dari browser ke B1 Pro | ✅ halaman uji siap |
| Ukuran label 48 × 67 mm terhitung benar | ✅ diuji, 45 test lolos |
| Masuk otomatis setelah sesi foto selesai | ❌ belum |
| Frame diambil langsung dari kiosk | ❌ belum — presetnya masih ditulis di halaman uji |
| Ukuran dari Admin (Kiosk Manager) | ❌ belum — sekarang tombol preset di halaman uji |
| Sambungan otomatis (tanpa pilih perangkat) | ❌ belum |

Urutan yang disarankan: **uji manual dulu di laptop** (bagian 2). Kalau sudah
keluar label yang benar, baru saya sambungkan ke alur photobooth dan ke
pengaturan ukuran di Admin.

---

## 5. Catatan teknis

Driver: `niimbot.js` v2.6.0, di `public/niimbot/`. Dimuat sebagai tiga berkas:

```
public/niimbot/niimbot.js       driver (window.Niimbot)
public/niimbot/label-size.js    mm -> px (window.NiimbotLabelSize)
public/niimbot/registry.json    daftar model + ukuran label
public/niimbot-test.html        halaman uji
```

Model yang dipakai untuk B1 Pro (dari `registry.json`):

```js
{ name_prefixes: ['B1'], task: 'v4', density: 3, label_type: 1, speed: 1 }
```

Tiga hal yang mudah salah:

- **`task` harus `v4`**, bukan `b1`. B1 Pro 300 dpi memakai protokol v4; `b1`
  untuk model 203 dpi (B1 biasa, D110, N1). Driver akan menolak dengan pesan
  jelas kalau salah.
- **Gambar diambil lewat `fetch()`**, jadi gambar dari server harus mengizinkan
  CORS. Halaman uji memakai data-URL agar bebas masalah ini.
- **Gambar direntangkan ke ukuran label tanpa menghiraukan rasio.** Siapkan
  gambar pada rasio 48:67, kalau tidak hasilnya gepeng. Halaman uji memperingatkan
  hal ini saat Anda memilih berkas.
- **Cetak = 1-bit.** Piksel jadi hitam bila kecerahannya < 128 dan alpha > 32,
  jadi gambar nyaris transparan tercetak putih. Printer mendukung 16 skala
  abu-abu, tetapi driver ini melakukan threshold — foto akan tercetak seperti
  gambar hitam-putih titik-titik (dithering tidak otomatis).
