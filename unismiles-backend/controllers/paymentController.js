const PaymentProfile = require('../models/paymentProfileModel');
const fs = require('fs/promises');
const { assertImageFile } = require('../utils/imageValidation');

const getKioskPaymentMethods = async (req, res) => {
  try {
    const user_id = req.kiosk.user_id;
    const profiles = await PaymentProfile.findByUserId(user_id);

    return res.status(200).json({ success: true, data: profiles });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAdminPaymentProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const profile = await PaymentProfile.findDefaultForKiosk(user_id);
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const uploadAdminQRIS = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    await assertImageFile(req.file, { allowed: ['png', 'jpeg', 'webp'], maxBytes: 5 * 1024 * 1024 });
    const user_id = req.user.id;
    const fileUrl = '/uploads/' + req.file.filename;
    const payment_data = JSON.stringify({ qris_image_url: fileUrl });
    
    await PaymentProfile.upsertProfile({ user_id, payment_data });
    
    return res.status(200).json({ success: true, url: fileUrl });
  } catch (error) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateAdminPaymentProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const {
      merchant_name,
      display_name,
      unique_amount_enabled,
      session_ttl_minutes,
      verification_mode,
      merchant_aliases,
      active_providers,
      payment_required,
    } = req.body;

    const existing = await PaymentProfile.findDefaultForKiosk(user_id);
    
    let paymentData = {};
    if (existing && existing.payment_data) {
      try {
        paymentData = typeof existing.payment_data === 'string'
          ? JSON.parse(existing.payment_data)
          : existing.payment_data;
      } catch (e) {}
    }

    paymentData.unique_amount_enabled = !!unique_amount_enabled;
    paymentData.session_ttl_minutes = Number(session_ttl_minutes) || 5;
    paymentData.verification_mode = verification_mode || 'assisted';
    paymentData.merchant_aliases = Array.isArray(merchant_aliases) 
      ? merchant_aliases 
      : String(merchant_aliases || '').split(',').map(s => s.trim()).filter(Boolean);
    paymentData.active_providers = Array.isArray(active_providers) 
      ? active_providers 
      : String(active_providers || '').split(',').map(s => s.trim()).filter(Boolean);

    // SAKLAR PEMBAYARAN.
    //
    // Penjagaan pemasukan: kunci ini sudah dipakai `sessionController` untuk
    // memutuskan apakah sesi dibuat sebagai menunggu pembayaran atau langsung
    // terverifikasi. Sampai sekarang hanya bisa diubah lewat SQL langsung —
    // itu sebabnya menyalakannya kembali harus lewat query manual. Sekarang
    // Admin bisa.
    //
    // Dibedakan dari `verification_mode: 'disabled'`, yang mematikan
    // PEMERIKSAAN bukti bayar tetapi alurnya tetap meminta bayar. Yang ini
    // mematikan permintaannya.
    //
    // Sengaja hanya diubah kalau field-nya benar-benar dikirim: request lama
    // yang belum memuat field ini tidak boleh diam-diam mematikan pembayaran.
    // Yang dikirim tapi bukan boolean juga diabaikan, bukan dikonversi — nilai
    // aneh tidak boleh menyalakan atau mematikan apa pun.
    if (typeof payment_required === 'boolean') {
      paymentData.payment_required = payment_required;
    } else if (payment_required !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'payment_required harus true atau false.',
      });
    }

    const payment_data_str = JSON.stringify(paymentData);

    const pool = require('../config/db');
    if (existing) {
      await pool.query(
        `UPDATE payment_profiles SET 
           merchant_name = ?, 
           display_name = ?, 
           payment_data = ? 
         WHERE id = ?`,
        [merchant_name || 'UNI SMILE', display_name || 'UNI SMILE', payment_data_str, existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO payment_profiles 
         (user_id, profile_name, payment_type, provider, display_name, merchant_name, is_default, status, payment_data) 
         VALUES (?, 'Default QRIS', 'manual_qris', 'manual', ?, ?, 1, 'active', ?)`,
        [user_id, display_name || 'UNI SMILE', merchant_name || 'UNI SMILE', payment_data_str]
      );
    }

    return res.status(200).json({ success: true, message: 'Payment profile updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getKioskPaymentMethods, getAdminPaymentProfile, uploadAdminQRIS, updateAdminPaymentProfile };
