-- Per-kiosk desired printer configuration and reported agent state.
-- Run after migrate_print_jobs.sql.
CREATE TABLE IF NOT EXISTS `kiosk_printing_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kiosk_id` VARCHAR(50) NOT NULL,
  `printing_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `adapter` VARCHAR(20) NOT NULL DEFAULT 'disabled',
  `printer_name` VARCHAR(255) DEFAULT NULL,
  `paper_size` VARCHAR(20) NOT NULL DEFAULT '4R',
  `orientation` VARCHAR(20) NOT NULL DEFAULT 'portrait',
  `copies_limit` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `timeout_ms` INT UNSIGNED NOT NULL DEFAULT 60000,
  `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `config_version` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `reported_config_version` BIGINT UNSIGNED DEFAULT NULL,
  `reported_adapter` VARCHAR(20) DEFAULT NULL,
  `reported_printer_name` VARCHAR(255) DEFAULT NULL,
  `reported_status` VARCHAR(30) DEFAULT NULL,
  `reported_paper_status` VARCHAR(30) DEFAULT NULL,
  `reported_prints_remaining` INT DEFAULT NULL,
  `reported_last_print_error` VARCHAR(255) DEFAULT NULL,
  `supported_adapters` JSON DEFAULT NULL,
  `available_printers` JSON DEFAULT NULL,
  `reported_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kiosk_printing_configs_kiosk` (`kiosk_id`),
  KEY `idx_kiosk_printing_configs_reported_version` (`kiosk_id`, `reported_config_version`),
  CONSTRAINT `fk_kiosk_printing_configs_kiosk`
    FOREIGN KEY (`kiosk_id`) REFERENCES `kiosks` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `resource_type` VARCHAR(100) NOT NULL,
  `resource_id` VARCHAR(100) NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_resource` (`resource_type`, `resource_id`),
  KEY `idx_audit_logs_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
