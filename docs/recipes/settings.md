# Recipe: Settings (Admin-Configurable Runtime Settings)

> **Files:** `backend/routes/settings.js` · `frontend/admin/settings.js`

---

## 1. Concept

Key-value store for admin-configurable runtime settings. Currently one setting: `notification_email`.

Changes take effect immediately without server restart (read from DB at request time).

---

## 2. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seeded defaults:
INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_email', 'admin@eolite.cz');
```

---

## 3. API Endpoints

```
# Admin only
GET  /api/settings           → all settings + runtime info (EMAIL_MODE)
PUT  /api/settings/:key      → update one setting (key must be in whitelist)
POST /api/settings/test-email → send test email to current notification_email
```

**Whitelist:** Only these keys can be updated via API:
```javascript
const ALLOWED_KEYS = ['notification_email'];
// PUT /api/settings/unknown_key → 400 { error: 'Nepovolený klíč nastavení' }
```

---

## 4. GET /api/settings Response

```json
{
  "settings": [
    { "key": "notification_email", "value": "admin@eolite.cz", "updated_at": "..." }
  ],
  "runtime": {
    "EMAIL_MODE": "mock"
  }
}
```

`EMAIL_MODE` is included so the admin UI can display whether emails are actually being sent.

---

## 5. Admin Manager (settings.js)

`SettingsManager` — simple form, no table rows:

```javascript
export class SettingsManager {
  constructor(auth) {
    this.auth = auth;
  }

  async init() {
    await this.loadSettings();
  }

  async loadSettings() {
    // GET /api/settings — Safe Fetch
    const data = await ...; // { settings, runtime }
    const emailSetting = data.settings.find(s => s.key === 'notification_email');
    document.getElementById('notificationEmail').value = emailSetting?.value || '';
    document.getElementById('emailModeDisplay').textContent = data.runtime.EMAIL_MODE;
  }

  async saveEmailSetting() {
    const value = document.getElementById('notificationEmail').value.trim();
    // Safe Fetch PUT /api/settings/notification_email
    // Body: { value }
    await fetch('/api/settings/notification_email', {
      method: 'PUT',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ value })
    });
    // ...Safe Fetch pattern...
  }

  async sendTestEmail() {
    // Safe Fetch POST /api/settings/test-email
    // Sends to current notification_email in DB
    // Shows success/error in UI
  }
}
```

---

## 6. Adding a New Setting

1. Add seed row in `database.js`:
```javascript
await db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('my_new_setting', 'default_value')`).run();
```

2. Add key to whitelist in `routes/settings.js`:
```javascript
const ALLOWED_KEYS = ['notification_email', 'my_new_setting'];
```

3. Add form field in `admin.html` settings section.

4. Load and save it in `SettingsManager` following the `notification_email` pattern.

---

## 7. Reading a Setting in Other Routes

```javascript
// In any backend route that needs a setting value:
import db from '../database.js';

const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get('notification_email');
const recipient = row?.value || process.env.ADMIN_EMAIL || 'admin@eolite.cz';
```

`EmailService` does this internally — it reads `notification_email` from DB on every call.

---

## 8. Checklist

- [ ] New keys seeded with `INSERT OR IGNORE` in `database.js`
- [ ] New keys added to `ALLOWED_KEYS` whitelist in `routes/settings.js`
- [ ] PUT returns `400` for keys not in whitelist (never accept arbitrary keys)
- [ ] No restart needed after changing a setting value
- [ ] Test email button wraps call in try/catch + shows user feedback
- [ ] `EMAIL_MODE` displayed in admin UI so user knows mock vs smtp
