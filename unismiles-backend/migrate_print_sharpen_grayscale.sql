-- Penajaman cetak + pilihan algoritma konversi abu-abu.
--
-- Kenapa perlu: yang membuat hasil cetak label terlihat blur bukan dpi-nya
-- (kanvas sudah 300 dpi dan itu harga mati), melainkan hilangnya perbedaan
-- terang sebelum dither 1-bit. Dua kolom ini mengendalikan bagian itu:
--
--   print_sharpen        0..100. 0 = perilaku lama (tidak menajamkan).
--                        Dikenakan pada abu-abu SEBELUM dither.
--   grayscale_algorithm  'rec601' (bawaan, perilaku lama), 'rec709',
--                        'average', 'luma-sqrt', 'green', 'red', 'blue',
--                        'max', 'min'. Bobotnya hanya dihitung di kiosk
--                        (services/oneBitImage.ts), backend hanya meneruskan
--                        namanya.
--
-- Keduanya punya bawaan = perilaku lama, jadi baris yang sudah ada tidak
-- berubah hasil cetaknya sampai operator mengubahnya sendiri di Admin.

ALTER TABLE kiosk_printing_configs
  ADD COLUMN print_sharpen INT NOT NULL DEFAULT 0 AFTER photo_fit_mode,
  ADD COLUMN grayscale_algorithm VARCHAR(16) NOT NULL DEFAULT 'rec601' AFTER print_sharpen;
