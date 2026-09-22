-- Kalibrasi cetak + penyesuaian tampilan foto, disimpan di konfigurasi cetak
-- per kiosk yang SUDAH ada.
--
-- Kenapa di tabel ini, bukan tabel/tempat baru:
--   `kiosk_printing_configs` sudah menjadi satu sumber kebenaran per kiosk, dan
--   jalurnya sudah tersambung utuh: Admin -> backend -> kiosk-agent ->
--   reportedState -> local bridge -> photobooth. Menaruh nilai ini di tempat
--   lain berarti membuat sumber kedua yang bisa berbeda dengan yang pertama —
--   persis pola yang sudah dua kali menyebabkan bug (ukuran kertas & path aset).
--
-- IDEMPOTEN. MySQL 8.x TIDAK mendukung `ADD COLUMN IF NOT EXISTS` (itu fitur
-- MariaDB), jadi pengecekan dilakukan lewat INFORMATION_SCHEMA + prepared
-- statement. Aman dijalankan berulang: kalau kolom sudah ada, tidak ada yang
-- diubah dan tidak ada error.
--
-- Cara pakai (dari folder unismiles-backend):
--   mysql -h <host> -P <port> -u <user> -p <db> < migrate_print_calibration.sql

-- Prosedur sementara: menambah kolom hanya kalau belum ada.
DROP PROCEDURE IF EXISTS unismiles_add_column_if_missing;

DELIMITER //
CREATE PROCEDURE unismiles_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- Kepekatan termal (nilai `density` pada driver Niimbot, 1-5).
-- Sebelumnya hanya bisa diatur di halaman uji localhost.
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'thermal_density',
  "TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT 'Kepekatan cetak termal 1-5'");

-- Geser vertikal cetak dalam piksel, untuk kalibrasi registrasi kertas:
-- positif menggeser gambar ke bawah, negatif ke atas.
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'thermal_offset_y_px',
  "SMALLINT NOT NULL DEFAULT 0 COMMENT 'Geser vertikal cetak (px)'");

-- Cara foto menempati label: 'fit' (jaga rasio + bingkai putih) atau
-- 'stretch' (penuhi label, bisa gepeng).
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'photo_fit_mode',
  "VARCHAR(10) NOT NULL DEFAULT 'fit' COMMENT 'fit = jaga rasio; stretch = penuhi label'");

-- Penyesuaian tampilan FOTO HASIL cetak, dalam persen.
-- CATATAN PENTING: ini tidak berlaku untuk frame yang dikirim ke OCR verifikasi
-- pembayaran. Jalur OCR punya filter sendiri yang sudah dikalibrasi agar nominal
-- struk terbaca; mengubahnya dari sini akan merusak verifikasi pembayaran.
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'photo_brightness',
  "TINYINT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Kecerahan foto hasil cetak (%) 50-150'");
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'photo_contrast',
  "TINYINT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Kontras foto hasil cetak (%) 50-150'");
CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'photo_saturation',
  "TINYINT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Saturasi foto hasil cetak (%) 0-150'");

DROP PROCEDURE IF EXISTS unismiles_add_column_if_missing;
