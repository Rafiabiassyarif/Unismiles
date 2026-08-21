-- ============================================================
-- Migration: Kiosk Orientation Support
-- Run this once in phpMyAdmin / MySQL CLI
-- ============================================================

ALTER TABLE `kiosks`
  ADD COLUMN `orientation` VARCHAR(50) DEFAULT 'PORTRAIT 1080x1920'
  AFTER `api_key`;

-- Update existing records with default orientation if NULL
UPDATE `kiosks` SET `orientation` = 'PORTRAIT 1080x1920' WHERE `orientation` IS NULL;
