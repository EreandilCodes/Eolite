# Recipe: Email (Non-Critical Side Effect)

> **Files:** `backend/services/email.service.js` · `backend/routes/inquiries.js` · `backend/routes/settings.js`

---

## 1. Core Rule

**Email must NEVER block request handling.** Always wrap at the call site:

```javascript
// ✅ CORRECT
try {
  await emailService.sendInquiryNotification(inquiry);
} catch (err) {
  console.error('Email failed (non-critical):', err.message);
}
// request continues normally regardless

// ❌ WRONG — throws to caller
await emailService.sendInquiryNotification(inquiry);
```

---

## 2. Configuration (.env)

```env
EMAIL_MODE=mock          # default — logs to console + writes to email_log.json
EMAIL_MODE=smtp          # sends via nodemailer

EMAIL_FROM=noreply@eolite.cz
ADMIN_EMAIL=admin@eolite.cz   # fallback; overridden by notification_email in settings DB

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user@example.com
SMTP_PASS=secret
```

---

## 3. EmailService API (backend/services/email.service.js)

```javascript
import emailService from '../services/email.service.js';

// Send inquiry notification to admin
await emailService.sendInquiryNotification(inquiry);
// inquiry: { name, email, phone, message }

// Send test email (used by Settings admin)
await emailService.sendTestNotification(toAddress);
```

Both methods:
- In `mock` mode: log to console + append to `email_log.json` (in project root)
- In `smtp` mode: use nodemailer transporter
- Both return a result object (or throw on transport failure — caller must catch)

---

## 4. Notification Email Recipient

The recipient address is read at send time from:
1. `settings` DB table: `notification_email` key (set via admin Settings UI)
2. Fallback: `process.env.ADMIN_EMAIL`

`EmailService` reads the DB on each call — no restart needed after changing the setting.

---

## 5. Mock Mode Output

When `EMAIL_MODE=mock` (default during development):

```
📧 Mock email sent:
   To: admin@eolite.cz
   Subject: Nová poptávka od Jan Novák
   Body: ...
```

Also appended to `email_log.json` in project root. Useful for verifying email content without SMTP.

---

## 6. Adding a New Email Notification

1. Add a method to `EmailService` (following `sendInquiryNotification` pattern)
2. Import and call it at the appropriate route with try/catch:

```javascript
import emailService from '../services/email.service.js';

router.post('/', async (req, res) => {
  // ... save to DB first ...
  const saved = { /* ...result... */ };
  res.status(201).json(saved); // respond BEFORE or AFTER email — email must not delay response

  // Non-critical notification (fire and forget pattern):
  try {
    await emailService.sendMyNewNotification(saved);
  } catch (err) {
    console.error('Email failed (non-critical):', err.message);
  }
});
```

Alternatively, send email after responding (keep response fast):

```javascript
res.status(201).json(saved);

// After res.json() — response is already sent
emailService.sendMyNewNotification(saved).catch(err =>
  console.error('Email failed (non-critical):', err.message)
);
```

---

## 7. Checklist

- [ ] `emailService` imported from `../services/email.service.js`
- [ ] Every call wrapped in `try/catch` (or `.catch()`)
- [ ] On catch: `console.error(...)` — never `throw`, never `res.status(500)`
- [ ] Request response happens regardless of email success/failure
- [ ] `EMAIL_MODE` defaults to `mock` — no SMTP needed for development
- [ ] Notification email configured via admin Settings UI (not hardcoded in routes)
