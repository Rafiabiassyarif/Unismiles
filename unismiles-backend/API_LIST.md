# 📋 Daftar API — Uni-Smiles Backend Server

> **Base URL:** `http://localhost:8000`  
> **Versi:** `1.0.0`  
> **Dibuat:** 2026-07-20

---

## Legenda Autentikasi

| Simbol | Jenis Auth | Header |
| :---: | :--- | :--- |
| 🔓 | Public (tanpa auth) | — |
| 🔑 | JWT Bearer Token | `Authorization: Bearer <token>` |
| 🔐 | API Key Kiosk | `x-api-key: <api_key>` |

---

## 🏥 Health Check

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/` | 🔓 | Cek status server berjalan |

---

## 🔐 Authentication — `/api/auth`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | 🔓 | Login user, mendapat JWT token |
| `POST` | `/api/auth/register` | 🔓 | Registrasi user/operator baru |
| `GET` | `/api/auth/me` | 🔑 | Lihat profil user yang sedang login |

---

## 👤 User Management — `/api/users`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/users` | 🔑 | Ambil semua user |
| `GET` | `/api/users/:id` | 🔑 | Ambil user berdasarkan ID |
| `PUT` | `/api/users/:id` | 🔑 | Update data user |
| `DELETE` | `/api/users/:id` | 🔑 | Hapus user |

---

## 🖥️ Kiosk Operations — `/api/kiosks`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/kiosks` | 🔓 | Ambil semua kiosk terdaftar |
| `GET` | `/api/kiosks/:id` | 🔓 | Ambil kiosk berdasarkan ID |
| `POST` | `/api/kiosks` | 🔑 | Daftarkan kiosk baru (auto-generate API Key) |
| `PUT` | `/api/kiosks/:id` | 🔑 | Update nama/lokasi kiosk |
| `DELETE` | `/api/kiosks/:id` | 🔑 | Hapus kiosk |

---

## 🖼️ Frame Templates — `/api/frame_templates`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/frame_templates` | 🔓 | Ambil semua template frame |
| `GET` | `/api/frame_templates/:id` | 🔓 | Ambil template frame berdasarkan ID |
| `POST` | `/api/frame_templates` | 🔓 | Tambah template frame baru |
| `PUT` | `/api/frame_templates/:id` | 🔓 | Update template frame |
| `DELETE` | `/api/frame_templates/:id` | 🔓 | Hapus template frame |

---

## 📸 Session & Transaksi — `/api/sessions`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/sessions` | 🔓 | Ambil semua histori sesi |
| `GET` | `/api/sessions/:id` | 🔓 | Ambil sesi berdasarkan ID |
| `POST` | `/api/sessions/start` | 🔐 | Mulai sesi photobooth baru |
| `POST` | `/api/sessions/:id/complete` | 🔐 | Selesaikan sesi & catat transaksi |
| `POST` | `/api/sessions/:id/send-email` | 🔐 | Kirim salinan digital foto ke email |

---

## 🖼️ Media & Foto — `/api/photos`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/photos` | 🔐 | Upload foto hasil sesi (multipart/form-data) |
| `GET` | `/api/photos/session/:sessionId` | 🔓 | Ambil semua foto berdasarkan ID sesi |

---

## 🎨 Filters — `/api/filters`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/filters` | 🔓 | Ambil semua filter aktif |
| `POST` | `/api/filters` | 🔓 | Tambah filter baru |
| `PUT` | `/api/filters/:id` | 🔓 | Update filter |
| `DELETE` | `/api/filters/:id` | 🔓 | Hapus filter |

---

## 🤚 Gesture Logs — `/api/gestures`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/gestures` | 🔓 | Ambil semua log gesture |
| `POST` | `/api/gestures` | 🔐 | Catat gesture dari kiosk (computer vision) |

---

## 🖨️ Print Logs — `/api/prints`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/prints` | 🔓 | Ambil semua log cetak (opsional: ?kiosk_id=...) |
| `POST` | `/api/prints` | 🔐 | Catat log cetak dari kiosk |

---

## 📊 Dashboard Analytics — `/api/dashboard`

| Method | Endpoint | Auth | Deskripsi |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/dashboard/stats` | 🔓 | Ambil statistik: total revenue, sesi hari ini, top templates |

---

## 📁 Static Files

| Path | Deskripsi |
| :--- | :--- |
| `/uploads/<filename>` | Akses file foto yang sudah diupload |

---

## ⚠️ HTTP Status Codes

| Kode | Nama | Trigger |
| :---: | :--- | :--- |
| `200` | OK | Request berhasil |
| `201` | Created | Resource baru berhasil dibuat |
| `400` | Bad Request | Parameter tidak lengkap / body salah format |
| `401` | Unauthorized | Header auth tidak ada atau tidak valid |
| `403` | Forbidden | JWT gagal verifikasi atau sudah expired |
| `404` | Not Found | Path atau ID resource tidak ditemukan |
| `409` | Conflict | Duplikasi email user atau ID kiosk |
| `500` | Internal Server Error | Error database atau exception server |

---

## 🔢 Ringkasan Total Endpoint

| Grup | Jumlah Endpoint |
| :--- | :---: |
| Health Check | 1 |
| Authentication | 3 |
| User Management | 4 |
| Kiosk Operations | 5 |
| Frame Templates | 5 |
| Session & Transaksi | 5 |
| Media & Foto | 2 |
| Filters | 4 |
| Gesture Logs | 2 |
| Print Logs | 2 |
| Dashboard Analytics | 1 |
| **Total** | **34** |

---

> 📖 Untuk dokumentasi lengkap dengan contoh request/response payload, lihat file [Uni-Smiles API Documentation.md](./Uni-Smiles%20API%20Documentation.md)
