# Uni-Smiles Kiosk Agent Service

Service kecil yang berjalan di background komputer photobooth (terpisah dari Photobooth Web App di `localhost:3000`). Agent menerima command melalui Socket.IO namespace `/kiosk` dan tidak pernah mengeksekusi shell command dari payload backend.

## Fitur Utama

1. **Authentication & Handshake**: Login menggunakan `deviceId` dan `deviceToken` (kiosk `api_key`) ke backend (`ws://localhost:8000/kiosk`).
2. **Persistent WebSocket Client**: Auto-reconnect otomatis apabila koneksi internet/server terputus dengan strategi exponential backoff.
3. **Heartbeat Telemetry (20s)**: Mengirimkan status perangkat setiap 20 detik:
   - `inkLevel` (level tinta printer %)
   - `storageUsedPercent` (persentase ruang penyimpanan disk terpakai %)
   - `cameraStatus` (`GOOD` / `BAD`)
   - `paperStatus` & `printsRemaining`
4. **Remote Command Handlers**:
   - **`CAMERA_SELF_TEST`**: Membuka device kamera, mengambil frame diagnostik, mengukur resolusi dan estimasi FPS, serta mengembalikan hasil pengujian ke backend.
   - **`UPDATE_CONFIG`**: Menerapkan pengaturan kecerahan (*brightness*), volume suara, dan status *maintenanceMode*.
   - Menerima konfigurasi printer versioned melalui `kiosk:config_update` dan hanya memilih adapter lokal dari allowlist `disabled`, `cups`, `windows`, atau `mock`; command/path dari backend tidak pernah dieksekusi.
5. **Local IPC Bridge (`localhost:3001`)**:
   - Mengirimkan sinyal `maintenanceMode` ke Photobooth Web App (`localhost:3000`).
   - Apabila `maintenanceMode` aktif, Photobooth App otomatis mengunci antarmuka dan menonaktifkan seluruh interaksi pengunjung.
6. **Automatic photo printing**:
   - Menerima `PRINT_PHOTO` melalui event `kiosk:command`.
   - Mengunduh image HTTP(S) ke temporary directory dengan validasi MIME, magic bytes, path, dan ukuran.
   - Menggunakan `PrinterAdapter`; adapter CUPS memakai printer yang sudah terdaftar dan adapter Windows memakai Windows Print Spooler dengan argument array.
   - Deduplikasi berdasarkan `job_id`, retry terbatas untuk error koneksi sementara, timeout, cleanup temporary file, dan telemetry printer pada heartbeat.

---

## Cara Menjalankan

### 1. Install Dependencies
```bash
cd uni-smiles-kiosk-agent
npm install
```

### 2. Konfigurasi Environment (`.env`)
Sesuaikan file `.env` di direktori `uni-smiles-kiosk-agent`:
```env
BACKEND_URL=http://localhost:8000
DEVICE_ID=KIOSK-001
KIOSK_API_KEY=replace-with-device-api-key
LOCAL_BRIDGE_PORT=3001
HEARTBEAT_INTERVAL=20000

PRINT_MODE=disabled
PRINTER_NAME=
PAPER_SIZE=4R
PRINT_ORIENTATION=portrait
PRINT_COPIES_LIMIT=2
PRINT_TIMEOUT_MS=60000
PRINT_RETRY_COUNT=2
PRINT_MAX_IMAGE_BYTES=15728640
```

`KIOSK_API_KEY` adalah nama konfigurasi utama. `DEVICE_TOKEN` masih diterima sebagai fallback untuk instalasi lama. API key tidak dicetak ke log. `PRINTER_NAME` harus diisi dengan nama printer trusted dari komputer, bukan nilai dari payload job. Set `PRINT_MODE=disabled` untuk instalasi awal atau mesin non-printer. Adapter dapat dipilih dinamis lewat Admin Panel setelah agent melaporkan printer yang tersedia.

### 3. Menjalankan Service

#### Development Mode:
```bash
npm run dev
```

#### Production Background Daemon (menggunakan PM2):
```bash
npm install -g pm2
pm2 start src/agent.js --name "unismiles-kiosk-agent"
pm2 save
pm2 startup
```

---

## Kontrak WebSocket Event

| Direction | Event Name | Payload Summary | Description |
|---|---|---|---|
| Kiosk -> Backend | `kiosk:heartbeat` | `{ deviceId, inkLevel, storageUsedPercent, cameraStatus }` | Mengirim data kesehatan perangkat tiap 20 detik |
| Backend -> Kiosk | `kiosk:command` | `{ command: "CAMERA_SELF_TEST", commandId }` | Perintah diagnosa kamera hardware |
| Kiosk -> Backend | `kiosk:command_result` | `{ commandId, status, data: { resolution, fps, capturedFrame } }` | Hasil pengujian diagnosa kamera |
| Backend -> Kiosk | `kiosk:command` | `{ command: "PRINT_PHOTO", payload: { job_id, image_url, copies, paper_size, orientation } }` | Memulai job print yang tervalidasi |
| Kiosk -> Backend | `kiosk:command_result` | `{ command: "PRINT_PHOTO", job_id, status: "printing" }` lalu satu result final | Status proses dan hasil print |
| Backend -> Kiosk | `kiosk:config_update` | `{ config: { brightness, volume, maintenanceMode, printing: { enabled, adapter, printer_name, paper_size, orientation, copies_limit, timeout_ms, retry_count, config_version } } }` | Mengubah konfigurasi desired state |
| Kiosk -> Backend | `kiosk:config_reported` | `{ deviceId, config_version, printing, supported_adapters, available_printers, reported_at }` | Mengirimkan reported printer state terbaru ke backend |
| Kiosk -> Photobooth App | Local WS (`ws://localhost:3001`) | `{ type: "STATE_UPDATE", payload: { maintenanceMode } }` | Notifikasi status maintenance ke Photobooth App |

