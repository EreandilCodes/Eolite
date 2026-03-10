# CLAUDE.md – Eolite

## Project
New presentation website focused on References (portfolio).
Built on KanjoWin architecture: Node/Express + sqlite3 + Vanilla JS + Admin UI pattern.

## Session: New Presentation Website – Reference-focused architecture (2026-03-01)

---

## Commands

```bash
npm install              # Install dependencies
npm start                # Production: node backend/server.js
npm run dev              # Development with nodemon
```

**Access Points:**
- Public web:  http://localhost:3002/
- Admin panel: http://localhost:3002/admin
- Login:       http://localhost:3002/login
- Default Admin: admin@eolite.cz / admin123

**Port:** 3002 (chosen to avoid conflict with KanjoWin on 3001)

---

## Architecture

### Reuse Principle
This project reuses KanjoWin patterns without modification:
- `database.js` → `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE try/catch` columns
- `middleware/auth.js` → Named export `{ AuthMiddleware }`, `verifyToken` + `adminOnly`
- Admin manager pattern → Class-based (VideosManager/MenuManager style)
- Safe Fetch Pattern → Check content-type before JSON.parse on ALL fetch calls
- i18n → `_cz`/`_en` fields in DB, `pick(czVal, enVal)` helper, localStorage lang key
- EmailService → Non-critical side effect pattern (try/catch, never throws)
- Reorder → ↑/↓ with adjacent `display_order` swap

### No new patterns introduced. No new frameworks.

---

## Backend (ES Modules)

```
backend/
├── server.js             Express entry point, port 3002
├── database.js           SQLite init (same wrapper class as KanjoWin)
├── middleware/
│   └── auth.js           JWT verify + adminOnly
├── routes/
│   ├── auth.js           POST /login, GET /me
│   ├── references.js     Categories + project references CRUD
│   ├── magazine.js       Magazine posts CRUD (posts pattern reuse)
│   ├── inquiries.js      POST /api/inquiries (public) + admin list
│   └── pages.js          Page content sections key-value store
└── services/
    └── email.service.js  Non-critical email (mock/smtp)
```

### Critical import pattern
```javascript
// ✅ CORRECT – named export
import { AuthMiddleware } from '../middleware/auth.js';

// ❌ WRONG
import AuthMiddleware from '../middleware/auth.js';
```

---

## Database Schema

### `users`
Admin only – no public registration.
Seeded: admin@eolite.cz / admin123

### `reference_categories`
```sql
id, name_cz, name_en, slug (UNIQUE), tag,
display_order, is_active, created_at
```
- slug auto-generated from name_cz (diacritics removed)
- tag e.g. "#exteriér"
- reorderable via ↑/↓ (display_order swap)

### `project_references`
```sql
id, category_id (FK), title_cz, title_en,
description_cz, description_en,
cover_image (URL string), gallery_json (JSON array),
is_featured, is_active, created_at
```
> Note: Table named `project_references` (not `references`) to avoid SQLite keyword conflict

### `magazine_posts`
```sql
id, title_cz, title_en, slug (UNIQUE),
content_cz, content_en, excerpt_cz, excerpt_en,
cover_image, is_published, published_at, created_at
```

### `inquiries`
```sql
id, name, email, phone, message, created_at, is_read
```

### `page_content`
```sql
id, section_key (UNIQUE), section_title,
content_cz, content_en, image_url, is_active, created_at
```
Default sections: hero, about, services, sales, contact, footer

---

## API Routes

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/references/categories          # active only (public)
GET    /api/references/categories/admin/all
GET    /api/references/categories/:slug    # by slug (public)
POST   /api/references/categories          # admin
PUT    /api/references/categories/:id      # admin
DELETE /api/references/categories/:id      # admin
PUT    /api/references/categories/:id/reorder  # admin

GET    /api/references                     # active only (public), ?category=slug
GET    /api/references/admin/all           # admin
GET    /api/references/:id                 # single (public)
POST   /api/references                     # admin
PUT    /api/references/:id                 # admin
DELETE /api/references/:id                 # admin

GET    /api/magazine                       # published only (public)
GET    /api/magazine/admin/all             # admin
GET    /api/magazine/:slug                 # single (public)
POST   /api/magazine                       # admin
PUT    /api/magazine/:id                   # admin
DELETE /api/magazine/:id                   # admin

POST   /api/inquiries                      # public (anti-bot protected)
GET    /api/inquiries/admin/all            # admin
PUT    /api/inquiries/:id/read             # admin
DELETE /api/inquiries/:id                  # admin

GET    /api/pages                          # all active (public)
GET    /api/pages/admin/all                # admin
GET    /api/pages/:key                     # single (public)
PUT    /api/pages/:key                     # admin
```

---

## Public Routing (SPA)

Express serves `index.html` for all routes.
Frontend `public.js` reads `window.location.pathname` and renders:

| Path                      | View                     |
|---------------------------|--------------------------|
| `/`                       | Homepage (all sections)  |
| `/reference`              | Reference categories grid|
| `/reference/:slug`        | References in category   |
| `/reference/:slug/:id`    | Reference detail         |
| `/magazine`               | Magazine article list    |
| `/magazine/:slug`         | Magazine article detail  |

Navigation uses `app.navigate(path)` → `history.pushState` + re-render.
Browser back/forward handled via `popstate` event.

---

## Inquiry Flow (anti-bot)

Three-layer protection:

1. **Honeypot** – hidden `<input name="website">` (CSS `position:absolute;left:-9999px`).
   If filled → server silently returns 200 (bot thinks it succeeded).

2. **Time check** – frontend sets `form_loaded_at = Date.now()`.
   Server rejects if `Date.now() - form_loaded_at < 2000ms`.

3. **Rate limit** – per-IP in-memory `Map`, 5 requests per 5 minutes.
   429 response if exceeded. Auto-cleanup every 10 minutes.

No reCAPTCHA. No external dependency.

---

## i18n System

- Language stored in `localStorage.getItem('eolite_lang')` (default: `'cz'`)
- UI texts: `const UI = { cz: {...}, en: {...} }` in `public.js`
- DB content: `pick(field_cz, field_en)` helper → returns EN if lang=en AND en exists, else CZ fallback
- Language switch re-renders current view (calls `app.route()`)
- Admin panel is in Czech only (no i18n needed for admin)

---

## EmailService Pattern

```javascript
// Non-critical: ALWAYS wrap at call site
try {
  await emailService.sendInquiryNotification(inquiry);
} catch (emailError) {
  console.error('Email failed (non-critical):', emailError.message);
}

// .env configuration:
EMAIL_MODE=mock          # default – logs to console + file
EMAIL_MODE=smtp          # sends via nodemailer
ADMIN_EMAIL=admin@eolite.cz
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
```

---

## Admin UI Pattern

All managers follow same class structure:
```javascript
class XManager {
  constructor(auth) { this.auth = auth; this.items = []; }
  async init() { await this.loadItems(); }
  async loadItems() { /* Safe Fetch Pattern */ }
  renderItems() { /* innerHTML into tbody */ }
  showModal(item = null) { /* fill form, set onsubmit */ }
  async saveItem() { /* POST or PUT */ }
  async deleteItem(id) { /* confirm + DELETE */ }
}
```

Managers: `RefCategoriesManager`, `ReferencesManager`, `MagazineManager`,
`InquiriesManager` (read-only), `PagesManager`

---

## Safe Fetch Pattern (MANDATORY on all fetch calls)

```javascript
const response = await fetch(url, options);
const contentType = response.headers.get('content-type');

if (!response.ok) {
  const err = contentType?.includes('application/json')
    ? await response.json()
    : { error: await response.text() };
  throw new Error(err.error || 'Request failed');
}

if (!contentType?.includes('application/json')) {
  throw new Error('Server returned non-JSON response');
}

const data = await response.json();
```

---

## Frontend Structure

```
frontend/
├── index.html          Public SPA (single file, JS-managed views)
├── admin.html          Admin panel
├── login.html          Admin login
├── css/
│   ├── public.css      CSS variables, grid, cards, dropdown, forms
│   └── admin.css       Sidebar, table, modal, toast
├── js/
│   ├── public.js       PublicApp (router, i18n, all section loaders)
│   ├── admin.js        AdminController (loadSection switch)
│   └── auth.js         AuthManager (JWT storage)
└── admin/
    ├── ref-categories.js
    ├── references.js
    ├── magazine.js
    ├── inquiries.js
    └── pages.js
```

---

## CSS Design Principles

- All colours via CSS custom properties at `:root`
- Zero inline colours in HTML
- Class-based styling only
- Ready for redesign: change `--color-primary`, `--color-accent`, etc.
- Responsive: mobile-first, breakpoints at 768px and 480px

---

## Gallery (added 2026-03-01)

### DB Tables

**`gallery_folders`** – adjacency list (parent_id self-ref)
```sql
id, name_cz, name_en, slug (UNIQUE), parent_id (FK self),
display_order, created_at, updated_at
```

**`gallery_images`**
```sql
id, folder_id (FK nullable), image_url, identifier (UNIQUE),
title_cz, title_en, description_cz, description_en,
tags, display_order, created_at, updated_at
```
- `identifier`: globally unique, regex `[a-z0-9_-]`, max 80 chars – for stable cross-site referencing

### API Routes

```
GET    /api/gallery/folders                       # admin – flat list, client builds tree
POST   /api/gallery/folders                       # admin
PUT    /api/gallery/folders/:id                   # admin
DELETE /api/gallery/folders/:id                   # admin – blocked if has children or images (400)

GET    /api/gallery/images?folder=root|N&search=X # admin
POST   /api/gallery/images                        # admin
PUT    /api/gallery/images/:id                    # admin (incl. folder move)
DELETE /api/gallery/images/:id                    # admin
```

### Admin UI
- `frontend/admin/gallery.js` – `GalleryManager` (init, loadFolders, loadImages, renderFolderTree, renderImages, showFolderModal, showImageModal, saveFolder, saveImage, deleteFolder, deleteImage)
- Left panel: folder tree built from flat list (adjacency list → tree in JS)
- Right panel: images table + search input
- "+ Přidat fotku" button → opens image modal; "+ Složka" inside folder panel → opens folder modal

### Key Decisions
- Folder delete blocked server-side (400) if folder has children or images – returns count in message
- Frontend builds tree from flat API list (no recursive SQL needed)
- Parent dropdown in folder modal excludes self + all descendants (prevents cycles)
- Folder pre-selected in image modal when a specific folder is active

### Image Auto-Resize on Upload
`sharp` (npm) resizes all uploaded images before writing to disk:
- `multer.memoryStorage()` (not diskStorage) — buffer passed to sharp
- Max 2000×2000 px (`fit: 'inside'`, `withoutEnlargement: true`)
- JPEG quality 85 · WebP quality 85 · PNG compressionLevel 8 · GIF unchanged
- 50 MB file size limit (originals can be large; output is small)
- On sharp error: logs warning and saves original buffer (non-fatal)

---

## Gallery Picker (Admin – cross-section image selection)

`frontend/js/gallery-picker.js` – shared module for picking gallery images.

### Usage
```javascript
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

// In init() of any manager:
bindGalleryPickerBtn('btnPickRefCover',   'refCoverImage',  this.auth);               // single
bindGalleryPickerBtn('btnPickRefGallery', 'refGalleryJson', this.auth, { multiple: true }); // multi
```

### Behaviour
- Opens `#galleryPickerModal` (in admin.html)
- Calls `GET /api/gallery/images` (with optional `?search=`)
- Single mode: one click fills the target `<input>` with `image_url`, closes modal
- Multiple mode: checkboxes + Confirm button → appends to JSON array in `<textarea>`
- Returns `null` when cancelled (bindGalleryPickerBtn ignores null)

### Button IDs
| Button           | Target field     | Mode     | Section    |
|------------------|------------------|----------|------------|
| `btnPickRefCover`   | `refCoverImage`  | single   | References |
| `btnPickRefGallery` | `refGalleryJson` | multiple | References |
| `btnPickArtCover`   | `artCoverImage`  | single   | Magazine   |
| `btnPickPageImage`  | `pageImageUrl`   | single   | Pages      |

---

## Known Decisions

**`project_references` not `references`:**
SQLite treats `references` as a keyword in constraint context. Using
`project_references` avoids quoting every query. Functionally identical.

**Port 3002:**
KanjoWin runs on 3001. Using 3002 to allow both to run simultaneously.

**Image upload architecture:**
- **Gallery only** uploads files from disk (multer, `/api/gallery/upload`)
- All other image fields (references cover, gallery JSON, magazine cover, page image) use the **Gallery Picker** – a modal that browses existing gallery images and fills the URL field.
- Helper: `frontend/js/gallery-picker.js` → `bindGalleryPickerBtn(btnId, targetId, auth, { multiple })`
- Uploaded images auto-resized by `sharp` (max 2000px, quality 85)

**Admin event listener guard (dataset.bound):**
When a section's `init()` is called multiple times (user navigates away and back),
event listeners must not stack. Use `element.dataset.bound = '1'` as a guard:
```javascript
if (form.dataset.bound) return;
form.dataset.bound = '1';
form.addEventListener('submit', ...);
```
Applied to: inquiry form, filter inputs, gallery picker buttons.

**Admin reference filters:**
Client-side only (no backend change). Filter bar in `#referencesSection`:
- `refFilterCategory` — populates from `this.categories` after load (`dataset.populated` guard)
- `refFilterName` — fuzzy name search on `title_cz`
- `refFilterStatus` — active / hidden
- `refFilterSort` — newest / oldest / name A–Z
`applyFilters()` filters `this.references[]` and calls `renderReferences(filtered)`.

**Pages admin — Hero section hidden:**
`renderSections()` in `pages.js` filters out `section_key === 'hero'` from the table.
Hero content exists in DB but is not editable via admin (controlled by code).

**No user accounts:**
Public: anonymous. Admin: JWT, seeded user only.

**Dead code (intentionally kept):**
- `frontend/js/upload-helper.js` — not imported by any manager (all use gallery-picker). Kept as reference.
- `backend/routes/upload.js` — registered in server.js at `/api/upload`, but no frontend calls it. Safe dead route.

---

## Session 2026-03-01: Surgical Code Cleanup

### Princip
Zero behavior change. Pouze bezpečné micro-fixy ověřitelných bugů.

### Co bylo čištěno
1. **`frontend/js/auth.js` – Safe Fetch Pattern** (`checkAuth`)
   - Přidán content-type guard před `response.json()` (AGENTS.md rule povinný)
   - Pokud server vrátí non-JSON při /api/auth/me → `logout()` namísto parse crash
2. **`frontend/js/public.js` – Wrong DOM ID** (`loadHomepageContent`)
   - `setEl('formSubmitBtn', ...)` → `setEl('inquirySubmitBtn', ...)`
   - Reálný bug: text tlačítka "Odeslat poptávku" se nepřepínal při přepnutí jazyka CZ↔EN

### Nalezeno, ale NEMĚNĚNO (záměrně)
- `upload-helper.js` / `routes/upload.js` — dead code, ponecháno (mohlo by se repoužít)
- `generateSlug()` duplikát ve 3 souborech — konsolidace by vyžadovala přesun logiky (zakázáno)
- `{ ...this.auth.getAuthHeaders(), 'Content-Type': 'application/json' }` v gallery.js — redundantní spread, neškodný
- `published_at` reset na PUT v magazine.js — behavior decision, ne crash

### Testy provedeny (smoke test)
- Server start (nodemon backend/server.js)
- `/admin` → login → load všech sekcí (Categories, References, Magazine, Inquiries, Pages, Gallery, Settings)
- `/` public homepage → přepnutí jazyka CZ/EN → submit button text se přepíná ✅
- POST /api/inquiries → formulář odešle poptávku → zobrazí potvrzení ✅

### Soubory změněny
| Soubor | Změna |
|--------|-------|
| `frontend/js/auth.js` | Content-type guard před response.json() v checkAuth |
| `frontend/js/public.js` | Oprava ID `formSubmitBtn` → `inquirySubmitBtn` |
| `AGENTS.md` | Přidána sekce Surgical Cleanup Rules |
| `CLAUDE.md` | Přidána tato sekce |

---

## Session 2026-03-01: Security Audit + Surgical Hardening (OWASP Top 10)

### Shrnutí nálezů
Celkem 8 nálezů: 6× P1, 2× P2. Žádné P0 (žádné okamžité RCE, SQLi ani auth bypass).

### Co bylo opraveno (P1)

