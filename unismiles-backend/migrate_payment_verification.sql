-- SQL Migration: Visual Payment Proof Verification
-- Target: MySQL 8.0+

CREATE TABLE IF NOT EXISTS `payment_profiles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `profile_name` VARCHAR(100) DEFAULT NULL,
  `payment_type` VARCHAR(50) DEFAULT NULL,
  `provider` VARCHAR(50) DEFAULT NULL,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `merchant_name` VARCHAR(100) DEFAULT NULL,
  `account_name` VARCHAR(100) DEFAULT NULL,
  `account_number` VARCHAR(100) DEFAULT NULL,
  `payment_data` JSON DEFAULT NULL,
  `is_default` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'active',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_payment_profile_user` (`user_id`),
  CONSTRAINT `fk_payment_profile_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `sessions`
  ADD COLUMN `payment_status` VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN `payment_required_amount` DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN `payment_expires_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `payment_verified_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `payment_verification_method` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `active_verification_attempt_id` CHAR(36) DEFAULT NULL;

ALTER TABLE `transactions`
  ADD COLUMN `verification_method` VARCHAR(50) DEFAULT 'qris_visual_proof',
  ADD COLUMN `provider_detected` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `reference_hmac` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `paid_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `verified_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `verification_attempt_id` CHAR(36) DEFAULT NULL,
  ADD COLUMN `model_version` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `rules_version` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `failure_reason_code` VARCHAR(50) DEFAULT NULL,
  ADD UNIQUE KEY `uq_transactions_session_id` (`session_id`);

CREATE TABLE IF NOT EXISTS `payment_verification_attempts` (
  `id` CHAR(36) NOT NULL,
  `session_id` VARCHAR(100) NOT NULL,
  `kiosk_id` VARCHAR(50) NOT NULL,
  `transaction_id` INT DEFAULT NULL,
  `attempt_number` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(50) NOT NULL DEFAULT 'received',
  `decision` VARCHAR(50) NOT NULL DEFAULT 'processing',
  `expected_amount` DECIMAL(10,2) NOT NULL,
  `extracted_amount` DECIMAL(10,2) DEFAULT NULL,
  `provider_detected` VARCHAR(50) DEFAULT NULL,
  `screen_type` VARCHAR(50) DEFAULT NULL,
  `merchant_normalized` VARCHAR(255) DEFAULT NULL,
  `reference_hmac` VARCHAR(64) DEFAULT NULL,
  `extracted_paid_at` TIMESTAMP NULL DEFAULT NULL,
  `ocr_confidence` FLOAT DEFAULT NULL,
  `provider_confidence` FLOAT DEFAULT NULL,
  `quality_score` FLOAT DEFAULT NULL,
  `liveness_score` FLOAT DEFAULT NULL,
  `tamper_score` FLOAT DEFAULT NULL,
  `reason_codes` JSON DEFAULT NULL,
  `model_version` VARCHAR(50) DEFAULT NULL,
  `rules_version` VARCHAR(50) DEFAULT NULL,
  `evidence_private_path` VARCHAR(512) DEFAULT NULL,
  `evidence_delete_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pva_session` (`session_id`),
  KEY `idx_pva_kiosk` (`kiosk_id`),
  CONSTRAINT `fk_pva_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
