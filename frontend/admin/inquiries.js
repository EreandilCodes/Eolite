/**
 * InquiriesManager – read-only list of submitted inquiries.
 * Admin can mark as read, delete, and filter by status/search/sort.
 * Safe Fetch Pattern on all API calls.
 */
export class InquiriesManager {
  constructor(auth) {
    this.auth = auth;
    this.inquiries = [];
  }

  async init() {
    await this.loadInquiries();
  }

  applyFilters() {
    const statusVal  = document.getElementById('inqFilterStatus')?.value  || '';
    const nameVal    = (document.getElementById('inqFilterName')?.value    || '').toLowerCase().trim();
    const emailVal   = (document.getElementById('inqFilterEmail')?.value   || '').toLowerCase().trim();
    const messageVal = (document.getElementById('inqFilterMessage')?.value || '').toLowerCase().trim();
    const sortVal    = document.getElementById('inqFilterSort')?.value     || 'newest';

    let filtered = this.inquiries.filter(inq => {
      if (statusVal === 'unread' && inq.is_read)  return false;
      if (statusVal === 'read'   && !inq.is_read) return false;
      if (nameVal    && !(inq.name    || '').toLowerCase().includes(nameVal))    return false;
      if (emailVal   && !(inq.email   || '').toLowerCase().includes(emailVal))   return false;
      if (messageVal && !(inq.message || '').toLowerCase().includes(messageVal)) return false;
      return true;
    });

    if (sortVal === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    this.renderInquiries(filtered);
  }

  async loadInquiries() {
    try {
      const response = await fetch('/api/inquiries/admin/all', {
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání poptávek');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.inquiries = await response.json();
      this.applyFilters();
    } catch (error) {
      console.error('Error loading inquiries:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
      this.inquiries = [];
      this.renderInquiries([]);
    }
  }

  renderInquiries(list = this.inquiries) {
    const container = document.getElementById('inquiriesContainer');
    if (!container) return;

    const unread = this.inquiries.filter(i => !i.is_read).length;
    const badge = unread > 0 ? `<span class="badge badge-danger" style="margin-left:8px">${unread} nových</span>` : '';

    const titleEl = document.getElementById('inquiriesSectionTitle');
    if (titleEl) titleEl.innerHTML = `Poptávky ${badge}`;

    if (!list.length) {
      container.innerHTML = this.inquiries.length
        ? '<p class="empty-message">Žádné poptávky neodpovídají filtru.</p>'
        : '<p class="empty-message">Žádné poptávky.</p>';
      return;
    }

    container.innerHTML = list.map(inq => `
      <div class="inquiry-card ${inq.is_read ? '' : 'unread'}" id="inq-${inq.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div>
            <strong>${inq.name || '–'}</strong>
            ${!inq.is_read ? '<span class="badge badge-info" style="margin-left:6px;font-size:0.65em">Nová</span>' : ''}
            <br>
            <a href="mailto:${inq.email}" style="color:var(--accent);font-size:0.875em">${inq.email || '–'}</a>
            ${inq.phone ? `<span style="color:var(--text-muted);font-size:0.875em;margin-left:1em">📞 ${inq.phone}</span>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0">
            <span style="font-size:0.78em;color:var(--text-muted)">${new Date(inq.created_at).toLocaleString('cs-CZ')}</span>
            ${!inq.is_read ? `<button class="btn-icon" onclick="admin.inquiries.markRead(${inq.id})" title="Označit jako přečtené">✓</button>` : ''}
            <button class="btn-icon btn-danger" onclick="admin.inquiries.deleteInquiry(${inq.id})" title="Smazat">🗑</button>
          </div>
        </div>
        <p style="margin-top:0.75rem;color:var(--text-primary);font-size:0.9em;line-height:1.6;white-space:pre-wrap">${inq.message || '–'}</p>
      </div>
    `).join('');
  }

  async markRead(id) {
    try {
      const response = await fetch(`/api/inquiries/${id}/read`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba');
      }

      // Update local state without full reload, preserve current filter
      const inq = this.inquiries.find(i => i.id === id);
      if (inq) inq.is_read = 1;
      this.applyFilters();
    } catch (error) {
      console.error('Error marking inquiry read:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  async deleteInquiry(id) {
    if (!confirm('Opravdu smazat tuto poptávku?')) return;

    try {
      const response = await fetch(`/api/inquiries/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Smazání selhalo');
      }

      admin.showNotification('Poptávka smazána', 'success');
      await this.loadInquiries();
    } catch (error) {
      console.error('Error deleting inquiry:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }
}
