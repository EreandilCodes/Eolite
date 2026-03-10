/**
 * AuthManager – handles JWT storage and auth headers for admin panel.
 * Same pattern as KanjoWin AuthManager.
 */
export class AuthManager {
  constructor() {
    this.token = localStorage.getItem('eolite_token');
    this.user = JSON.parse(localStorage.getItem('eolite_user') || 'null');
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  async checkAuth() {
    if (!this.token) {
      window.location.href = '/login';
      return false;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        this.logout();
        return false;
      }

      const ct = response.headers.get('content-type');
      if (!ct?.includes('application/json')) {
        this.logout();
        return false;
      }

      const user = await response.json();
      this.user = user;
      localStorage.setItem('eolite_user', JSON.stringify(user));

      // Show user info in sidebar if element exists
      const userEl = document.getElementById('adminUserEmail');
      if (userEl) userEl.textContent = user.email;

      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      this.logout();
      return false;
    }
  }

  logout() {
    localStorage.removeItem('eolite_token');
    localStorage.removeItem('eolite_user');
    window.location.href = '/login';
  }
}
