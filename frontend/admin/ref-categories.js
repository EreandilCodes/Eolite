/** Ensure a single tag value starts with # (empty stays empty) */
function autoHashtag(val) {
  val = val.trim();
  return val && !val.startsWith('#') ? '#' + val : val;
}

/**
 * RefCategoriesManager – CRUD for reference categories.
 * Follows VideosManager / MenuManager pattern from KanjoWin.
 * Safe Fetch Pattern on all API calls.
 */
export class RefCategoriesManager {
  constructor(auth) {
    this.auth = auth;
    this.categories = [];
    this.currentCategory = null;
  }

  async init() {
    await this.loadCategories();
  }

  async loadCategories() {
    try {
      const response = await fetch('/api/references/categories/admin/all', {
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání kategorií');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.categories = await response.json();
      this.renderCategories();
    } catch (error) {
      console.error('Error loading categories:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
      this.categories = [];
      this.renderCategories();
    }
  }

  renderCategories() {
    const tbody = document.getElementById('refCategoriesTableBody');
    if (!tbody) return;

    if (!this.categories.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Žádné kategorie. Klikněte na "Přidat" pro vytvoření.</td></tr>';
      return;
    }

    tbody.innerHTML = this.categories.map((cat, idx) => `
      <tr>
        <td>
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <button class="btn-icon" onclick="admin.refCategories.reorderCategory(${cat.id}, 'up')" ${idx === 0 ? 'disabled' : ''} title="Nahoru">↑</button>
            <button class="btn-icon" onclick="admin.refCategories.reorderCategory(${cat.id}, 'down')" ${idx === this.categories.length - 1 ? 'disabled' : ''} title="Dolů">↓</button>
          </div>
        </td>
        <td><strong>${cat.name_cz}</strong>${cat.name_en ? `<br><small style="color:var(--text-muted)">${cat.name_en}</small>` : ''}</td>
        <td><code style="font-size:0.8em">${cat.slug || '–'}</code></td>
        <td>${cat.tag ? `<span style="background:#e0edff;color:#1d4ed8;padding:2px 8px;border-radius:999px;font-size:0.78em">${cat.tag}</span>` : '–'}</td>
        <td><span class="badge ${cat.is_active ? 'badge-success' : 'badge-warning'}">${cat.is_active ? 'Aktivní' : 'Skrytá'}</span></td>
        <td>
          <button class="btn-icon" onclick="admin.refCategories.editCategory(${cat.id})" title="Upravit">✏️</button>
          <button class="btn-icon btn-danger" onclick="admin.refCategories.deleteCategory(${cat.id})" title="Smazat">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(category = null) {
    this.currentCategory = category;
    const modal = document.getElementById('refCategoryModal');
    const form = document.getElementById('refCategoryForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('refCategoryModalTitle').textContent = category ? 'Upravit kategorii' : 'Nová kategorie';

    if (category) {
      document.getElementById('catNameCZ').value = category.name_cz || '';
      document.getElementById('catNameEN').value = category.name_en || '';
      document.getElementById('catSlug').value = category.slug || '';
      document.getElementById('catTag').value = category.tag || '';
      document.getElementById('catActive').checked = !!category.is_active;
    } else {
      document.getElementById('catActive').checked = true;
    }

    // Auto-prepend # on blur
    const tagEl = document.getElementById('catTag');
    tagEl.onblur = () => { tagEl.value = autoHashtag(tagEl.value); };

    modal.classList.add('open');
    form.onsubmit = null;
    setTimeout(() => {
      form.onsubmit = (e) => { e.preventDefault(); this.saveCategory(); };
    }, 50);

    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('open');
    modal.querySelector('.modal-close-btn').onclick = () => modal.classList.remove('open');
  }

  async saveCategory() {
    try {
      const data = {
        name_cz: document.getElementById('catNameCZ').value.trim(),
        name_en: document.getElementById('catNameEN').value.trim() || null,
        slug: document.getElementById('catSlug').value.trim() || null,
        tag: autoHashtag(document.getElementById('catTag').value) || null,
        is_active: document.getElementById('catActive').checked
      };

      if (!data.name_cz) {
        admin.showNotification('Název (CZ) je povinný', 'error');
        return;
      }

      const url = this.currentCategory
        ? `/api/references/categories/${this.currentCategory.id}`
        : '/api/references/categories';
      const method = this.currentCategory ? 'PUT' : 'POST';

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

      admin.showNotification('Kategorie uložena', 'success');
      document.getElementById('refCategoryModal').classList.remove('open');
      await this.loadCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  editCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    if (cat) this.showModal(cat);
  }

  async deleteCategory(id) {
    if (!confirm('Opravdu smazat tuto kategorii? Reference v ní zůstanou bez kategorie.')) return;

    try {
      const response = await fetch(`/api/references/categories/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Smazání selhalo');
      }

      admin.showNotification('Kategorie smazána', 'success');
      await this.loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  async reorderCategory(id, direction) {
    try {
      const response = await fetch(`/api/references/categories/${id}/reorder`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ direction })
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Přeřazení selhalo');
      }

      await this.loadCategories();
    } catch (error) {
      console.error('Error reordering:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }
}
