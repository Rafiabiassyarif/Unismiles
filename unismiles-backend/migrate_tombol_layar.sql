-- Tombol layar akhir yang bisa dimatikan dari Admin.
--
-- Kenapa di sini dan bukan sekadar konstanta di kode: ketiga tombol ini adalah
-- pilihan OPERASIONAL, bukan teknis. Ada kiosk yang tidak boleh mengirim email
-- (mis. tanpa SMTP), ada yang ingin pembeli tidak bisa mengambil ulang foto, dan
-- ada yang ingin cetaknya hanya otomatis (tanpa tombol cetak yang bisa ditekan
-- berkali-kali). Menyalakan/mematikannya harus bisa dilakukan dari Admin tanpa
-- build ulang — dan tanpa MENGHAPUS kodenya, karena kodenya masih dipakai begitu
-- diaktifkan kembali.
--
-- Bawaannya SEMUA AKTIF = perilaku yang sudah ada sekarang. Kiosk yang sudah
-- berjalan tidak berubah apa pun sampai operator mematikannya sendiri.

ALTER TABLE kiosk_printing_configs
  ADD COLUMN show_email_button TINYINT(1) NOT NULL DEFAULT 1 AFTER grayscale_algorithm,
  ADD COLUMN show_retake_button TINYINT(1) NOT NULL DEFAULT 1 AFTER show_email_button,
  ADD COLUMN show_print_button TINYINT(1) NOT NULL DEFAULT 1 AFTER show_retake_button;
