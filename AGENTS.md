# AGENTS.md – Eolite

## Project Rules for All AI Agents

These rules apply to ALL work done on the Eolite project.

---

## Core Principle

**Reuse existing architecture before creating new patterns.**

This project is intentionally built on the KanjoWin architecture.
Do not introduce new frameworks, libraries, or architectural patterns
without explicit user approval.

**Documentation lives in `/docs/`.**
- `docs/PLAYBOOK.md` — normative engineering rules (Safe Fetch, DB migrations, Admin Manager, i18n, uploads, security)
- `docs/PROJECT_GUIDE.md` — project architecture reference (all modules, routing, known pitfalls)
- `docs/recipes/` — one recipe per feature: copy/paste patterns for adding or modifying each module

When in doubt how something works, read the relevant recipe before touching code.

---

## Code Rules

### 1. Safe Fetch Pattern – MANDATORY
All frontend fetch calls MUST check content-type before JSON.parse.
No exceptions.

```javascript
// ✅ CORRECT
const response = await fetch(url, options);
const contentType = response.headers.get('content-type');
if (!response.ok) {
  const err = contentType?.includes('application/json')
    ? await response.json()
    : { error: await response.text() };
  throw new Error(err.error || 'Request failed');
}
const data = await response.json();

// ❌ WRONG – crashes on non-JSON responses
const data = await fetch(url).then(r => r.json());
```

### 2. Email is always non-critical
Email failures must NEVER block request handling.

```javascript
// ✅ CORRECT
try {
  await emailService.sendInquiryNotification(inquiry);
} catch (err) {
  console.error('Email failed (non-critical):', err.message);
}
// ❌ WRONG – throwing email errors to the caller
await emailService.sendInquiryNotification(inquiry); // without try/catch
```

### 3. Admin features follow existing manager pattern
New admin sections must implement the same class structure as
`RefCategoriesManager`, `ReferencesManager`, etc.

Required methods: `init()`, `loadItems()`, `renderItems()`, `showModal()`, `saveItem()`.

### 4. All public forms must include minimal anti-bot protection

Every public-facing form MUST have at minimum:
- Honeypot field (hidden input, must stay empty)
- Time check (form submitted < 2s → reject)
- Per-IP rate limiting (5 requests / 5 minutes)

### 5. AuthMiddleware import – named export only

```javascript
// ✅ CORRECT
import { AuthMiddleware } from '../middleware/auth.js';

// ❌ WRONG (crashes – no default export)
import AuthMiddleware from '../middleware/auth.js';
```

### 6. Database pattern

Always use:
- `CREATE TABLE IF NOT EXISTS` (never DROP and recreate)
- `ALTER TABLE ... ADD COLUMN` wrapped in try/catch for new columns
- No `BEGIN/COMMIT` transactions
- No migration runner (inline in database.js is sufficient)

### 7. i18n

- DB fields: use `_cz` / `_en` suffix pairs
- Frontend: `pick(czVal, enVal)` helper (returns EN if lang=en AND en exists, else CZ)
- Never hardcode language-specific text in HTML; use i18n system or data attributes

### 8. No `required` on hidden form fields

Never put `required` attribute on inputs inside conditionally hidden containers.
HTML5 validation enforces `required` on hidden fields silently.

### 9. Image upload architecture – CRITICAL

**Only one place uploads files from the user's computer: the Gallery module.**

All other admin sections (references, magazine, pages) select images by
opening the **Gallery Picker modal** (`galleryPickerModal` in admin.html),
which browses existing gallery images and fills the URL field.

Uploaded images are **automatically resized** by `sharp` on the server:
- Max 2000×2000 px (longest side), never enlarged
- JPEG: quality 85 · WebP: quality 85 · PNG: compressionLevel 8 · GIF: unchanged
- Multer uses `memoryStorage()`; sharp processes the buffer before `fs.writeFileSync`
- Original large camera files (up to 50 MB) are accepted and reduced transparently

```
Gallery admin:      ✅ uploads files from disk  → /api/gallery/upload
References:         ❌ no file upload            → bindGalleryPickerBtn (gallery picker)
Magazine:           ❌ no file upload            → bindGalleryPickerBtn (gallery picker)
Pages:              ❌ no file upload            → bindGalleryPickerBtn (gallery picker)
```

The helper is `frontend/js/gallery-picker.js`:
```javascript
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';
// In init():
bindGalleryPickerBtn('btnPickRefCover',   'refCoverImage',  this.auth);
bindGalleryPickerBtn('btnPickRefGallery', 'refGalleryJson', this.auth, { multiple: true });
```

`multiple: true` appends selected URLs as a JSON array into the textarea.

### 10. Multipart fetch – Content-Type must NOT be set manually

When using `fetch()` with `FormData`, never pass `Content-Type` explicitly.
The browser sets it automatically with the correct `multipart/form-data; boundary=...`.

```javascript
// ✅ CORRECT – only Authorization header
const { Authorization } = this.auth.getAuthHeaders();
await fetch('/api/gallery/upload', { method: 'POST', headers: { Authorization }, body: formData });

// ❌ WRONG – overrides multipart boundary → PayloadTooLargeError on Express.json()
await fetch('/api/gallery/upload', { method: 'POST', headers: this.auth.getAuthHeaders(), body: formData });
```

---

## Surgical Cleanup Rules (added 2026-03-01)

### Co je povoleno (Surgical cleanup = POVOLENO)
- Odstranění mrtvého kódu (nepoužité importy, nepoužité funkce, dead setEl calls)
- Opravy zjevných bugů minimální změnou (špatné DOM ID, chybějící content-type guard)
- Přidání content-type guardu před `response.json()` tam, kde chybí (Safe Fetch Pattern)
- Přidání `dataset.bound` guardů proti stackování event listenerů

