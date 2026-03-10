/**
 * SettingsManager – admin-configurable site settings.
 * Currently: notification email for inquiry alerts.
 * Safe Fetch Pattern on all API calls.
 */
export class SettingsManager {
  constructor(auth) {
    this.auth = auth;
    this.settings = {};
  }

  async init() {
    await this.loadSettings();
    this.bindButtons();
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings', {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Chyba při načítání nastavení');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');

      this.settings = await response.json();
      this.render();
    } catch (error) {
      console.error('Error loading settings:', error);
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  render() {
    const emailInput = document.getElementById('settingNotificationEmail');
    if (emailInput) emailInput.value = this.settings.notification_email || '';

    // Show email mode badge
    const modeBadge = document.getElementById('smtpModeBadge');
    if (modeBadge) {
      const mode = this.settings._email_mode || 'mock';
      const isSMTP = mode === 'smtp';
      modeBadge.textContent = isSMTP ? 'SMTP (odesílání)' : 'MOCK (konzole / log)';
      modeBadge.className = `badge ${isSMTP ? 'badge-success' : 'badge-warning'}`;
    }

    const fromEl = document.getElementById('smtpFromDisplay');
    if (fromEl) fromEl.textContent = this.settings._email_from || 'noreply@eolite.cz';
  }

  async saveNotificationEmail() {
    const emailInput = document.getElementById('settingNotificationEmail');
    if (!emailInput) return;

    const value = emailInput.value.trim();
    // Validate each address in the comma-separated list
    if (value) {
      const invalid = value.split(',').map(e => e.trim()).filter(e => e && !e.includes('@'));
      if (invalid.length) {
        admin.showNotification(`Neplatný email: ${invalid[0]}`, 'error');
        return;
      }
    }

    try {
      const response = await fetch('/api/settings/notification_email', {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ value })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Uložení selhalo');
      }
      this.settings.notification_email = value;
      admin.showNotification('Nastavení uloženo', 'success');
    } catch (error) {
      admin.showNotification('Chyba: ' + error.message, 'error');
    }
  }

  async sendTestEmail() {
    const btn = document.getElementById('btnTestEmail');
    if (btn) { btn.disabled = true; btn.textContent = 'Odesílám…'; }

    try {
      const response = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || 'Odeslání selhalo');
      }
      const data = await response.json();
      admin.showNotification(data.message, 'success');
    } catch (error) {
      admin.showNotification('Chyba: ' + error.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Odeslat testovací email'; }
    }
  }

  bindButtons() {
    const saveBtn = document.getElementById('btnSaveSettings');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', () => this.saveNotificationEmail());
    }

    const testBtn = document.getElementById('btnTestEmail');
    if (testBtn && !testBtn.dataset.bound) {
      testBtn.dataset.bound = '1';
      testBtn.addEventListener('click', () => this.sendTestEmail());
    }
  }
}
