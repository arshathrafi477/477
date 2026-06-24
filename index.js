require("dotenv").config();
const express = require("express");
const { sendEmail } = require("./mailer");

const app = express();
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "MailerSend Email API is running 🚀" });
});

// ─── Send Simple Email ───────────────────────────────────────────────────────
// POST /send-email
// Body: { to, toName?, subject, text, html? }
app.post("/send-email", async (req, res) => {
  const { to, toName, subject, text, html } = req.body;

  // Basic validation
  if (!to || !subject || !text) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: to, subject, text",
    });
  }

  try {
    const info = await sendEmail({ to, toName, subject, text, html });
    res.status(200).json({
      success: true,
      message: "Email sent successfully!",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Email error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.message,
    });
  }
});

// ─── Send Welcome Email ──────────────────────────────────────────────────────
// POST /send-welcome
// Body: { to, name }
app.post("/send-welcome", async (req, res) => {
  const { to, name } = req.body;

  if (!to || !name) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: to, name",
    });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
      <h2 style="color: #4f46e5;">👋 Welcome, ${name}!</h2>
      <p>Thanks for joining us. We're glad to have you on board.</p>
      <p>If you have any questions, just reply to this email — we're always happy to help.</p>
      <br/>
      <p style="color: #6b7280;">Best regards,<br/><strong>arshath M</strong></p>
    </div>
  `;

  try {
    const info = await sendEmail({
      to,
      toName: name,
      subject: `Welcome to the team, ${name}! 🎉`,
      text: `Welcome, ${name}! Thanks for joining us. We're glad to have you on board.`,
      html,
    });
    res.status(200).json({
      success: true,
      message: `Welcome email sent to ${name}!`,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Welcome email error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send welcome email",
      error: error.message,
    });
  }
});

// ─── Send OTP Email ──────────────────────────────────────────────────────────
// POST /send-otp
// Body: { to, otp }
app.post("/send-otp", async (req, res) => {
  const { to, otp } = req.body;

  if (!to || !otp) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: to, otp",
    });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
      <h2 style="color: #4f46e5;">🔐 Your OTP Code</h2>
      <p>Use the code below to verify your identity. It expires in <strong>10 minutes</strong>.</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #4f46e5; margin: 24px 0;">
        ${otp}
      </div>
      <p style="color: #ef4444;">Do not share this code with anyone.</p>
    </div>
  `;

  try {
    const info = await sendEmail({
      to,
      subject: `Your OTP Code: ${otp}`,
      text: `Your OTP is: ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
      html,
    });
    res.status(200).json({
      success: true,
      message: "OTP email sent!",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("OTP email error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP email",
      error: error.message,
    });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