### Co je zakázáno (Surgical cleanup = ZAKÁZÁNO)
- Přesun logiky mezi soubory (i když jde o duplikát)
- Přejmenování veřejných funkcí ani API kontraktů
- Sjednocení duplicitních helper funkcí přes soubory (generateSlug atd.)
- Změna chování endpointů, statusů, textů v UI
- Jakékoli změny, u nichž si nejsi 100% jistý

### Safe Fetch Pattern – kontrolní seznam
Každý `response.json()` call musí být předcházen:
1. Kontrola `response.ok` (nebo explicitní zpracování chyby)
2. Kontrola `content-type` → `ct?.includes('application/json')`
Výjimka: `safeFetch()` helper v `public.js` – používat místo manuálního fetch tam, kde je dostupný.

### Non-critical side effects
Emaily, webhooky, notifikace – vždy v `try/catch`, nikdy nesmí hodit výjimku do calleru:
```javascript
try {
  await emailService.sendXxx(data);
} catch (err) {
  console.error('Email failed (non-critical):', err.message);
}
```

### Záchytné body před changesetem
Před každou úpravou zkontroluj:
- Je změna minimální a cílená?
- Neporušuje změna API kontrakt?
- Nezmění se UI/UX?
- Je změna testovatelná bez spuštění testů?

---

## What NOT to do

- ❌ No new frameworks (React, Vue, etc.)
- ❌ No full rewrites of existing patterns
- ❌ No complex media library – image URLs are plain strings
- ❌ No BEGIN/COMMIT transactions
- ❌ No new auth system – reuse JWT + adminOnly middleware
- ❌ No import of KanjoWin's DB or files – Eolite has its own DB (`eolite.db`)
- ❌ No over-engineering – minimum viable solution first

---

## Adding New Features Checklist

When adding a new entity type:
1. Add `CREATE TABLE IF NOT EXISTS` in `database.js`
2. Create `backend/routes/newentity.js` (import `{ AuthMiddleware }`)
3. Register in `backend/server.js`
4. Create `frontend/admin/newentity.js` manager class
5. Import in `frontend/js/admin.js`
6. Add nav item + section HTML in `frontend/admin.html`
7. Add section to `switch` in `loadSection()`
8. Update `CLAUDE.md` with new routes and schema
9. Create `docs/recipes/<entity>.md` following `docs/recipes/_TEMPLATE.md`

---

## File Ownership

| File | Owner | Notes |
|------|-------|-------|
| `backend/database.js` | Backend | DB schema source of truth |
| `backend/routes/` | Backend | API endpoints |
| `frontend/js/public.js` | Frontend | Public SPA, i18n, routing |
| `frontend/js/admin.js` | Frontend | Admin controller |
| `frontend/admin/*.js` | Frontend | One manager per entity |
| `frontend/js/gallery-picker.js` | Frontend | Shared gallery picker helper |
| `frontend/css/public.css` | Design | CSS variables, no inline |
| `frontend/css/admin.css` | Design | Admin panel styles |

---

## Reference Architecture (KanjoWin)

Located at: `/mnt/d/Ereandil/_Web dev/KanjoWin_fun stuff/`

Read-only reference for patterns. Do NOT modify KanjoWin files.
Do NOT copy KanjoWin's database file.

---

## Security Rules (added 2026-03-01)

### 11. Security fixes must be minimal diffs

Security fixes follow the same surgical approach as code cleanup:
- Minimum viable change – one bug, one fix
- No API contract changes
- No UI/UX changes unless the fix requires it
- Document what was fixed and why it doesn't change behavior

### 12. Never break API contracts during security hardening

When adding validation (whitelist checks, rate limits, etc.):
- Keep existing success responses identical
- Only add new 4xx/5xx responses for rejected inputs
- Error message text may change if it previously leaked internal info (acceptable)

### 13. Always add tests/checklist for security changes

After any security fix:
- Add the change to `TESTING.md` (or create it if missing)
- Include: what to test, expected result, regression check
- Smoke test the affected flow manually before marking done

### 14. HTML output from DB content – esc() is mandatory

When inserting DB-sourced values into `innerHTML` template literals in `public.js`:
- **Structural fields** (titles, names, tags, slugs, image URLs in attributes): MUST use `esc()` helper
- **Rich-text content** (page content, magazine article body): MAY use `innerHTML` directly (intentional)

```javascript
// ✅ CORRECT – structural field
grid.innerHTML = `<h2>${esc(cat.name_cz)}</h2>`;
grid.innerHTML = `<img src="${esc(ref.cover_image)}" alt="${esc(title)}">`;

// ✅ CORRECT – intentional rich text
target.innerHTML = content.replace(/\n/g, '<br>');

// ❌ WRONG – structural field without escaping
grid.innerHTML = `<h2>${cat.name_cz}</h2>`;
```

### 15. Login endpoint requires rate limiting

The `/api/auth/login` endpoint MUST have per-IP rate limiting.
Current: 10 attempts / 15 minutes (see `routes/auth.js`).
Pattern: same `Map`-based approach as `inquiries.js`.

### 16. File upload extension whitelist

Gallery upload MUST check both MIME type AND file extension:
```javascript
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
// Both checks required – MIME type is client-controlled and can be spoofed
```

### 17. Never log credentials to stdout

`console.log` and `console.info` must NOT contain:
- Passwords (default or otherwise)
- JWT secrets
- API keys

Warnings about missing configuration (e.g. JWT_SECRET not set) are OK via `console.warn`.
