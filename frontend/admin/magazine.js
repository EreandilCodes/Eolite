import { bindGalleryPickerBtn } from '../js/gallery-picker.js';

/**
 * MagazineManager – CRUD for magazine posts.
 * Reuses posts/CMSManager pattern from KanjoWin.
 * Safe Fetch Pattern on all API calls.
 */
export class MagazineManager {
  constructor(auth) {
    this.auth = auth;
    this.posts = [];
    this.currentPost = null;
  }

  async init() {
    await this.loadPosts();
    bindGalleryPickerBtn('btnPickArtCover', 'artCoverImage', this.auth);
  }

  async loadPosts() {
    try {
      const response = await fetch('/api/magazine/admin/all', {
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání článků');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.posts = await response.json();
      this.renderPosts();
    } catch (error) {
      console.error('Error loading posts:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
      this.posts = [];
      this.renderPosts();
    }
  }

  renderPosts() {
    const tbody = document.getElementById('magazineTableBody');
    if (!tbody) return;

    if (!this.posts.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Žádné články. Klikněte na "Přidat" pro vytvoření.</td></tr>';
      return;
    }

    tbody.innerHTML = this.posts.map(post => `
      <tr>
        <td><strong>${post.title_cz}</strong></td>
        <td><code style="font-size:0.8em">${post.slug}</code></td>
        <td><span class="badge ${post.is_published ? 'badge-success' : 'badge-warning'}">${post.is_published ? 'Publikováno' : 'Koncept'}</span></td>
        <td style="font-size:0.8em;color:var(--text-muted)">${new Date(post.created_at).toLocaleDateString('cs-CZ')}</td>
        <td>
          <button class="btn-icon" onclick="admin.magazine.editPost(${post.id})" title="Upravit">✏️</button>
          <button class="btn-icon btn-danger" onclick="admin.magazine.deletePost(${post.id})" title="Smazat">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(post = null) {
    this.currentPost = post;
    const modal = document.getElementById('magazineModal');
    const form = document.getElementById('magazineForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('magazineModalTitle').textContent = post ? 'Upravit článek' : 'Nový článek';

    if (post) {
      document.getElementById('artTitleCZ').value = post.title_cz || '';
      document.getElementById('artTitleEN').value = post.title_en || '';
      document.getElementById('artExcerptCZ').value = post.excerpt_cz || '';
      document.getElementById('artExcerptEN').value = post.excerpt_en || '';
      document.getElementById('artContentCZ').value = post.content_cz || '';
      document.getElementById('artContentEN').value = post.content_en || '';
      document.getElementById('artCoverImage').value = post.cover_image || '';
      document.getElementById('artPublished').checked = !!post.is_published;
    }

    modal.classList.add('open');
    form.onsubmit = null;
    setTimeout(() => {
      form.onsubmit = (e) => { e.preventDefault(); this.savePost(); };
    }, 50);

    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('open');
    modal.querySelector('.modal-close-btn').onclick = () => modal.classList.remove('open');
  }

  async savePost() {
    try {
      const data = {
        title_cz: document.getElementById('artTitleCZ').value.trim(),
        title_en: document.getElementById('artTitleEN').value.trim() || null,
        excerpt_cz: document.getElementById('artExcerptCZ').value.trim() || null,
        excerpt_en: document.getElementById('artExcerptEN').value.trim() || null,
        content_cz: document.getElementById('artContentCZ').value.trim() || null,
        content_en: document.getElementById('artContentEN').value.trim() || null,
        cover_image: document.getElementById('artCoverImage').value.trim() || null,
        is_published: document.getElementById('artPublished').checked
      };

      if (!data.title_cz) { admin.showNotification('Název (CZ) je povinný', 'error'); return; }

      const url = this.currentPost ? `/api/magazine/${this.currentPost.id}` : '/api/magazine';
      const method = this.currentPost ? 'PUT' : 'POST';

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

      admin.showNotification('Článek uložen', 'success');
      document.getElementById('magazineModal').classList.remove('open');
      await this.loadPosts();
    } catch (error) {
      console.error('Error saving post:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  editPost(id) {
    const post = this.posts.find(p => p.id === id);
    if (post) this.showModal(post);
  }

  async deletePost(id) {
    if (!confirm('Opravdu smazat tento článek?')) return;

    try {
      const response = await fetch(`/api/magazine/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Smazání selhalo');
      }

      admin.showNotification('Článek smazán', 'success');
      await this.loadPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }
}
