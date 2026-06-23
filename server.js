require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

// ─── SMTP Transporter ───────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD,
  },
});

// ─── Generate OTP ────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Send OTP to Single User ─────────────────────────────────
app.post("/send-otp", async (req, res) => {
  const { name, email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const otp = generateOTP();

  try {
    await transporter.sendMail({
      from: `"Newemax" <${process.env.ZOHO_EMAIL}>`,
      to: email,
      subject: "Your OTP Code",
      html: `
        <h2>Hello ${name || "User"}!</h2>
        <p>Your OTP code is:</p>
        <h1 style="color:#4CAF50; letter-spacing:5px;">${otp}</h1>
        <p>This code expires in <b>10 minutes</b>.</p>
        <p>Do not share this code with anyone.</p>
      `,
    });

    console.log(`✅ OTP sent to ${email} → ${otp}`);
    res.json({ success: true, message: `OTP sent to ${email}` });

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Send OTP to Multiple Users ──────────────────────────────
app.post("/send-otp-bulk", async (req, res) => {
  const { users } = req.body;

  // users = [{ name: "Arshath", email: "arshath@example.com" }, ...]
  if (!users || !Array.isArray(users)) {
    return res.status(400).json({ success: false, message: "Users array is required" });
  }

  const results = [];

  for (const user of users) {
    const otp = generateOTP();

    try {
      await transporter.sendMail({
        from: `"Newemax" <${process.env.ZOHO_EMAIL}>`,
        to: user.email,
        subject: "Your OTP Code",
        html: `
          <h2>Hello ${user.name || "User"}!</h2>
          <p>Your OTP code is:</p>
          <h1 style="color:#4CAF50; letter-spacing:5px;">${otp}</h1>
          <p>This code expires in <b>10 minutes</b>.</p>
          <p>Do not share this code with anyone.</p>
        `,
      });

      console.log(`✅ OTP sent to ${user.name} (${user.email}) → ${otp}`);
      results.push({ email: user.email, success: true });

    } catch (error) {
      console.error(`❌ Failed: ${user.email} → ${error.message}`);
      results.push({ email: user.email, success: false, error: error.message });
    }
  }

  res.json({ success: true, results });
});

// ─── Health Check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "OTP Server is running 🚀" });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
