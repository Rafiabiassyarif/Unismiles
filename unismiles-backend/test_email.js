require('dotenv').config();

const nodemailer = require('nodemailer');

const isPlaceholder = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || /replace-with|your[-_]?|change[-_]?me|example\.com/.test(normalized);
};

const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
const smtpPort = Number(process.env.SMTP_PORT) || 587;

if (isPlaceholder(smtpUser) || isPlaceholder(smtpPass)) {
  console.error('SMTP_USER dan SMTP_PASS belum dikonfigurasi di .env.');
  process.exitCode = 1;
} else {
  const transporter = nodemailer.createTransport({
    host: String(process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort === 587,
    auth: { user: smtpUser, pass: smtpPass },
  });

  transporter.verify()
    .then(() => console.log('SMTP Gmail siap digunakan.'))
    .catch(error => {
      console.error(error.code || error.message);
      process.exitCode = 1;
    });
}
