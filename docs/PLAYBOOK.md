# Engineering Playbook – Eolite

> Idiot-proof rules. Short. Normative. No exceptions without explicit approval.

---

## Core Architecture Rules

- **Reuse existing patterns before creating new ones.** When in doubt, read how magazine/references do it.
- **No light-mode toggle** — the project intentionally maintains a single premium dark cinematic theme across both public and admin UIs.
- **No BEGIN/COMMIT transactions** in async sqlite routes. The wrapper (`db.prepare`) is not transaction-safe.
- **Non-critical side effects (email) must never break main request.** Always wrap in `try/catch`, log, continue.
- **All DB schema changes via `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` try/catch** in `backend/database.js` only.
- **All frontend `fetch` calls use Safe Fetch Pattern** – content-type check before `response.json()`.
- **All admin features use Manager CRUD class pattern** – `init()`, `loadItems()`, `renderItems()`, `showModal()`, `saveItem()`.
- **No new frameworks** (React, Vue, etc.) without explicit approval.
- **No inline styles in HTML** (only `class=`). Colours via CSS custom properties.
- **Both public and admin share the same cinematic dark palette**: deep charcoal `#0b0d0e`, warm off-white `#f4f1eb`, muted gold `#c8a96a` accent. No light mode.
- **Use the project logger in all backend code**: `import { logger } from '../logger.js'`. Never add raw `console.*` calls in new routes or services.
- **Named export only for AuthMiddleware**: `import { AuthMiddleware } from '../middleware/auth.js'`
- **Never add raw `console.*` logs in backend** — always use `logger.info|warn|error|fromError()` from `backend/logger.js`.
- **Docs are source of internal implementation guidance** (`/docs`). Keep recipes updated when adding features.
- If something is missing from repo: write **"TODO – not found in repository"** – do not invent.

---

## Safe Fetch Pattern

**MANDATORY on every `fetch` call.** No exceptions.

```javascript
// ✅ CORRECT
const response = await fetch('/api/entity', {
  headers: this.auth.getAuthHeaders()
});
const contentType = response.headers.get('content-type');
if (!response.ok) {
  const err = contentType?.includes('application/json')
    ? await response.json()
    : { error: await response.text() };
  throw new Error(err.error || 'Request failed');
}
if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
const data = await response.json();

// ❌ WRONG – crashes on non-JSON error responses
const data = await fetch(url).then(r => r.json());
```

**Exception:** `safeFetch(url)` helper is available in `public.js` for unauthenticated public calls.

**Multipart upload exception:** When sending `FormData`, do NOT set `Content-Type` manually:
```javascript
// ✅ CORRECT – only Authorization
const { Authorization } = this.auth.getAuthHeaders();
await fetch('/api/gallery/upload', { method: 'POST', headers: { Authorization }, body: formData });

// ❌ WRONG – overrides multipart boundary, breaks upload
await fetch(url, { headers: this.auth.getAuthHeaders(), body: formData });
```

---

## DB Migration Pattern

**Schema source of truth: `backend/database.js`** — all `CREATE TABLE` and `ALTER TABLE` go here only.

```javascript
// Table creation — always IF NOT EXISTS, never DROP
await db.exec(`
  CREATE TABLE IF NOT EXISTS my_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_cz TEXT NOT NULL,
    name_en TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Adding a new column to existing table — always try/catch
try {
  await db.exec(`ALTER TABLE my_table ADD COLUMN new_col TEXT`);
} catch { /* column already exists – safe to ignore */ }
```

---

## Admin Manager Pattern

Every admin section is a class in `frontend/admin/<entity>.js`.

**Required methods:** `init()`, `loadItems()`, `renderItems()`, `showModal()`, `saveItem()`

```javascript
export class MyEntityManager {
  constructor(auth) {
    this.auth = auth;
    this.items = [];
  }

  async init() {
    await this.loadItems();
    // bind gallery picker buttons here if needed
  }

  async loadItems() {
    // Safe Fetch Pattern — see above
    this.items = await ...; // parse response
    this.renderItems();
  }

  renderItems() {
    const tbody = document.getElementById('myEntityTableBody');
    tbody.innerHTML = this.items.map(item => `<tr>...</tr>`).join('');
  }

  showModal(item = null) {
    // fill form fields, set form.onsubmit
  }

