-- Reusable PNG/logo/sticker assets for the admin frame editor.
-- Run after the base schema and migrate_frame_templates.sql.

CREATE TABLE IF NOT EXISTS admin_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  asset_type VARCHAR(40) NOT NULL DEFAULT 'overlay',
  file_url VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_assets_owner_type (admin_id, asset_type, is_active),
  CONSTRAINT fk_admin_assets_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE frame_templates
  ADD COLUMN IF NOT EXISTS asset_id BIGINT UNSIGNED NULL,
  ADD INDEX idx_frame_templates_asset (asset_id);

-- Existing frame_templates rows remain valid: asset_id is nullable.
