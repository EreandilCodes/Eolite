# Recipe: Page Content (Homepage Sections)

> **Files:** `backend/routes/pages.js` · `frontend/admin/pages.js` · `frontend/js/public.js`

---

## 1. Concept

Each homepage section (About, Services, Contact, Footer) has a row in `page_content` with editable CZ/EN text and an optional image. The admin edits these sections; the public homepage loads and renders them.

**Hero section:** exists in DB but is **hidden from the admin table** by code. It is used on the public homepage but not editable via the UI.

---

## 2. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS page_content (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key   TEXT UNIQUE NOT NULL,   -- 'hero', 'about', 'services', 'contact', 'footer'
  section_title TEXT,
  content_cz    TEXT,
  content_en    TEXT,
  image_url     TEXT,
  is_active     INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Default sections seeded on first run: `hero`, `about`, `services`, `contact`, `footer`.

---

## 3. API Endpoints

```
# Public
GET /api/pages             → all active sections (all section_keys)
GET /api/pages/:key        → single section by section_key

# Admin
GET /api/pages/admin/all   → all sections (including inactive)
PUT /api/pages/:key        → upsert (creates if not exists, updates if exists)
```

No POST, no DELETE — sections are fixed. Admin can only update content.

---

## 4. Admin Manager (pages.js)

`PagesManager` shows a table of sections (excluding hero) and opens an edit modal for each.

```javascript
renderSections() {
  const sections = this.sections.filter(s => s.section_key !== 'hero'); // hero hidden
  document.getElementById('pagesTableBody').innerHTML = sections.map(s => `
    <tr>
      <td>${s.section_key}</td>
      <td>${s.section_title || '—'}</td>
      <td><button onclick="admin.pages.showModal('${s.section_key}')">Upravit</button></td>
    </tr>
  `).join('');
}

showModal(key) {
  const section = this.sections.find(s => s.section_key === key);
  document.getElementById('pageKey').value       = section.section_key;
  document.getElementById('pageContentCz').value = section.content_cz || '';
  document.getElementById('pageContentEn').value = section.content_en || '';
  document.getElementById('pageImageUrl').value  = section.image_url || '';
  document.getElementById('pageModal').style.display = 'flex';
  document.getElementById('pageForm').onsubmit = (e) => { e.preventDefault(); this.saveSection(); };
}

async saveSection() {
  const key  = document.getElementById('pageKey').value;
  const body = {
    content_cz: document.getElementById('pageContentCz').value,
    content_en: document.getElementById('pageContentEn').value,
    image_url:  document.getElementById('pageImageUrl').value.trim() || null,
  };
  // Safe Fetch PUT /api/pages/:key
}
```

Gallery Picker bound in `init()`:
```javascript
bindGalleryPickerBtn('btnPickPageImage', 'pageImageUrl', this.auth);
```

---

## 5. Public Homepage Rendering (public.js)

```javascript
async loadHomepageContent() {
  const sections = await safeFetch('/api/pages');
  for (const section of sections) {
    const content = pick(section.content_cz, section.content_en);
    const target = document.getElementById(`pageContent_${section.section_key}`);
    if (target) {
      // ✅ intentional innerHTML — content may include formatted text
      target.innerHTML = content ? content.replace(/\n/g, '<br>') : '';
    }
    // image if applicable
    const imgEl = document.getElementById(`pageImage_${section.section_key}`);
    if (imgEl && section.image_url) imgEl.src = esc(section.image_url);
  }
}
```

HTML placeholders in `index.html`:
```html
<div id="pageContent_about"></div>
<div id="pageContent_services"></div>
<img id="pageImage_about" src="" alt="">
```

---

## 6. Adding a New Section

1. Add a seeded row in `database.js` `initDatabase()`:
```javascript
await db.prepare(`
  INSERT OR IGNORE INTO page_content (section_key, section_title, content_cz)
  VALUES ('newsection', 'Nová sekce', 'Výchozí obsah...')
`).run();
```

2. Add placeholder elements in `index.html`:
```html
<section id="newSection">
  <div id="pageContent_newsection"></div>
</section>
```

3. No backend changes needed — `PUT /api/pages/:key` upserts automatically.
4. Remove `'newsection'` from the hidden-in-admin filter if you want it editable (or leave out of that filter to show it).

---

## 7. Checklist

- [ ] `hero` filtered from admin table (`section_key !== 'hero'`)
- [ ] `PUT /api/pages/:key` uses upsert (INSERT OR REPLACE or UPDATE)
- [ ] Content rendered as `innerHTML` on public site (intentional rich text — no `esc()`)
- [ ] `image_url` rendered with `esc()` in `img.src`
- [ ] Gallery Picker bound: `bindGalleryPickerBtn('btnPickPageImage', 'pageImageUrl', this.auth)`
- [ ] No `required` on hidden form fields
- [ ] New sections seeded as `INSERT OR IGNORE` (safe to re-run on restart)
