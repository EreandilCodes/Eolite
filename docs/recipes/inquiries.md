# Recipe: Inquiries (Contact Form)

> **Files:** `backend/routes/inquiries.js` · `frontend/admin/inquiries.js` · `frontend/js/public.js`

---

## 1. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS inquiries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  message    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_read    INTEGER DEFAULT 0
);
```

---

## 2. API Endpoints

```
# Public submission
POST /api/inquiries
Body: { name, email, phone, message, website, form_loaded_at }
  ← website: honeypot (must be empty)
  ← form_loaded_at: timestamp set by JS when form renders

Response 200: { message: 'OK' }   ← honeypot filled (bot silently accepted)
Response 201: { message: 'Děkujeme!...' }   ← success
Response 400: { error: '...' }   ← too fast (< 2s)
Response 429: { error: '...' }   ← rate limited (5/5min/IP)

# Admin
GET    /api/inquiries/admin/all   → all inquiries, newest first
PUT    /api/inquiries/:id/read    → { is_read: 1 }
DELETE /api/inquiries/:id         → delete
```

---

## 3. Anti-Bot Protection (3 Layers)

All three are required per `AGENTS.md`. Implemented in `backend/routes/inquiries.js`:

### Layer 1: Honeypot
```javascript
// Server: silently accept if honeypot is filled
const { website } = req.body;
if (website && website.trim() !== '') {
  return res.status(200).json({ message: 'OK' }); // bot thinks it succeeded
}
```
```html
<!-- HTML: hidden field, must stay empty -->
<input type="text" name="website" id="websiteField"
  style="position:absolute;left:-9999px;opacity:0" tabindex="-1" autocomplete="off">
<!-- NEVER put required on this field -->
```

### Layer 2: Time Check
```javascript
// Server: reject if submitted < 2s after form load
const { form_loaded_at } = req.body;
if (form_loaded_at && (Date.now() - Number(form_loaded_at)) < 2000) {
  return res.status(400).json({ error: 'Formulář byl odeslán příliš rychle.' });
}
```
```javascript
// Client: set on page load / form render
document.getElementById('formLoadedAt').value = Date.now();
```

### Layer 3: Rate Limit
```javascript
const rateLimits = new Map();
const RATE_MAX = 5;
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry) { rateLimits.set(ip, { count: 1, windowStart: now }); return { allowed: true }; }
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now }); return { allowed: true };
  }
  if (entry.count >= RATE_MAX) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
const rateCheck = checkRateLimit(ip);
if (!rateCheck.allowed) {
  return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkuste to za 5 minut.' });
}
```

---

## 4. Email Notification

After saving the inquiry, a non-critical email notification is sent:

```javascript
try {
  await emailService.sendInquiryNotification(inquiry);
} catch (err) {
  console.error('Email notification failed (non-critical):', err.message);
}
```

---

## 5. Admin Manager (inquiries.js)

`InquiriesManager` is **read-only** — no create or edit. Supports mark as read, delete, and client-side filtering.

```javascript
export class InquiriesManager {
  constructor(auth) { this.auth = auth; this.inquiries = []; }

  async init() {
    await this.loadInquiries();
    this.bindFilters();
  }

  // No bindFilters() — triggers wired via inline onchange/onclick/onkeydown in admin.html

  applyFilters() {
    const statusVal  = document.getElementById('inqFilterStatus')?.value  || '';
    const nameVal    = (document.getElementById('inqFilterName')?.value    || '').toLowerCase().trim();
    const emailVal   = (document.getElementById('inqFilterEmail')?.value   || '').toLowerCase().trim();
    const messageVal = (document.getElementById('inqFilterMessage')?.value || '').toLowerCase().trim();
    const sortVal    = document.getElementById('inqFilterSort')?.value     || 'newest';

    let filtered = this.inquiries.filter(inq => {
      if (statusVal === 'unread' && inq.is_read)  return false;
      if (statusVal === 'read'   && !inq.is_read) return false;
      if (nameVal    && !(inq.name    || '').toLowerCase().includes(nameVal))    return false;
      if (emailVal   && !(inq.email   || '').toLowerCase().includes(emailVal))   return false;
      if (messageVal && !(inq.message || '').toLowerCase().includes(messageVal)) return false;
      return true;
    });

    if (sortVal === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    this.renderInquiries(filtered);
  }

  // loadInquiries() — Safe Fetch GET /api/inquiries/admin/all → calls applyFilters()
  // renderInquiries(list) — renders the passed list (not this.inquiries directly)
  // markRead(id) — updates local state, then calls applyFilters() to preserve filter
  // deleteInquiry(id) — DELETE with confirm(), then full loadInquiries()

  // NO showModal(), NO saveItem()
}
```

Filter bar in `admin.html` — inline handlers, žádné addEventListener:
```html
<div class="admin-filters-bar">
  <select id="inqFilterStatus" class="admin-filter-select" onchange="admin.inquiries.applyFilters()">
    <option value="">Všechny statusy</option>
    <option value="unread">Nové (nepřečtené)</option>
    <option value="read">Přečtené</option>
  </select>
  <select id="inqFilterSort" class="admin-filter-select" onchange="admin.inquiries.applyFilters()">
    <option value="newest">Nejnovější</option>
    <option value="oldest">Nejstarší</option>
  </select>
  <input type="text" id="inqFilterName" class="admin-filter-input" placeholder="Jméno…"
    onkeydown="if(event.key==='Enter') admin.inquiries.applyFilters()">
  <input type="text" id="inqFilterEmail" class="admin-filter-input" placeholder="Email…"
    onkeydown="if(event.key==='Enter') admin.inquiries.applyFilters()">
  <input type="text" id="inqFilterMessage" class="admin-filter-input" placeholder="Text zprávy…"
    onkeydown="if(event.key==='Enter') admin.inquiries.applyFilters()">
  <button type="button" class="btn-secondary" onclick="admin.inquiries.applyFilters()">Vyhledej</button>
</div>
```

In `admin.js`: omit from `handleAddNew()`, hide `#addNewBtn` for the inquiries section.

---

## 6. Public Form (public.js)

Form bound with `dataset.bound` guard (called from `loadHomepage()` which runs on every nav):

```javascript
const form = document.getElementById('inquiryForm');
if (form && !form.dataset.bound) {
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // collect name, email, phone, message, website (honeypot), form_loaded_at
    // Safe Fetch POST to /api/inquiries
    // Show success/error message in #inquiryMessage
  });
}

// Set timestamp on form render:
const tsField = document.getElementById('formLoadedAt');
if (tsField) tsField.value = Date.now();
```

---

## 7. Checklist

- [ ] All 3 anti-bot layers present: honeypot, time check, rate limit
- [ ] Honeypot field has NO `required` attribute
- [ ] `form_loaded_at` set to `Date.now()` on every form render
- [ ] Server silently 200 on honeypot fill (never 4xx)
- [ ] Rate limit: 5/5min/IP
- [ ] Email notification wrapped in try/catch
- [ ] Admin manager is read-only (no create/edit modals)
- [ ] `dataset.bound` guard on form submit listener (form re-renders on SPA nav)
- [ ] `dataset.bound` guard on all filter `addEventListener` calls in `bindFilters()`
- [ ] `renderInquiries(list)` renders the passed list, not `this.inquiries` directly
- [ ] `markRead()` calls `applyFilters()` after local state update (preserves active filter)
- [ ] `loadInquiries()` calls `applyFilters()` after fetch (not `renderInquiries()`)
- [ ] `#addNewBtn` hidden for inquiries section in admin
