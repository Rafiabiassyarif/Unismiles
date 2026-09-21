-- Perbaiki kolom `id` yang kehilangan AUTO_INCREMENT / PRIMARY KEY.
--
-- Kenapa diperlukan: di database produksi, `admin_assets.id` ternyata tidak punya
-- AUTO_INCREMENT dan tidak jadi PRIMARY KEY (padahal dump SQL proyek sudah benar).
-- Akibatnya setiap INSERT menolak tanpa nilai `id`:
--   Field 'id' doesn't have a default value
-- dan upload gambar di Frame Editor gagal.
--
-- Migrasi ini idempoten: aman dijalankan berulang. Kalau kolom sudah benar,
-- ALTER TABLE tidak mengubah apa pun.
--
-- Cara pakai (dari folder unismiles-backend):
--   mysql -h <host> -P <port> -u <user> -p <db> < migrate_id_autoincrement.sql

-- admin_assets: tabel yang menampung gambar frame yang di-upload dari Admin.
ALTER TABLE `admin_assets`
  MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

-- audit_logs: dicatat setiap aksi admin. Cacat yang sama.
ALTER TABLE `audit_logs`
  MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

-- activity_logs: dipakai untuk jejak aktivitas kiosk.
ALTER TABLE `activity_logs`
  MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);
