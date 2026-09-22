# Dokumentasi & Spesifikasi Air Gesture Unismiles

Dokumen ini berisi spesifikasi teknis lengkap, arsitektur, konfigurasi delay/timing, panduan implementasi ringkas, serta spesifikasi stack sistem Unismiles.

---

## 1. Spesifikasi Teknis Air Gesture

Sistem **Air Gesture** (Contactless UI Control) pada Unismiles dirancang untuk memungkinkan pengguna mengoperasikan antarmuka photobooth tanpa menyentuh layar secara fisik. Logika utama sistem ini diisolasi dalam custom hook [useAirGesture.ts](file:///Users/nadine/Unismiles/unismiles-photobooth/components/useAirGesture.ts) dan diintegrasikan secara *real-time* dalam komponen utama [PhotoBooth.tsx](file:///Users/nadine/Unismiles/unismiles-photobooth/components/PhotoBooth.tsx).

---

### 1.1 Arsitektur Engine & Vision Library
* **Core Engine:** **MediaPipe Hands** (`@mediapipe/hands` & `@mediapipe/camera_utils`) dimuat secara client-side via CDN di browser untuk meminimalkan *latency* pemrosesan server.
* **Stream Processing Loop:** Frame video dari webcam ditangkap terus-menerus dan diproses oleh worker MediaPipe. Setiap frame menghasilkan daftar koordinat **21 Hand Landmarks 3D** (x, y, z normalized $0.0 - 1.0$) yang diteruskan ke callback `processLandmarks()`.
* **Titik Landmark Kunci (Keypoints):**
  * `Wrist (#0)`: Pangkal pergelangan tangan (referensi dasar).
  * `Thumb (#4)`: Ujung jari jempol.
  * `Index Finger (#8 Tip, #5 MCP)`: Ujung dan pangkal jari telunjuk (penunjuk kursor).
  * `Middle Finger (#12 Tip, #9 MCP)`: Ujung dan pangkal jari tengah (referensi ukuran tangan).
  * `Ring Finger (#16 Tip, #13 MCP)`: Ujung dan pangkal jari manis.
  * `Pinky Finger (#20 Tip, #17 MCP)`: Ujung dan pangkal jari kelingking.

---

### 1.2 Skala Ukuran Tangan Dinamis & Klasifikasi Gestur

Untuk memastikan deteksi tetap stabil baik saat pengguna berdiri dekat maupun jauh dari kamera kiosk, sistem mengkalkulasi **Ukuran Tangan Dinamis (`handSize`)** di setiap frame:

$$\text{handSize} = \text{dist2D}(\text{wrist}_{0}, \text{middleMcp}_{9}) = \sqrt{(x_0 - x_9)^2 + (y_0 - y_9)^2}$$

#### A. Gestur `pinch` (Pinch / Tap & Hold Drag)
Dideteksi berdasarkan rasio jarak antara Ujung Jempol (`#4`) dan Ujung Telunjuk (`#8`) terhadap ukuran tangan (`handSize`):

$$\text{pinchGap} = \text{dist2D}(\text{thumbTip}_{4}, \text{indexTip}_{8})$$

* **Hysteresis State Machine (Mencegah Fluktuasi State):**
  * **Pinch Enter Threshold (`0.22`):** Mode Pinch **AKTIF** saat $\text{pinchGap} < \text{handSize} \times 0.22$.
  * **Pinch Exit Threshold (`0.32`):** Mode Pinch **RELEASE / NONAKTIF** saat $\text{pinchGap} > \text{handSize} \times 0.32$.

#### B. Gestur `open_hand` (Telapak Tangan Terbuka)
Dideteksi saat kondisi `!isPinch` terpenuhi DAN keempat jari utama (Telunjuk, Tengah, Manis, Kelingking) berada dalam posisi terangkat lurus di atas titik MCP masing-masing:

$$y_{\text{tip}} < y_{\text{mcp}} - (\text{handSize} \times 0.05)$$

Fungsi utama `open_hand`:
1. Menggerakkan kursor visual pada layar (Mode Navigation / Hover).
2. Memulai timernya sendiri ketika pengguna berada pada layar *Capture* foto untuk memicu hitung mundur pengambilan gambar (*Auto-Capture*).

---

### 1.3 Normalisasi Viewport & Kalibrasi Area (Calibration Box)

Kamera webcam bawaan kiosk memiliki bidang pandang (*Field of View*) yang lebar, namun fisik pengguna umumnya berada di area tengah kamera. Untuk meningkatkan kenyamanan jangkauan tangan:

* **Bounding Box Kalibrasi:** Didefinisikan area aktif tangan dengan batas `minX: 0.3`, `maxX: 0.7`, `minY: 0.25`, `maxY: 0.75`.
* **Mirroring & Range Mapping:** Koordinat $x$ kamera dibalik ($1 - x_{\text{indexTip}}$) agar gerakan kursor sesuai arah pandang mata (seperti cermin).
* **Transformasi Koordinat:**
  $$\text{targetX} = \text{mapRange}(1 - x_{\text{indexTip}}, \text{minX}, \text{maxX}) \times \text{window.innerWidth}$$
  $$\text{targetY} = \text{mapRange}(y_{\text{indexTip}}, \text{minY}, \text{maxY}) \times \text{window.innerHeight}$$

---

### 1.4 Filter Smoothing & Stabilisasi Gerakan (EMA Filter)

Gerakan tangan manusia memiliki mikro-tremor yang dapat menyebabkan kursor bergetar (*jittering*). Unismiles menerapkan **Exponential Moving Average (EMA)**:

$$\vec{P}_{\text{smooth}} = (\vec{P}_{\text{smooth}} \times 0.65) + (\vec{P}_{\text{target}} \times 0.35)$$

* **Behavior Saat Pinch:** Ketika pengguna melakukan Pinch, posisi visual kursor **dibekukan (*frozen cursor*)** pada titik awal pinch agar pengguna tidak mengeklik elemen yang salah akibat pergerakan tidak sengaja saat menjepitkan jari.
* **Raw Delta Tracker:** Pemrosesan drag/scroll menggunakan koordinat *raw pos* berkecepatan tinggi tanpa smoothing berat agar respon *scrolling* terasa responsif dan langsung.

---

### 1.5 State Machine Interaksi UI (Discrimination Logic: Click vs Scroll)

Sistem harus membedakan secara cerdas apakah gerakan *pinch* pengguna bertujuan untuk mengeklik tombol atau melakukan *scrolling* halaman:

1. **State Pinch Start:** Saat pinch terdeteksi, titik awal pinch dicatat (`pinchStartMs`, `pinchStartRaw`) dan target elemen di bawah kursor diidentifikasi menggunakan `document.elementFromPoint(x, y)`.
2. **Kriteria Komit Mode Scroll:** Mode scroll **HANYA** akan aktif jika **KEDUA** syarat berikut terpenuhi secara bersamaan:
   * Pinch telah ditahan durasi minimum $\ge 350\text{ ms}$ (`DRAG_MIN_HOLD_MS`).
   * Tangan telah bergerak sejauh $> 55\text{ px}$ (`DRAG_THRESHOLD_PX`) dari titik awal jepitan.
   * *Logika ini secara efektif mencegah tremor tangan saat mengeklik agar tidak sengaja berubah menjadi scroll.*
3. **Eksekusi Aksi Klik:** Jika pinch dilepas kurang dari `2.5` detik dan tidak pernah memasuki mode scroll, sistem secara otomatis mencari komponen interaktif terdekat (`button`, `a`, `input`, `[role="button"]`) lalu mengeksekusi metode `.click()`.

---

### 1.6 Logging Analitik Gestur Backend
Setiap gestur interaksi yang dilakukan pada kiosk di-log ke backend melalui endpoint REST API `POST /api/gestures` ([gestureRoutes.js](file:///Users/nadine/Unismiles/unismiles-backend/routes/v1/gestureRoutes.js)) yang tersimpan pada tabel `gesture_logs` di database MySQL. Ini berguna untuk memantau metrik adopsi fitur *touchless* oleh pengguna photobooth.


---

## 2. Durasi Delay & Parameter Timing

| Parameter | Value / Threshold | Keterangan & Fungsi |
| :--- | :--- | :--- |
| **Open-Hand Hold Capture** | `1.5` Detik (`1500 ms`) | Durasi menahan telapak tangan terbuka di layar capture untuk memicu otomatisasi pengambilan foto (*Auto-Capture*). |
| **Click Maximum Duration** | `2.5` Detik (`2500 ms`) | Batas durasi maksimum pinch ditahan untuk tetap dianggap sebagai aksi **Click**. |
| **Click Debounce** | `0.5` Detik (`500 ms`) | Waktu jeda minimum antar dua klik berturut-turut untuk mencegah *double-click* tidak sengaja. |
| **Drag Min Hold Duration** | `0.35` Detik (`350 ms`) | Durasi minimum pinch harus ditahan sebelum sistem mengizinkan konversi dari Mode Click ke Mode Scroll. |
| **Drag Distance Threshold** | `55` pixel | Pergeseran posisi tangan minimum dari awal pinch agar sistem mengonfirmasi pergerakan sebagai Scroll/Drag. |
| **Scroll Amplification** | `3.2x` | Pengali kecepatan scroll relatif terhadap pergeseran fisik tangan. |

---

## 3. Panduan Implementasi Ringkas (Step-by-Step)

```typescript
// 1. Inisialisasi MediaPipe Hands
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

// 2. Deteksi Gestur dari 21 Landmark (Pada Callback Results)
const wrist = landmarks[0];
const thumbTip = landmarks[4];
const indexTip = landmarks[8];
const middleMcp = landmarks[9];

const handSize = dist2D(wrist, middleMcp);
const pinchGap = dist2D(thumbTip, indexTip);

const isPinch = pinchGap < handSize * 0.22;
const isOpenHand = !isPinch && checkFingersUp(landmarks);

// 3. Mapping Koordinat & EMA Smoothing
const targetX = mapRange(1 - indexTip.x, calib.minX, calib.maxX) * window.innerWidth;
const targetY = mapRange(indexTip.y, calib.minY, calib.maxY) * window.innerHeight;

smoothedPos.x = smoothedPos.x * 0.65 + targetX * 0.35;
smoothedPos.y = smoothedPos.y * 0.65 + targetY * 0.35;

// 4. Eksekusi Interaksi UI (Click & Scroll)
const element = document.elementFromPoint(smoothedPos.x, smoothedPos.y);

if (isPinchReleased && !wasDragging) {
  const clickable = element?.closest('button, a, [role="button"], input');
  clickable?.click();
} else if (isDragging) {
  scrollableElement.scrollBy(dx * 3.2, dy * 3.2);
}
```

---

## 4. Spesifikasi Lengkap Sistem Unismiles

### 4.1 Frontend Kiosk & Photobooth ([unismiles-photobooth](file:///Users/nadine/Unismiles/unismiles-photobooth))
* **Framework & Tooling:** React 19, TypeScript, Vite, Lucide React, Axios.
* **AI Computer Vision (Browser Client-Side):**
  * `MediaPipe Hands`: Sistem Air Gesture UI Control.
  * `MediaPipe Selfie Segmentation`: Background Removal & pemotong latar belakang foto secara real-time.

### 4.2 Backend REST API ([unismiles-backend](file:///Users/nadine/Unismiles/unismiles-backend))
* **Runtime & Framework:** Node.js (>= 18.0.0), Express.js.
* **Database & ORM/Driver:** MySQL / MariaDB (`mysql2`), `migrate_frame_templates.sql`.
* **Realtime & Modul:** Socket.io, Nodemailer (pengiriman foto hasil ke email), Multer (upload aset/foto), JWT Authentication.
* **Logging:** Tabel database `gesture_logs` untuk analitik gestur pengguna pada kiosk.

### 4.3 Vision & Payment Microservice ([payment-vision-service](file:///Users/nadine/Unismiles/payment-vision-service))
* **Framework:** Python FastAPI, Uvicorn server.
* **Processing Stack:** OpenCV (`opencv-python-headless`), Pillow, NumPy, Pydantic.
* **Fungsi:** Pemrosesan gambar tingkat lanjut dan verifikasi pembayaran/QRIS.

### 4.4 Dashboard Admin ([unismiles-admin](file:///Users/nadine/Unismiles/unismiles-admin))
* **Framework:** React 19, TypeScript, Vite.
* **UI & Animation:** Tailwind CSS v4, Motion (Framer Motion), Recharts (visualisasi data/analitik), Sonner, Lucide React.