  async saveItem() {
    // POST (new) or PUT (existing) — Safe Fetch Pattern
  }
}
```

**Wiring a new manager into the admin:**
1. Create `frontend/admin/myentity.js`
2. Import in `frontend/js/admin.js`
3. Instantiate in `AdminController` constructor
4. Add case to `loadSection()` switch
5. Add `<section id="myentitySection" class="admin-section">` to `admin.html`
6. Add nav link `<a data-section="myentity">` to `admin.html` sidebar

**Event listener guard** — prevent stacking on repeated `init()`:
```javascript
const el = document.getElementById('myInput');
if (el && !el.dataset.bound) {
  el.dataset.bound = '1';
  el.addEventListener('input', handler);
}
```

**Filter triggers** — dvě spolehlivé varianty:

Varianta A — inline handlery v HTML (jednodušší, žádné event listener management):
```html
<!-- select: onchange okamžitě filtruje -->
<select id="myFilterStatus" onchange="admin.myentity.applyFilters()">...</select>
<!-- text input: Enter spustí filtr, tlačítko spustí filtr -->
<input id="myFilterName" onkeydown="if(event.key==='Enter') admin.myentity.applyFilters()">
<button onclick="admin.myentity.applyFilters()">Vyhledej</button>
```

Varianta B — addEventListener v JS (`change` pro select, `input` pro text):
```javascript
const filters = [
  ['myFilterStatus', 'change'],  // <select>
  ['myFilterName',   'input'],   // <input type="text"> — každý stisk
];
filters.forEach(([id, eventName]) => {
  const el = document.getElementById(id);
  if (el && !el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener(eventName, () => this.applyFilters());
  }
});
```

**Chyba:** `'input'` na `<select>` elementech — nespolehlivé v některých prohlížečích. Vždy použij `'change'` pro selecty.

---

## i18n Pattern

- **DB fields:** use `_cz` / `_en` suffix pairs (e.g. `title_cz`, `title_en`)
- **Frontend helper:** `pick(czVal, enVal)` → returns EN if `lang === 'en'` AND EN value exists; else CZ fallback
- **Language key:** `localStorage.getItem('eolite_lang')` — `'cz'` (default) or `'en'`
- **UI static texts:** defined in `UI = { cz: {...}, en: {...} }` in `public.js`
- **Admin panel:** Czech only — no i18n needed in admin UI

```javascript
// DB content:
const title = pick(item.title_cz, item.title_en); // returns correct language

// Static UI text:
const submitLabel = UI[getLang()].contact.submit;
```

---

## Media / Uploads Pattern

**Only one upload point: Gallery module** (`POST /api/gallery/upload`).

All other image fields use the **Gallery Picker** modal:

```javascript
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

// In init():
bindGalleryPickerBtn('myPickBtnId', 'myImageUrlInputId', this.auth);           // single
bindGalleryPickerBtn('myPickBtnId', 'myGalleryJsonId',   this.auth, { multiple: true }); // multi
```

Gallery picker button IDs in admin.html:
| Button | Target | Mode | Section |
|--------|--------|------|---------|
| `btnPickRefCover` | `refCoverImage` | single | References |
| `btnPickRefGallery` | `refGalleryJson` | multiple | References |
| `btnPickArtCover` | `artCoverImage` | single | Magazine |
| `btnPickPageImage` | `pageImageUrl` | single | Pages |

**Upload pipeline:**
1. Multer `memoryStorage()` → buffer in `req.files[i].buffer`
2. `sharp(buffer).resize(2000, 2000, { fit: 'inside' })` → compressed buffer
3. `fs.writeFileSync(filepath, processedBuf)` → written to `frontend/uploads/gallery/`
4. URL stored as `/uploads/gallery/<filename>` string in DB

**Allowed MIME:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`
**Allowed extensions:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
**Max size:** 50 MB (resized by sharp before storage)

---

## Anti-Bot Minimum Standard

Applied to all public-facing forms. Current implementation in `backend/routes/inquiries.js`.

Three layers required:

1. **Honeypot** – hidden field `<input name="website">` in form; if filled → server returns 200 silently (bot thinks it succeeded)
2. **Time check** – form_loaded_at set client-side; server rejects if elapsed < 2000ms
3. **Per-IP rate limit** – in-memory `Map`, 5 requests / 5 minutes (inquiries); 10 attempts / 15 minutes (login)

```javascript
// Server-side check (inquiries pattern):
if (website && website.trim() !== '') return res.status(200).json({ message: 'OK' }); // honeypot
if (form_loaded_at && (Date.now() - Number(form_loaded_at)) < 2000) return res.status(400).json({ error: '...' });
const rateCheck = checkRateLimit(ip); // Map-based per-IP
if (!rateCheck.allowed) return res.status(429).json({ error: '...' });
```

---

## HTML Escaping (public.js)

All **structural** DB fields inserted into `innerHTML` templates MUST be escaped:

```javascript
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ✅ Use esc() for: titles, names, tags, img src/alt
grid.innerHTML = `<h2>${esc(cat.name_cz)}</h2>`;
img.innerHTML  = `<img src="${esc(ref.cover_image)}" alt="${esc(title)}">`;

// ✅ Do NOT use esc() for intentional rich-text (page content, article body)
target.innerHTML = content.replace(/\n/g, '<br>');
```

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| DB table | snake_case | `project_references`, `gallery_images` |
| DB column | snake_case | `title_cz`, `is_active`, `created_at` |
| Route file | snake_case | `routes/references.js` |
| Admin manager file | kebab-case | `admin/ref-categories.js` |
| Manager class | PascalCase + Manager | `RefCategoriesManager` |
| HTML section ID | camelCase + Section | `gallerySection` |
| HTML input ID | camelCase | `folderNameCZ`, `imageIdentifier` |
| i18n DB fields | suffix `_cz` / `_en` | `name_cz`, `content_en` |

---

## Security Non-Negotiables

- All admin API endpoints: `AuthMiddleware.verifyToken` + `AuthMiddleware.adminOnly`
- Login endpoint: rate limiting (10/15min/IP) — see `routes/auth.js`
- File upload: BOTH MIME and extension whitelist
- `console.log` must NOT contain passwords, JWT secrets, or API keys
- Generic error messages on public endpoints (not `error.message`)
- Security headers set globally: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`
