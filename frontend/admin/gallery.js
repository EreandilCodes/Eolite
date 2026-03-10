/** Add # to each comma-separated tag that doesn't already start with # */
function autoHashtagList(val) {
  return val.split(',')
    .map(t => { t = t.trim(); return t && !t.startsWith('#') ? '#' + t : t; })
    .filter(t => t)
    .join(', ');
}

export class GalleryManager {
  constructor(auth) {
    this.auth = auth;
    this.folders = [];
    this.images = [];
    this.activeFolderId = null; // null = all images, 'root' = no folder, number = specific folder
    this.searchQuery = '';
  }

  async init() {
    this.setupSearch();
    await this.loadFolders();
    await this.loadImages();
  }

  setupSearch() {
    const el = document.getElementById('gallerySearch');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('input', () => {
      this.searchQuery = el.value.trim();
      this.loadImages();
    });
  }

  // ============================================================
  // Load data
  // ============================================================

  async loadFolders() {
    try {
      const response = await fetch('/api/gallery/folders', {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      this.folders = await response.json();
      this.renderFolderTree();
    } catch (error) {
      console.error('Error loading gallery folders:', error);
      const tree = document.getElementById('galleryFolderTree');
      if (tree) tree.innerHTML = '<p style="padding:0.75rem;color:var(--text-muted);font-size:0.85rem">Chyba při načítání složek</p>';
    }
  }

  async loadImages() {
    try {
      const params = new URLSearchParams();
      if (this.activeFolderId !== null) {
        params.set('folder', this.activeFolderId === 'root' ? 'root' : String(this.activeFolderId));
      }
      if (this.searchQuery) params.set('search', this.searchQuery);

      const response = await fetch(`/api/gallery/images?${params}`, {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      this.images = await response.json();
      this.renderImages();
    } catch (error) {
      console.error('Error loading gallery images:', error);
      const tbody = document.getElementById('galleryImagesTableBody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Chyba při načítání fotek</td></tr>';
    }
  }

  // ============================================================
  // Render
  // ============================================================

  buildTree(parentId = null) {
    return this.folders
      .filter(f => f.parent_id === parentId)
      .map(f => ({ ...f, children: this.buildTree(f.id) }));
  }

  renderFolderTree() {
    const container = document.getElementById('galleryFolderTree');
    if (!container) return;

    const allActive  = this.activeFolderId === null;
    const rootActive = this.activeFolderId === 'root';

    let html = `
      <div class="gallery-folder-item ${allActive ? 'active' : ''}" onclick="admin.gallery.setActiveFolder(null)">
        <span class="folder-name">🗂 Vše</span>
      </div>
      <div class="gallery-folder-item ${rootActive ? 'active' : ''}" onclick="admin.gallery.setActiveFolder('root')">
        <span class="folder-name">📂 (bez složky)</span>
      </div>`;

    html += this.renderTreeNodes(this.buildTree(null), 0);
    container.innerHTML = html;
  }

  renderTreeNodes(nodes, depth) {
    let html = '';
    const indent = depth * 14;
    for (const node of nodes) {
      const isActive = this.activeFolderId === node.id;
      html += `
        <div class="gallery-folder-item ${isActive ? 'active' : ''}"
             style="padding-left:calc(0.75rem + ${indent}px)"
             onclick="admin.gallery.setActiveFolder(${node.id})">
          <span class="folder-name">📁 ${node.name_cz}</span>
          <span class="folder-actions">
            <button class="btn-icon" title="Editovat"
              onclick="event.stopPropagation();admin.gallery.showFolderModal(${node.id})">✏️</button>
            <button class="btn-icon btn-danger" title="Smazat"
              onclick="event.stopPropagation();admin.gallery.deleteFolder(${node.id})">🗑</button>
          </span>
        </div>`;
      if (node.children.length) html += this.renderTreeNodes(node.children, depth + 1);
    }
    return html;
  }

  renderImages() {
    const tbody = document.getElementById('galleryImagesTableBody');
    if (!tbody) return;

    if (!this.images.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Žádné fotky</td></tr>';
      return;
    }

    tbody.innerHTML = this.images.map(img => `
      <tr>
        <td><img src="${img.image_url}" alt="" class="gallery-thumb" onerror="this.style.opacity='0'"></td>
        <td>
          <code class="identifier-badge">${img.identifier}</code>
          ${img.title_cz ? `<div class="item-subtitle">${img.title_cz}</div>` : ''}
        </td>
        <td class="text-muted">${img.folder_name || '—'}</td>
        <td class="text-muted">${img.tags || '—'}</td>
        <td class="table-actions">
          <button class="btn-icon" onclick="admin.gallery.showImageModal(${img.id})" title="Editovat">✏️</button>
          <button class="btn-icon btn-danger" onclick="admin.gallery.deleteImage(${img.id})" title="Smazat">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  // ============================================================
  // Navigation
  // ============================================================

  setActiveFolder(folderId) {
    this.activeFolderId = folderId;
    this.renderFolderTree();
    this.loadImages();
  }

  // Called by admin.handleAddNew()
  showModal() {
    this.showUploadModal();
  }

  // ============================================================
  // Folder modal
  // ============================================================

  showFolderModal(id = null) {
    const folder = id ? (this.folders.find(f => f.id === id) || null) : null;
    const modal  = document.getElementById('galleryFolderModal');
    const form   = document.getElementById('galleryFolderForm');

    document.getElementById('galleryFolderModalTitle').textContent =
      folder ? 'Editovat složku' : 'Nová složka';

    // Parent dropdown – exclude self and its descendants
    const excluded = folder ? this.getSubtreeIds(folder.id) : new Set();
    const parentSelect = document.getElementById('folderParentId');
    parentSelect.innerHTML = '<option value="">— bez nadřazené složky —</option>';
    this.folders
      .filter(f => !excluded.has(f.id))
      .forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name_cz;
        if (folder && f.id === folder.parent_id) opt.selected = true;
        parentSelect.appendChild(opt);
      });

    document.getElementById('folderNameCZ').value      = folder?.name_cz || '';
    document.getElementById('folderNameEN').value      = folder?.name_en || '';
    document.getElementById('folderSlug').value        = folder?.slug || '';
    document.getElementById('folderDisplayOrder').value = folder?.display_order ?? 0;

    form.onsubmit = async (e) => { e.preventDefault(); await this.saveFolder(folder?.id || null); };
    this.openModal(modal);
  }

  getSubtreeIds(rootId) {
    const ids = new Set([rootId]);
    const addChildren = (pid) => {
      this.folders.filter(f => f.parent_id === pid).forEach(f => { ids.add(f.id); addChildren(f.id); });
    };
    addChildren(rootId);
    return ids;
  }

  // ============================================================
  // Image modal
  // ============================================================

  showImageModal(id = null) {
    const image = id ? (this.images.find(i => i.id === id) || null) : null;
    const modal = document.getElementById('galleryImageModal');
    const form  = document.getElementById('galleryImageForm');

    document.getElementById('galleryImageModalTitle').textContent =
      image ? 'Editovat fotku' : 'Nová fotka';

    // Folder dropdown
    const folderSelect = document.getElementById('imageFolderId');
    folderSelect.innerHTML = '<option value="">— bez složky —</option>';
    this.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name_cz;
      const shouldSelect = image ? f.id === image.folder_id
                                 : typeof this.activeFolderId === 'number' && f.id === this.activeFolderId;
      if (shouldSelect) opt.selected = true;
      folderSelect.appendChild(opt);
    });

    document.getElementById('imageUrl').value          = image?.image_url || '';
    document.getElementById('imageIdentifier').value   = image?.identifier || '';
    document.getElementById('imageTitleCZ').value      = image?.title_cz || '';
    document.getElementById('imageTitleEN').value      = image?.title_en || '';
    document.getElementById('imageDescCZ').value       = image?.description_cz || '';
    document.getElementById('imageDescEN').value       = image?.description_en || '';
    document.getElementById('imageTags').value         = image?.tags || '';
    document.getElementById('imageDisplayOrder').value = image?.display_order ?? 0;

    // Auto-prepend # to tags on blur
    const imageTagsEl = document.getElementById('imageTags');
    imageTagsEl.onblur = () => { imageTagsEl.value = autoHashtagList(imageTagsEl.value); };

    form.onsubmit = async (e) => { e.preventDefault(); await this.saveImage(image?.id || null); };
    this.openModal(modal);
  }

  // ============================================================
  // Save / Delete
  // ============================================================

  async saveFolder(id = null) {
    const body = {
      name_cz:       document.getElementById('folderNameCZ').value,
      name_en:       document.getElementById('folderNameEN').value || null,
      slug:          document.getElementById('folderSlug').value || null,
      parent_id:     document.getElementById('folderParentId').value || null,
      display_order: Number(document.getElementById('folderDisplayOrder').value) || 0
    };

    try {
      const response = await fetch(id ? `/api/gallery/folders/${id}` : '/api/gallery/folders', {
        method: id ? 'PUT' : 'POST',
        headers: { ...this.auth.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const data = await response.json();
      this.closeModal(document.getElementById('galleryFolderModal'));
      window.admin.showNotification(data.message || 'Složka uložena');
      await this.loadFolders();
    } catch (error) {
      window.admin.showNotification(error.message, 'error');
    }
  }

  async saveImage(id = null) {
    const body = {
      folder_id:     document.getElementById('imageFolderId').value || null,
      image_url:     document.getElementById('imageUrl').value,
      identifier:    document.getElementById('imageIdentifier').value,
      title_cz:      document.getElementById('imageTitleCZ').value || null,
      title_en:      document.getElementById('imageTitleEN').value || null,
      description_cz: document.getElementById('imageDescCZ').value || null,
      description_en: document.getElementById('imageDescEN').value || null,
      tags:          autoHashtagList(document.getElementById('imageTags').value) || null,
      display_order: Number(document.getElementById('imageDisplayOrder').value) || 0
    };

    try {
      const response = await fetch(id ? `/api/gallery/images/${id}` : '/api/gallery/images', {
        method: id ? 'PUT' : 'POST',
        headers: { ...this.auth.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const data = await response.json();
      this.closeModal(document.getElementById('galleryImageModal'));
      window.admin.showNotification(data.message || 'Fotka uložena');
      await this.loadImages();
    } catch (error) {
      window.admin.showNotification(error.message, 'error');
    }
  }

  async deleteFolder(id) {
    const folder = this.folders.find(f => f.id === id);
    if (!folder || !confirm(`Smazat složku "${folder.name_cz}"?`)) return;

    try {
      const response = await fetch(`/api/gallery/folders/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const data = await response.json();
      window.admin.showNotification(data.message);
      if (this.activeFolderId === id) this.activeFolderId = null;
      await this.loadFolders();
      await this.loadImages();
    } catch (error) {
      window.admin.showNotification(error.message, 'error');
    }
  }

  async deleteImage(id) {
    const image = this.images.find(i => i.id === id);
    if (!image || !confirm(`Smazat fotku "${image.identifier}"?`)) return;

    try {
      const response = await fetch(`/api/gallery/images/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const data = await response.json();
      window.admin.showNotification(data.message);
      await this.loadImages();
    } catch (error) {
      window.admin.showNotification(error.message, 'error');
    }
  }

  // ============================================================
  // Upload modal
  // ============================================================

  showUploadModal() {
    const modal      = document.getElementById('galleryUploadModal');
    const fileInput  = document.getElementById('galleryFileInput');
    const previews   = document.getElementById('galleryUploadPreviews');
    const uploadBtn  = document.getElementById('galleryUploadBtn');
    const progressEl = document.getElementById('galleryUploadProgress');

    // Reset state
    fileInput.value = '';
    previews.innerHTML = '';
    previews.style.display = 'none';
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Nahrát';
    progressEl.style.display = 'none';
    document.getElementById('galleryProgressFill').style.width = '0%';

    // Populate folder dropdown
    const folderSelect = document.getElementById('uploadFolderId');
    folderSelect.innerHTML = '<option value="">— bez složky —</option>';
    this.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name_cz;
      if (typeof this.activeFolderId === 'number' && f.id === this.activeFolderId) opt.selected = true;
      folderSelect.appendChild(opt);
    });

    // Reset shared metadata fields
    ['uploadTitleCZ','uploadTitleEN','uploadDescCZ','uploadDescEN','uploadTags'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('uploadDisplayOrder').value = '0';

    // Auto-prepend # to tags on blur
    const uploadTagsEl = document.getElementById('uploadTags');
    uploadTagsEl.onblur = () => { uploadTagsEl.value = autoHashtagList(uploadTagsEl.value); };

    // File input change
    fileInput.onchange = () => this.updateUploadPreviews(fileInput.files);

    // Dropzone drag & drop
    this.setupDropzone(document.getElementById('galleryDropzone'), fileInput);

    // Submit
    document.getElementById('galleryUploadForm').onsubmit = async (e) => {
      e.preventDefault();
      await this.doUpload(fileInput.files);
    };

    this.openModal(modal);
  }

  setupDropzone(zone, fileInput) {
    zone.ondragover  = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
    zone.ondragleave = ()  => zone.classList.remove('drag-over');
    zone.ondrop      = (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      // Merge existing + dropped (images only)
      const dt = new DataTransfer();
      [...(fileInput.files || []), ...e.dataTransfer.files]
        .filter(f => f.type.startsWith('image/'))
        .forEach(f => dt.items.add(f));
      fileInput.files = dt.files;
      this.updateUploadPreviews(fileInput.files);
    };
  }

  updateUploadPreviews(files) {
    const previews  = document.getElementById('galleryUploadPreviews');
    const uploadBtn = document.getElementById('galleryUploadBtn');

    if (!files || files.length === 0) {
      previews.style.display = 'none';
      previews.innerHTML = '';
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Nahrát';
      return;
    }

    previews.style.display = 'grid';
    previews.innerHTML = Array.from(files).map(file => {
      const url = URL.createObjectURL(file);
      const mb  = (file.size / 1024 / 1024).toFixed(1);
      return `
        <div class="upload-preview-item">
          <img src="${url}" alt="${file.name}" onload="URL.revokeObjectURL(this.src)">
          <span class="upload-filename">${file.name}</span>
          <span class="upload-size">${mb} MB</span>
        </div>`;
    }).join('');

    uploadBtn.disabled = false;
    const n = files.length;
    uploadBtn.textContent = `Nahrát (${n} ${n === 1 ? 'fotka' : n < 5 ? 'fotky' : 'fotek'})`;
  }

  async doUpload(files) {
    if (!files || files.length === 0) return;

    const uploadBtn   = document.getElementById('galleryUploadBtn');
    const progressEl  = document.getElementById('galleryUploadProgress');
    const progressBar = document.getElementById('galleryProgressFill');
    const progressTxt = document.getElementById('galleryProgressText');

    uploadBtn.disabled = true;
    progressEl.style.display = 'block';
    progressTxt.textContent  = 'Nahrávám...';
    progressBar.style.width  = '15%';

    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    formData.append('folder_id',     document.getElementById('uploadFolderId').value  || '');
    formData.append('title_cz',      document.getElementById('uploadTitleCZ').value);
    formData.append('title_en',      document.getElementById('uploadTitleEN').value);
    formData.append('description_cz', document.getElementById('uploadDescCZ').value);
    formData.append('description_en', document.getElementById('uploadDescEN').value);
    formData.append('tags',          autoHashtagList(document.getElementById('uploadTags').value));
    formData.append('display_order', document.getElementById('uploadDisplayOrder').value || '0');

    try {
      // Only Authorization – NO Content-Type.
      // fetch sets multipart/form-data + boundary automatically when body is FormData.
      // getAuthHeaders() includes Content-Type:application/json which would break multipart.
      const { Authorization } = this.auth.getAuthHeaders();
      const response = await fetch('/api/gallery/upload', {
        method: 'POST',
        headers: { Authorization },
        body: formData
      });

      progressBar.style.width = '100%';

      const contentType = response.headers.get('content-type');
      const data = contentType?.includes('application/json')
        ? await response.json()
        : { error: await response.text() };

      if (!response.ok && !(data.images?.length > 0)) {
        throw new Error(data.error || 'Upload selhal');
      }

      progressTxt.textContent = data.message || 'Hotovo';

      if (data.errors?.length) {
        console.warn('Upload – chyby u některých souborů:', data.errors);
      }

      setTimeout(() => {
        this.closeModal(document.getElementById('galleryUploadModal'));
        window.admin.showNotification(data.message || 'Fotky nahrány');
        this.loadImages();
      }, 700);

    } catch (error) {
      progressEl.style.display = 'none';
      progressBar.style.width  = '0%';
      uploadBtn.disabled = false;
      this.updateUploadPreviews(files); // restore button text
      window.admin.showNotification(error.message, 'error');
    }
  }

  // ============================================================
  // Modal helpers
  // ============================================================

  openModal(modal) {
    modal.classList.add('open');
    const close = () => modal.classList.remove('open');
    modal.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn =>
      btn.addEventListener('click', close, { once: true })
    );
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
  }

  closeModal(modal) {
    modal.classList.remove('open');
  }
}
