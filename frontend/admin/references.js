import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

/**
 * ReferencesManager – CRUD for project references.
 * Safe Fetch Pattern on all API calls.
 */
export class ReferencesManager {
  constructor(auth) {
    this.auth = auth;
    this.references = [];
    this.categories = [];
    this.currentRef = null;
  }

  async init() {
    await Promise.all([this.loadCategories(), this.loadReferences()]);
    bindGalleryPickerBtn('btnPickRefCover',   'refCoverImage',  this.auth);
    bindGalleryPickerBtn('btnPickRefGallery', 'refGalleryJson', this.auth, { multiple: true });
    this.bindFilters();
  }

  async loadCategories() {
    try {
      const response = await fetch('/api/references/categories/admin/all', {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) return;
      this.categories = await response.json();
      this.populateCategoryFilter();
    } catch (error) {
      console.error('Error loading categories for references:', error);
    }
  }

  populateCategoryFilter() {
    const select = document.getElementById('refFilterCategory');
    if (!select || select.dataset.populated) return;
    select.dataset.populated = '1';
    this.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name_cz;
      select.appendChild(opt);
    });
  }

  bindFilters() {
    // <select> fires 'change', <input type="text"> fires 'input' (live search)
    const filters = [
      ['refFilterCategory', 'change'],
      ['refFilterName',     'input'],
      ['refFilterStatus',   'change'],
      ['refFilterSort',     'change'],
    ];
    filters.forEach(([id, eventName]) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = '1';
        el.addEventListener(eventName, () => this.applyFilters());
      }
    });
  }

  applyFilters() {
    const catVal    = document.getElementById('refFilterCategory')?.value || '';
    const nameVal   = (document.getElementById('refFilterName')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('refFilterStatus')?.value || '';
    const sortVal   = document.getElementById('refFilterSort')?.value || 'newest';

    let filtered = this.references.filter(ref => {
      if (catVal && String(ref.category_id) !== catVal) return false;
      if (nameVal && !ref.title_cz.toLowerCase().includes(nameVal)) return false;
      if (statusVal === 'active' && !ref.is_active) return false;
      if (statusVal === 'hidden' && ref.is_active) return false;
      return true;
    });

    if (sortVal === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortVal === 'name') {
      filtered.sort((a, b) => a.title_cz.localeCompare(b.title_cz, 'cs'));
    } else {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    this.renderReferences(filtered);
  }

  async loadReferences() {
    try {
      const response = await fetch('/api/references/admin/all', {
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání referencí');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.references = await response.json();
      this.applyFilters();
    } catch (error) {
      console.error('Error loading references:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
      this.references = [];
      this.renderReferences([]);
    }
  }

  renderReferences(refs = this.references) {
    const tbody = document.getElementById('referencesTableBody');
    if (!tbody) return;

    if (!refs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Žádné reference. Klikněte na "Přidat" pro vytvoření.</td></tr>';
      return;
    }

    tbody.innerHTML = refs.map(ref => `
      <tr>
        <td>
          ${ref.cover_image
            ? `<img src="${ref.cover_image}" alt="" style="width:60px;height:40px;object-fit:cover;border-radius:4px;">`
            : '<span style="color:var(--text-muted);font-size:0.8em">–</span>'
          }
        </td>
        <td>
          <strong>${ref.title_cz}</strong>
          ${ref.is_featured ? '<span style="margin-left:6px;background:#fef3c7;color:#92400e;font-size:0.7em;padding:1px 6px;border-radius:999px;">⭐ Featured</span>' : ''}
        </td>
        <td style="color:var(--text-muted);font-size:0.85em">${ref.category_name_cz || '–'}</td>
        <td><span class="badge ${ref.is_active ? 'badge-success' : 'badge-warning'}">${ref.is_active ? 'Aktivní' : 'Skrytá'}</span></td>
        <td style="font-size:0.8em;color:var(--text-muted)">${new Date(ref.created_at).toLocaleDateString('cs-CZ')}</td>
        <td>
          <button class="btn-icon" onclick="admin.references.editReference(${ref.id})" title="Upravit">✏️</button>
          <button class="btn-icon btn-danger" onclick="admin.references.deleteReference(${ref.id})" title="Smazat">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(ref = null) {
    this.currentRef = ref;
    const modal = document.getElementById('referenceModal');
    const form = document.getElementById('referenceForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('refModalTitle').textContent = ref ? 'Upravit referenci' : 'Nová reference';

    // Populate category dropdown
    const catSelect = document.getElementById('refCategoryId');
    catSelect.innerHTML = '<option value="">-- Vyberte kategorii --</option>' +
      this.categories.map(c => `<option value="${c.id}">${c.name_cz}</option>`).join('');

    if (ref) {
      catSelect.value = ref.category_id;
      document.getElementById('refTitleCZ').value = ref.title_cz || '';
      document.getElementById('refTitleEN').value = ref.title_en || '';
      document.getElementById('refDescCZ').value = ref.description_cz || '';
      document.getElementById('refDescEN').value = ref.description_en || '';
      document.getElementById('refCoverImage').value = ref.cover_image || '';
      document.getElementById('refGalleryJson').value = ref.gallery_json || '';
      document.getElementById('refFeatured').checked = !!ref.is_featured;
      document.getElementById('refActive').checked = !!ref.is_active;
    } else {
      document.getElementById('refActive').checked = true;
    }

    modal.classList.add('open');
    form.onsubmit = null;
    setTimeout(() => {
      form.onsubmit = (e) => { e.preventDefault(); this.saveReference(); };
    }, 50);

    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('open');
    modal.querySelector('.modal-close-btn').onclick = () => modal.classList.remove('open');
  }

  async saveReference() {
    try {
      const galleryRaw = document.getElementById('refGalleryJson').value.trim();

      // Validate gallery JSON if not empty
      if (galleryRaw) {
        try { JSON.parse(galleryRaw); } catch {
          admin.showNotification('Gallery JSON není platné pole. Příklad: ["img1.jpg","img2.jpg"]', 'error');
          return;
        }
      }

      const data = {
        category_id: document.getElementById('refCategoryId').value,
        title_cz: document.getElementById('refTitleCZ').value.trim(),
        title_en: document.getElementById('refTitleEN').value.trim() || null,
        description_cz: document.getElementById('refDescCZ').value.trim() || null,
        description_en: document.getElementById('refDescEN').value.trim() || null,
        cover_image: document.getElementById('refCoverImage').value.trim() || null,
        gallery_json: galleryRaw || null,
        is_featured: document.getElementById('refFeatured').checked,
        is_active: document.getElementById('refActive').checked
      };

      if (!data.title_cz) { admin.showNotification('Název (CZ) je povinný', 'error'); return; }
      if (!data.category_id) { admin.showNotification('Kategorie je povinná', 'error'); return; }

      const url = this.currentRef ? `/api/references/${this.currentRef.id}` : '/api/references';
      const method = this.currentRef ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Uložení selhalo');
      }

      admin.showNotification('Reference uložena', 'success');
      document.getElementById('referenceModal').classList.remove('open');
      await this.loadReferences();
    } catch (error) {
      console.error('Error saving reference:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  editReference(id) {
    const ref = this.references.find(r => r.id === id);
    if (ref) this.showModal(ref);
  }

  async deleteReference(id) {
    if (!confirm('Opravdu smazat tuto referenci?')) return;

    try {
      const response = await fetch(`/api/references/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Smazání selhalo');
      }

      admin.showNotification('Reference smazána', 'success');
      await this.loadReferences();
    } catch (error) {
      console.error('Error deleting reference:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }
}
