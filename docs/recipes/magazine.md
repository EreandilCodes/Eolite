# Recipe: Magazine (Blog/News)

> **Files:** `backend/routes/magazine.js` · `frontend/admin/magazine.js` · `frontend/js/public.js`

---

## 1. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS magazine_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title_cz     TEXT NOT NULL,
  title_en     TEXT,
  slug         TEXT UNIQUE NOT NULL,
  content_cz   TEXT,
  content_en   TEXT,
  excerpt_cz   TEXT,
  excerpt_en   TEXT,
  cover_image  TEXT,          -- URL string
  is_published INTEGER DEFAULT 0,
  published_at DATETIME,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. API Endpoints

```
# Public
GET  /api/magazine                → published only (is_published = 1), ordered by published_at DESC
GET  /api/magazine/:slug          → single published article by slug

# Admin
GET  /api/magazine/admin/all      → all articles (draft + published)
POST /api/magazine                → create
PUT  /api/magazine/:id            → update (published_at reset on each PUT when is_published=1)
DELETE /api/magazine/:id          → delete
```

---

## 3. Admin Manager (magazine.js)

Key points of `MagazineManager`:

```javascript
async init() {
  await this.loadItems();
  bindGalleryPickerBtn('btnPickArtCover', 'artCoverImage', this.auth);
}

// showModal() — fill all fields including slug, excerpt, content
showModal(id = null) {
  const item = id ? this.items.find(i => i.id === id) : null;
  document.getElementById('articleId').value   = item?.id || '';
  document.getElementById('articleSlug').value = item?.slug || '';
  document.getElementById('articleTitleCz').value   = item?.title_cz || '';
  document.getElementById('articleTitleEn').value   = item?.title_en || '';
  document.getElementById('articleExcerptCz').value = item?.excerpt_cz || '';
  document.getElementById('articleExcerptEn').value = item?.excerpt_en || '';
  document.getElementById('articleContentCz').value = item?.content_cz || '';
  document.getElementById('articleContentEn').value = item?.content_en || '';
  document.getElementById('artCoverImage').value    = item?.cover_image || '';
  document.getElementById('articlePublished').checked = !!item?.is_published;
  document.getElementById('articleModal').style.display = 'flex';
  document.getElementById('articleForm').onsubmit = (e) => { e.preventDefault(); this.saveItem(); };
}

// saveItem() — PUT resets published_at server-side when is_published=1
async saveItem() {
  const id = document.getElementById('articleId').value;
  const body = {
    title_cz:    document.getElementById('articleTitleCz').value.trim(),
    title_en:    document.getElementById('articleTitleEn').value.trim(),
    slug:        document.getElementById('articleSlug').value.trim(),
    excerpt_cz:  document.getElementById('articleExcerptCz').value.trim(),
    excerpt_en:  document.getElementById('articleExcerptEn').value.trim(),
    content_cz:  document.getElementById('articleContentCz').value,
    content_en:  document.getElementById('articleContentEn').value,
    cover_image: document.getElementById('artCoverImage').value.trim() || null,
    is_published: document.getElementById('articlePublished').checked ? 1 : 0,
  };
  const url    = id ? `/api/magazine/${id}` : '/api/magazine';
  const method = id ? 'PUT' : 'POST';
  // Safe Fetch Pattern...
}
```

---

## 4. Slug

- Slug must be unique (`UNIQUE` constraint on `magazine_posts.slug`)
- Auto-generated from `title_cz` on create (same diacritics-strip logic as categories)
- Admin can edit slug manually before saving
- Public URL: `/magazine/:slug`

---

## 5. Published / Draft Toggle

```javascript
// is_published: 0 (draft) or 1 (published)
// published_at: set by server on first publish (PUT when is_published=1)

// Admin table shows status visually:
`<span class="${item.is_published ? 'badge-published' : 'badge-draft'}">
  ${item.is_published ? 'Publikováno' : 'Koncept'}
</span>`
```

---

## 6. Content Rendering (public.js)

**Rich-text content is rendered as HTML intentionally.** Do NOT use `esc()` on article body.

```javascript
async loadMagazineArticle(slug) {
  const post = await safeFetch(`/api/magazine/${slug}`);
  const title   = pick(post.title_cz, post.title_en);
  const content = pick(post.content_cz, post.content_en);

  document.getElementById('articleTitle').textContent = title;
  // ✅ intentional innerHTML for rich text — content may contain HTML formatting
  document.getElementById('articleBody').innerHTML = content;

  // ✅ esc() for structural fields:
  document.getElementById('articleCover').src = esc(post.cover_image);
}
```

Excerpt (homepage preview, list card): plain text, use `esc()`:
```javascript
`<p class="card-excerpt">${esc(pick(post.excerpt_cz, post.excerpt_en))}</p>`
```

---

## 7. Homepage Magazine Preview

`loadMagazinePreview()` in `public.js` loads the 3 most recent published articles for the homepage section.

```javascript
async loadMagazinePreview() {
  const posts = await safeFetch('/api/magazine');
  const preview = posts.slice(0, 3);
  document.getElementById('magazinePreviewGrid').innerHTML = preview.map(p =>
    `<a href="/magazine/${esc(p.slug)}" class="magazine-card">
       <img src="${esc(p.cover_image)}" alt="${esc(pick(p.title_cz, p.title_en))}">
       <h3>${esc(pick(p.title_cz, p.title_en))}</h3>
       <p>${esc(pick(p.excerpt_cz, p.excerpt_en))}</p>
     </a>`
  ).join('');
}
```

---

## 8. Checklist

- [ ] Slug is unique, auto-generated from `title_cz`, editable
- [ ] `is_published` toggle in admin form
- [ ] `published_at` set server-side on first publish (not client-controlled)
- [ ] Rich-text body: `innerHTML` directly (intentional, no `esc()`)
- [ ] Structural fields (title, excerpt, slug, cover): always `esc()`
- [ ] Gallery Picker bound: `bindGalleryPickerBtn('btnPickArtCover', 'artCoverImage', this.auth)`
- [ ] Public `/magazine/:slug` returns 404 if `is_published = 0`
