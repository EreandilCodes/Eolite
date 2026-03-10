# Recipe: Gallery Admin

> **Files:** `backend/routes/gallery.js` · `frontend/admin/gallery.js` · `frontend/js/gallery-picker.js` · `backend/database.js`

---

## 1. Architecture

Gallery is the central image library for the whole site.

```
                ┌──────────────────────────────┐
                │         Gallery Admin         │
                │  folder tree  │  image table  │
                │  (left panel) │ (right panel) │
                └───────┬───────┴───────┬───────┘
                        │               │
               gallery_folders     gallery_images
                    (DB)               (DB)
                        │               │
                        └───────────────┘
                                │
                    Gallery Picker Modal
                   (used by all sections)
```

---

## 2. DB Schema

```sql
-- backend/database.js
CREATE TABLE IF NOT EXISTS gallery_folders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_cz       TEXT NOT NULL,
  name_en       TEXT,
  slug          TEXT UNIQUE NOT NULL,
  parent_id     INTEGER REFERENCES gallery_folders(id),  -- self-ref, nullable = root
  display_order INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id       INTEGER REFERENCES gallery_folders(id),  -- nullable = unorganized
  image_url       TEXT NOT NULL,   -- '/uploads/gallery/<filename>'
  identifier      TEXT UNIQUE,     -- regex [a-z0-9_-], max 80 chars, for stable referencing
  title_cz        TEXT,
  title_en        TEXT,
  description_cz  TEXT,
  description_en  TEXT,
  tags            TEXT,
  display_order   INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. API Endpoints

```
# Folders (admin)
GET    /api/gallery/folders           → flat list (client builds tree)
POST   /api/gallery/folders           → create folder
PUT    /api/gallery/folders/:id       → update folder (name, parent, order)
DELETE /api/gallery/folders/:id       → delete — 400 if has children or images

# Images (admin)
GET    /api/gallery/images            → ?folder=root|N&search=X
POST   /api/gallery/images            → create image record (URL only, no upload)
PUT    /api/gallery/images/:id        → update (incl. folder move)
DELETE /api/gallery/images/:id        → delete record (NOT file from disk)

# Upload (admin)
POST   /api/gallery/upload            → multipart, field "images" (multiple) + optional "folder_id"
```

---

## 4. Admin Manager (gallery.js)

`GalleryManager` — split-panel UI:

```javascript
async init() {
  await this.loadFolders();
  await this.loadImages(); // loads for current active folder
}

async loadFolders() {
  // GET /api/gallery/folders → flat array
  // buildTree(folders) → tree structure
  this.renderFolderTree();
}

renderFolderTree() {
  // buildTree() converts flat adjacency list to nested structure
  // renderTreeNodes(node, depth) → recursive <li> with indent
  // Active folder highlighted, click → setActiveFolder(id)
}

setActiveFolder(folderId) {
  this.activeFolder = folderId;
  this.loadImages();
}

async loadImages() {
  // GET /api/gallery/images?folder=<activeFolder>&search=<searchQuery>
  this.renderImages();
}

renderImages() {
  const tbody = document.getElementById('galleryImagesTableBody');
  tbody.innerHTML = this.images.map(img => `
    <tr>
      <td><img src="${img.image_url}" class="thumb"></td>
      <td>${img.identifier || '—'}</td>
      <td>${img.title_cz || '—'}</td>
      <td>
        <button onclick="admin.gallery.showImageModal(${img.id})">Upravit</button>
        <button onclick="admin.gallery.deleteImage(${img.id})">Smazat</button>
      </td>
    </tr>
  `).join('');
}
```

---

## 5. Tree Building (adjacency list → tree)

```javascript
buildTree(folders) {
  const map = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots = [];
  folders.forEach(f => {
    if (f.parent_id && map[f.parent_id]) {
      map[f.parent_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  return roots;
}
```

Parent dropdown in folder modal excludes self and all descendants (prevents circular references):
```javascript
getDescendantIds(folderId) {
  const ids = new Set([folderId]);
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop();
    this.folders.filter(f => f.parent_id === id).forEach(f => {
      ids.add(f.id); stack.push(f.id);
    });
  }
  return ids;
}
```

---

## 6. Upload Modal (drag & drop + progress)

```javascript
showUploadModal() {
  document.getElementById('galleryUploadModal').style.display = 'flex';
  this.setupDropzone();
}

setupDropzone() {
  const zone = document.getElementById('uploadDropzone');
  if (zone.dataset.bound) return;
  zone.dataset.bound = '1';
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    this.handleFiles(Array.from(e.dataTransfer.files));
  });
  document.getElementById('uploadFileInput').addEventListener('change', e => {
    this.handleFiles(Array.from(e.target.files));
  });
}

async doUpload() {
  const { Authorization } = this.auth.getAuthHeaders(); // NO Content-Type
  const formData = new FormData();
  this.pendingFiles.forEach(f => formData.append('images', f));
  if (this.activeFolder) formData.append('folder_id', this.activeFolder);

  const response = await fetch('/api/gallery/upload', {
    method: 'POST',
    headers: { Authorization }, // NOT getAuthHeaders() — would break multipart
    body: formData
  });
  // Safe Fetch Pattern...
}
```

---

## 7. Folder Delete Protection

Server returns `400` (not `500`) if folder cannot be deleted:

```javascript
// Backend:
const childCount = await db.prepare('SELECT COUNT(*) as n FROM gallery_folders WHERE parent_id = ?').get(id);
const imageCount = await db.prepare('SELECT COUNT(*) as n FROM gallery_images WHERE folder_id = ?').get(id);
if (childCount.n > 0 || imageCount.n > 0) {
  return res.status(400).json({
    error: `Složku nelze smazat: obsahuje ${childCount.n} podsložek a ${imageCount.n} obrázků`
  });
}
```

---

## 8. Gallery Picker (used by other sections)

See `docs/recipes/uploads_media.md` for full picker recipe.

Quick summary:
```javascript
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

// In any manager's init():
bindGalleryPickerBtn('btnPickXxx', 'xxxImageUrl', this.auth);           // single
bindGalleryPickerBtn('btnPickXxx', 'xxxGalleryJson', this.auth, { multiple: true }); // multi
```

Picker calls `GET /api/gallery/images?search=` (no auth required? — check: auth IS passed).

---

## 9. Identifier Field

`identifier` is a unique, URL-safe string for stable cross-site image referencing:
- Regex: `[a-z0-9_-]`, max 80 chars
- Validated server-side: `400` if format invalid
- Optional: images without identifier still work
- Useful when you need to reference a specific image by name, not by DB id

---

## 10. Checklist

- [ ] Folder tree built client-side from flat list (not recursive SQL)
- [ ] Folder delete blocked server-side if has children or images (400, with count)
- [ ] Parent dropdown excludes self + all descendants
- [ ] Upload: `{ Authorization }` only, NO `Content-Type`
- [ ] `setupDropzone()` uses `dataset.bound` guard
- [ ] `identifier` validated as `[a-z0-9_-]` on server
- [ ] Image delete removes DB record only (not file from disk)
- [ ] Gallery Picker uses `galleryPickerModal` (already in admin.html)
- [ ] `showModal()` on GalleryManager opens upload modal (not a CRUD modal)
