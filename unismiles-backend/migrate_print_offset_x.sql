-- Geser MENDATAR cetak (sumbu X), pelengkap thermal_offset_y_px yang sudah ada.
--
-- Kenapa perlu kolom terpisah, bukan digabung:
--   Sebelumnya hanya ada geser vertikal. Kalau isi frame tidak sejajar MENDATAR
--   dengan desain yang sudah tercetak di kertas label, tidak ada cara
--   memperbaikinya dari Admin sama sekali — satu-satunya jalan adalah menyentuh
--   kode dan deploy ulang. Itu yang terjadi: hasil cetak bergeser kiri/kanan dan
--   tidak bisa dikalibrasi.
--
-- Konvensi tanda SAMA dengan sumbu Y (konsisten, supaya tidak perlu diingat):
--   positif = geser ke KANAN, negatif = geser ke KIRI.
--
-- Batas ±200 px (±16,9 mm @300 dpi) cukup untuk semua pergeseran kertas yang
-- masuk akal, dan tetap mencegah salah ketik yang menggeser gambar keluar label.
--
-- IDEMPOTEN — aman dijalankan berulang. MySQL 8.x tidak punya
-- `ADD COLUMN IF NOT EXISTS`, jadi dicek lewat INFORMATION_SCHEMA.

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

CALL unismiles_add_column_if_missing('kiosk_printing_configs', 'thermal_offset_x_px',
  "SMALLINT NOT NULL DEFAULT 0 COMMENT 'Geser mendatar cetak (px); positif = kanan'");

DROP PROCEDURE IF EXISTS unismiles_add_column_if_missing;
