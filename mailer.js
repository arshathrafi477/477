const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error.message);
  } else {
    console.log("✅ SMTP server is ready to send emails");
  }
});

const sendEmail = async ({ to, toName, subject, text, html }) => {
  const mailOptions = {
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: toName ? `"${toName}" <${to}>` : to,
    subject,
    text,
    html: html || text,
  };
  const info = await transporter.sendMail(mailOptions);
  return info;
};

module.exports = { sendEmail };
