-- Asynchronous print jobs for the kiosk print orchestrator.
-- Run once after the existing schema and kiosk soft-delete migrations.
-- This table is intentionally separate from print_logs so existing reports
-- and legacy kiosk logging remain unchanged.

CREATE TABLE IF NOT EXISTS `print_jobs` (
  `job_id` CHAR(36) NOT NULL,
  `kiosk_id` VARCHAR(50) NOT NULL,
  `session_id` VARCHAR(100) NOT NULL,
  `session_code` VARCHAR(100) NOT NULL,
  `image_url` VARCHAR(2048) NOT NULL,
  `copies` TINYINT UNSIGNED NOT NULL,
  `paper_size` VARCHAR(20) NOT NULL DEFAULT '4R',
  `orientation` VARCHAR(20) NOT NULL DEFAULT 'portrait',
  `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
  `printer_name` VARCHAR(255) DEFAULT NULL,
  `error_code` VARCHAR(100) DEFAULT NULL,
  `error_message` TEXT NULL,
  `idempotency_key` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_print_jobs_kiosk_idempotency` (`kiosk_id`, `idempotency_key`),
  KEY `idx_print_jobs_session` (`session_code`),
  KEY `idx_print_jobs_kiosk_status` (`kiosk_id`, `status`),
  CONSTRAINT `fk_print_jobs_kiosk`
    FOREIGN KEY (`kiosk_id`) REFERENCES `kiosks` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
