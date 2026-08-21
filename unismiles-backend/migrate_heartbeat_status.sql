-- ============================================================
-- Migration: Kiosk Heartbeat & Soft-Delete Support
-- Run this once in phpMyAdmin / MySQL CLI before deploying
-- ============================================================

-- 1. Tambah kolom deleted_at ke tabel kiosks
--    (sudah dipakai di query tapi belum ada di schema)
ALTER TABLE `kiosks`
  ADD COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL
  AFTER `updated_at`;

-- 2. Tambah index pada last_heartbeat untuk mempercepat
--    query kalkulasi status online/idle/offline
ALTER TABLE `kiosks`
  ADD INDEX `idx_last_heartbeat` (`last_heartbeat`);

-- 3. Tambah index pada deleted_at untuk mempercepat
--    filter soft-delete
ALTER TABLE `kiosks`
  ADD INDEX `idx_deleted_at` (`deleted_at`);

-- ============================================================
-- Verifikasi: jalankan query ini setelah migration
-- ============================================================
-- DESCRIBE kiosks;
-- SHOW INDEX FROM kiosks;
