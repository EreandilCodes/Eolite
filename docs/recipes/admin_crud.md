# Recipe: Admin Manager CRUD Pattern

> **Files:** `frontend/admin/*.js` · `frontend/js/admin.js` · `frontend/admin.html`

This is the canonical pattern for every admin section. Study `ReferencesManager` or `MagazineManager` as working examples.

---

## 1. Required Class Structure

```javascript
// frontend/admin/myentity.js
export class MyEntityManager {
  constructor(auth) {
    this.auth = auth;
    this.items = [];
  }

  async init() {
    await this.loadItems();
    // Bind gallery picker if needed (do NOT add dataset.bound here — bindGalleryPickerBtn handles it)
  }

  async loadItems() {
    // Safe Fetch Pattern — MANDATORY
    const response = await fetch('/api/myentity/admin/all', {
      headers: this.auth.getAuthHeaders()
    });
    const ct = response.headers.get('content-type');
    if (!response.ok) {
      const err = ct?.includes('application/json')
        ? await response.json() : { error: await response.text() };
      throw new Error(err.error || 'Request failed');
    }
    if (!ct?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
    this.items = await response.json();
    this.renderItems();
  }

  renderItems() {
    const tbody = document.getElementById('myEntityTableBody');
    if (!tbody) return;
    tbody.innerHTML = this.items.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>${item.name_cz}</td>
        <td>
          <button onclick="admin.myentity.showModal(${item.id})">Upravit</button>
          <button onclick="admin.myentity.deleteItem(${item.id})">Smazat</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    document.getElementById('myEntityModalTitle').textContent = item ? 'Upravit' : 'Nový';
    document.getElementById('myEntityId').value = item?.id || '';
    document.getElementById('myEntityNameCz').value = item?.name_cz || '';
    document.getElementById('myEntityModal').style.display = 'flex';
    document.getElementById('myEntityForm').onsubmit = (e) => {
      e.preventDefault();
      this.saveItem();
    };
  }

  async saveItem() {
    const id = document.getElementById('myEntityId').value;
    const body = {
      name_cz: document.getElementById('myEntityNameCz').value.trim(),
    };
    const url = id ? `/api/myentity/${id}` : '/api/myentity';
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(body)
    });
    const ct = response.headers.get('content-type');
    if (!response.ok) {
      const err = ct?.includes('application/json')
        ? await response.json() : { error: await response.text() };
      alert(err.error || 'Chyba uložení');
      return;
    }
    document.getElementById('myEntityModal').style.display = 'none';
    await this.loadItems();
  }

  async deleteItem(id) {
    if (!confirm('Smazat tento záznam?')) return;
    const response = await fetch(`/api/myentity/${id}`, {
      method: 'DELETE',
      headers: this.auth.getAuthHeaders()
    });
    if (!response.ok) { alert('Chyba mazání'); return; }
    await this.loadItems();
  }
}
```

---

## 2. Wire into AdminController (frontend/js/admin.js)

```javascript
import { MyEntityManager } from '../admin/myentity.js';

class AdminController {
  constructor() {
    this.auth = new AuthManager();
    // existing managers...
    this.myentity = new MyEntityManager(this.auth);
  }

  async loadSection(section) {
    // hide all sections...
    const titles = {
      // existing...
      myentity: 'Moje entity',
    };
    document.getElementById('sectionTitle').textContent = titles[section] || '';
    // show/hide addNewBtn based on section...
    switch (section) {
      // existing cases...
      case 'myentity': await this.myentity.init(); break;
    }
  }

  handleAddNew() {
    switch (this.currentSection) {
      // existing cases...
      case 'myentity': this.myentity.showModal(); break;
    }
  }
}
```

---

## 3. HTML Section (frontend/admin.html)

Sidebar nav item:
```html
<a href="#" class="nav-item" data-section="myentity">
  <span class="nav-icon">🗂️</span> Moje entity
</a>
```

Section + table:
```html
<section id="myentitySection" class="admin-section" style="display:none">
  <div class="section-header">
    <!-- addNewBtn is global — shown/hidden by AdminController -->
  </div>
  <table class="admin-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Název CZ</th>
        <th>Akce</th>
      </tr>
    </thead>
    <tbody id="myEntityTableBody">
      <tr><td colspan="3">Načítám...</td></tr>
    </tbody>
  </table>
</section>
```

Modal:
```html
<div id="myEntityModal" class="modal" style="display:none">
  <div class="modal-overlay" onclick="document.getElementById('myEntityModal').style.display='none'"></div>
  <div class="modal-content">
    <h3 id="myEntityModalTitle">Nový záznam</h3>
    <form id="myEntityForm">
      <input type="hidden" id="myEntityId">

      <div class="form-group">
        <label for="myEntityNameCz">Název CZ *</label>
        <input type="text" id="myEntityNameCz" required>
      </div>

      <div class="form-group">
        <label for="myEntityNameEn">Název EN</label>
        <input type="text" id="myEntityNameEn">
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">Uložit</button>
        <button type="button" class="btn-secondary"
          onclick="document.getElementById('myEntityModal').style.display='none'">
          Zrušit
        </button>
      </div>
    </form>
  </div>
</div>
```

---

## 4. Event Listener Guard (dataset.bound)

When `init()` is called multiple times (user navigates away and back), event listeners must not stack.

**Critical: `<select>` uses `change`, `<input type="text">` uses `input`:**

```javascript
// ✅ CORRECT — different event per element type
const filters = [
  ['myFilterCategory', 'change'],  // <select>
  ['myFilterName',     'input'],   // <input type="text"> — live search on each keystroke
  ['myFilterStatus',   'change'],  // <select>
  ['myFilterSort',     'change'],  // <select>
];
filters.forEach(([id, eventName]) => {
  const el = document.getElementById(id);
  if (el && !el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener(eventName, () => this.applyFilters());
  }
});

// ❌ WRONG — 'input' does not fire reliably on <select> elements
ids.forEach(id => el.addEventListener('input', () => this.applyFilters()));
```

Note: `form.onsubmit = fn` (assignment, not addEventListener) is safe to reassign — no guard needed.

---

## 5. Read-Only Manager (no create/edit)

For sections like Inquiries where admin only views data:

```javascript
export class MyReadOnlyManager {
  constructor(auth) { this.auth = auth; this.items = []; }
  async init() { await this.loadItems(); }
  async loadItems() { /* Safe Fetch, then renderItems() */ }
  renderItems() { /* tbody.innerHTML */ }
  // No showModal(), no saveItem()
}
```

In `admin.js`, omit from `handleAddNew()` and hide `#addNewBtn` for this section.

---

## 6. Checklist

- [ ] Manager class in `frontend/admin/myentity.js`
- [ ] All 5 methods: `init`, `loadItems`, `renderItems`, `showModal`, `saveItem`
- [ ] Safe Fetch Pattern on every `fetch` call (content-type check)
- [ ] `dataset.bound` guard on any `addEventListener` called from `init()`
- [ ] Imported + instantiated in `admin.js` constructor
- [ ] Case added to `loadSection()` switch
- [ ] Title added to `titles` map
- [ ] Case added to `handleAddNew()` switch
- [ ] Section HTML: id = `myentitySection`, class = `admin-section`
- [ ] Table body id = `myEntityTableBody`
- [ ] No `required` on hidden form fields
- [ ] Nav link: `data-section="myentity"`
