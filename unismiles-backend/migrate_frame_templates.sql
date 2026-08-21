-- ============================================================
-- Migration: Extend frame_templates table
-- Run this on your MySQL database (unismiles)
-- ============================================================

-- Add missing columns that the controller already references
-- Use IF NOT EXISTS style via separate ALTER statements

ALTER TABLE `frame_templates`
  ADD COLUMN IF NOT EXISTS `user_id` int DEFAULT NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `price` decimal(12,2) NOT NULL DEFAULT 0 AFTER `name`,
  ADD COLUMN IF NOT EXISTS `layout_id` varchar(20) DEFAULT '1x1' AFTER `name`,
  ADD COLUMN IF NOT EXISTS `bg_color` varchar(50) DEFAULT '#1E293B' AFTER `image_url`,
  ADD COLUMN IF NOT EXISTS `accent_color` varchar(50) DEFAULT '#FFFFFF' AFTER `bg_color`,
  ADD COLUMN IF NOT EXISTS `frame_type` varchar(20) DEFAULT 'color' COMMENT 'color | gradient | png' AFTER `accent_color`,
  ADD COLUMN IF NOT EXISTS `gradient_stops` json DEFAULT NULL COMMENT 'Array of {color, position} objects' AFTER `frame_type`,
  ADD COLUMN IF NOT EXISTS `gradient_angle` int DEFAULT 45 AFTER `gradient_stops`,
  ADD COLUMN IF NOT EXISTS `gradient_style` varchar(10) DEFAULT 'linear' COMMENT 'linear | radial' AFTER `gradient_angle`,
  ADD COLUMN IF NOT EXISTS `text_elements` json DEFAULT NULL COMMENT 'Array of text overlay elements' AFTER `gradient_style`,
  ADD COLUMN IF NOT EXISTS `deleted_at` timestamp NULL DEFAULT NULL AFTER `updated_at`;

-- Add foreign key for user_id if not already present
-- (Skip if it already exists in your schema)
-- ALTER TABLE `frame_templates`
--   ADD CONSTRAINT `fk_ft_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Verify result
-- ============================================================
DESCRIBE `frame_templates`;
