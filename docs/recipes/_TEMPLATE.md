# Recipe: [Feature Name]

> **Files:** `backend/routes/xxx.js` · `frontend/admin/xxx.js` · `backend/database.js`

---

## 1. DB Schema

```sql
-- In backend/database.js → initDatabase()
CREATE TABLE IF NOT EXISTS my_table (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_cz     TEXT NOT NULL,
  name_en     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Adding a column to existing table (migration):
try { await db.exec(`ALTER TABLE my_table ADD COLUMN new_col TEXT`); } catch {}
```

---

## 2. Backend Route (backend/routes/xxx.js)

```javascript
import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js'; // NAMED import only

const router = express.Router();

// Public GET
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM my_table WHERE is_active = 1').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' }); // generic, no err.message
  }
});

// Admin CRUD
router.post('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en } = req.body;
    const result = await db.prepare(
      'INSERT INTO my_table (name_cz, name_en) VALUES (?, ?)'
    ).run(name_cz, name_en);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
```

Register in `backend/server.js`:
```javascript
import myRoutes from './routes/xxx.js';
app.use('/api/xxx', myRoutes);
```

---

## 3. Admin Manager (frontend/admin/xxx.js)

```javascript
export class XxxManager {
  constructor(auth) {
    this.auth = auth;
    this.items = [];
  }

  async init() {
    await this.loadItems();
    // bind gallery picker if needed:
    // bindGalleryPickerBtn('btnPickXxx', 'xxxImageUrl', this.auth);
  }

  async loadItems() {
    const response = await fetch('/api/xxx/admin/all', {
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
    const tbody = document.getElementById('xxxTableBody');
    if (!tbody) return;
    tbody.innerHTML = this.items.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>${item.name_cz}</td>
        <td>
          <button onclick="admin.xxx.showModal(${item.id})">Upravit</button>
          <button onclick="admin.xxx.deleteItem(${item.id})">Smazat</button>
        </td>
      </tr>
    `).join('');
  }

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    document.getElementById('xxxModalTitle').textContent = item ? 'Upravit' : 'Nový';
    document.getElementById('xxxId').value = item?.id || '';
    document.getElementById('xxxNameCz').value = item?.name_cz || '';
    document.getElementById('xxxNameEn').value = item?.name_en || '';
    document.getElementById('xxxModal').style.display = 'flex';
    document.getElementById('xxxForm').onsubmit = (e) => { e.preventDefault(); this.saveItem(); };
  }

  async saveItem() {
    const id = document.getElementById('xxxId').value;
    const body = {
      name_cz: document.getElementById('xxxNameCz').value.trim(),
      name_en: document.getElementById('xxxNameEn').value.trim(),
    };
    const url = id ? `/api/xxx/${id}` : '/api/xxx';
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
    document.getElementById('xxxModal').style.display = 'none';
    await this.loadItems();
  }

  async deleteItem(id) {
    if (!confirm('Smazat tento záznam?')) return;
    const response = await fetch(`/api/xxx/${id}`, {
      method: 'DELETE',
      headers: this.auth.getAuthHeaders()
    });
    if (!response.ok) { alert('Chyba mazání'); return; }
    await this.loadItems();
  }
}
```

---

## 4. Wire into Admin (frontend/js/admin.js)

```javascript
import { XxxManager } from '../admin/xxx.js';

class AdminController {
  constructor() {
    // ...existing managers...
    this.xxx = new XxxManager(this.auth);
  }

  loadSection(section) {
    // ...existing cases...
    case 'xxx': await this.xxx.init(); break;
  }
}
```

Titles map in `loadSection()`:
```javascript
const titles = {
  // ...
  xxx: 'Xxx sekce',
};
```

---

## 5. HTML (frontend/admin.html)

Sidebar nav:
```html
<a href="#" class="nav-item" data-section="xxx">
  <span class="nav-icon">🗂️</span> Xxx
</a>
```

Section:
```html
<section id="xxxSection" class="admin-section" style="display:none">
  <table>
    <thead>
      <tr><th>ID</th><th>Název CZ</th><th>Akce</th></tr>
    </thead>
    <tbody id="xxxTableBody"></tbody>
  </table>
</section>

<!-- Modal -->
<div id="xxxModal" class="modal" style="display:none">
  <div class="modal-content">
    <h3 id="xxxModalTitle">Nový</h3>
    <form id="xxxForm">
      <input type="hidden" id="xxxId">
      <label>Název CZ <input id="xxxNameCz" required></label>
      <label>Název EN <input id="xxxNameEn"></label>
      <button type="submit">Uložit</button>
      <button type="button" onclick="document.getElementById('xxxModal').style.display='none'">Zrušit</button>
    </form>
  </div>
</div>
```

---

## 6. Checklist

- [ ] `CREATE TABLE IF NOT EXISTS` in `database.js`
- [ ] Route file created, named export `{ AuthMiddleware }`
- [ ] Route registered in `server.js`
- [ ] Manager class with all 5 required methods
- [ ] Safe Fetch Pattern on every `fetch` call
- [ ] Manager imported + instantiated in `admin.js`
- [ ] Case added to `loadSection()` switch
- [ ] Section ID = `xxxSection`, nav `data-section="xxx"`
- [ ] No `required` on hidden inputs
- [ ] `dataset.bound` guard on any repeatedly-bound event listeners
- [ ] Recipe added to `docs/recipes/`
- [ ] `CLAUDE.md` updated with new routes + schema
