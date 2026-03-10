# Recipe: References (Portfolio)

> **Files:** `backend/routes/references.js` · `frontend/admin/references.js` · `frontend/admin/ref-categories.js` · `frontend/js/public.js`

---

## 1. Two-Table Structure

```
reference_categories   ← categories (Exteriéry, Interiéry, ...)
  └─ project_references  ← portfolio items (FK: category_id)
```

> Table is named `project_references` (not `references`) because `references` is an SQLite keyword.

---

## 2. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS reference_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_cz       TEXT NOT NULL,
  name_en       TEXT,
  slug          TEXT UNIQUE NOT NULL,
  tag           TEXT,           -- e.g. '#exteriér'
  display_order INTEGER DEFAULT 0,
  is_active     INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_references (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER REFERENCES reference_categories(id),
  title_cz        TEXT NOT NULL,
  title_en        TEXT,
  description_cz  TEXT,
  description_en  TEXT,
  cover_image     TEXT,         -- URL string
  gallery_json    TEXT,         -- JSON array of URL strings
  is_featured     INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. API Endpoints

```
# Categories (public)
GET  /api/references/categories              → active only, ordered by display_order
GET  /api/references/categories/:slug        → single category by slug

# Categories (admin)
GET  /api/references/categories/admin/all    → all (including inactive)
POST /api/references/categories              → create
PUT  /api/references/categories/:id          → update
DELETE /api/references/categories/:id        → delete
PUT  /api/references/categories/:id/reorder  → { direction: 'up'|'down' } swaps display_order

# References (public)
GET  /api/references                         → active only; ?category=slug to filter
GET  /api/references/:id                     → single active reference

# References (admin)
GET  /api/references/admin/all               → all (including inactive)
POST /api/references                         → create
PUT  /api/references/:id                     → update
DELETE /api/references/:id                   → delete
```

---

## 4. Admin: Category Manager (ref-categories.js)

- `RefCategoriesManager` — table with ↑/↓ reorder buttons
- Slug is auto-generated from `name_cz` on create (diacritics stripped, lowercase, hyphens)
- Slug is editable on update

Reorder call:
```javascript
async reorder(id, direction) {
  await fetch(`/api/references/categories/${id}/reorder`, {
    method: 'PUT',
    headers: this.auth.getAuthHeaders(),
    body: JSON.stringify({ direction })
  });
  await this.loadItems();
}
```

---

## 5. Admin: References Manager (references.js)

Client-side filters applied after load:
```javascript
// Filter inputs: refFilterCategory, refFilterName, refFilterStatus, refFilterSort
// Guard against stacking:
const catFilter = document.getElementById('refFilterCategory');
if (catFilter && !catFilter.dataset.bound) {
  catFilter.dataset.bound = '1';
  catFilter.addEventListener('change', () => this.applyFilters());
}

applyFilters() {
  let filtered = [...this.references];
  if (this.filterCategory) filtered = filtered.filter(r => r.category_id === +this.filterCategory);
  if (this.filterName)     filtered = filtered.filter(r => r.title_cz.toLowerCase().includes(this.filterName));
  if (this.filterStatus === 'active')  filtered = filtered.filter(r => r.is_active);
  if (this.filterStatus === 'hidden')  filtered = filtered.filter(r => !r.is_active);
  // sort...
  this.renderReferences(filtered);
}
```

Gallery JSON field (multiple images):
```javascript
// In showModal():
document.getElementById('refGalleryJson').value = JSON.stringify(item.gallery_json || []);
// bindGalleryPickerBtn handles multi-select
bindGalleryPickerBtn('btnPickRefGallery', 'refGalleryJson', this.auth, { multiple: true });
```

---

## 6. Public Routing (public.js)

```
/reference              → loadReferenceOverview()   grid of category cards
/reference/:slug        → loadReferenceCategory()   reference cards in that category
/reference/:slug/:id    → loadReferenceDetail()     detail + image carousel
```

Carousel uses `initCarousel()` + lightbox (both defined in `public.js`).

Category slug from URL → `GET /api/references/categories/:slug` → `GET /api/references?category=:slug`

---

## 7. Category Nav Dropdown

Categories are loaded into the main nav dropdown via `loadCategoriesForNav()`:

```javascript
async loadCategoriesForNav() {
  const cats = await safeFetch('/api/references/categories');
  document.getElementById('refDropdown').innerHTML = cats.map(c =>
    `<a href="/reference/${esc(c.slug)}">${esc(pick(c.name_cz, c.name_en))}</a>`
  ).join('');
}
```

Dropdown CSS: `visibility` + `opacity` transition, `top: 100%` + `padding-top: 4px` (gap is padding, not margin, so `:hover` chain isn't broken).

---

## 8. Gallery JSON Format

```javascript
// Stored in project_references.gallery_json as TEXT
'["/uploads/gallery/img1.jpg", "/uploads/gallery/img2.jpg"]'

// Parsed for carousel:
const images = JSON.parse(ref.gallery_json || '[]');
```

Cover image is a separate `cover_image TEXT` field (single URL string).

---

## 9. Checklist

- [ ] Category: slug auto-generated, unique, URL-safe
- [ ] Reference: `category_id` FK nullable (references may not have a category yet)
- [ ] `gallery_json` stored as JSON string, parsed client-side
- [ ] Admin filter bar: `dataset.bound` guard on all filter inputs
- [ ] Category populate guard: `dataset.populated` on select to avoid duplicate `<option>` on repeated init
- [ ] Carousel initialized after `renderReferenceDetail()` populates DOM
- [ ] Public nav dropdown uses `esc()` on all DB-sourced values
