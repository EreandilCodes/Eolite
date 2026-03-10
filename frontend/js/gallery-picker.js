/**
 * gallery-picker.js – shared "pick from gallery" helper for admin managers.
 *
 * Usage (single image):
 *   import { bindGalleryPickerBtn } from '../js/gallery-picker.js';
 *   bindGalleryPickerBtn('myBtnId', 'myInputId', this.auth);
 *
 * Usage (multi-image – appends to JSON array in textarea):
 *   bindGalleryPickerBtn('myBtnId', 'myTextareaId', this.auth, { multiple: true });
 */

let _resolve = null;
let _auth    = null;
let _multiple = false;
let _selected = new Set();
let _images  = [];

/**
 * Opens the gallery picker modal.
 * Returns a Promise that resolves with:
 *   - string (image_url)          in single mode
 *   - string[] (array of URLs)    in multiple mode
 *   - null                        when cancelled
 */
export function openGalleryPicker(auth, { multiple = false } = {}) {
  _auth     = auth;
  _multiple = multiple;
  _selected = new Set();

  return new Promise((resolve) => {
    _resolve = resolve;
    _setup();
    _load('');
  });
}

/**
 * Binds a gallery picker button to a target input/textarea.
 * Idempotent (guarded with dataset.pickerBound).
 */
export function bindGalleryPickerBtn(btnId, targetId, auth, { multiple = false } = {}) {
  const btn = document.getElementById(btnId);
  if (!btn || btn.dataset.pickerBound) return;
  btn.dataset.pickerBound = '1';

  btn.addEventListener('click', async () => {
    const result = await openGalleryPicker(auth, { multiple });
    if (result === null) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    if (multiple) {
      let arr = [];
      try { arr = JSON.parse(target.value || '[]'); } catch { /* ignore */ }
      if (!Array.isArray(arr)) arr = [];
      target.value = JSON.stringify([...arr, ...result]);
    } else {
      target.value = result;
    }
  });
}

// ============================================================
// Internal helpers
// ============================================================

function _setup() {
  const modal     = document.getElementById('galleryPickerModal');
  const search    = document.getElementById('galleryPickerSearch');
  const closeBtn  = document.getElementById('galleryPickerClose');
  const cancelBtn = document.getElementById('galleryPickerCancel');
  const confirmBtn = document.getElementById('galleryPickerConfirm');
  const footer    = document.getElementById('galleryPickerFooter');
  const grid      = document.getElementById('galleryPickerGrid');

  document.getElementById('galleryPickerTitle').textContent =
    _multiple ? 'Vybrat fotky z galerie' : 'Vybrat fotku z galerie';

  if (footer) footer.style.display = _multiple ? 'flex' : 'none';

  if (search) {
    search.value = '';
    search.oninput = _debounce(() => _load(search.value.trim()), 300);
  }

  const close = () => {
    modal.classList.remove('open');
    if (_resolve) { _resolve(null); _resolve = null; }
  };

  if (closeBtn)  closeBtn.onclick  = close;
  if (cancelBtn) cancelBtn.onclick = close;

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      modal.classList.remove('open');
      const urls = [..._selected];
      if (_resolve) { _resolve(urls.length ? urls : null); _resolve = null; }
    };
  }

  // Event delegation on the grid
  if (grid) {
    grid.onclick = (e) => {
      const item = e.target.closest('[data-picker-idx]');
      if (!item) return;
      const img = _images[Number(item.dataset.pickerIdx)];
      if (!img) return;

      if (!_multiple) {
        // Single: resolve immediately
        modal.classList.remove('open');
        if (_resolve) { _resolve(img.image_url); _resolve = null; }
      } else {
        // Multi: toggle selection
        if (_selected.has(img.image_url)) {
          _selected.delete(img.image_url);
          item.classList.remove('selected');
        } else {
          _selected.add(img.image_url);
          item.classList.add('selected');
        }
        const countEl = document.getElementById('galleryPickerCount');
        if (countEl) countEl.textContent = _selected.size;
      }
    };
  }

  modal.classList.add('open');
}

async function _load(search = '') {
  const grid = document.getElementById('galleryPickerGrid');
  if (!grid) return;

  grid.innerHTML = '<p class="picker-empty">Načítám…</p>';

  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);

    const response = await fetch(`/api/gallery/images?${params}`, {
      headers: _auth.getAuthHeaders()
    });

    const ct = response.headers.get('content-type');
    if (!response.ok || !ct?.includes('application/json')) {
      grid.innerHTML = '<p class="picker-empty">Chyba při načítání galerie</p>';
      return;
    }

    _images = await response.json();
    _render();
  } catch {
    grid.innerHTML = '<p class="picker-empty">Chyba při načítání galerie</p>';
  }
}

function _render() {
  const grid = document.getElementById('galleryPickerGrid');
  if (!grid) return;

  if (!_images.length) {
    grid.innerHTML = '<p class="picker-empty">Žádné fotky v galerii. Nejdříve nahrajte fotky v sekci Galerie.</p>';
    return;
  }

  grid.innerHTML = _images.map((img, i) => `
    <div class="gallery-picker-item${_selected.has(img.image_url) ? ' selected' : ''}"
         data-picker-idx="${i}"
         title="${img.identifier}${img.title_cz ? ' – ' + img.title_cz : ''}">
      <img src="${img.image_url}" alt="${img.identifier}"
           onerror="this.parentElement.classList.add('no-img')">
      <div class="picker-name">${img.identifier}</div>
    </div>`).join('');
}

function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
