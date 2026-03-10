import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

/**
 * PagesManager – edit page content sections (hero, about, services, etc.)
 * Reuses pages pattern from KanjoWin.
 * Safe Fetch Pattern on all API calls.
 */
export class PagesManager {
  constructor(auth) {
    this.auth = auth;
    this.sections = [];
    this.currentSection = null;
  }

  async init() {
    await this.loadSections();
    bindGalleryPickerBtn('btnPickPageImage', 'pageImageUrl', this.auth);
  }

  async loadSections() {
    try {
      const response = await fetch('/api/pages/admin/all', {
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání sekcí');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.sections = await response.json();
      this.renderSections();
    } catch (error) {
      console.error('Error loading page sections:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
      this.sections = [];
      this.renderSections();
    }
  }

  renderSections() {
    const tbody = document.getElementById('pagesTableBody');
    if (!tbody) return;

    if (!this.sections.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Žádné sekce.</td></tr>';
      return;
    }

    tbody.innerHTML = this.sections.filter(s => s.section_key !== 'hero').map(s => `
      <tr>
        <td><code style="font-size:0.8em">${s.section_key}</code></td>
        <td>${s.section_title}</td>
        <td><span class="badge ${s.is_active ? 'badge-success' : 'badge-warning'}">${s.is_active ? 'Aktivní' : 'Skrytá'}</span></td>
        <td>
          <button class="btn-icon" onclick="admin.pages.editSection('${s.section_key}')" title="Upravit">✏️</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(section) {
    this.currentSection = section;
    const modal = document.getElementById('pagesModal');
    const form = document.getElementById('pagesForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('pagesModalTitle').textContent = `Editace: ${section.section_title}`;
    document.getElementById('pageContentCZ').value = section.content_cz || '';
    document.getElementById('pageContentEN').value = section.content_en || '';
    document.getElementById('pageImageUrl').value = section.image_url || '';
    document.getElementById('pageActive').checked = !!section.is_active;

    modal.classList.add('open');
    form.onsubmit = null;
    setTimeout(() => {
      form.onsubmit = (e) => { e.preventDefault(); this.saveSection(); };
    }, 50);

    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('open');
    modal.querySelector('.modal-close-btn').onclick = () => modal.classList.remove('open');
  }

  async saveSection() {
    try {
      const data = {
        content_cz: document.getElementById('pageContentCZ').value,
        content_en: document.getElementById('pageContentEN').value,
        image_url: document.getElementById('pageImageUrl').value.trim() || null,
        is_active: document.getElementById('pageActive').checked
      };

      const response = await fetch(`/api/pages/${this.currentSection.section_key}`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Uložení selhalo');
      }

      admin.showNotification('Sekce uložena', 'success');
      document.getElementById('pagesModal').classList.remove('open');
      await this.loadSections();
    } catch (error) {
      console.error('Error saving section:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  editSection(key) {
    const section = this.sections.find(s => s.section_key === key);
    if (section) this.showModal(section);
  }
}
