# Recipe: Authentication

> **Files:** `backend/routes/auth.js` · `backend/middleware/auth.js` · `frontend/js/auth.js` · `frontend/login.html`

---

## 1. How It Works

- Admin logs in via `POST /api/auth/login` → receives JWT (24h expiry)
- Token stored in `localStorage.eolite_token`
- Every admin request sends `Authorization: Bearer <token>` header
- `AuthMiddleware.verifyToken` validates token; `AuthMiddleware.adminOnly` checks `role === 'admin'`
- No public registration. One seeded user: `admin@eolite.cz / admin123`

---

## 2. Middleware (backend/middleware/auth.js)

```javascript
// ALWAYS named import — no default export exists
import { AuthMiddleware } from '../middleware/auth.js';

// Usage on route:
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, handler);
```

`verifyToken` → attaches `req.user = { id, email, role }`
`adminOnly` → checks `req.user.role === 'admin'`, returns 403 otherwise

---

## 3. Login Endpoint (backend/routes/auth.js)

```javascript
// Rate limit: 10 attempts / 15 min / IP (in-memory Map)
POST /api/auth/login
Body: { email, password }
Response 200: { token, user: { id, email, role } }
Response 401: { error: 'Nesprávný email nebo heslo' }
Response 429: { error: 'Příliš mnoho pokusů...' }
Response 500: { error: 'Chyba serveru. Zkuste to prosím znovu.' }  ← generic, never error.message

GET /api/auth/me
Headers: Authorization: Bearer <token>
Response 200: { id, email, role }
Response 401: { error: 'Authentication required' }
```

---

## 4. Frontend AuthManager (frontend/js/auth.js)

```javascript
// Token key
localStorage.eolite_token

// Get headers for authenticated requests:
this.auth.getAuthHeaders()
// Returns: { 'Authorization': 'Bearer <token>', 'Content-Type': 'application/json' }

// For FormData uploads — only Authorization, NOT Content-Type:
const { Authorization } = this.auth.getAuthHeaders();
fetch(url, { method: 'POST', headers: { Authorization }, body: formData });

// Check auth on admin page load:
await auth.checkAuth(); // redirects to /login if token missing/invalid

// Logout:
auth.logout(); // removes token, redirects to /login
```

---

## 5. Login Page Flow

1. `login.html` submits `POST /api/auth/login`
2. On success: stores token → `window.location.href = '/admin'`
3. On fail: shows error message in `#loginError`
4. `admin.html` calls `auth.checkAuth()` on load (before rendering anything)

---

## 6. Rate Limiting Pattern

Matches pattern in `routes/inquiries.js`. In `routes/auth.js`:

```javascript
const loginRateLimits = new Map();
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginRateLimits.get(ip);
  if (!entry) { loginRateLimits.set(ip, { count: 1, windowStart: now }); return true; }
  if (now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
    loginRateLimits.set(ip, { count: 1, windowStart: now }); return true;
  }
  if (entry.count >= LOGIN_RATE_MAX) return false;
  entry.count++;
  return true;
}

// In handler:
const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
if (!checkLoginRateLimit(ip)) {
  return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to za 15 minut.' });
}
```

---

## 7. Security Notes

- JWT secret: `process.env.JWT_SECRET` — **must be set in production `.env`**
  - Server logs `console.warn` on startup if missing
  - Falls back to insecure default (development only)
- Token expiry: 24h — no invalidation on logout (stateless JWT)
- Password stored as bcrypt hash in `users` table
- Rate limit resets on server restart (in-memory Map)
