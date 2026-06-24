# MailerSend Email API

A Node.js + Express REST API to send emails via MailerSend SMTP.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Edit `.env` with your MailerSend SMTP credentials (already pre-filled).

3. Start the server:
   ```bash
   npm start
   ```

## API Endpoints

### GET /
Health check.

---

### POST /send-email
Send any custom email.

**Body:**
```json
{
  "to": "recipient@example.com",
  "toName": "John Doe",
  "subject": "Hello!",
  "text": "Plain text body",
  "html": "<b>Optional HTML body</b>"
}
```

---

### POST /send-welcome
Send a pre-built welcome email.

**Body:**
```json
{
  "to": "newuser@example.com",
  "name": "John"
}
```

---

### POST /send-otp
Send an OTP verification email.

**Body:**
```json
{
  "to": "user@example.com",
  "otp": "482910"
}
```

## Tech Stack
- Node.js
- Express.js
- Nodemailer
- MailerSend SMTP
