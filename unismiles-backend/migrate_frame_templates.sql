-- ============================================================
-- Migration: Extend frame_templates table
-- Run this on your MySQL database (unismiles)
-- ============================================================

-- Add missing columns that the controller already references
-- Use IF NOT EXISTS style via separate ALTER statements

ALTER TABLE `frame_templates`
  ADD COLUMN `user_id` int DEFAULT NULL AFTER `id`,
  ADD COLUMN `layout_id` varchar(20) DEFAULT '1x1' AFTER `name`,
  ADD COLUMN `bg_color` varchar(50) DEFAULT '#1E293B' AFTER `image_url`,
  ADD COLUMN `accent_color` varchar(50) DEFAULT '#FFFFFF' AFTER `bg_color`,
  ADD COLUMN `frame_type` varchar(20) DEFAULT 'color' COMMENT 'color | gradient | png' AFTER `accent_color`,
  ADD COLUMN `gradient_stops` json DEFAULT NULL COMMENT 'Array of {color, position} objects' AFTER `frame_type`,
  ADD COLUMN `gradient_angle` int DEFAULT 45 AFTER `gradient_stops`,
  ADD COLUMN `gradient_style` varchar(10) DEFAULT 'linear' COMMENT 'linear | radial' AFTER `gradient_angle`,
  ADD COLUMN `text_elements` json DEFAULT NULL COMMENT 'Array of text overlay elements' AFTER `gradient_style`,
  ADD COLUMN `deleted_at` timestamp NULL DEFAULT NULL AFTER `updated_at`;

-- Add foreign key for user_id if not already present
-- (Skip if it already exists in your schema)
-- ALTER TABLE `frame_templates`
--   ADD CONSTRAINT `fk_ft_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Verify result
-- ============================================================
DESCRIBE `frame_templates`;
