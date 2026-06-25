// ═══════════════════════════════════════════════════════════════
//  OTP Email Verification — server.js
//  Stack   : Node.js + Express
//  Email   : Maileroo SMTP (nodemailer)
//  Storage : In-memory (no database)
//
//  Routes:
//    POST /api/auth/send-otp    → send OTP to email
//    POST /api/auth/verify-otp  → verify OTP
//    GET  /health               → health check (GET only)
// ═══════════════════════════════════════════════════════════════

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const nodemailer = require("nodemailer");
const crypto     = require("crypto");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// ════════════════════════════════════════════════════════════════
//  MAILEROO SMTP
// ════════════════════════════════════════════════════════════════

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.error("❌ SMTP connection failed:", err.message);
  else     console.log("✅ Maileroo SMTP ready");
});

// ════════════════════════════════════════════════════════════════
//  OTP STORE  →  { "email": { otp, expiresAt, sentAt } }
// ════════════════════════════════════════════════════════════════

const otpStore = {};

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

// Strict email regex — rejects missing TLD, double dots, etc.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254)       return false;   // RFC 5321 max
  if (!EMAIL_REGEX.test(trimmed)) return false;
  // Reject consecutive dots
  if (trimmed.includes(".."))     return false;
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
      <p style="color:#3d3d42;font-size:15px;margin:0 0 24px;">
        Enter this one-time password to complete your verification.
      </p>
      <div style="background:#f2ede4;border:2px dashed #e87722;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#7a7a82;font-size:11px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1.5px;">Your OTP</p>
        <div style="letter-spacing:14px;font-size:40px;font-weight:700;color:#0f1e3c;font-family:monospace;">
          ${otp}
        </div>
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
//  ROUTES
// ════════════════════════════════════════════════════════════════

// ── POST /api/auth/send-otp ───────────────────────────────────
app.post("/api/auth/send-otp", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();

  // 1. Validate email
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }

  // 2. Resend cooldown — 60 seconds
  const existing = otpStore[email];
  if (existing && Date.now() < existing.sentAt + 60_000) {
    const wait = Math.ceil((existing.sentAt + 60_000 - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      message: `Please wait ${wait}s before requesting a new OTP.`,
    });
  }

  // 3. Generate OTP
  const otp       = generateOTP();
  const expiresAt = Date.now() + 5 * 60_000; // 5 min

  // 4. Send email FIRST — only store if send succeeds
  try {
    await transporter.sendMail({
      from:    `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to:      email,
      subject: `${otp} — Your verification code (valid 5 min)`,
      html:    buildEmailHTML(otp),
    });
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }

  // 5. Store only after successful send
  otpStore[email] = { otp, expiresAt, sentAt: Date.now() };

  const isDev = process.env.NODE_ENV !== "production";

  return res.status(200).json({
    success: true,
    message: `OTP sent to ${maskEmail(email)}`,
    masked:  maskEmail(email),
    ...(isDev && { demo_otp: otp }), // dev only — remove in production
  });
});


// ── POST /api/auth/verify-otp ─────────────────────────────────
app.post("/api/auth/verify-otp", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const otp   = String(req.body.otp || "").trim();

  // 1. Validate inputs
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: "OTP must be a 6-digit number." });
  }

  // 2. Look up store
  const record = otpStore[email];
  if (!record) {
    return res.status(400).json({ success: false, message: "No OTP found. Please request a new one." });
  }

  // 3. Expiry check
  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }

  // 4. OTP match — use timing-safe compare to prevent brute-force timing attacks
  const expected = Buffer.from(record.otp);
  const received = Buffer.from(otp);
  const valid =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!valid) {
    return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
  }

  // 5. Success — delete OTP so it can't be reused
  delete otpStore[email];

  return res.status(200).json({ success: true, message: "Email verified successfully!" });
});


// ── GET /health — reject all other methods ────────────────────
app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok", service: "OTP Verification API" });
});

app.all("/health", (_, res) => {
  res.status(405).set("Allow", "GET").json({ success: false, message: "Method not allowed." });
});


// ── 404 for unknown routes ────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});


// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("❌ Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error." });
});


// ════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || "development"}`);
});