## Kontrak `PRINT_PHOTO`

Contoh command:

```json
{
  "command": "PRINT_PHOTO",
  "payload": {
    "job_id": "uuid",
    "session_code": "#US-123",
    "image_url": "http://localhost:8000/uploads/final-photo.png",
    "copies": 1,
    "paper_size": "4R",
    "orientation": "portrait"
  }
}
```

Agent mengirim result `status: "printing"` setelah image selesai diunduh dan tepat sebelum adapter memulai print. Setelah itu dikirim satu result final dengan `status: "success"` atau `status: "failed"`. Command dengan `job_id` yang sama tidak dicetak ulang dan mendapatkan response `status: "duplicate"`.

Error code yang dipakai antara lain `PRINTER_NOT_CONFIGURED`, `PRINTER_NOT_FOUND`, `PRINTER_OFFLINE`, `PRINT_TIMEOUT`, `IMAGE_DOWNLOAD_FAILED`, `IMAGE_INVALID`, `IMAGE_TOO_LARGE`, `INVALID_COPIES`, `INVALID_PAPER_SIZE`, dan `PRINTER_BUSY`.

## Konfigurasi printer fisik di macOS

1. Install driver resmi printer sesuai model dan versi macOS, lalu restart jika installer memintanya.
2. Hubungkan printer melalui USB atau jaringan. Buka **System Settings → Printers & Scanners → Add Printer** dan pastikan printer bisa dipakai mencetak test page.
3. Cari nama printer yang persis:

   ```bash
   lpstat -p -d
   lpstat -a
   ```

   Nilai setelah `printer` pada output `lpstat -p` adalah nilai `PRINTER_NAME`. Spasi diperbolehkan; jangan menambahkan quote ke nilai `.env` kecuali diperlukan oleh format env loader.

4. Isi `PRINTER_NAME` dan `PRINT_MODE=macos`, kemudian jalankan agent. Verifikasi status:

   ```bash
   lpstat -p "Canon SELPHY CP1500"
   npm test
   npm start
   ```

5. Jika printer tidak muncul, pasang ulang driver, pastikan queue tidak paused/disabled, dan cek bahwa user yang menjalankan PM2 memiliki akses ke printer. Adapter mengembalikan `PRINTER_NOT_FOUND` untuk queue yang tidak ada dan `PRINTER_OFFLINE` untuk queue disabled/offline.

## Konfigurasi printer fisik di Windows

1. Install driver resmi printer sesuai merek/model.
2. Buka **Settings → Bluetooth & devices → Printers & scanners → Add device**.
3. Cetak **Print test page** dari Windows.
4. Cari nama queue printer:

   ```powershell
   Get-Printer | Select-Object Name, PrinterStatus
   ```

5. Jalankan agent dengan `PRINT_MODE=disabled` terlebih dahulu atau biarkan config awal kosong. Agent akan melaporkan `supported_adapters: ["disabled", "mock", "windows"]` dan `available_printers` melalui `kiosk:config_reported`.
6. Admin memilih adapter `windows` dan printer dari daftar tersebut. Backend mengirim `kiosk:config_update`; agent memvalidasi OS, adapter, printer name, ukuran kertas, jumlah copy, timeout, dan retry sebelum mengaktifkan printing.
7. Kirim satu test `PRINT_PHOTO`. Adapter Windows menggunakan Windows Print Spooler dan tidak membuka print dialog browser.

`getPaperStatus()` pada Windows dapat mengembalikan `UNKNOWN` karena Windows Print Spooler tidak menyediakan jumlah kertas yang konsisten untuk semua driver. Status printer tetap dilaporkan sebagai `READY`, `OFFLINE`, atau `NOT_FOUND` jika dapat dibaca.

Untuk printer atau OS lain, buat adapter baru yang mengimplementasikan `checkPrinter()`, `printImage(filePath, options)`, `getStatus()`, `getPaperStatus()`, dan `listPrinters()`. Handler Socket.IO tidak perlu diubah.

## Menjalankan test dengan fake printer

Test tidak memanggil `lp` dan tidak memerlukan printer fisik:

```bash
npm test
```

`test/print-photo.test.js` memakai `FakePrinterAdapter` dan fake HTTP response untuk memverifikasi success, offline, MIME/file invalid, duplicate job, failed print, dan timeout. Untuk integrasi adapter lain, injeksikan object dengan empat method adapter tersebut ke constructor `KioskWSClient`.

## Menjalankan agent

```bash
npm install
cp .env.example .env
# edit BACKEND_URL, KIOSK_API_KEY, DEVICE_ID, dan konfigurasi printer
npm start
```

Untuk daemon PM2, jalankan `npm run daemon:start`, lalu `npm run daemon:logs`. Pastikan environment PM2 memuat nilai `.env` yang sama dan tidak menaruh API key di `ecosystem.config.js` yang dikomit ke repository.
