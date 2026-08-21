-- Harga khusus per frame template.
-- NULL berarti gunakan kiosks.base_price sebagai fallback untuk kompatibilitas data lama.
ALTER TABLE frame_templates
  ADD COLUMN price DECIMAL(12, 2) NULL;

-- Saat pembayaran, backend harus menyimpan harga yang dipakai ke session/transaction.
-- Sesuaikan nama tabel/kolom dengan skema backend Anda bila berbeda.
-- Contoh query sumber harga:
-- SELECT COALESCE(ft.price, k.base_price) AS amount
-- FROM sessions s
-- JOIN kiosks k ON k.id = s.kiosk_id
-- LEFT JOIN frame_templates ft ON ft.id = s.frame_template_id
-- WHERE s.session_code = ?;

-- Penting: nilai amount yang sudah tersimpan pada sessions/transactions tidak boleh
-- diubah ketika harga frame diubah; harga baru hanya berlaku untuk session berikutnya.
