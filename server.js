require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const crypto  = require("crypto");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Sanitize body — trim spaces from all keys and string values
app.use((req, _, next) => {
  if (req.body && typeof req.body === "object") {
    const clean = {};
    for (const [key, val] of Object.entries(req.body)) {
      clean[key.trim()] = typeof val === "string" ? val.trim() : val;
    }
    req.body = clean;
  }
  next();
});

// ════════════════════════════════════════════════════════════════
//  MAILEROO HTTP API v2
// ════════════════════════════════════════════════════════════════

async function sendEmail({ to, subject, html }) {
  const response = await fetch("https://smtp.maileroo.com/api/v2/emails", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "X-API-Key": process.env.MAILEROO_API_KEY,
    },
    body: JSON.stringify({
      from: {
        address:      process.env.FROM_EMAIL,
        display_name: process.env.FROM_NAME,
      },
      to: [{ address: to }],
      subject,
      html,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Maileroo error: ${response.status}`);
  }
  return data;
}

// ════════════════════════════════════════════════════════════════
//  OTP STORE
// ════════════════════════════════════════════════════════════════

const otpStore = {};

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const t = email.trim();
  if (t.length > 254)       return false;
  if (!EMAIL_REGEX.test(t)) return false;
  if (t.includes(".."))     return false;
  return true;
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function maskEmail(email) {
  const [user, domain] = email.trim().split("@");
  const m =
    user.length <= 2
      ? user[0] + "*".repeat(user.length - 1)
      : user[0] + "*".repeat(user.length - 2) + user[user.length - 1];
  return `${m}@${domain}`;
}

function buildEmailHTML(otp) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:32px 0;">
  <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
    <div style="background:#0f1e3c;padding:28px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">Email Verification</h1>
      <p style="color:#8fa3c8;font-size:13px;margin:6px 0 0;">Use the OTP below to verify your email</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#3d3d42;font-size:15px;margin:0 0 24px;">Enter this one-time password to complete your verification.</p>
      <div style="background:#f2ede4;border:2px dashed #e87722;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#7a7a82;font-size:11px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1.5px;">Your OTP</p>
        <div style="letter-spacing:14px;font-size:40px;font-weight:700;color:#0f1e3c;font-family:monospace;">${otp}</div>
      </div>
      <p style="color:#7a7a82;font-size:13px;margin:0 0 4px;">⏱ Expires in <strong>5 minutes</strong>.</p>
      <p style="color:#7a7a82;font-size:13px;margin:0;">If you didn't request this, ignore this email.</p>
    </div>
    <div style="background:#f2ede4;padding:14px 32px;text-align:center;">
      <p style="color:#7a7a82;font-size:12px;margin:0;">Do not share this OTP with anyone.</p>
    </div>
  </div>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
//  CORE HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleSendOtp(req, res) {
  const email = (req.body.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }

  const existing = otpStore[email];
  if (existing && Date.now() < existing.sentAt + 60_000) {
    const wait = Math.ceil((existing.sentAt + 60_000 - Date.now()) / 1000);
    return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting a new OTP.` });
  }

  const otp       = generateOTP();
  const expiresAt = Date.now() + 5 * 60_000;

  try {
    await sendEmail({
      to:      email,
      subject: `${otp} — Your verification code (valid 5 min)`,
      html:    buildEmailHTML(otp),
    });
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }

  otpStore[email] = { otp, expiresAt, sentAt: Date.now() };
  console.log(`✅ OTP sent → ${maskEmail(email)}`);

  const isDev = process.env.NODE_ENV !== "production";
  return res.status(200).json({
    success: true,
    message: `OTP sent to ${maskEmail(email)}`,
    masked:  maskEmail(email),
    ...(isDev && { demo_otp: otp }),
  });
}

function handleVerifyOtp(req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const otp   = String(req.body.otp || "").trim();

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: "OTP must be a 6-digit number." });
  }

  const record = otpStore[email];
  if (!record) {
    return res.status(400).json({ success: false, message: "No OTP found. Please request a new one." });
  }
  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }

  const expected = Buffer.from(record.otp);
  const received = Buffer.from(otp);
  const valid = expected.length === received.length && crypto.timingSafeEqual(expected, received);

  if (!valid) {
    return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
  }

  delete otpStore[email];
  console.log(`✅ OTP verified → ${maskEmail(email)}`);
  return res.status(200).json({ success: true, message: "Email verified successfully!" });
}

// ════════════════════════════════════════════════════════════════
//  ROUTES — all URL variations work
// ════════════════════════════════════════════════════════════════

// Health
app.get("/health", (_, res) => res.status(200).json({ status: "ok", service: "OTP Verification API" }));
app.all("/health", (_, res) => res.status(405).set("Allow", "GET").json({ success: false, message: "Method not allowed." }));

// Root
app.get("/", (_, res) => res.status(200).json({
  service:   "OTP Verification API",
  status:    "running",
  endpoints: {
    sendOtp:   "POST /api/auth/send-otp",
    verifyOtp: "POST /api/auth/verify-otp",
    health:    "GET  /health",
  },
}));

// Send OTP — all URL variations
app.post("/api/auth/send-otp", handleSendOtp);
app.post("/api/send-otp",      handleSendOtp);
app.post("/auth/send-otp",     handleSendOtp);
app.post("/send-otp",          handleSendOtp);
app.post("/send",              handleSendOtp);

// Verify OTP — all URL variations
app.post("/api/auth/verify-otp", handleVerifyOtp);
app.post("/api/verify-otp",      handleVerifyOtp);
app.post("/auth/verify-otp",     handleVerifyOtp);
app.post("/verify-otp",          handleVerifyOtp);
app.post("/verify",              handleVerifyOtp);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("❌ Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error." });
});

// ════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
  console.log(`   Mode : ${process.env.NODE_ENV || "development"}`);
  console.log(`   From : ${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`);
  console.log(`   API  : Maileroo HTTP API v2`);
});
