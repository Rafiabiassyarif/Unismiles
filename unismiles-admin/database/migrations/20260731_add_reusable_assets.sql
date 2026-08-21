-- Reusable PNG/logo assets owned by an admin. Files should be stored by the
-- backend in configured upload storage; this table stores metadata only.
CREATE TABLE admin_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  asset_type VARCHAR(40) NOT NULL DEFAULT 'overlay',
  file_url VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_assets_owner_type (admin_id, asset_type, is_active)
);

ALTER TABLE frame_templates
  ADD COLUMN asset_id BIGINT UNSIGNED NULL,
  ADD INDEX idx_frame_templates_asset (asset_id);

-- Add foreign keys after confirming the actual user/admin primary-key table.
-- ALTER TABLE admin_assets ADD CONSTRAINT fk_admin_assets_admin
--   FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE;
-- ALTER TABLE frame_templates ADD CONSTRAINT fk_frame_templates_asset
--   FOREIGN KEY (asset_id) REFERENCES admin_assets(id) ON DELETE SET NULL;
