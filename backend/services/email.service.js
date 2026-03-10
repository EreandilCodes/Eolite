/**
 * EmailService – simplified non-critical side effect pattern.
 * EMAIL_MODE=mock (default) → logs to console / file
 * EMAIL_MODE=smtp → sends via nodemailer
 *
 * CRITICAL: Email failures NEVER block request handling.
 * All send calls are wrapped in try/catch at call site.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class EmailService {
  constructor() {
    this.mode = process.env.EMAIL_MODE || 'mock';
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@eolite.cz';
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@eolite.cz';

    if (this.mode === 'smtp') {
      console.log('📧 EmailService: SMTP mode');
    } else {
      console.log('📧 EmailService: MOCK mode (emails logged to console)');
    }
  }

  /**
   * Send notification when a new inquiry is submitted.
   * toEmail overrides the .env ADMIN_EMAIL (set from DB settings).
   * NON-CRITICAL – call site must wrap in try/catch.
   */
  async sendInquiryNotification(inquiry, toEmail) {
    const recipient = this._resolveRecipients(toEmail);
    if (!recipient) {
      console.log('📧 Inquiry notification skipped – no recipient configured');
      return;
    }

    const subject = `Nová poptávka od ${inquiry.name || 'neznámý'}`;
    const text = [
      `Nová poptávka ze stránek Eolite`,
      ``,
      `Jméno:    ${inquiry.name || '–'}`,
      `Email:    ${inquiry.email || '–'}`,
      `Telefon:  ${inquiry.phone || '–'}`,
      `Zpráva:   ${inquiry.message || '–'}`,
      ``,
      `Čas:      ${new Date().toLocaleString('cs-CZ')}`
    ].join('\n');

    await this._send({
      to: recipient,
      subject,
      text,
      eventType: 'inquiry_notification'
    });
  }

  /**
   * Send a test email to verify the email configuration.
   * NON-CRITICAL – call site must wrap in try/catch.
   */
  /** Parse comma-separated emails, return valid ones joined or null. */
  _resolveRecipients(raw) {
    if (!raw) return null;
    const valid = raw.split(',')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));
    return valid.length ? valid.join(', ') : null;
  }

  async sendTestNotification(toEmail) {
    const recipient = this._resolveRecipients(toEmail);
    if (!recipient) throw new Error('Žádný platný email');

    const subject = `Testovací email – Eolite`;
    const text = [
      `Testovací email z administrace Eolite.`,
      ``,
      `Pokud jste tento email obdrželi, emailové notifikace fungují správně.`,
      ``,
      `Čas odeslání: ${new Date().toLocaleString('cs-CZ')}`
    ].join('\n');

    await this._send({
      to: recipient,
      subject,
      text,
      eventType: 'test_notification'
    });
  }

  async _send({ to, subject, text, eventType }) {
    if (this.mode === 'smtp') {
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: this.fromEmail,
          to,
          subject,
          text
        });

        console.log(`✅ Email sent: ${eventType} → ${to}`);
      } catch (error) {
        // CRITICAL: log but never throw
        console.error(`❌ Email failed (non-critical): ${eventType}`, error.message);
      }
    } else {
      // Mock: log to console and optionally to file
      console.log(`📧 MOCK EMAIL [${eventType}]`);
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Body: ${text.substring(0, 200)}`);

      try {
        const logDir = path.join(__dirname, '../logs/emails');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const filename = `${Date.now()}-${eventType}.json`;
        fs.writeFileSync(
          path.join(logDir, filename),
          JSON.stringify({ to, subject, text, eventType, timestamp: new Date().toISOString() }, null, 2)
        );
      } catch {
        // file logging failure is non-critical too
      }
    }
  }
}

export default new EmailService();
