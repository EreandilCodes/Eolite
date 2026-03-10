# Recipe: Uploads & Media

> **Files:** `backend/routes/gallery.js` · `frontend/admin/gallery.js` · `frontend/js/gallery-picker.js`

---

## 1. Architecture Rule

**Only one place uploads files: the Gallery module.**

```
Gallery admin:      ✅ uploads files from disk  → POST /api/gallery/upload
References admin:   ❌ no file upload            → Gallery Picker modal
Magazine admin:     ❌ no file upload            → Gallery Picker modal
Pages admin:        ❌ no file upload            → Gallery Picker modal
```

All other sections select images by browsing the gallery via `bindGalleryPickerBtn()`.

---

## 2. Upload Endpoint (POST /api/gallery/upload)

```
POST /api/gallery/upload
Headers: Authorization: Bearer <token>   ← NO Content-Type (multipart boundary auto-set)
Body: multipart/form-data, field name "images" (multiple files)
      optional: "folder_id" field

Response 200: { uploaded: [{id, image_url, identifier}, ...], errors: [...] }
```

**MIME whitelist:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`
**Extension whitelist:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
**Max file size:** 50 MB (sharp compresses output)

---

## 3. Sharp Auto-Resize Pipeline

```
multer.memoryStorage() → req.files[i].buffer
  → sharp(buffer).resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
  → JPEG: quality 85 · WebP: quality 85 · PNG: compressionLevel 8 · GIF: unchanged
  → fs.writeFileSync(path.join('frontend/uploads/gallery/', filename), processedBuf)
  → URL stored as '/uploads/gallery/<filename>' in gallery_images table
```

On sharp error: logs warning, saves original buffer (non-fatal fallback).

---

## 4. Gallery Picker (selecting existing images)

```javascript
// frontend/js/gallery-picker.js
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

// In manager's init():
bindGalleryPickerBtn('btnPickRefCover',   'refCoverImage',  this.auth);               // single
bindGalleryPickerBtn('btnPickRefGallery', 'refGalleryJson', this.auth, { multiple: true }); // multi
```

**Single mode:** clicking an image fills `<input id="refCoverImage">` with the URL, closes modal.
**Multiple mode:** checkboxes + Confirm → fills `<textarea id="refGalleryJson">` with JSON array.

Existing button/target pairs:
| Button ID          | Target ID        | Mode     | Section    |
|--------------------|------------------|----------|------------|
| `btnPickRefCover`  | `refCoverImage`  | single   | References |
| `btnPickRefGallery`| `refGalleryJson` | multiple | References |
| `btnPickArtCover`  | `artCoverImage`  | single   | Magazine   |
| `btnPickPageImage` | `pageImageUrl`   | single   | Pages      |

---

## 5. Adding Gallery Picker to a New Section

1. Add button and target input/textarea to modal in `admin.html`:
```html
<div class="form-group">
  <label>Obrázek</label>
  <div class="image-pick-row">
    <input type="text" id="myEntityImageUrl" placeholder="/uploads/gallery/...">
    <button type="button" id="btnPickMyEntity">Vybrat z galerie</button>
  </div>
</div>
```

2. In manager's `init()`:
```javascript
import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

async init() {
  await this.loadItems();
  bindGalleryPickerBtn('btnPickMyEntity', 'myEntityImageUrl', this.auth);
}
```

3. In `saveItem()` body:
```javascript
image_url: document.getElementById('myEntityImageUrl').value.trim() || null,
```

---

## 6. Multipart Fetch — Content-Type Must NOT Be Set

```javascript
// ✅ CORRECT — only Authorization
const { Authorization } = this.auth.getAuthHeaders();
const formData = new FormData();
formData.append('images', file);
formData.append('folder_id', folderId);

const response = await fetch('/api/gallery/upload', {
  method: 'POST',
  headers: { Authorization },   // NO Content-Type
  body: formData
});

// ❌ WRONG — overrides multipart boundary, breaks upload
const response = await fetch(url, {
  method: 'POST',
  headers: this.auth.getAuthHeaders(),  // includes Content-Type: application/json
  body: formData
});
```

---

## 7. Image URL Storage

Image URLs are plain strings stored in DB fields. No media library object, no JSON wrapper for single images.

```
'/uploads/gallery/abc123-photo.jpg'    ← stored in DB
http://localhost:3002/uploads/gallery/abc123-photo.jpg  ← served as static file
```

Static serving: `express.static('frontend')` in `server.js` serves the entire `frontend/` directory.

---

## 8. Checklist

- [ ] New section does NOT add its own file upload — uses Gallery Picker
- [ ] `bindGalleryPickerBtn(btnId, targetId, auth)` called in `init()`
- [ ] Button ID and target ID added to the table above (in this doc + CLAUDE.md)
- [ ] Multipart fetch: only `Authorization` header, NO `Content-Type`
- [ ] Image URL stored as plain string (`TEXT` column in DB)
- [ ] Gallery upload: both MIME and extension whitelisted
