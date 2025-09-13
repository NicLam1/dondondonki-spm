const nodemailer = require('nodemailer');
const { env } = require('../config/env');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: Number(env.SMTP_PORT) === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  const info = await tx.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return info;
}

module.exports = { sendMail };


