const Photo = require('../models/photoModel');
const Session = require('../models/sessionModel');
const { assertImageFile } = require('../utils/imageValidation');
const fs = require('fs/promises');

const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo file provided' });
    }

    const session_code = req.params.session_code || req.body.session_code || req.body.session_id;
    if (!session_code) {
      return res.status(400).json({ success: false, message: 'session_code is required' });
    }

    const session = await Session.findByCodeAndKiosk(session_code, req.kiosk.id);
    if (!session) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ success: false, message: 'Session not found or does not belong to this kiosk.' });
    }
    await assertImageFile(req.file);

    const fileUrl = '/uploads/' + req.file.filename;

    await Photo.create({ session_id: session_code, url: fileUrl });

    return res.status(201).json({ success: true, message: 'Photo uploaded successfully', data: { url: fileUrl }, url: fileUrl });
  } catch (error) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadPhoto };
