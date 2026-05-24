# Project Guide – Eolite

Konkrétní architektura tohoto projektu. Viz `/docs/PLAYBOOK.md` pro normativní pravidla.

---

## Architecture Overview

### Backend

```
backend/
├── server.js            Express entry point; port 3002
│                        DB init → cors → json → security headers → static → routes → SPA catch-all
├── database.js          SQLite wrapper + schema source of truth
│                        Class Database { exec, prepare{run,get,all} }
│                        export initDatabase() + export default db
├── middleware/
│   └── auth.js          AuthMiddleware.verifyToken + AuthMiddleware.adminOnly
│                        JWT_SECRET from env (falls back to insecure default with console.warn)
├── routes/
│   ├── auth.js          POST /api/auth/login · GET /api/auth/me
│   ├── references.js    /api/references (categories + project_references)
│   ├── magazine.js      /api/magazine
│   ├── inquiries.js     /api/inquiries
│   ├── pages.js         /api/pages
│   ├── gallery.js       /api/gallery (folders + images + upload)
│   ├── settings.js      /api/settings
│   └── upload.js        /api/upload  ← DEAD ROUTE (no frontend caller; kept for reference)
└── services/
    └── email.service.js EmailService { sendInquiryNotification, sendTestNotification }
                         EMAIL_MODE=mock (default) | smtp
```

### Frontend

```
frontend/
├── index.html           Public SPA shell (one HTML file, JS renders all views)
├── admin.html           Admin panel shell (all admin HTML + all modals)
├── login.html           Login form
├── css/
│   ├── public.css       CSS variables + public site styles
│   └── admin.css        Admin panel styles
├── js/
│   ├── public.js        PublicApp class – router, i18n, all view renderers
│   │                    + safeFetch(), pick(), esc(), initCarousel(), lightbox
│   ├── admin.js         AdminController – loadSection() switch, handleAddNew()
│   ├── auth.js          AuthManager – JWT in localStorage, checkAuth(), getAuthHeaders()
│   ├── gallery-picker.js Shared picker modal – openGalleryPicker(), bindGalleryPickerBtn()
│   └── upload-helper.js DEAD FILE (not imported anywhere; kept for reference)
├── admin/
│   ├── ref-categories.js  RefCategoriesManager
│   ├── references.js      ReferencesManager  (+ client-side filters)
│   ├── magazine.js        MagazineManager
│   ├── inquiries.js       InquiriesManager (read-only)
│   ├── pages.js           PagesManager (hero section hidden from table)
│   ├── gallery.js         GalleryManager (folder tree + image table + upload modal)
│   └── settings.js        SettingsManager (notification email + test email)
└── uploads/
    └── gallery/           Uploaded images served at /uploads/gallery/<file>
```

### SPA Routing (public.js)

Express serves `index.html` for all non-API routes. `public.js` reads `window.location.pathname`:

| Path | View |
|------|------|
| `/` | Homepage (hero + about + services + magazine preview + contact) |
| `/reference` | Reference categories grid |
| `/reference/:slug` | References in category |
| `/reference/:slug/:id` | Reference detail + carousel |
| `/magazine` | Magazine article list |
| `/magazine/:slug` | Magazine article detail |

Navigation: `app.navigate(path)` → `history.pushState` + re-render. Back/forward via `popstate` event.

### Admin Routing (admin.js)

`AdminController.loadSection(section)` drives everything:
- Hides all `.admin-section` elements
- Shows `#${section}Section`
- Calls `this[section].init()`
- Updates `#sectionTitle`
- Shows/hides `#addNewBtn`

`window.admin = new AdminController()` — globally accessible from inline onclick handlers.

---

## Existing Modules

### 1. Auth (`routes/auth.js`, `frontend/js/auth.js`)

**Purpose:** JWT-based admin authentication.

**Backend endpoints:**
- `POST /api/auth/login` — email + password → JWT (24h expiry) + brute-force rate limit 10/15min/IP
- `GET  /api/auth/me` — returns logged-in user object

**Frontend:**
- `AuthManager` in `auth.js` — stores token in `localStorage.eolite_token`
- `getAuthHeaders()` → `{ Authorization: 'Bearer <token>', 'Content-Type': 'application/json' }`
- `checkAuth()` — called on admin.html load; redirects to `/login` if not valid

**Public:** Login form at `/login` (login.html)

---

### 2. Reference Categories (`routes/references.js`, `admin/ref-categories.js`)

**Purpose:** Categories for portfolio references (e.g. "Exteriéry", "Interiéry").

**DB table:** `reference_categories` (id, name_cz, name_en, slug, tag, display_order, is_active)

**Backend endpoints:**
- `GET /api/references/categories` — active only (public)
- `GET /api/references/categories/admin/all` — all (admin)
- `GET /api/references/categories/:slug` — by slug (public)
- `POST/PUT/DELETE /api/references/categories/:id` — CRUD (admin)
- `PUT /api/references/categories/:id/reorder` — ↑/↓ swap display_order (admin)

**Admin:** `RefCategoriesManager` — table with reorder, slug auto-generated from name_cz

**Public:** Categories loaded into nav dropdown + `/reference` overview grid

---

### 3. Project References (`routes/references.js`, `admin/references.js`)

**Purpose:** Portfolio items (the main content of the site).

**DB table:** `project_references` (id, category_id FK, title_cz, title_en, description_cz, description_en, cover_image, gallery_json, is_featured, is_active)

> Note: table named `project_references` — `references` is an SQLite keyword

**Backend endpoints:**
- `GET /api/references` — active only, `?category=slug` filter (public)
- `GET /api/references/admin/all` — all (admin)
- `GET /api/references/:id` — single (public)
- `POST/PUT/DELETE /api/references/:id` — CRUD (admin)

**Admin:** `ReferencesManager` + client-side filters (category/name/status/sort)

**Public:** Category list → reference grid → reference detail + image carousel

---

### 4. Magazine (`routes/magazine.js`, `admin/magazine.js`)

**Purpose:** Blog/news articles with CZ/EN content.

**DB table:** `magazine_posts` (id, title_cz, title_en, slug UNIQUE, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, is_published, published_at)

**Backend endpoints:**
- `GET /api/magazine` — published only (public)
- `GET /api/magazine/admin/all` — all (admin)
- `GET /api/magazine/:slug` — single published (public)
- `POST/PUT/DELETE /api/magazine/:id` — CRUD (admin)

**Admin:** `MagazineManager` — draft/published toggle, cover image via gallery picker

**Public:** Magazine list + article detail

---

### 5. Inquiries (`routes/inquiries.js`, `admin/inquiries.js`)

**Purpose:** Public contact/inquiry form with anti-bot protection.

**DB table:** `inquiries` (id, name, email, phone, message, created_at, is_read)

**Backend endpoints:**
- `POST /api/inquiries` — public submission (honeypot + time check + 5/5min rate limit)
- `GET /api/inquiries/admin/all` — admin list
- `PUT /api/inquiries/:id/read` — mark as read
- `DELETE /api/inquiries/:id` — delete

**Admin:** `InquiriesManager` — read-only display, mark as read, delete; no create/edit

**Public:** Homepage contact form (honeypot hidden field, form_loaded_at timestamp)

---

### 6. Page Content (`routes/pages.js`, `admin/pages.js`)

**Purpose:** Editable text + image for each homepage section.

**DB table:** `page_content` (id, section_key UNIQUE, section_title, content_cz, content_en, image_url, is_active)

**Default sections:** `hero`, `about`, `services`, `contact`, `footer`

> `hero` section exists in DB but is **hidden from admin table** (controlled via code in `pages.js`)

**Backend endpoints:**
- `GET /api/pages` — all active (public)
- `GET /api/pages/admin/all` — all (admin)
- `GET /api/pages/:key` — single by key (public)
- `PUT /api/pages/:key` — update (admin); creates if not exists

**Admin:** `PagesManager` — edit each section's CZ/EN content + image via gallery picker

**Public:** Homepage loads all active sections via `safeFetch('/api/pages')` and fills `#pageContent_<key>` elements

---

### 7. Gallery (`routes/gallery.js`, `admin/gallery.js`, `js/gallery-picker.js`)

**Purpose:** Image library with folder organisation for all other modules to reference.

**DB tables:**
- `gallery_folders` (id, name_cz, name_en, slug UNIQUE, parent_id FK self, display_order, created_at, updated_at)
- `gallery_images` (id, folder_id FK nullable, image_url, identifier UNIQUE, title_cz, title_en, description_cz, description_en, tags, display_order, created_at, updated_at)

**Backend endpoints:**
- `GET/POST /api/gallery/folders` — folder list / create (admin)
- `PUT/DELETE /api/gallery/folders/:id` — update / delete (admin; delete blocked if has children or images)
- `GET /api/gallery/images?folder=root|N&search=X` — filtered list (admin)
- `POST/PUT/DELETE /api/gallery/images/:id` — CRUD (admin)
- `POST /api/gallery/upload` — multipart upload, sharp resize (admin)

**Admin:** `GalleryManager` — split-panel: folder tree left, image table right; upload modal with drag & drop + progress; folder modal; image edit modal

**Shared picker:** `gallery-picker.js` — `bindGalleryPickerBtn(btnId, targetId, auth, {multiple})` — used by References, Magazine, Pages managers

---

### 8. Settings (`routes/settings.js`, `admin/settings.js`)

**Purpose:** Admin-configurable runtime settings (currently: notification email).

**DB table:** `settings` (key TEXT PK, value TEXT, updated_at)

**Allowed keys whitelist:** `['notification_email']` — only these can be changed via API

**Backend endpoints:**
- `GET /api/settings` — all settings + runtime info (admin)
- `POST /api/settings/test-email` — send test email (admin)
- `PUT /api/settings/:key` — update one setting (admin, whitelist-validated)

**Admin:** `SettingsManager` — email config form + test button; EMAIL_MODE display

**Public:** None

---

### 9. Upload (`routes/upload.js`)

**Status: DEAD ROUTE** — registered at `/api/upload` but no frontend code calls it. Kept for reference.

Uses `multer.diskStorage` (not memoryStorage), 10MB limit, no sharp processing.

---

## How to Add a New Entity

1. **DB** — add `CREATE TABLE IF NOT EXISTS` in `backend/database.js`; add `ALTER TABLE` try/catch for any future columns
2. **Route** — create `backend/routes/<entity>.js`, import `{ AuthMiddleware }`, register in `server.js`: `app.use('/api/<entity>', <entity>Routes)`
3. **Admin manager** — create `frontend/admin/<entity>.js` with `export class <Entity>Manager`
4. **Wire admin** — in `frontend/js/admin.js`: import + instantiate + add case to `loadSection()` switch + add section title to `titles` map
5. **HTML** — add `<a data-section="<entity>">` to sidebar in `admin.html`; add `<section id="<entity>Section" class="admin-section">` with table + modals
6. **Public** (if needed) — add route case to `PublicApp.route()` in `public.js`; add view renderer method
7. **Docs** — add entry to this guide + create `docs/recipes/<entity>.md` + update `CLAUDE.md`

---

## Common Patterns Used

| Pattern | File(s) |
|---------|---------|
| Safe Fetch (admin) | All `frontend/admin/*.js` |
| `safeFetch()` helper (public) | `frontend/js/public.js` |
| `esc()` HTML escape | `frontend/js/public.js` |
| Manager CRUD class | `frontend/admin/*.js` |
| DB init | `backend/database.js` |
| i18n CZ/EN fields + `pick()` | `backend/routes/*.js` (DB) + `public.js` |
| Non-critical email | `backend/routes/inquiries.js`, `settings.js` |
| Anti-bot | `backend/routes/inquiries.js` |
| Login rate limit | `backend/routes/auth.js` |
| Gallery picker | `frontend/js/gallery-picker.js` |
| `dataset.bound` guard | `frontend/admin/gallery.js` (search), `frontend/admin/references.js` (filters), `public.js` (inquiry form) |

---

## Known Pitfalls in This Codebase

| Pitfall | Location | Fix |
|---------|----------|-----|
| `getAuthHeaders()` includes `Content-Type: application/json` — breaks multipart | `auth.js:13` | For FormData: destructure only `{ Authorization }` |
| `response.json()` without content-type check → parse crash | Anywhere | Use Safe Fetch Pattern |
| `form.addEventListener('submit')` stacks on repeated `init()` calls | `public.js` | `dataset.bound` guard |
| Hidden `<input required>` silently blocks form submission | Any form | Never put `required` on hidden inputs |
| `references` is SQLite keyword | `database.js` | Table named `project_references` |
| `error.message` leaked on public endpoints | `routes/auth.js` was fixed | Return generic 500 message |
| Gallery upload: MIME spoofing → wrong extension on disk | `routes/gallery.js` fixed | Check both MIME + extension |

---

## Security Notes

- **Access control:** All write endpoints: `verifyToken + adminOnly`. Public GET endpoints: no auth. No user-owned resources (no IDOR risk).
- **SQL injection:** All queries use parameterized `db.prepare(sql).get/run/all(...params)`. Dynamic SQL only where values come from validated enums.
- **CSRF:** Not applicable — JWT sent in `Authorization` header (not cookie). Cross-origin requests cannot set custom headers without CORS preflight.
- **XSS:** Structural DB fields escaped via `esc()` in public.js. Rich-text admin content (`content_cz/en`) intentionally rendered as HTML.
- **Rate limiting:** Login: 10/15min/IP (auth.js). Inquiries: 5/5min/IP (inquiries.js). Login rate limit uses in-memory Map (resets on restart).
- **Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-Powered-By` removed.
- **File upload:** MIME + extension whitelist, 50MB max, sharp auto-resize to 2000px.
- **Logging:** `backend/logger.js` — environment-aware (DEV = colored/human-readable, PROD = JSON structured). All backend code uses `logger.info|warn|error|fromError()`. Never uses raw `console.*`.

---

## Environment Variables Used

From `.env.example` and code:

| Variable | Default | Required in production |
|----------|---------|----------------------|
| `NODE_ENV` | `development` | **YES** — set to `production` |
| `LOG_LEVEL` | `debug` (dev), `info` (prod) | No |
| `PORT` | `3002` | No |
| `JWT_SECRET` | `eolite-dev-secret-...` | **YES** – set a strong random string |
| `EMAIL_MODE` | `mock` | No (mock logs to console + file) |
| `EMAIL_FROM` | `noreply@eolite.cz` | No |
| `ADMIN_EMAIL` | `admin@eolite.cz` | No (set via Settings admin UI) |
| `SMTP_HOST` | — | Only if `EMAIL_MODE=smtp` |
| `SMTP_PORT` | `587` | Only if `EMAIL_MODE=smtp` |
| `SMTP_SECURE` | `false` | Only if `EMAIL_MODE=smtp` |
| `SMTP_USER` | — | Only if `EMAIL_MODE=smtp` |
| `SMTP_PASS` | — | Only if `EMAIL_MODE=smtp` |
