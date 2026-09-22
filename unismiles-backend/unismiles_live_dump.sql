-- ============================================================
-- Uni-Smiles Production Database Dump
-- Generated: 2026-09-15
-- Target Database: MySQL 8.0+ / MariaDB 10.5+
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------
-- 1. Table structure for table `users`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` ENUM('Super Admin','Admin Mitra','Klien') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Admin Mitra',
  `partner_name` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT 'All Partners',
  `assigned_kiosks` JSON DEFAULT NULL COMMENT 'Array ID kiosk, contoh: ["K-001", "K-002"]',
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping initial Super Admin user
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `partner_name`, `assigned_kiosks`, `status`, `created_at`, `updated_at`) VALUES
(1, 'Super Admin', 'm.taqizdihar@gmail.com', '$2b$10$DZn53BW.hHq2znUODMBr9.O5WWDGrCWD.TENakJkOFB0EPYy.Hsr.', 'Super Admin', 'Unaffiliated', NULL, 'Active', '2026-07-16 00:49:09', '2026-07-16 01:28:43')
ON DUPLICATE KEY UPDATE `id`=`id`;

-- --------------------------------------------------------
-- 2. Table structure for table `kiosks`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `kiosks` (
  `id` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Contoh: K-001',
  `name` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` INT DEFAULT NULL,
  `api_key` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orientation` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'PORTRAIT 1080x1920',
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'offline' COMMENT 'online, offline, idle',
  `health` JSON DEFAULT NULL COMMENT 'Status hardware (printer, storage, camera)',
  `config` JSON DEFAULT NULL COMMENT 'Pengaturan brightness, volume, maintenance',
  `last_heartbeat` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key` (`api_key`),
  KEY `fk_kiosk_user` (`user_id`),
  KEY `idx_last_heartbeat` (`last_heartbeat`),
  KEY `idx_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_kiosk_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping initial default kiosk
INSERT INTO `kiosks` (`id`, `name`, `location`, `user_id`, `api_key`, `orientation`, `status`, `health`, `config`, `last_heartbeat`, `created_at`, `updated_at`, `deleted_at`) VALUES
('K-001', 'Kiosk Senja 01', 'Lobi Utara', NULL, NULL, 'PORTRAIT 1080x1920', 'offline', NULL, NULL, NULL, '2026-07-15 03:43:51', '2026-07-15 03:43:51', NULL)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- --------------------------------------------------------
-- 3. Table structure for table `admin_assets`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `admin_assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id` INT NOT NULL,
  `name` VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_type` VARCHAR(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'overlay',
  `file_url` VARCHAR(1024) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` BIGINT UNSIGNED DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_assets_owner_type` (`admin_id`, `asset_type`, `is_active`),
  CONSTRAINT `fk_admin_assets_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Table structure for table `frame_templates`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `frame_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT DEFAULT NULL,
  `name` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `layout_id` VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT '1x1',
  `price` DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  `category` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL referensi file gambar bingkai',
  `bg_color` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT '#1E293B',
  `accent_color` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT '#FFFFFF',
  `frame_type` VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT 'color' COMMENT 'color | gradient | png',
  `gradient_stops` JSON DEFAULT NULL COMMENT 'Array of {color, position} objects',
  `gradient_angle` INT DEFAULT 45,
  `gradient_style` VARCHAR(10) COLLATE utf8mb4_unicode_ci DEFAULT 'linear' COMMENT 'linear | radial',
  `text_elements` JSON DEFAULT NULL COMMENT 'Array of text overlay elements',
  `slot_count` INT NOT NULL DEFAULT '1',
  `layout_config` JSON DEFAULT NULL COMMENT 'Koordinat slot foto dalam bingkai',
  `asset_id` BIGINT UNSIGNED DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT '1',
  `usage_count` INT DEFAULT '0',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_ft_user` (`user_id`),
  KEY `idx_frame_templates_asset` (`asset_id`),
  CONSTRAINT `fk_ft_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ft_asset` FOREIGN KEY (`asset_id`) REFERENCES `admin_assets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Table structure for table `payment_profiles`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `payment_profiles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `profile_name` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_type` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `merchant_name` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_name` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_data` JSON DEFAULT NULL,
  `is_default` TINYINT(1) DEFAULT '0',
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_payment_profile_user` (`user_id`),
  CONSTRAINT `fk_payment_profile_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Table structure for table `system_settings`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `setting_group` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `setting_key` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `value_type` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'string',
  `description` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_public` TINYINT(1) DEFAULT '0',
  `updated_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `fk_system_settings_user` (`updated_by`),
  CONSTRAINT `fk_system_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_settings` (`setting_group`, `setting_key`, `setting_value`, `value_type`, `description`, `is_public`) VALUES
('retention', 'session_retention_months', '6', 'number', 'Retention duration for sessions in months', 0)
ON DUPLICATE KEY UPDATE `setting_key`=`setting_key`;

-- --------------------------------------------------------
-- 7. Table structure for table `sessions`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Contoh: #US-117001',
  `kiosk_id` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frame_template_id` INT DEFAULT NULL,
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'active' COMMENT 'active, completed, abandoned',
  `payment_status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `payment_required_amount` DECIMAL(10,2) DEFAULT NULL,
  `payment_expires_at` TIMESTAMP NULL DEFAULT NULL,
  `payment_verified_at` TIMESTAMP NULL DEFAULT NULL,
  `payment_verification_method` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active_verification_attempt_id` CHAR(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_session_kiosk` (`kiosk_id`),
  KEY `fk_session_frame` (`frame_template_id`),
  CONSTRAINT `fk_session_frame` FOREIGN KEY (`frame_template_id`) REFERENCES `frame_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_session_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `kiosks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. Table structure for table `payment_verification_attempts`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `payment_verification_attempts` (
  `id` CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kiosk_id` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_id` INT DEFAULT NULL,
  `attempt_number` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'received',
  `decision` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'processing',
  `expected_amount` DECIMAL(10,2) NOT NULL,
  `extracted_amount` DECIMAL(10,2) DEFAULT NULL,
  `provider_detected` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `screen_type` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `merchant_normalized` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_hmac` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extracted_paid_at` TIMESTAMP NULL DEFAULT NULL,
  `ocr_confidence` FLOAT DEFAULT NULL,
  `provider_confidence` FLOAT DEFAULT NULL,
  `quality_score` FLOAT DEFAULT NULL,
  `liveness_score` FLOAT DEFAULT NULL,
  `tamper_score` FLOAT DEFAULT NULL,
  `reason_codes` JSON DEFAULT NULL,
  `model_version` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rules_version` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_private_path` VARCHAR(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_delete_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pva_session` (`session_id`),
  KEY `idx_pva_kiosk` (`kiosk_id`),
  CONSTRAINT `fk_pva_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 9. Table structure for table `transactions`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_code` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Kode referensi QRIS / Invoice',
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_method` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'QRIS',
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT 'pending, success, failed',
  `verification_method` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'qris_visual_proof',
  `provider_detected` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_hmac` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` TIMESTAMP NULL DEFAULT NULL,
  `verified_at` TIMESTAMP NULL DEFAULT NULL,
  `verification_attempt_id` CHAR(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_version` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rules_version` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_reason_code` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_code` (`transaction_code`),
  UNIQUE KEY `uq_transactions_session_id` (`session_id`),
  KEY `fk_transaction_session` (`session_id`),
  CONSTRAINT `fk_transaction_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 10. Table structure for table `photos`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `photos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_sent_to` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_photo_session` (`session_id`),
  CONSTRAINT `fk_photo_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 11. Table structure for table `filters`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `filters` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'color' COMMENT 'color, overlay, sticker',
  `preview_url` VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT '1',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 12. Table structure for table `photo_filters`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `photo_filters` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `photo_id` INT NOT NULL,
  `filter_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pf_photo` (`photo_id`),
  KEY `fk_pf_filter` (`filter_id`),
  CONSTRAINT `fk_pf_filter` FOREIGN KEY (`filter_id`) REFERENCES `filters` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pf_photo` FOREIGN KEY (`photo_id`) REFERENCES `photos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 13. Table structure for table `gesture_logs`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `gesture_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gesture_type` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence_score` FLOAT NOT NULL,
  `action_triggered` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detected_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_gesture_session` (`session_id`),
  CONSTRAINT `fk_gesture_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 14. Table structure for table `print_jobs`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `print_jobs` (
  `job_id` CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kiosk_id` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_code` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` VARCHAR(2048) COLLATE utf8mb4_unicode_ci NOT NULL,
  `copies` TINYINT UNSIGNED NOT NULL,
  `paper_size` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '4R',
  `orientation` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'portrait',
  `status` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `printer_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_code` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` TEXT COLLATE utf8mb4_unicode_ci,
  `idempotency_key` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_print_jobs_kiosk_idempotency` (`kiosk_id`, `idempotency_key`),
  KEY `idx_print_jobs_session` (`session_code`),
  KEY `idx_print_jobs_kiosk_status` (`kiosk_id`, `status`),
  CONSTRAINT `fk_print_jobs_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `kiosks` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 15. Table structure for table `print_logs`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `print_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kiosk_id` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'success',
  `paper_stock_left` INT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_print_logs_kiosk` (`kiosk_id`),
  KEY `idx_print_logs_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 16. Table structure for table `kiosk_printing_configs`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `kiosk_printing_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kiosk_id` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `printing_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `adapter` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disabled',
  `printer_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paper_size` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '4R',
  `orientation` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'portrait',
  `copies_limit` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `timeout_ms` INT UNSIGNED NOT NULL DEFAULT 60000,
  `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `config_version` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `reported_config_version` BIGINT UNSIGNED DEFAULT NULL,
  `reported_adapter` VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_printer_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_status` VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_paper_status` VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_prints_remaining` INT DEFAULT NULL,
  `reported_last_print_error` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supported_adapters` JSON DEFAULT NULL,
  `available_printers` JSON DEFAULT NULL,
  `reported_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kiosk_printing_configs_kiosk` (`kiosk_id`),
  KEY `idx_kiosk_printing_configs_reported_version` (`kiosk_id`, `reported_config_version`),
  CONSTRAINT `fk_kiosk_printing_configs_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `kiosks` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 17. Table structure for table `audit_logs`
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_resource` (`resource_type`, `resource_id`),
  KEY `idx_audit_logs_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