| Nález | Soubor | Oprava |
|-------|--------|--------|
| Brute-force na login (bez rate limitu) | `routes/auth.js` | `checkLoginRateLimit()` – 10 pokusů / 15 min / IP |
| Chybějící security headers | `server.js` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `app.disable('x-powered-by')` |
| Default heslo v server logu | `server.js` | Odstraněn `console.log('Default Admin: ...')` |
| JWT_SECRET bez varování | `server.js` | `console.warn` při startu pokud `JWT_SECRET` není v env |
| Login 500 vracel `error.message` | `routes/auth.js` | Nahrazeno generickým textem |
| Gallery upload: chybí extension whitelist | `routes/gallery.js` | `ALLOWED_EXT` Set + kontrola v `fileFilter` |
| XSS: strukturální pole bez escapování | `frontend/js/public.js` | Přidána `esc()` helper + aplikována na tituly, jména, tagy, src/alt atributy |

### Co bylo pouze doporučeno (P2, NEimplementováno)
- CORS restriction na produkční doménu (`server.js`) – potřebuje znalost domény
- Content-Security-Policy header – potřebuje audit zdrojů, riziko rozbití
- JWT token invalidation při logout – architekturální změna
- Generic error messages v admin routes – nízký dopad (admin-only)
- Sanitizace rich-text polí (page content, magazine body) – intentional HTML feature

### Testy
Viz `TESTING.md` – 16 bodový checklist + výsledky.

### Soubory změněny
| Soubor | Změna |
|--------|-------|
| `backend/server.js` | +JWT warn, +security headers, +disable x-powered-by, -credentials log |
| `backend/routes/auth.js` | +login rate limiting, generic 500 message |
| `backend/routes/gallery.js` | +ALLOWED_EXT whitelist, +extension check v fileFilter |
| `frontend/js/public.js` | +esc() helper, esc() na 15+ strukturálních polích |
| `security_report.md` | Vytvořen – full OWASP audit report |
| `TESTING.md` | Vytvořen – 16-bodový test checklist |

---

## Session 2026-03-01: Documentation Playbook System

### Scope
FÁZE 1: Docs-only session. Nulové změny kódu.

### Co bylo vytvořeno

| Soubor | Obsah |
|--------|-------|
| `docs/PLAYBOOK.md` | Normativní engineering pravidla (Safe Fetch, DB migrace, Admin Manager, i18n, uploads, anti-bot, escapování, naming conventions, security) |
| `docs/PROJECT_GUIDE.md` | Architektura projektu: all modules (Auth, RefCategories, References, Magazine, Inquiries, Pages, Gallery, Settings), SPA routing, admin routing, common patterns, known pitfalls, security notes, env vars |
| `docs/recipes/_TEMPLATE.md` | Šablona pro nové recepty |
| `docs/recipes/auth.md` | JWT auth, rate limit, AuthManager, login flow |
| `docs/recipes/admin_crud.md` | Manager CRUD pattern, wiring do admin.js, HTML sekce + modal, dataset.bound guard |
| `docs/recipes/i18n.md` | CZ/EN DB páry, pick() helper, UI = {cz,en}, language switch |
| `docs/recipes/email.md` | Non-critical pattern, EmailService API, mock/smtp, notification recipient |
| `docs/recipes/uploads_media.md` | Architektura uploadu, sharp pipeline, Gallery Picker, multipart fetch |
| `docs/recipes/references.md` | Kategorie + reference, reorder, client-side filtry, carousel, gallery JSON |
| `docs/recipes/magazine.md` | Slug, draft/published toggle, rich-text rendering, homepage preview |
| `docs/recipes/inquiries.md` | 3-vrstvá anti-bot ochrana, honeypot, time check, rate limit, read-only admin |
| `docs/recipes/pages.md` | Upsert pattern, hero skrytý, rich-text content, gallery picker |
| `docs/recipes/gallery_admin.md` | Folder tree (adjacency list), upload modal, doUpload, delete protection, picker |
| `docs/recipes/settings.md` | Key-value store, ALLOWED_KEYS whitelist, test email, runtime info |

### FÁZE 2 — status
Gallery admin byl již plně implementován v předchozí session. FÁZE 2 nevyžadovala žádné změny kódu.
